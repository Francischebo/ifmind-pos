import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCreditNoteEtimsFields1791040000000 implements MigrationInterface {
    name = "AddCreditNoteEtimsFields1791040000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "credit_notes"
            ADD COLUMN IF NOT EXISTS "etims_note_no" character varying,
            ADD COLUMN IF NOT EXISTS "etims_qr_code" text,
            ADD COLUMN IF NOT EXISTS "etims_signature" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "credit_notes"
            DROP COLUMN IF EXISTS "etims_signature",
            DROP COLUMN IF EXISTS "etims_qr_code",
            DROP COLUMN IF EXISTS "etims_note_no"
        `);
    }
}
