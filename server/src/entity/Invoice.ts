import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Sale } from "./Sale";
import { Customer } from "./Customer";
import { User } from "./User";

export enum InvoiceStatus {
    DRAFT = "draft",
    ISSUED = "issued",
    PARTIALLY_PAID = "partially_paid",
    PAID = "paid",
    CANCELLED = "cancelled",
    VOID = "void",
}

@Entity("invoices")
export class Invoice {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    invoice_number: string;

    @Column({ type: "uuid", nullable: true })
    sale_id: string | null;

    @ManyToOne(() => Sale, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "sale_id" })
    sale: Sale | null;

    @Column({ type: "uuid", nullable: true })
    customer_id: string | null;

    @ManyToOne(() => Customer, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "customer_id" })
    customer: Customer | null;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    subtotal: number;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    tax_amount: number;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    discount_amount: number;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    total_amount: number;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    paid_amount: number;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    balance_due: number;

    @Column({ type: "varchar", default: InvoiceStatus.DRAFT })
    status: InvoiceStatus;

    @Column("date", { nullable: true })
    due_date: Date | null;

    @Column("timestamptz", { nullable: true })
    issued_at: Date | null;

    @Column("timestamptz", { nullable: true })
    paid_at: Date | null;

    @Column("text", { nullable: true })
    notes: string | null;

    @Column({ type: "uuid" })
    created_by: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    creator: User;

    @CreateDateColumn({ type: "timestamptz" })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updated_at: Date;
}
