import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./User";

@Entity("otp_codes")
export class OtpCode {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @ManyToOne(() => User, (user) => user.id, { onDelete: "CASCADE" })
    @JoinColumn({ name: "user_id" })
    user: User;

    @Column()
    user_id: string;

    @Column()
    code_hash: string;

    @Column()
    expires_at: Date;

    @Column({ default: false })
    is_used: boolean;

    @Column({ default: 0 })
    attempts: number;

    @CreateDateColumn()
    created_at: Date;
}
