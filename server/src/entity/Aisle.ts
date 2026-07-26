import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Warehouse } from "./Warehouse";
import { Bin } from "./Bin";

@Entity("aisles")
export class Aisle {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @ManyToOne(() => Warehouse)
    @JoinColumn({ name: "warehouse_id" })
    warehouse: Warehouse;

    @Column()
    warehouse_id: string;

    @OneToMany(() => Bin, bin => bin.aisle)
    bins: Bin[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
