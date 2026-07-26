import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Aisle } from "./Aisle";

@Entity("bins")
export class Bin {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @ManyToOne(() => Aisle, aisle => aisle.bins)
    @JoinColumn({ name: "aisle_id" })
    aisle: Aisle;

    @Column()
    aisle_id: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
