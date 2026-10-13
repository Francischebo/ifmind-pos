import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMpesaMismatchHandling1791120000000 implements MigrationInterface {
    name = "AddMpesaMismatchHandling1791120000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            ADD COLUMN IF NOT EXISTS "mismatch_reason" text
        `);

        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_mpesa_transactions_status"
            ON "mpesa_transactions" ("status")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_transactions_status"`);
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            DROP COLUMN IF EXISTS "mismatch_reason"
        `);
    }
}
