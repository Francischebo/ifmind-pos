import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from "typeorm";
import { JournalLine } from "./JournalLine";

@Entity("journal_entries")
export class JournalEntry {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    reference_id: string; // E.g., Sale ID, PO ID

    @Column()
    reference_type: string; // 'SALE', 'PURCHASE', 'ADJUSTMENT'

    @Column("text", { nullable: true })
    description: string;

    @CreateDateColumn()
    created_at: Date;

    @OneToMany(() => JournalLine, line => line.journal_entry, { cascade: true })
    lines: JournalLine[];
}
