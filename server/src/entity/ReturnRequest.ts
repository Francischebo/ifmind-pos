import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
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

export enum MpesaRefundStatus {
    NOT_REQUIRED = "not_required",
    PENDING = "pending",
    COMPLETED = "completed"
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

    @Column({ type: "varchar", default: MpesaRefundStatus.NOT_REQUIRED })
    mpesa_refund_status: MpesaRefundStatus;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    mpesa_refund_amount: number;

    @Index("IDX_return_requests_mpesa_refund_receipt", { unique: true, where: '"mpesa_refund_receipt" IS NOT NULL' })
    @Column({ type: "varchar", length: 64, nullable: true })
    mpesa_refund_receipt: string | null;

    @Column("timestamp with time zone", { nullable: true })
    mpesa_refund_completed_at: Date | null;

    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "mpesa_refund_completed_by" })
    mpesa_refund_completed_by: User | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
