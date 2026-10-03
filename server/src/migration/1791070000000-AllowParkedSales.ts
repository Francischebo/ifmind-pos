import { MigrationInterface, QueryRunner } from "typeorm";

export class AllowParkedSales1791070000000 implements MigrationInterface {
    name = "AllowParkedSales1791070000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_type
                    WHERE typname = 'sales_status_enum'
                      AND typtype = 'e'
                ) THEN
                    ALTER TYPE "sales_status_enum" ADD VALUE IF NOT EXISTS 'parked';
                END IF;
            END
            $$
        `);

        await queryRunner.query(`
            ALTER TABLE IF EXISTS public.sales
            DROP CONSTRAINT IF EXISTS sales_status_check
        `);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.sales') IS NOT NULL
                   AND EXISTS (
                       SELECT 1
                       FROM information_schema.columns
                       WHERE table_schema = 'public'
                         AND table_name = 'sales'
                         AND column_name = 'status'
                   ) THEN
                    ALTER TABLE public.sales
                    ADD CONSTRAINT sales_status_check
                    CHECK (status::text = ANY (ARRAY[
                        'completed',
                        'pending',
                        'voided',
                        'partially_refunded',
                        'parked'
                    ]::text[]));
                END IF;
            END
            $$
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE IF EXISTS public.sales
            DROP CONSTRAINT IF EXISTS sales_status_check
        `);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF to_regclass('public.sales') IS NOT NULL
                   AND EXISTS (
                       SELECT 1
                       FROM information_schema.columns
                       WHERE table_schema = 'public'
                         AND table_name = 'sales'
                         AND column_name = 'status'
                   ) THEN
                    ALTER TABLE public.sales
                    ADD CONSTRAINT sales_status_check
                    CHECK (status::text = ANY (ARRAY[
                        'completed',
                        'pending',
                        'voided'
                    ]::text[]));
                END IF;
            END
            $$
        `);
    }
}
