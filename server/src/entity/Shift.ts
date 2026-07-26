import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";

export enum ShiftStatus {
    OPEN = "open",
    CLOSED = "closed"
}

@Entity("shifts")
export class Shift {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "cashier_id" })
    cashier: User;

    @Column()
    cashier_id: string;

    @Column("timestamp", { default: () => "CURRENT_TIMESTAMP" })
    start_time: Date;

    @Column("timestamp", { nullable: true })
    end_time: Date | null;

    @Column({
        type: "enum",
        enum: ShiftStatus,
        default: ShiftStatus.OPEN
    })
    status: ShiftStatus;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    opening_float: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    expected_cash: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    actual_cash: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    mpesa_total: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    total_sales: number;

    @Column("text", { nullable: true })
    notes: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
