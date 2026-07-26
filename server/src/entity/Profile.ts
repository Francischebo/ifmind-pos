import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity("profiles")
export class Profile {
    @PrimaryColumn("uuid")
    id: string;

    @OneToOne(() => User, user => user.profile, { onDelete: "CASCADE" })
    @JoinColumn({ name: "id" })
    user: User;

    @Column()
    full_name: string;

    @Column({ nullable: true })
    phone_encrypted: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
