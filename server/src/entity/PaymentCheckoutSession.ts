import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

export interface PaymentCheckoutItem {
    product_id: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    sku: string;
    barcode: string | null;
    name: string;
}

@Entity("payment_checkout_sessions")
@Index("IDX_payment_checkout_sessions_cashier_status", ["cashier_id", "status"])
export class PaymentCheckoutSession {
    @PrimaryColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    cashier_id: string;

    @Column({ type: "uuid", nullable: true })
    warehouse_id: string | null;

    @Column({ type: "uuid", nullable: true })
    customer_id: string | null;

    @Column({ type: "varchar", length: 20, nullable: true })
    store_credit_barcode: string | null;

    @Column({ type: "jsonb" })
    items: PaymentCheckoutItem[];

    @Column("decimal", { precision: 10, scale: 2 })
    subtotal: number;

    @Column("decimal", { precision: 10, scale: 2 })
    tax_amount: number;

    @Column("decimal", { precision: 10, scale: 2 })
    total_amount: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    loyalty_discount: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    cash_amount: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    store_credit_amount: number;

    @Column({ type: "varchar", default: "reserved" })
    status: "reserved" | "completed" | "cancelled";

    @CreateDateColumn({ type: "timestamptz" })
    created_at: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updated_at: Date;
}
