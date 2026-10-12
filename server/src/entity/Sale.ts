import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { User } from "./User";
import { SaleItem } from "./SaleItem";
import { Customer } from "./Customer";
import { Warehouse } from "./Warehouse";

export enum PaymentMethod {
    CASH = "cash",
    MPESA = "mpesa",
    HYBRID = "hybrid",
    STORE_CREDIT = "store_credit"
}

export enum SaleStatus {
    COMPLETED = "completed",
    PENDING = "pending",
    VOIDED = "voided",
    PARTIALLY_REFUNDED = "partially_refunded",
    PARKED = "parked"
}

@Entity("sales")
export class Sale {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "cashier_id" })
    cashier: User;

    @ManyToOne(() => Warehouse, { nullable: true })
    @JoinColumn({ name: "warehouse_id" })
    warehouse: Warehouse | null;

    @ManyToOne(() => Customer, customer => customer.sales, { nullable: true })
    @JoinColumn({ name: "customer_id" })
    customer: Customer | null;

    @Column("decimal", { precision: 10, scale: 2 })
    subtotal: number;

    @Column("decimal", { precision: 10, scale: 2 })
    tax_amount: number;

    @Column("decimal", { precision: 10, scale: 2 })
    total_amount: number;

    @Column({
        type: "enum",
        enum: PaymentMethod
    })
    payment_method: PaymentMethod;

    @Column({
        type: "enum",
        enum: SaleStatus,
        default: SaleStatus.COMPLETED
    })
    status: SaleStatus;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    cash_amount: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    mpesa_amount: number;

    @Column({ type: "varchar", default: "pending" })
    payment_status: string;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    change_amount: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    store_credit_amount: number;

    @Column({ type: "varchar", length: 20, nullable: true })
    store_credit_barcode: string | null;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    loyalty_discount: number;

    @Column({ type: "varchar", nullable: true })
    idempotency_key: string | null;

    // Pesapal Integration fields
    @Column({ nullable: true })
    pesapal_tracking_id: string;

    @Column({ nullable: true })
    pesapal_status: string; // 'pending', 'completed', 'failed'

    // ETIMS Compliance fields
    @Column({ nullable: true })
    etims_receipt_no: string;

    @Column("text", { nullable: true })
    etims_qr_code: string;

    @Column("text", { nullable: true })
    etims_signature: string;

    @CreateDateColumn()
    created_at: Date;

    @Column({ type: "timestamptz", nullable: true })
    offline_created_at: Date | null;

    @OneToMany(() => SaleItem, saleItem => saleItem.sale)
    items: SaleItem[];
}
