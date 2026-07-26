import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Sale, SaleStatus } from "../entity/Sale";
import { AccountingService } from "../services/AccountingService";

export class PaymentController {
    static async pesapalWebhook(req: Request, res: Response) {
        try {
            const { OrderTrackingId, OrderNotificationType, OrderMerchantReference } = req.body;
            
            if (OrderNotificationType === "IPNCHANGE") {
                const queryRunner = AppDataSource.createQueryRunner();
                await queryRunner.connect();
                await queryRunner.startTransaction();
                try {
                    const saleRepo = queryRunner.manager.getRepository(Sale);
                    const sale = await saleRepo.findOne({ where: { pesapal_tracking_id: OrderTrackingId } });
                    
                    if (!sale) {
                        return res.status(404).json({ message: "Sale not found for tracking id " + OrderTrackingId });
                    }
                    
                    if (sale.pesapal_status === "completed") {
                        return res.status(200).json({ message: "Already processed" });
                    }

                    // For mock, assume an IPNCHANGE means payment was successful.
                    sale.pesapal_status = "completed";
                    const pesapal_amount = sale.mpesa_amount > 0 ? sale.mpesa_amount : sale.total_amount;
                    sale.mpesa_amount = pesapal_amount; // Just ensuring the amount field is populated
                    
                    await queryRunner.manager.save(sale);

                    // We are using Pesapal, let's treat it as cash/ar resolution depending on if sale is already recorded.
                    // For now, simply update the DB. Double entries for the initial sale were recorded as AR for non-cash.
                    // Here we'd debit Cash and credit AR.

                    // Debit Cash, Credit AR for the pesapal amount.
                    const cashAcc = await AccountingService.getOrCreateAccount(queryRunner.manager, "1000", "Cash", "asset" as any);
                    const arAcc = await AccountingService.getOrCreateAccount(queryRunner.manager, "1200", "Accounts Receivable", "asset" as any);
                    
                    const { JournalEntry } = require("../entity/JournalEntry");
                    const { JournalLine } = require("../entity/JournalLine");

                    const entry = new JournalEntry();
                    entry.reference_id = sale.id;
                    entry.reference_type = "PESAPAL_PAYMENT";
                    entry.description = `M-Pesa payment received via Pesapal for Sale ID: ${sale.id}`;
                    await queryRunner.manager.save(entry);

                    const debitLine = new JournalLine();
                    debitLine.journal_entry = entry;
                    debitLine.account = cashAcc;
                    debitLine.debit = pesapal_amount;
                    await queryRunner.manager.save(debitLine);

                    const creditLine = new JournalLine();
                    creditLine.journal_entry = entry;
                    creditLine.account = arAcc;
                    creditLine.credit = pesapal_amount;
                    await queryRunner.manager.save(creditLine);

                    await queryRunner.commitTransaction();

                    // Send IPN response expected by Pesapal
                    res.status(200).json({
                        orderNotificationType: req.body.OrderNotificationType,
                        orderTrackingId: req.body.OrderTrackingId,
                        orderMerchantReference: req.body.OrderMerchantReference,
                        status: 200
                    });

                } catch (innerError) {
                    await queryRunner.rollbackTransaction();
                    throw innerError;
                } finally {
                    await queryRunner.release();
                }
            } else {
                res.status(200).json({ message: "Ignored notification type" });
            }
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error processing Pesapal webhook" });
        }
    }
}
