import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Product } from "./Product";
import { User } from "./User";

export enum RequisitionStatus {
    DRAFT = "draft",
    PENDING_MANAGER = "pending_manager",
    APPROVED = "approved",
    REJECTED = "rejected",
    PO_CREATED = "po_created"
}

@Entity("purchase_requisitions")
export class PurchaseRequisition {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => Product)
    @JoinColumn({ name: "product_id" })
    product: Product;

    @Column()
    product_id: string;

    @Column("int")
    requested_quantity: number;

    @Column({
        type: "enum",
        enum: RequisitionStatus,
        default: RequisitionStatus.DRAFT
    })
    status: RequisitionStatus;

    @ManyToOne(() => User)
    @JoinColumn({ name: "requested_by" })
    requester: User;

    @Column()
    requested_by: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: "approved_by" })
    approver: User | null;

    @Column({ nullable: true })
    approved_by: string;

    @Column({ default: false })
    is_auto_generated: boolean;

    @Column({ type: "text", nullable: true })
    notes: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
