import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Sale, SaleStatus } from "../entity/Sale";
import { SaleItem } from "../entity/SaleItem";
import { Product } from "../entity/Product";
import { Customer } from "../entity/Customer";
import { MoreThanOrEqual } from "typeorm";
import { InventoryService } from "../services/InventoryService";

export class DashboardController {
    static async getDashboardStats(req: Request, res: Response) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const saleRepo = AppDataSource.getRepository(Sale);
            const saleItemRepo = AppDataSource.getRepository(SaleItem);
            const productRepo = AppDataSource.getRepository(Product);
            const customerRepo = AppDataSource.getRepository(Customer);

            // Get today's sales
            const todaySalesData = await saleRepo.find({
                where: {
                    status: SaleStatus.COMPLETED,
                    created_at: MoreThanOrEqual(today)
                },
                order: { created_at: "DESC" }
            });

            const todaySales = todaySalesData.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
            const todayTransactions = todaySalesData.length;

            const recentTransactions = todaySalesData.slice(0, 5).map(sale => ({
                id: sale.id,
                time: sale.created_at.toLocaleTimeString('en-KE'),
                amount: Number(sale.total_amount),
                method: sale.payment_method
            }));

            const paymentSummary = todaySalesData.reduce((acc: any, sale) => {
                const method = sale.payment_method;
                if (!acc[method]) acc[method] = 0;
                acc[method] += Number(sale.total_amount);
                return acc;
            }, {});

            const salesByMethod = Object.entries(paymentSummary).map(([method, amount]: [string, any]) => ({
                method,
                amount,
                percentage: todaySales > 0 ? (amount / todaySales) * 100 : 0
            }));

            // Get weekly trend
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);

            const weekSalesData = await saleRepo.find({
                where: {
                    status: SaleStatus.COMPLETED,
                    created_at: MoreThanOrEqual(weekAgo)
                }
            });

            const weeklyTrend = Array.from({ length: 7 }, (_, i) => {
                const date = new Date();
                date.setDate(date.getDate() - (6 - i));
                date.setHours(0, 0, 0, 0);
                const dayName = date.toLocaleDateString('en-KE', { weekday: 'short' });
                
                const daySales = weekSalesData.filter(sale => {
                    const saleDate = new Date(sale.created_at);
                    saleDate.setHours(0, 0, 0, 0);
                    return saleDate.getTime() === date.getTime();
                });

                return {
                    day: dayName,
                    sales: daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
                    transactions: daySales.length
                };
            });

            // Get top products
            const todaySaleItems = await saleItemRepo.find({
                where: {
                    created_at: MoreThanOrEqual(today)
                },
                relations: ["product"]
            });

            const productSummary = todaySaleItems.reduce((acc: any, item) => {
                const pid = item.product.id;
                if (!acc[pid]) {
                    acc[pid] = {
                        name: item.product.name,
                        quantity: 0,
                        revenue: 0
                    };
                }
                acc[pid].quantity += item.quantity;
                acc[pid].revenue += Number(item.line_total);
                return acc;
            }, {});

            const topProducts = Object.values(productSummary)
                .sort((a: any, b: any) => b.revenue - a.revenue)
                .slice(0, 5);

            // Get products info
            const [products, stockTotals] = await Promise.all([
                productRepo.find(),
                InventoryService.getTotalStockByProduct(AppDataSource.manager),
            ]);
            const totalProducts = products.length;
            const lowStockCount = products.filter(
                (product) => InventoryService.getTotalStockOnHand(product, stockTotals) <= product.reorder_level,
            ).length;

            // Get customers
            const totalCustomers = await customerRepo.count();

            res.json({
                todaySales,
                todayTransactions,
                recentTransactions,
                salesByMethod,
                weeklyTrend,
                topProducts,
                totalProducts,
                lowStockCount,
                totalCustomers
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching dashboard stats" });
        }
    }
}
