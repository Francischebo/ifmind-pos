import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Sale, SaleStatus } from "../entity/Sale";
import { SaleItem } from "../entity/SaleItem";
import { Product } from "../entity/Product";
import { User } from "../entity/User";
import { Customer } from "../entity/Customer";
import { Warehouse } from "../entity/Warehouse";
import { WarehouseStock } from "../entity/WarehouseStock";
import { ProductBatch } from "../entity/ProductBatch";
import { SaleItemBatch } from "../entity/SaleItemBatch";
import { CreditNote } from "../entity/CreditNote";
import { StoreCredit, StoreCreditStatus } from "../entity/StoreCredit";
import { AccountingService } from "../services/AccountingService";
import { EtimsMockService } from "../services/EtimsMockService";
import { SocketService } from "../services/SocketService";

const saleRepository = AppDataSource.getRepository(Sale);
const saleItemRepository = AppDataSource.getRepository(SaleItem);
const productRepository = AppDataSource.getRepository(Product);

export class SalesController {
    static async getAllSales(req: Request, res: Response) {
        try {
            const sales = await saleRepository.find({
                relations: ["items", "items.product", "cashier"]
            });
            res.json(sales);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching sales" });
        }
    }

    static async createSale(req: any, res: Response) {
        // Run as a database transaction
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { items, payment_method, customer_id, warehouse_id, loyalty_discount, idempotency_key, cash_amount, mpesa_amount, store_credit_amount, store_credit_barcode } = req.body;
            
            const cashier = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            if (!cashier) throw new Error("Cashier not found");

            // Enforce open shift
            const { Shift, ShiftStatus } = require("../entity/Shift");
            const openShift = await queryRunner.manager.findOneBy(Shift, { cashier_id: cashier.id, status: ShiftStatus.OPEN });
            if (!openShift) {
                throw new Error("You must open a shift before processing a sale.");
            }

            let customer = null;
            if (customer_id) {
                customer = await queryRunner.manager.findOneBy(Customer, { id: customer_id });
                if (!customer) throw new Error("Customer not found");
            }

            let warehouse = null;
            if (warehouse_id) {
                warehouse = await queryRunner.manager.findOneBy(Warehouse, { id: warehouse_id });
                if (!warehouse) throw new Error("Warehouse not found");
            }

            let calculatedSubtotal = 0;
            let calculatedTaxAmount = 0;
            let calculatedTotalCogs = 0;
            const saleItems: SaleItem[] = [];
            const batchDeductionLog: { saleItem: SaleItem; batch: ProductBatch; deducted: number }[] = [];
            
            // Queue for socket updates after successful transaction
            const inventoryUpdates: { productId: string; newStockLevel: number; warehouseId: string | null }[] = [];

            for (const item of items) {
                const product = await queryRunner.manager.findOne(Product, { 
                    where: { id: item.product_id },
                    relations: ["tax_class"]
                });
                if (!product) {
                    throw new Error(`Product with id ${item.product_id} not found`);
                }

                // Check and decrement branch-specific stock if warehouse provided
                if (warehouse_id) {
                    const branchStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                        warehouse_id: warehouse_id,
                        product_id: item.product_id
                    });
                    
                    if (!branchStock || branchStock.stock_on_hand < item.quantity) {
                        throw new Error(`Insufficient branch stock for product ${product.name}`);
                    }
                    branchStock.stock_on_hand -= item.quantity;
                    await queryRunner.manager.save(branchStock);
                } else {
                    if (product.stock_on_hand < item.quantity) {
                        throw new Error(`Insufficient global stock for product ${product.name}`);
                    }
                }

                // Decrement global stock as well
                product.stock_on_hand -= item.quantity;
                await queryRunner.manager.save(product);

                const lineTotal = product.retail_price * item.quantity;
                const taxRate = product.tax_class ? Number(product.tax_class.rate) : Number(product.tax_rate) || 0;
                const itemTax = (lineTotal * taxRate) / 100;

                const itemCogs = (product.unit_cost || 0) * item.quantity;
                calculatedTotalCogs += itemCogs;

                calculatedSubtotal += lineTotal;
                calculatedTaxAmount += itemTax;

                const saleItem = new SaleItem();
                // sale item will be linked to sale after sale is saved
                saleItem.product = product;
                saleItem.quantity = item.quantity;
                saleItem.unit_price = product.retail_price;
                saleItem.tax_rate = taxRate;
                saleItem.line_total = lineTotal;
                saleItems.push(saleItem);

                // Setup FEFO Batch Deduction
                let qtyToDeduct = item.quantity;
                const batches = await queryRunner.manager.find(ProductBatch, {
                    where: { product_id: product.id },
                    order: {
                        expiry_date: "ASC",
                        created_at: "ASC"
                    }
                });

                for (const batch of batches) {
                    if (qtyToDeduct <= 0) break;
                    if (batch.current_quantity > 0) {
                        const deductAmount = Math.min(batch.current_quantity, qtyToDeduct);
                        batch.current_quantity -= deductAmount;
                        qtyToDeduct -= deductAmount;
                        await queryRunner.manager.save(batch);
                        batchDeductionLog.push({ saleItem, batch, deducted: deductAmount });
                    }
                }
                
                // Note: We're not tightly throwing error if batches < quantity here
                // because legacy stock might not have batches yet.

                // Push inventory update event
                inventoryUpdates.push({
                    productId: product.id,
                    newStockLevel: product.stock_on_hand,
                    warehouseId: warehouse_id || null
                });
            }

            const appliedDiscount = loyalty_discount || 0;
            const subtotalWithDiscount = Math.max(0, calculatedSubtotal - appliedDiscount);
            const calculatedTotal = subtotalWithDiscount + calculatedTaxAmount;

            const sale = new Sale();
            sale.cashier = cashier;
            sale.customer = customer;
            sale.warehouse = warehouse;
            sale.payment_method = payment_method;
            sale.subtotal = calculatedSubtotal;
            sale.tax_amount = calculatedTaxAmount;
            sale.total_amount = calculatedTotal;
            sale.cash_amount = cash_amount || 0;
            sale.mpesa_amount = mpesa_amount || 0;
            sale.store_credit_amount = store_credit_amount || 0;
            sale.loyalty_discount = appliedDiscount;
            sale.idempotency_key = idempotency_key;
            sale.status = SaleStatus.COMPLETED;

            // Handle Store Credit deductions
            if (sale.store_credit_amount > 0) {
                if (customer && customer.store_credit_balance >= sale.store_credit_amount) {
                    customer.store_credit_balance = Number(customer.store_credit_balance) - sale.store_credit_amount;
                } else if (store_credit_barcode) {
                    const sc = await queryRunner.manager.findOneBy(StoreCredit, { barcode: store_credit_barcode, status: StoreCreditStatus.ACTIVE });
                    if (!sc || sc.current_balance < sale.store_credit_amount) {
                        throw new Error("Invalid or insufficient store credit barcode");
                    }
                    sc.current_balance = Number(sc.current_balance) - sale.store_credit_amount;
                    if (sc.current_balance === 0) sc.status = StoreCreditStatus.REDEEMED;
                    await queryRunner.manager.save(sc);
                } else {
                    throw new Error("Insufficient store credit balance");
                }
            }

            // Submit to KRA ETIMS (Mock)
            const etimsData = await EtimsMockService.signInvoice(sale);
            sale.etims_receipt_no = etimsData.receipt_no;
            sale.etims_qr_code = etimsData.qr_code;
            sale.etims_signature = etimsData.signature;

            await queryRunner.manager.save(sale);

            // Save sale items
            for (const saleItem of saleItems) {
                saleItem.sale = sale;
                await queryRunner.manager.save(saleItem);
            }

            // Save SaleItemBatch FEFO correlation correctly
            for (const log of batchDeductionLog) {
                const sib = new SaleItemBatch();
                sib.sale_item = log.saleItem;
                sib.product_batch = log.batch;
                sib.quantity_deducted = log.deducted;
                await queryRunner.manager.save(sib);
            }

            if (customer) {
                customer.purchase_count += 1;
                customer.total_purchases = Number(customer.total_purchases) + calculatedTotal;
                if (customer.purchase_count > 5) {
                    customer.is_frequent = true;
                }
                await queryRunner.manager.save(customer);
            }

            // Record into Accounting Ledger
            const isCash = payment_method === "cash";
            await AccountingService.recordSale(
                queryRunner.manager,
                sale.id,
                calculatedTotal,
                calculatedSubtotal,
                calculatedTaxAmount,
                calculatedTotalCogs,
                isCash
            );

            await queryRunner.commitTransaction();
            
            // Emit Socket events after success
            try {
                SocketService.emitNewSale(sale.id);
                for (const update of inventoryUpdates) {
                    SocketService.emitInventoryUpdated(update.productId, update.newStockLevel, update.warehouseId || undefined);
                }
            } catch (err) {
                console.error("Socket emit failed", err);
            }

            res.status(201).json(sale);

        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error creating sale" });
        } finally {
            await queryRunner.release();
        }
    }

    static async voidSale(req: any, res: Response) {
        const saleId = req.params.id;
        const { reason } = req.body;

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const sale = await queryRunner.manager.findOne(Sale, {
                where: { id: saleId },
                relations: ["items", "items.product", "cashier", "customer", "warehouse"]
            });

            if (!sale) throw new Error("Sale not found");
            if (sale.status === SaleStatus.VOIDED) throw new Error("Sale is already voided");

            const cashier = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            if (!cashier) throw new Error("Cashier not found");

            let calculatedTotalCogs = 0;
            const inventoryUpdates: { productId: string; newStockLevel: number; warehouseId: string | null }[] = [];

            // Reverse Items
            for (const item of sale.items) {
                const product = item.product;
                
                const itemCogs = (product.unit_cost || 0) * item.quantity;
                calculatedTotalCogs += itemCogs;

                // Revert global stock
                product.stock_on_hand += item.quantity;
                await queryRunner.manager.save(product);

                // Revert branch stock if applicable
                if (sale.warehouse) {
                    const branchStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                        warehouse_id: sale.warehouse.id,
                        product_id: product.id
                    });
                    if (branchStock) {
                        branchStock.stock_on_hand += item.quantity;
                        await queryRunner.manager.save(branchStock);
                    }
                }

                // Revert ProductBatch (just put it back in the newest active batch)
                const batch = await queryRunner.manager.findOne(ProductBatch, {
                    where: { product_id: product.id },
                    order: { created_at: "DESC" }
                });
                if (batch) {
                    batch.current_quantity += item.quantity;
                    await queryRunner.manager.save(batch);
                }

                inventoryUpdates.push({
                    productId: product.id,
                    newStockLevel: product.stock_on_hand,
                    warehouseId: sale.warehouse ? sale.warehouse.id : null
                });
            }

            sale.status = SaleStatus.VOIDED;
            await queryRunner.manager.save(sale);

            // Create Credit Note
            const creditNote = new CreditNote();
            creditNote.sale = sale;
            creditNote.amount = sale.total_amount;
            creditNote.reason = reason || "Customer Return/Void";
            creditNote.cashier = cashier;
            await queryRunner.manager.save(creditNote);

            const isCash = sale.payment_method === "cash";
            await AccountingService.recordSaleReversal(
                queryRunner.manager,
                sale.id,
                sale.total_amount,
                sale.subtotal,
                sale.tax_amount,
                calculatedTotalCogs,
                isCash
            );

            await queryRunner.commitTransaction();

            try {
                for (const update of inventoryUpdates) {
                    SocketService.emitInventoryUpdated(update.productId, update.newStockLevel, update.warehouseId || undefined);
                }
            } catch (err) {
                console.error("Socket emit failed", err);
            }

            res.status(200).json({ message: "Sale voided successfully", creditNote });

        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error voiding sale" });
        } finally {
            await queryRunner.release();
        }
    }

    static async parkSale(req: any, res: Response) {
        try {
            const { items, customer_id, warehouse_id } = req.body;
            
            const cashier = await saleRepository.manager.findOneBy(User, { id: req.user.id });
            if (!cashier) throw new Error("Cashier not found");

            const sale = new Sale();
            sale.cashier = cashier;
            if (customer_id) {
                sale.customer = await saleRepository.manager.findOneBy(Customer, { id: customer_id });
            }
            if (warehouse_id) {
                sale.warehouse = await saleRepository.manager.findOneBy(Warehouse, { id: warehouse_id });
            }
            
            sale.payment_method = "cash" as any; // Temporary
            sale.subtotal = 0;
            sale.tax_amount = 0;
            sale.total_amount = 0;
            sale.status = SaleStatus.PARKED;

            await saleRepository.save(sale);

            const saleItems = [];
            for (const item of items) {
                const product = await productRepository.findOneBy({ id: item.product_id });
                if (product) {
                    const saleItem = new SaleItem();
                    saleItem.sale = sale;
                    saleItem.product = product;
                    saleItem.quantity = item.quantity;
                    saleItem.unit_price = product.retail_price;
                    saleItem.tax_rate = product.tax_rate || 0;
                    saleItem.line_total = product.retail_price * item.quantity;
                    await saleItemRepository.save(saleItem);
                    saleItems.push(saleItem);
                }
            }

            res.status(201).json({ ...sale, items: saleItems });
        } catch (error) {
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error parking sale" });
        }
    }

    static async getParkedSales(req: any, res: Response) {
        try {
            const sales = await saleRepository.find({
                where: { status: SaleStatus.PARKED },
                relations: ["items", "items.product", "customer"]
            });
            res.json(sales);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching parked sales" });
        }
    }
}
