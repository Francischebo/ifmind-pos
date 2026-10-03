import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Invoice } from "./Invoice";
import { User } from "./User";

@Entity("invoice_payments")
export class InvoicePayment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    invoice_id: string;

    @ManyToOne(() => Invoice, { onDelete: "CASCADE" })
    @JoinColumn({ name: "invoice_id" })
    invoice: Invoice;

    @Column("decimal", { precision: 12, scale: 2 })
    amount: number;

    @Column({ type: "varchar" })
    payment_method: string;

    @Column({ type: "varchar", nullable: true })
    reference_number: string | null;

    @Column({ type: "varchar", nullable: true })
    mpesa_receipt: string | null;

    @Column("text", { nullable: true })
    notes: string | null;

    @Column({ type: "uuid" })
    received_by: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "received_by" })
    receiver: User;

    @CreateDateColumn({ type: "timestamptz" })
    created_at: Date;
}
