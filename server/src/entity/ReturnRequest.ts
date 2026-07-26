import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Sale } from "./Sale";
import { User } from "./User";
import { ReturnItem } from "./ReturnItem";
import { OneToMany } from "typeorm";

export enum RefundMethod {
    CASH = "cash",
    MPESA = "mpesa",
    STORE_CREDIT = "store_credit",
    EXCHANGE = "exchange"
}

export enum ReturnStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected"
}

@Entity("return_requests")
export class ReturnRequest {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Sale)
    @JoinColumn({ name: "sale_id" })
    sale: Sale;

    @ManyToOne(() => User)
    @JoinColumn({ name: "requested_by" })
    requested_by: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "approved_by" })
    approved_by: User | null;

    @OneToMany(() => ReturnItem, return_item => return_item.return_request, { cascade: true })
    items: ReturnItem[];

    @Column({
        type: "enum",
        enum: ReturnStatus,
        default: ReturnStatus.PENDING
    })
    status: ReturnStatus;

    @Column({
        type: "enum",
        enum: RefundMethod,
        default: RefundMethod.CASH
    })
    refund_method: RefundMethod;

    @Column("text")
    reason: string;

    @Column("text", { nullable: true })
    rejection_reason: string | null;

    @Column("boolean", { default: false })
    pesapal_refund_logged: boolean;

    @Column("text", { nullable: true })
    pesapal_refund_notes: string | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
