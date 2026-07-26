import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { PurchaseOrder } from "./PurchaseOrder";
import { Vendor } from "./Vendor";
import { User } from "./User";
import { DeliveryNoteItem } from "./DeliveryNoteItem";

@Entity("delivery_notes")
export class DeliveryNote {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    po_id: string;

    @ManyToOne(() => PurchaseOrder)
    @JoinColumn({ name: "po_id" })
    purchase_order: PurchaseOrder;

    @Column()
    vendor_id: string;

    @ManyToOne(() => Vendor)
    @JoinColumn({ name: "vendor_id" })
    vendor: Vendor;

    @Column()
    grn_number: string;

    @Column()
    received_by: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "received_by" })
    receiver: User;

    @Column("int", { default: 0 })
    total_items: number;

    @Column("decimal", { precision: 10, scale: 2, default: 0 })
    total_value: number;

    @Column({ nullable: true, type: "text" })
    notes: string;

    @Column({ default: 'completed' })
    status: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => DeliveryNoteItem, item => item.delivery_note, { cascade: true })
    items: DeliveryNoteItem[];
}
