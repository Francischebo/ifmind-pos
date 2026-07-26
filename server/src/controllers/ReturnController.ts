import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Sale, SaleStatus } from "../entity/Sale";
import { ReturnRequest, ReturnStatus, RefundMethod } from "../entity/ReturnRequest";
import { ReturnItem, ReturnItemCondition } from "../entity/ReturnItem";
import { SaleItem } from "../entity/SaleItem";
import { SaleItemBatch } from "../entity/SaleItemBatch";
import { User, AppRole } from "../entity/User";
import { CreditNote } from "../entity/CreditNote";
import { ProductBatch } from "../entity/ProductBatch";
import { WarehouseStock } from "../entity/WarehouseStock";
import { Shift, ShiftStatus } from "../entity/Shift";
import { AccountingService } from "../services/AccountingService";
import { EtimsMockService } from "../services/EtimsMockService";
import { SocketService } from "../services/SocketService";
import { StoreCredit, StoreCreditStatus } from "../entity/StoreCredit";
import { Customer } from "../entity/Customer";
import crypto from "crypto";

const saleRepository = AppDataSource.getRepository(Sale);
const returnRepository = AppDataSource.getRepository(ReturnRequest);
const returnItemRepository = AppDataSource.getRepository(ReturnItem);
const userRepository = AppDataSource.getRepository(User);
const saleItemRepository = AppDataSource.getRepository(SaleItem);

export class ReturnController {
    // Utility to calculate exactly 3 working days strictly (excluding Saturday & Sunday)
    static isWithinReturnWindow(invoiceDate: Date): boolean {
        const MAX_WORKING_DAYS = 3;
        let workingDaysElapsed = 0;
        
        const current = new Date(invoiceDate);
        const now = new Date();
        
        while (current.getTime() + 86400000 <= now.getTime()) {
            current.setTime(current.getTime() + 86400000);
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0=Sun, 6=Sat
                workingDaysElapsed++;
            }
        }
        return workingDaysElapsed <= MAX_WORKING_DAYS;
    }

    static async requestReturn(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { sale_id, reason, items } = req.body; // items: [{ sale_item_id, quantity }]
            if (!sale_id || !reason || !items || !items.length) {
                return res.status(400).json({ message: "Sale ID, reason, and items are required" });
            }

            const sale = await queryRunner.manager.findOne(Sale, { where: { id: sale_id } });
            if (!sale) throw new Error("Sale not found");

            if (sale.status === SaleStatus.VOIDED) {
                throw new Error("Sale is already voided/fully returned");
            }

            if (!ReturnController.isWithinReturnWindow(sale.created_at)) {
                return res.status(403).json({ message: "Return window expired. Strictly limited to 3 working days." });
            }

            const cashier = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            if (!cashier) throw new Error("Cashier not found");

            const returnReq = new ReturnRequest();
            returnReq.sale = sale;
            returnReq.requested_by = cashier;
            returnReq.reason = reason;
            await queryRunner.manager.save(returnReq);

            for (const payloadItem of items) {
                const saleItem = await queryRunner.manager.findOne(SaleItem, { where: { id: payloadItem.sale_item_id } });
                if (!saleItem || saleItem.sale.id !== sale.id) {
                    throw new Error(`Invalid sale item ${payloadItem.sale_item_id}`);
                }
                if (payloadItem.quantity <= 0 || payloadItem.quantity > saleItem.quantity) {
                    throw new Error(`Invalid quantity for item ${saleItem.product.name}`);
                }

                const retItem = new ReturnItem();
                retItem.return_request = returnReq;
                retItem.sale_item = saleItem;
                retItem.quantity = payloadItem.quantity;
                await queryRunner.manager.save(retItem);
            }

            await queryRunner.commitTransaction();
            res.status(201).json({ message: "Return requested successfully. Awaiting managerial approval.", request: returnReq });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error("Error requesting return:", error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Server error creating return request" });
        } finally {
            await queryRunner.release();
        }
    }

    static async approveReturn(req: any, res: Response) {
        const requestId = req.params.id;
        const { items_conditions, refund_method } = req.body; // [{ return_item_id, condition }], refund_method

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const returnReq = await queryRunner.manager.findOne(ReturnRequest, {
                where: { id: requestId },
                relations: ["sale", "sale.customer", "sale.warehouse", "sale.cashier", "items", "items.sale_item", "items.sale_item.product", "requested_by"]
            });

            if (!returnReq) throw new Error("Return request not found");
            if (returnReq.status !== ReturnStatus.PENDING) throw new Error("Return request is already processed");

            const admin = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            if (!admin) throw new Error("Approval user not found");

            const sale = returnReq.sale;
            if (sale.status === SaleStatus.VOIDED) throw new Error("Sale is already voided");

            const inventoryUpdates: { productId: string; newStockLevel: number; warehouseId: string | null }[] = [];
            let calculatedTotalCogs = 0;
            let totalRefundAmount = 0;
            let totalTaxRefund = 0;
            let totalSubtotalRefund = 0;

            for (const retItem of returnReq.items) {
                const saleItem = retItem.sale_item;
                const product = saleItem.product;
                
                const conditionPayload = items_conditions?.find((c: any) => c.return_item_id === retItem.id);
                retItem.condition = conditionPayload ? conditionPayload.condition : ReturnItemCondition.SELLABLE;

                const itemProportionalPrice = saleItem.line_total / saleItem.quantity;
                const refundAmount = itemProportionalPrice * retItem.quantity;
                const taxAmount = (saleItem.tax_rate / 100) * refundAmount;
                const itemCogs = (product.unit_cost || 0) * retItem.quantity;

                totalRefundAmount += refundAmount + taxAmount;
                totalSubtotalRefund += refundAmount;
                totalTaxRefund += taxAmount;
                calculatedTotalCogs += itemCogs;

                if (retItem.condition === ReturnItemCondition.SELLABLE) {
                    product.stock_on_hand += retItem.quantity;
                    await queryRunner.manager.save(product);

                    if (sale.warehouse) {
                        const branchStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                            warehouse_id: sale.warehouse.id,
                            product_id: product.id
                        });
                        if (branchStock) {
                            branchStock.stock_on_hand += retItem.quantity;
                            await queryRunner.manager.save(branchStock);
                        }
                    }

                    let qtyToReturn = retItem.quantity;
                    const saleItemBatches = await queryRunner.manager.find(SaleItemBatch, {
                        where: { sale_item: { id: saleItem.id } },
                        relations: ["product_batch"]
                    });
                    
                    for (const sib of saleItemBatches) {
                        if (qtyToReturn <= 0) break;
                        const returnableToThisBatch = Math.min(sib.quantity_deducted, qtyToReturn);
                        if (returnableToThisBatch > 0) {
                            sib.product_batch.current_quantity += returnableToThisBatch;
                            sib.quantity_deducted -= returnableToThisBatch;
                            qtyToReturn -= returnableToThisBatch;
                            
                            await queryRunner.manager.save(sib.product_batch);
                            await queryRunner.manager.save(sib);
                        }
                    }
                    
                    if (qtyToReturn > 0) {
                        const batch = await queryRunner.manager.findOne(ProductBatch, {
                            where: { product_id: product.id },
                            order: { created_at: "DESC" }
                        });
                        if (batch) {
                            batch.current_quantity += qtyToReturn;
                            await queryRunner.manager.save(batch);
                        }
                    }

                    inventoryUpdates.push({
                        productId: product.id,
                        newStockLevel: product.stock_on_hand,
                        warehouseId: sale.warehouse ? sale.warehouse.id : null
                    });
                } else if (retItem.condition === ReturnItemCondition.DAMAGED) {
                    // Damaged goods are written off automatically as Inventory Shrinkage
                    await AccountingService.recordInventoryAdjustment(
                        queryRunner.manager, 
                        returnReq.id, // using request ID as correlation
                        itemCogs, 
                        true // isShrinkage = true
                    );
                }

                await queryRunner.manager.save(retItem);
            }

            sale.status = SaleStatus.PARTIALLY_REFUNDED;
            await queryRunner.manager.save(sale);

            const creditNote = new CreditNote();
            creditNote.sale = sale;
            creditNote.amount = totalRefundAmount;
            creditNote.reason = returnReq.reason;
            creditNote.cashier = admin;
            await queryRunner.manager.save(creditNote);

            try {
                await EtimsMockService.signCreditNote(creditNote);
            } catch (err) {}

            const isCash = sale.payment_method === "cash";
            await AccountingService.recordSaleReversal(
                queryRunner.manager,
                sale.id,
                totalRefundAmount,
                totalSubtotalRefund,
                totalTaxRefund,
                calculatedTotalCogs,
                isCash
            );

            // Deduct from the requesting Cashier's active shift
            const activeShift = await queryRunner.manager.findOne(Shift, {
                where: { cashier_id: returnReq.requested_by.id, status: ShiftStatus.OPEN }
            });

            if (activeShift) {
                if (isCash) {
                    activeShift.expected_cash -= totalRefundAmount;
                } else if (sale.payment_method === "mpesa") {
                    activeShift.mpesa_total -= totalRefundAmount;
                }
                await queryRunner.manager.save(activeShift);
            }

            returnReq.status = ReturnStatus.APPROVED;
            returnReq.approved_by = admin;
            
            if (refund_method) {
                returnReq.refund_method = refund_method;
            }

            let generatedStoreCredit = null;

            if (returnReq.refund_method === RefundMethod.STORE_CREDIT) {
                if (sale.customer) {
                    sale.customer.store_credit_balance = Number(sale.customer.store_credit_balance) + totalRefundAmount;
                    await queryRunner.manager.save(sale.customer);
                } else {
                    const sc = new StoreCredit();
                    sc.barcode = "SC-" + crypto.randomBytes(4).toString("hex").toUpperCase();
                    sc.original_amount = totalRefundAmount;
                    sc.current_balance = totalRefundAmount;
                    sc.issued_from_return_id = returnReq.id;
                    sc.status = StoreCreditStatus.ACTIVE;
                    // expire in 1 year
                    sc.expires_at = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
                    await queryRunner.manager.save(sc);
                    generatedStoreCredit = sc;
                }
            } else if (returnReq.refund_method === RefundMethod.MPESA) {
                returnReq.pesapal_refund_logged = true;
                returnReq.pesapal_refund_notes = "Manual refund action required by admin on Pesapal Dashboard";
            }
            
            await queryRunner.manager.save(returnReq);

            await queryRunner.commitTransaction();

            for (const update of inventoryUpdates) {
                SocketService.emitInventoryUpdated(update.productId, update.newStockLevel, update.warehouseId || undefined);
            }

            res.status(200).json({ 
                message: "Return approved securely.", 
                creditNote, 
                pesapalRefundRequired: returnReq.refund_method === RefundMethod.MPESA,
                storeCreditBarcode: generatedStoreCredit ? generatedStoreCredit.barcode : null
            });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: error instanceof Error ? error.message : "Error approving return" });
        } finally {
            await queryRunner.release();
        }
    }

    static async rejectReturn(req: any, res: Response) {
        try {
            const requestId = req.params.id;
            const { rejection_reason } = req.body;

            const returnReq = await returnRepository.findOne({ where: { id: requestId } });
            if (!returnReq) return res.status(404).json({ message: "Return request not found" });

            if (returnReq.status !== ReturnStatus.PENDING) {
                return res.status(400).json({ message: "Request already processed" });
            }

            const admin = await userRepository.findOneBy({ id: req.user.id });

            returnReq.status = ReturnStatus.REJECTED;
            returnReq.approved_by = admin;
            returnReq.rejection_reason = rejection_reason || "Rejected by management";

            await returnRepository.save(returnReq);

            res.status(200).json({ message: "Return request rejected", returnReq });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error rejecting return" });
        }
    }

    static async getAllRequests(req: Request, res: Response) {
        try {
            const requests = await returnRepository.find({
                relations: ["sale", "requested_by", "approved_by", "items", "items.sale_item", "items.sale_item.product"],
                order: { created_at: "DESC" }
            });
            res.json(requests);
        } catch (error) {
            res.status(500).json({ message: "Error fetching returns" });
        }
    }
}
