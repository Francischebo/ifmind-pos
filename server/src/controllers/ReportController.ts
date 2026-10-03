import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Product } from "../entity/Product";
import { Sale, SaleStatus } from "../entity/Sale";
import { InventoryService } from "../services/InventoryService";

export class ReportController {
    static async getSummary(req: Request, res: Response) {
        try {
            const start = new Date(String(req.query.start));
            const end = new Date(String(req.query.end));
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
                return res.status(400).json({ message: "Valid report date range is required" });
            }

            const [sales, products, stockTotals] = await Promise.all([
                AppDataSource.getRepository(Sale).find({
                    where: { status: SaleStatus.COMPLETED },
                    relations: ["cashier", "items", "items.product"],
                }),
                AppDataSource.getRepository(Product).find({ order: { stock_on_hand: "ASC" } }),
                InventoryService.getTotalStockByProduct(AppDataSource.manager),
            ]);

            const filteredSales = sales.filter((sale) => sale.created_at >= start && sale.created_at <= end);
            const paymentSummary = new Map<string, { method: string; total: number; count: number }>();
            const productSummary = new Map<string, { product_id: string; name: string; sku: string; total_quantity: number }>();
            const cashierSummary = new Map<string, { cashier_id: string; name: string; total: number; count: number }>();

            for (const sale of filteredSales) {
                const method = sale.payment_method;
                const payment = paymentSummary.get(method) || { method, total: 0, count: 0 };
                payment.total += Number(sale.total_amount);
                payment.count += 1;
                paymentSummary.set(method, payment);

                const cashierId = sale.cashier?.id || "unknown";
                const cashier = cashierSummary.get(cashierId) || {
                    cashier_id: cashierId,
                    name: sale.cashier?.email || "Unknown",
                    total: 0,
                    count: 0,
                };
                cashier.total += Number(sale.total_amount);
                cashier.count += 1;
                cashierSummary.set(cashierId, cashier);

                for (const item of sale.items || []) {
                    const product = item.product;
                    if (!product) continue;
                    const summary = productSummary.get(product.id) || {
                        product_id: product.id,
                        name: product.name,
                        sku: product.sku,
                        total_quantity: 0,
                    };
                    summary.total_quantity += Number(item.quantity);
                    productSummary.set(product.id, summary);
                }
            }

            res.json({
                salesByPayment: Array.from(paymentSummary.values()),
                topProducts: Array.from(productSummary.values())
                    .sort((a, b) => b.total_quantity - a.total_quantity)
                    .slice(0, 10),
                lowStock: products
                    .map((product) => ({
                        ...product,
                        stock_on_hand: InventoryService.getTotalStockOnHand(product, stockTotals),
                    }))
                    .filter((product) => product.stock_on_hand <= product.reorder_level),
                cashierPerformance: Array.from(cashierSummary.values())
                    .sort((a, b) => b.total - a.total),
            });
        } catch (error) {
            console.error("Error generating report summary:", error);
            res.status(500).json({ message: "Error generating report summary" });
        }
    }
}
