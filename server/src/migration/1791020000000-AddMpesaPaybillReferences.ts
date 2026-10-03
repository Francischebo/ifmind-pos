import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMpesaPaybillReferences1791020000000 implements MigrationInterface {
    name = "AddMpesaPaybillReferences1791020000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            ADD COLUMN IF NOT EXISTS "account_reference" character varying
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mpesa_transactions_account_reference"
            ON "mpesa_transactions" ("account_reference")
            WHERE "account_reference" IS NOT NULL
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mpesa_transactions_receipt_number"
            ON "mpesa_transactions" ("mpesa_receipt_number")
            WHERE "mpesa_receipt_number" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_transactions_receipt_number"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_transactions_account_reference"`);
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            DROP COLUMN IF EXISTS "account_reference"
        `);
    }
}
