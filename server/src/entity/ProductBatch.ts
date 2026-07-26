import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Product } from "./Product";
import { PurchaseOrder } from "./PurchaseOrder";
import { Bin } from "./Bin";

@Entity("product_batches")
export class ProductBatch {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    product_id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column({ nullable: true })
    po_id: string;

    @ManyToOne(() => PurchaseOrder, { nullable: true })
    @JoinColumn({ name: "po_id" })
    purchase_order: PurchaseOrder;

    @ManyToOne(() => Bin, { nullable: true })
    @JoinColumn({ name: "bin_id" })
    bin: Bin | null;

    @Column({ nullable: true })
    bin_id: string;

    @Column()
    batch_number: string;

    @Column("date", { nullable: true })
    expiry_date: Date;

    @Column("date", { nullable: true })
    manufacturing_date: Date;

    @Column({ nullable: true })
    supplier_batch_reference: string;

    @Column({ default: 'pending' })
    quality_check_status: string;

    @Column({ nullable: true })
    environmental_conditions: string;

    @Column("int")
    initial_quantity: number;

    @Column("int")
    current_quantity: number;

    @Column("decimal", { precision: 10, scale: 2 })
    unit_cost: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
