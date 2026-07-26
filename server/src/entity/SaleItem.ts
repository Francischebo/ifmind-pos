import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Sale } from "./Sale";
import { Product } from "./Product";

@Entity("sale_items")
export class SaleItem {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Sale, sale => sale.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "sale_id" })
    sale: Sale;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column("int")
    quantity: number;

    @Column("decimal", { precision: 10, scale: 2 })
    unit_price: number;

    @Column("decimal", { precision: 5, scale: 2 })
    tax_rate: number;

    @Column("decimal", { precision: 10, scale: 2 })
    line_total: number;

    @CreateDateColumn()
    created_at: Date;
}
