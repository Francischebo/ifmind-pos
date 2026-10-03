import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Customer } from "./Customer";

@Entity("loyalty_members")
export class LoyaltyMember {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Customer, { nullable: false, onDelete: "CASCADE" })
    @JoinColumn({ name: "customer_id" })
    customer: Customer;

    @Column({ type: "uuid" })
    customer_id: string;

    @Column("int", { default: 0 })
    points: number;

    @Column({ default: "Bronze" })
    tier: string;

    @Column("decimal", { precision: 12, scale: 2, default: 0 })
    total_spent: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
