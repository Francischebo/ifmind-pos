import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { User } from "./User";
import { Warehouse } from "./Warehouse";
import { StockTakeItem } from "./StockTakeItem";

export enum StockTakeStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    CANCELLED = "cancelled"
}

@Entity("stock_takes")
export class StockTake {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Warehouse)
    @JoinColumn({ name: "warehouse_id" })
    warehouse: Warehouse;

    @Column()
    warehouse_id: string;

    @Column({
        type: "enum",
        enum: StockTakeStatus,
        default: StockTakeStatus.PENDING
    })
    status: StockTakeStatus;

    @Column("text", { nullable: true })
    notes: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: "created_by" })
    creator: User;

    @Column()
    created_by: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "completed_by" })
    completer: User;

    @Column({ nullable: true })
    completed_by: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @Column({ type: "timestamp", nullable: true })
    completed_at: Date;

    @OneToMany(() => StockTakeItem, item => item.stock_take, { cascade: true })
    items: StockTakeItem[];
}
