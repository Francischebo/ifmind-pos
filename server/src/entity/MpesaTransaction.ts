import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Sale } from "./Sale";
import { User } from "./User";

@Entity("mpesa_transactions")
export class MpesaTransaction {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid", nullable: true })
    sale_id: string | null;

    @ManyToOne(() => Sale, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "sale_id" })
    sale: Sale | null;

    @Column({ type: "uuid", nullable: true })
    cashier_id: string | null;

    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "cashier_id" })
    cashier: User | null;

    @Column({ type: "uuid", nullable: true })
    checkout_session_id: string | null;

    @Column({ type: "varchar", unique: true })
    transaction_code: string;

    @Column({ type: "varchar" })
    phone_number: string;

    @Column("decimal", { precision: 10, scale: 2 })
    amount: number;

    @Column({ type: "varchar", default: "pending" })
    status: string;

    @Column({ type: "varchar", nullable: true })
    mpesa_receipt_number: string | null;

    @Column({ type: "text", nullable: true })
    result_desc: string | null;

    @Column({ type: "varchar", nullable: true })
    checkout_request_id: string | null;

    @Column({ type: "varchar", nullable: true })
    callback_token_hash: string | null;

    @Column({ type: "varchar", nullable: true })
    merchant_request_id: string | null;

    @Column({ type: "varchar", nullable: true })
    account_reference: string | null;

    @Column({ type: "boolean", default: false })
    callback_received: boolean;

    @Column({ type: "jsonb", nullable: true })
    callback_data: Record<string, unknown> | null;

    @CreateDateColumn({ type: "timestamptz" })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updated_at: Date;
}
