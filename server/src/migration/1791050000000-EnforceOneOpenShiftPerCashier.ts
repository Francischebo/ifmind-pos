import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceOneOpenShiftPerCashier1791050000000 implements MigrationInterface {
    name = "EnforceOneOpenShiftPerCashier1791050000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "shifts"
                    WHERE "status" = 'open'
                    GROUP BY "cashier_id"
                    HAVING count(*) > 1
                ) THEN
                    RAISE EXCEPTION 'Multiple open shifts exist for a cashier; reconcile them before applying this migration';
                END IF;
            END $$
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_shifts_one_open_per_cashier"
            ON "shifts" ("cashier_id")
            WHERE "status" = 'open'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_shifts_one_open_per_cashier"`);
    }
}
