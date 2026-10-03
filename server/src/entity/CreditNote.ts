import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToOne } from "typeorm";
import { Sale } from "./Sale";
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
