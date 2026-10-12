import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToOne } from "typeorm";
import { Sale, EtimsStatus } from "./Sale";
import { User } from "./User";
import { ReturnRequest } from "./ReturnRequest";

@Entity("credit_notes")
export class CreditNote {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Sale)
    @JoinColumn({ name: "sale_id" })
    sale: Sale;

    @Column("decimal", { precision: 10, scale: 2 })
    amount: number;

    @Column("text")
    reason: string;

    @Column({ type: "varchar", length: 32, default: "not_applicable" })
    etims_status: EtimsStatus;

    @Column("int", { default: 0 })
    etims_attempts: number;

    @Column("text", { nullable: true })
    etims_last_error: string | null;

    @Column({ type: "timestamptz", nullable: true })
    etims_submitted_at: Date | null;

    @Column({ type: "varchar", nullable: true })
    etims_note_no: string | null;

    @Column("text", { nullable: true })
    etims_qr_code: string | null;

    @Column("text", { nullable: true })
    etims_signature: string | null;

    @OneToOne(() => ReturnRequest, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "return_request_id" })
    return_request: ReturnRequest | null;

    @ManyToOne(() => User)
    @JoinColumn({ name: "cashier_id" })
    cashier: User;

    @CreateDateColumn()
    created_at: Date;
}
