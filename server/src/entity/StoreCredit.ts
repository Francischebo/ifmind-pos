import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

export enum StoreCreditStatus {
    ACTIVE = "active",
    REDEEMED = "redeemed",
    EXPIRED = "expired",
    VOIDED = "voided"
}

@Entity("store_credits")
export class StoreCredit {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column("varchar", { length: 20, unique: true })
    barcode: string; // e.g., SC-123456789

    @Column("decimal", { precision: 10, scale: 2 })
    original_amount: number;

    @Column("decimal", { precision: 10, scale: 2 })
    current_balance: number;

    @Column({
        type: "enum",
        enum: StoreCreditStatus,
        default: StoreCreditStatus.ACTIVE
    })
    status: StoreCreditStatus;

    @Column({ nullable: true })
    issued_from_return_id: string; // Reference to the return request that generated this

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @Column("timestamp", { nullable: true })
    expires_at: Date;
}
