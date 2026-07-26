import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from "typeorm";
import { Product } from "./Product";
import { User } from "./User";
import { Warehouse } from "./Warehouse";

export enum AdjustmentType {
    SHRINKAGE = "shrinkage",
    DAMAGE = "damage",
    MISCOUNT = "miscount",
    EXPIRATION = "expiration"
}

@Entity("inventory_adjustments")
export class InventoryAdjustment {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column()
    product_id: string;

    @ManyToOne(() => Warehouse)
    @JoinColumn({ name: "warehouse_id" })
    warehouse: Warehouse;

    @Column()
    warehouse_id: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "authorized_by" })
    authorizer: User;

    @Column()
    authorized_by: string;

    @Column({
        type: "enum",
        enum: AdjustmentType
    })
    type: AdjustmentType;

    @Column("int")
    quantity_adjusted: number; // can be negative or positive

    @Column("decimal", { precision: 10, scale: 2 })
    unit_cost: number;

    @Column("decimal", { precision: 10, scale: 2 })
    total_value_adjusted: number;

    @Column("text")
    reason: string;

    @CreateDateColumn()
    created_at: Date;
}
