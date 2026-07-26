import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { WarehouseStock } from "./WarehouseStock";

@Entity("warehouses")
export class Warehouse {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    location_address: string;

    @Column({ default: true })
    is_active: boolean;

    @Column({ default: false })
    is_main: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => WarehouseStock, ws => ws.warehouse)
    stocks: WarehouseStock[];
}
