import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { PurchaseOrder } from "../entity/PurchaseOrder";
import { DeliveryNote } from "../entity/DeliveryNote";
import { SupplierInvoice, InvoiceStatus } from "../entity/SupplierInvoice";
import { PurchaseRequisition, RequisitionStatus } from "../entity/PurchaseRequisition";
import { Vendor } from "../entity/Vendor";
import { User } from "../entity/User";
import { AccountingService } from "../services/AccountingService";

const invoiceRepo = AppDataSource.getRepository(SupplierInvoice);
const reqRepo = AppDataSource.getRepository(PurchaseRequisition);

export class ProcurementController {

    // -----------------------------------------------------
    // 3-WAY MATCHING (Invoice <- PO -> GRN)
    // -----------------------------------------------------
    static async createSupplierInvoice(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { invoice_number, vendor_id, po_id, grn_id, total_amount, due_date } = req.body;

            const vendor = await queryRunner.manager.findOneBy(Vendor, { id: vendor_id });
            const po = await queryRunner.manager.findOneBy(PurchaseOrder, { id: po_id });
            const grn = await queryRunner.manager.findOneBy(DeliveryNote, { id: grn_id });

            if (!vendor || !po || !grn) {
                throw new Error("Invalid references provided.");
            }

            const invoice = new SupplierInvoice();
            invoice.invoice_number = invoice_number;
            invoice.vendor = vendor;
            invoice.purchase_order = po;
            invoice.delivery_note = grn;
            invoice.total_amount = total_amount;
            invoice.due_date = new Date(due_date);
            
            // Perform 3-Way Match
            // Validate amounts/quantities
            const poAmount = Number(po.total_amount);
            const grnAmount = Number(grn.total_value);
            const invAmount = Number(total_amount);

            if (poAmount === grnAmount && grnAmount === invAmount) {
                invoice.status = InvoiceStatus.MATCHED;
            } else {
                invoice.status = InvoiceStatus.DISCREPANCY;
            }

            await queryRunner.manager.save(invoice);

            // If matched, we authorize the Accounts Payable Ledger
            // (Note: GRN already debited inventory and credited AP. We might just flag it for payment here,
            // or if the invoice differs slightly, adjust the AP entry).
            // For this phase, if matched, it's verified ready for payment.

            await queryRunner.commitTransaction();
            res.status(201).json({ message: "Invoice processed", invoice });

        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: error.message || "Failed to process invoice" });
        } finally {
            await queryRunner.release();
        }
    }

    // -----------------------------------------------------
    // PURCHASE REQUISITIONS & HIERARCHIES
    // -----------------------------------------------------
    static async updateRequisitionStatus(req: any, res: Response) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            const requisition = await reqRepo.findOne({ where: { id }, relations: ["product", "requester"] });
            if (!requisition) return res.status(404).json({ message: "Requisition not found" });

            // Ensure hierarchical flow
            if (status === RequisitionStatus.APPROVED || status === RequisitionStatus.REJECTED) {
                const approver = await AppDataSource.manager.findOneBy(User, { id: req.user.id });
                if (!approver) return res.status(401).json({ message: "Invalid approver" });
                requisition.approver = approver;
            }

            requisition.status = status;
            await reqRepo.save(requisition);

            res.json(requisition);
        } catch(err: any) {
             res.status(400).json({ message: "Failed to update requisition" });
        }
    }
}
