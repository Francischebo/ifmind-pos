import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { SaleItem } from "./SaleItem";
import { ProductBatch } from "./ProductBatch";

@Entity("sale_item_batches")
export class SaleItemBatch {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => SaleItem)
    @JoinColumn({ name: "sale_item_id" })
    sale_item: SaleItem;

    @ManyToOne(() => ProductBatch)
    @JoinColumn({ name: "product_batch_id" })
    product_batch: ProductBatch;

    @Column("int")
    quantity_deducted: number;

    @CreateDateColumn()
    created_at: Date;
}
