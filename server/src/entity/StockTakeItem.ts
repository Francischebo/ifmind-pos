import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { StockTake } from "./StockTake";
import { Product } from "./Product";

@Entity("stock_take_items")
export class StockTakeItem {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => StockTake, stock_take => stock_take.items, { onDelete: "CASCADE" })
    @JoinColumn({ name: "stock_take_id" })
    stock_take: StockTake;

    @Column()
    stock_take_id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column()
    product_id: string;

    @Column("int")
    expected_quantity: number;

    @Column("int", { nullable: true })
    counted_quantity: number | null;

    @Column("int", { nullable: true })
    discrepancy: number | null;
}
