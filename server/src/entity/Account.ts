import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { JournalLine } from "./JournalLine";

export enum AccountType {
    ASSET = "asset",
    LIABILITY = "liability",
    EQUITY = "equity",
    REVENUE = "revenue",
    EXPENSE = "expense"
}

@Entity("accounts")
export class Account {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    code: string;

    @Column()
    name: string;

    @Column({
        type: "enum",
        enum: AccountType,
    })
    type: AccountType;

    @Column({ default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @OneToMany(() => JournalLine, line => line.account)
    journal_lines: JournalLine[];
}
