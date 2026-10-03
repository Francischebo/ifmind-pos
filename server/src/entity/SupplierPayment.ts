import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { SupplierInvoice } from "./SupplierInvoice";
import { Vendor } from "./Vendor";
import { User } from "./User";

@Entity("supplier_payments")
export class SupplierPayment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    supplier_invoice_id: string;

    @ManyToOne(() => SupplierInvoice)
    @JoinColumn({ name: "supplier_invoice_id" })
    supplier_invoice: SupplierInvoice;

    @Column()
    vendor_id: string;

    @ManyToOne(() => Vendor)
    @JoinColumn({ name: "vendor_id" })
    vendor: Vendor;

    @Column("decimal", { precision: 12, scale: 2 })
    amount: number;

    @Column({ default: "bank_transfer" })
    payment_method: string;

    @Column({ type: "varchar", nullable: true })
    reference_number: string | null;

    @Column({ type: "date" })
    payment_date: Date;

    @Column({ nullable: true, type: "text" })
    notes: string | null;

    @Column()
    paid_by: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "paid_by" })
    payer: User;

    @CreateDateColumn()
    created_at: Date;
}
