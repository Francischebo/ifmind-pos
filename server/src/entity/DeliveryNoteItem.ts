import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { DeliveryNote } from "./DeliveryNote";
import { PoItem } from "./PoItem";
import { Product } from "./Product";

@Entity("delivery_note_items")
export class DeliveryNoteItem {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    delivery_note_id: string;

    @ManyToOne(() => DeliveryNote, dn => dn.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "delivery_note_id" })
    delivery_note: DeliveryNote;

    @Column({ nullable: true })
    po_item_id: string;

    @ManyToOne(() => PoItem)
    @JoinColumn({ name: "po_item_id" })
    po_item: PoItem;

    @Column()
    product_id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column("int")
    ordered_quantity: number;

    @Column("int")
    received_quantity: number;

    @Column("int", { default: 0 })
    rejected_quantity: number;

    @Column({ nullable: true })
    rejection_reason: string;

    @Column("decimal", { precision: 10, scale: 2 })
    unit_cost: number;

    @Column("decimal", { precision: 10, scale: 2 })
    line_total: number;

    @Column({ nullable: true })
    batch_number: string;

    @Column("date", { nullable: true })
    expiry_date: Date;
}
