import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { PurchaseOrder } from "./PurchaseOrder";
import { Product } from "./Product";

@Entity("po_items")
export class PoItem {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    po_id: string;

    @ManyToOne(() => PurchaseOrder, po => po.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "po_id" })
    purchase_order: PurchaseOrder;

    @Column()
    product_id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column("int")
    quantity: number;

    @Column("int", { default: 0 })
    received_quantity: number;

    @Column("decimal", { precision: 10, scale: 2 })
    unit_cost: number;
}
