import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Product } from "./Product";
import { Warehouse } from "./Warehouse";
import { User } from "./User";

export enum TransferStatus {
    PENDING = "pending",
    IN_TRANSIT = "in_transit",
    COMPLETED = "completed",
    CANCELLED = "cancelled"
}

@Entity("inventory_transfers")
export class InventoryTransfer {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column()
    product_id: string;

    @ManyToOne(() => Warehouse)
    @JoinColumn({ name: "from_warehouse_id" })
    from_warehouse: Warehouse;

    @Column()
    from_warehouse_id: string;

    @ManyToOne(() => Warehouse)
    @JoinColumn({ name: "to_warehouse_id" })
    to_warehouse: Warehouse;

    @Column()
    to_warehouse_id: string;

    @Column("int")
    quantity: number;

    @Column({
        type: "enum",
        enum: TransferStatus,
        default: TransferStatus.PENDING
    })
    status: TransferStatus;

    @ManyToOne(() => User)
    @JoinColumn({ name: "requested_by" })
    requester: User;

    @Column()
    requested_by: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "fulfilled_by" })
    fulfiller: User | null;

    @Column({ nullable: true })
    fulfilled_by: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
