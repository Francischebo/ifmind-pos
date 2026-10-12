import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceSaleIdempotency1791100000000 implements MigrationInterface {
    name = "EnforceSaleIdempotency1791100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM public.sales
                    WHERE cashier_id IS NOT NULL
                      AND idempotency_key IS NOT NULL
                    GROUP BY cashier_id, idempotency_key
                    HAVING COUNT(*) > 1
                ) THEN
                    RAISE EXCEPTION
                        'Cannot enforce sale idempotency: duplicate non-NULL idempotency keys exist for a cashier. Reconcile those sales before retrying migration 1791100000000.';
                END IF;
            END;
            $$;
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sales_cashier_idempotency_key"
            ON public.sales (cashier_id, idempotency_key)
            WHERE cashier_id IS NOT NULL AND idempotency_key IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS public."IDX_sales_cashier_idempotency_key"`);
    }
}
