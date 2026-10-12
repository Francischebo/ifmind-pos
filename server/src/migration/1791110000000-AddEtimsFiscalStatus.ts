import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEtimsFiscalStatus1791110000000 implements MigrationInterface {
    name = "AddEtimsFiscalStatus1791110000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add eTIMS fiscal tracking columns to sales
        await queryRunner.query(`
            ALTER TABLE public.sales
            ADD COLUMN IF NOT EXISTS "etims_status" VARCHAR(32) NOT NULL DEFAULT 'not_applicable',
            ADD COLUMN IF NOT EXISTS "etims_attempts" INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "etims_last_error" TEXT,
            ADD COLUMN IF NOT EXISTS "etims_submitted_at" TIMESTAMPTZ
        `);

        // Backfill existing signed sales to 'submitted'
        await queryRunner.query(`
            UPDATE public.sales
            SET "etims_status" = 'submitted',
                "etims_submitted_at" = COALESCE("created_at", NOW())
            WHERE "etims_receipt_no" IS NOT NULL
              AND "etims_status" = 'not_applicable'
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_sales_etims_status"
            ON public.sales ("etims_status")
        `);

        // Add eTIMS fiscal tracking columns to credit_notes
        await queryRunner.query(`
            ALTER TABLE public.credit_notes
            ADD COLUMN IF NOT EXISTS "etims_status" VARCHAR(32) NOT NULL DEFAULT 'not_applicable',
            ADD COLUMN IF NOT EXISTS "etims_attempts" INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "etims_last_error" TEXT,
            ADD COLUMN IF NOT EXISTS "etims_submitted_at" TIMESTAMPTZ
        `);

        // Backfill existing signed credit notes to 'submitted'
        await queryRunner.query(`
            UPDATE public.credit_notes
            SET "etims_status" = 'submitted',
                "etims_submitted_at" = COALESCE("created_at", NOW())
            WHERE "etims_note_no" IS NOT NULL
              AND "etims_status" = 'not_applicable'
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_credit_notes_etims_status"
            ON public.credit_notes ("etims_status")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS public."IDX_credit_notes_etims_status"`);
        await queryRunner.query(`
            ALTER TABLE public.credit_notes
            DROP COLUMN IF EXISTS "etims_submitted_at",
            DROP COLUMN IF EXISTS "etims_last_error",
            DROP COLUMN IF EXISTS "etims_attempts",
            DROP COLUMN IF EXISTS "etims_status"
        `);

        await queryRunner.query(`DROP INDEX IF EXISTS public."IDX_sales_etims_status"`);
        await queryRunner.query(`
            ALTER TABLE public.sales
            DROP COLUMN IF EXISTS "etims_submitted_at",
            DROP COLUMN IF EXISTS "etims_last_error",
            DROP COLUMN IF EXISTS "etims_attempts",
            DROP COLUMN IF EXISTS "etims_status"
        `);
    }
}
