import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { PurchaseOrder } from "./PurchaseOrder";
import { DeliveryNote } from "./DeliveryNote";
import { Vendor } from "./Vendor";

export enum InvoiceStatus {
    PENDING = "pending",
    MATCHED = "matched",
    DISCREPANCY = "discrepancy",
    PAID = "paid"
}

@Entity("supplier_invoices")
export class SupplierInvoice {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    invoice_number: string;

    @ManyToOne(() => Vendor)
    @JoinColumn({ name: "vendor_id" })
    vendor: Vendor;

    @Column()
    vendor_id: string;

    @ManyToOne(() => PurchaseOrder)
    @JoinColumn({ name: "po_id" })
    purchase_order: PurchaseOrder;

    @Column()
    po_id: string;

    @ManyToOne(() => DeliveryNote)
    @JoinColumn({ name: "grn_id" })
    delivery_note: DeliveryNote;

    @Column()
    grn_id: string;

    @Column("decimal", { precision: 12, scale: 2 })
    total_amount: number;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    tax_amount: number;

    @Column({
        type: "enum",
        enum: InvoiceStatus,
        default: InvoiceStatus.PENDING
    })
    status: InvoiceStatus;

    @Column("date")
    due_date: Date;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
