import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { PurchaseOrder } from "../entity/PurchaseOrder";
import { DeliveryNote } from "../entity/DeliveryNote";
import { SupplierInvoice, InvoiceStatus } from "../entity/SupplierInvoice";
import { PurchaseRequisition, RequisitionStatus } from "../entity/PurchaseRequisition";
import { Vendor } from "../entity/Vendor";
import { User } from "../entity/User";
import { SupplierPayment } from "../entity/SupplierPayment";
import { AccountingService } from "../services/AccountingService";

const invoiceRepo = AppDataSource.getRepository(SupplierInvoice);
const paymentRepo = AppDataSource.getRepository(SupplierPayment);
const reqRepo = AppDataSource.getRepository(PurchaseRequisition);

class DuplicateSupplierInvoiceError extends Error {}
class DuplicateDeliveryNoteInvoiceError extends Error {}

const SUPPLIER_INVOICE_ALLOWED_FIELDS = new Set([
    "invoice_number",
    "vendor_id",
    "po_id",
    "delivery_note_id",
    "subtotal",
    "tax_amount",
    "total_amount",
    "due_date",
    "invoice_date",
    "notes",
    "payment_terms",
]);

const SUPPLIER_PAYMENT_ALLOWED_FIELDS = new Set([
    "amount",
    "payment_method",
    "reference_number",
    "payment_date",
    "notes",
]);

export const sanitizeSupplierInvoicePayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Record<string, any>;
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!SUPPLIER_INVOICE_ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "" && (key === "invoice_number" || key === "vendor_id" || key === "po_id")) continue;
            sanitized[key] = trimmed;
            continue;
        }

        if (typeof value === "number" || typeof value === "boolean") {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

export const sanitizeSupplierPaymentPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Record<string, any>;
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!SUPPLIER_PAYMENT_ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "" && (key === "payment_method" || key === "reference_number")) continue;
            sanitized[key] = trimmed;
            continue;
        }

        if (typeof value === "number") {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

export const sanitizeRequisitionStatusPayload = (input: unknown): { status: RequisitionStatus } => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Requisition status payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const status = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "";

    if (!Object.values(RequisitionStatus).includes(status as RequisitionStatus)) {
        throw new Error("status is invalid");
    }

    return { status: status as RequisitionStatus };
};

export class ProcurementController {

    static async listSupplierInvoices(req: Request, res: Response) {
        try {
            const invoices = await invoiceRepo.find({
                relations: ["vendor", "purchase_order", "delivery_note"],
                order: { created_at: "DESC" },
            });

            return res.json(invoices);
        } catch (error: any) {
            console.error("Error fetching supplier invoices:", error);
            return res.status(500).json({ message: "Error fetching supplier invoices" });
        }
    }

    static async listSupplierPayments(req: Request, res: Response) {
        try {
            const payments = await paymentRepo.find({
                where: { supplier_invoice_id: req.params.invoiceId as string },
                order: { created_at: "DESC" },
            });

            return res.json(payments);
        } catch (error: any) {
            console.error("Error fetching supplier payments:", error);
            return res.status(500).json({ message: "Error fetching supplier payments" });
        }
    }

    // -----------------------------------------------------
    // 3-WAY MATCHING (Invoice <- PO -> GRN)
    // -----------------------------------------------------
    static async createSupplierInvoice(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const payload = sanitizeSupplierInvoicePayload(req.body);
            const { vendor_id, po_id, delivery_note_id, subtotal, tax_amount, total_amount, due_date, invoice_date, notes, payment_terms } = payload;
            const invoiceNumber = typeof payload.invoice_number === "string" ? payload.invoice_number.trim().toUpperCase() : "";
            if (!invoiceNumber) throw new Error("invoice_number is required");
            const actorId = req.user?.id ?? null;

            const duplicateInvoice = await queryRunner.manager.findOne(SupplierInvoice, {
                where: { vendor_id, invoice_number: invoiceNumber },
            });
            if (duplicateInvoice) {
                throw new DuplicateSupplierInvoiceError("This invoice number already exists for this vendor");
            }

            const vendor = await queryRunner.manager.findOneBy(Vendor, { id: vendor_id });
            const po = po_id ? await queryRunner.manager.findOneBy(PurchaseOrder, { id: po_id }) : null;
            const grn = delivery_note_id
                ? await queryRunner.manager.findOne(DeliveryNote, {
                    where: { id: delivery_note_id },
                    lock: { mode: "pessimistic_write" },
                })
                : null;

            if (!vendor || !po || !grn) {
                throw new Error("Invalid references provided.");
            }
            if (po.vendor_id !== vendor.id || grn.vendor_id !== vendor.id || grn.po_id !== po.id) {
                throw new Error("Invoice vendor, purchase order, and goods receipt must match.");
            }
            if (grn.status !== "completed") {
                throw new Error("Goods receipt must be completed before invoicing.");
            }

            const invoiceSubtotal = Number(subtotal ?? 0);
            const invoiceTax = Number(tax_amount ?? 0);
            const invoiceTotal = Number(total_amount ?? invoiceSubtotal + invoiceTax);
            if ([invoiceSubtotal, invoiceTax, invoiceTotal].some((amount) => !Number.isFinite(amount) || amount < 0)) {
                throw new Error("Invoice amounts must be valid non-negative numbers.");
            }
            if (Math.abs(invoiceTotal - invoiceSubtotal - invoiceTax) > 0.01) {
                throw new Error("Invoice total must equal subtotal plus tax.");
            }

            const invoice = new SupplierInvoice();
            invoice.invoice_number = invoiceNumber;
            invoice.vendor = vendor;
            invoice.purchase_order = po;
            invoice.delivery_note = grn;
            invoice.delivery_note_id = grn.id;
            invoice.total_amount = invoiceTotal;
            invoice.tax_amount = invoiceTax;
            invoice.due_date = new Date(due_date || invoice_date || Date.now());
            invoice.payment_terms = payment_terms ?? null;
            invoice.notes = notes ?? null;
            invoice.created_by = actorId ?? null;
            invoice.invoice_date = invoice_date ? new Date(invoice_date) : new Date();
            invoice.subtotal = invoiceSubtotal;
            invoice.paid_amount = 0;
            invoice.balance_due = invoice.total_amount;

            const grnAmount = Number(grn.total_value || 0);
            const poAmount = Number(po.total_amount || 0);

            if (grnAmount > poAmount + 0.01) {
                throw new Error("Goods receipt value exceeds the purchase order value.");
            }

            if (Math.abs(invoice.subtotal - grnAmount) <= 0.01) {
                const existingInvoicesForGrn = await queryRunner.manager.find(SupplierInvoice, {
                    where: { delivery_note_id: grn.id },
                    select: ["id", "status"],
                });
                if (existingInvoicesForGrn.some((existingInvoice) => existingInvoice.status !== InvoiceStatus.DISCREPANCY)) {
                    throw new DuplicateDeliveryNoteInvoiceError("This goods receipt already has a payable supplier invoice");
                }
                invoice.status = InvoiceStatus.MATCHED;
            } else {
                invoice.status = InvoiceStatus.DISCREPANCY;
            }

            await queryRunner.manager.save(invoice);
            await queryRunner.commitTransaction();
            return res.status(201).json({ message: "Invoice processed", invoice });

        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            if (error instanceof DuplicateSupplierInvoiceError) {
                return res.status(409).json({ message: error.message });
            }
            if (error instanceof DuplicateDeliveryNoteInvoiceError) {
                return res.status(409).json({ message: error.message });
            }
            if (error?.driverError?.code === "23505" && error?.driverError?.constraint === "IDX_supplier_invoice_vendor_number") {
                return res.status(409).json({ message: "This invoice number already exists for this vendor" });
            }
            return res.status(400).json({ message: error.message || "Failed to process invoice" });
        } finally {
            await queryRunner.release();
        }
    }

    static async recordSupplierPayment(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { invoiceId } = req.params;
            const payload = sanitizeSupplierPaymentPayload(req.body);
            const { amount, payment_method, reference_number, payment_date, notes } = payload;
            const actorId = req.user?.id ?? null;
            const parsedAmount = Number(amount);

            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({ message: "Valid payment amount is required" });
            }

            const invoice = await queryRunner.manager.findOne(SupplierInvoice, {
                where: { id: invoiceId },
                lock: { mode: "pessimistic_write" },
            });
            if (!invoice) {
                await queryRunner.rollbackTransaction();
                return res.status(404).json({ message: "Supplier invoice not found" });
            }

            if (invoice.status !== InvoiceStatus.MATCHED && invoice.status !== InvoiceStatus.PENDING) {
                await queryRunner.rollbackTransaction();
                return res.status(409).json({ message: "Supplier invoice must pass three-way matching before payment" });
            }

            const balanceDue = Number(invoice.balance_due ?? invoice.total_amount ?? 0);
            if (parsedAmount > balanceDue) {
                await queryRunner.rollbackTransaction();
                return res.status(400).json({ message: "Payment amount exceeds invoice balance" });
            }

            const payerId = actorId ?? invoice.created_by;
            if (!payerId) {
                await queryRunner.rollbackTransaction();
                return res.status(400).json({ message: "Payment author is required" });
            }

            const payment = new SupplierPayment();
            payment.supplier_invoice_id = invoice.id;
            payment.vendor_id = invoice.vendor_id;
            payment.amount = parsedAmount;
            payment.payment_method = payment_method || "bank_transfer";
            payment.reference_number = reference_number ?? null;
            payment.payment_date = new Date(payment_date || Date.now());
            payment.notes = notes ?? null;
            payment.paid_by = payerId;
            await queryRunner.manager.save(payment);

            const newPaidAmount = Number(invoice.paid_amount || 0) + parsedAmount;
            invoice.paid_amount = newPaidAmount;
            invoice.balance_due = Math.max(0, Number(invoice.total_amount || 0) - newPaidAmount);
            invoice.status = invoice.balance_due <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PENDING;
            await queryRunner.manager.save(invoice);

            await AccountingService.recordSupplierPayment(
                queryRunner.manager,
                payment.id,
                invoice.id,
                parsedAmount,
            );

            await queryRunner.commitTransaction();
            return res.status(201).json({ message: "Payment recorded", payment, invoice });
        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            console.error("Error recording supplier payment:", error);
            return res.status(500).json({ message: error.message || "Error recording supplier payment" });
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
            const { status } = sanitizeRequisitionStatusPayload(req.body ?? {});

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
             res.status(400).json({ message: err.message || "Failed to update requisition" });
        }
    }
}
