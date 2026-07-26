import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Sale } from "./Sale";
import { User } from "./User";

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

    @ManyToOne(() => User)
    @JoinColumn({ name: "cashier_id" })
    cashier: User;

    @CreateDateColumn()
    created_at: Date;
}
