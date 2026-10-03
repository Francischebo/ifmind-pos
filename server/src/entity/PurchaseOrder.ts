import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { Vendor } from "./Vendor";
import { PoItem } from "./PoItem";
import { User } from "./User";
import { Warehouse } from "./Warehouse";

@Entity("purchase_orders")
export class PurchaseOrder {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    po_number: string;

    @Column()
    vendor_id: string;

    @ManyToOne(() => Vendor, vendor => vendor.purchase_orders)
    @JoinColumn({ name: "vendor_id" })
    vendor: Vendor;

    @Column({ nullable: true })
    warehouse_id: string | null;

    @ManyToOne(() => Warehouse, { nullable: true })
    @JoinColumn({ name: "warehouse_id" })
    warehouse: Warehouse | null;

    @Column({ default: 'draft' })
    status: string;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    total_amount: number;

    @Column({ nullable: true })
    created_by: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    creator: User;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => PoItem, item => item.purchase_order, { cascade: true })
    items: PoItem[];
}
