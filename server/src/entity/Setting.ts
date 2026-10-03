import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("settings")
export class Setting {
    @PrimaryColumn("text")
    key: string;

    @Column("text", { nullable: true })
    value: string | null;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
