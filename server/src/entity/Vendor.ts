import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { PurchaseOrder } from "./PurchaseOrder";

@Entity("vendors")
export class Vendor {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    contact_person: string;

    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    email: string;

    @Column({ nullable: true, type: "text" })
    address: string;

    @Column({ nullable: true })
    payment_terms: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => PurchaseOrder, po => po.vendor)
    purchase_orders: PurchaseOrder[];
}
