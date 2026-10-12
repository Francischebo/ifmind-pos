import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Category } from "./Category";
import { TaxClass } from "./TaxClass";

@Entity("products")
export class Product {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    sku: string;

    @Column({ unique: true, nullable: true })
    barcode: string;

    @Column()
    name: string;

    @ManyToOne(() => Category, category => category.products)
    @JoinColumn({ name: "category_id" })
    category: Category | null;

    @Column("decimal", { precision: 10, scale: 2 })
    unit_cost: number;

    @Column("decimal", { precision: 10, scale: 2 })
    retail_price: number;

    @ManyToOne(() => TaxClass, { nullable: true })
    @JoinColumn({ name: "tax_class_id" })
    tax_class: TaxClass | null;

    @Column({ nullable: true })
    tax_class_id: string;

    @Column("decimal", { precision: 5, scale: 2, default: 16.0 })
    tax_rate: number; // Deprecated, kept for backward compatibility during migration

    @Column({ default: "piece" })
    unit_of_measure: string;

    @Column("int", { default: 10 })
    reorder_level: number;

    @Column("int", { default: 0 })
    stock_on_hand: number;

    @Column({ default: "main" })
    location: string;

    @ManyToOne(() => Product, { nullable: true })
    @JoinColumn({ name: "parent_id" })
    parent: Product | null;

    @Column({ nullable: true })
    parent_id: string;

    @Column({ default: false })
    is_parent: boolean;

    @Column("jsonb", { nullable: true })
    variant_attributes: Record<string, string | number | boolean> | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
