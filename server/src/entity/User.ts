import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne } from "typeorm";
import { Profile } from "./Profile";

export enum AppRole {
    ADMIN = "admin",
    MANAGER = "manager",
    SUPERVISOR = "supervisor",
    CASHIER = "cashier"
}

@Entity("users")
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    email: string;

    @Column()
    password_hash: string;

    @Column({
        type: "enum",
        enum: AppRole,
        default: AppRole.CASHIER
    })
    role: AppRole;

    @Column({ default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToOne(() => Profile, profile => profile.user)
    profile: Profile;
}
