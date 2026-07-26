import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { JournalEntry } from "./JournalEntry";
import { Account } from "./Account";

@Entity("journal_lines")
export class JournalLine {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    journal_entry_id: string;

    @Column()
    account_id: string;

    @ManyToOne(() => JournalEntry, entry => entry.lines)
    @JoinColumn({ name: "journal_entry_id" })
    journal_entry: JournalEntry;

    @ManyToOne(() => Account, account => account.journal_lines)
    @JoinColumn({ name: "account_id" })
    account: Account;

    @Column("decimal", { precision: 15, scale: 2, default: 0 })
    debit: number;

    @Column("decimal", { precision: 15, scale: 2, default: 0 })
    credit: number;
}
