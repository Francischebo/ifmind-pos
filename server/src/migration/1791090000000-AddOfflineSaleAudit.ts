import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOfflineSaleAudit1791090000000 implements MigrationInterface {
    name = "AddOfflineSaleAudit1791090000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE IF EXISTS public.sales
            ADD COLUMN IF NOT EXISTS offline_created_at timestamptz
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE IF EXISTS public.sales
            DROP COLUMN IF EXISTS offline_created_at
        `);
    }
}
