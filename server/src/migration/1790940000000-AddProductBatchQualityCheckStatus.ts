import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductBatchQualityCheckStatus1790940000000 implements MigrationInterface {
    name = "AddProductBatchQualityCheckStatus1790940000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "product_batches"
            ADD COLUMN IF NOT EXISTS "quality_check_status" character varying NOT NULL DEFAULT 'passed'
        `);

        await queryRunner.query(`
            UPDATE "product_batches"
            SET "quality_check_status" = 'passed'
            WHERE "quality_check_status" IS NULL OR "quality_check_status" = ''
        `);

        await queryRunner.query(`
            ALTER TABLE "product_batches"
            DROP CONSTRAINT IF EXISTS "product_batches_quality_check_status_check"
        `);

        await queryRunner.query(`
            ALTER TABLE "product_batches"
            ADD CONSTRAINT "product_batches_quality_check_status_check"
            CHECK ("quality_check_status" IN ('pending', 'passed', 'failed', 'rejected', 'hold', 'on_hold'))
            NOT VALID
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "product_batches"
            DROP CONSTRAINT IF EXISTS "product_batches_quality_check_status_check"
        `);

        await queryRunner.query(`
            ALTER TABLE "product_batches"
            DROP COLUMN IF EXISTS "quality_check_status"
        `);
    }
}
