import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMpesaCheckoutSessions1791000000000 implements MigrationInterface {
    name = "AddMpesaCheckoutSessions1791000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            ADD COLUMN IF NOT EXISTS "cashier_id" uuid,
            ADD COLUMN IF NOT EXISTS "checkout_session_id" uuid
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'FK_mpesa_transactions_cashier'
                ) THEN
                    ALTER TABLE "mpesa_transactions"
                    ADD CONSTRAINT "FK_mpesa_transactions_cashier"
                    FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END $$
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_mpesa_transactions_checkout_session"
            ON "mpesa_transactions" ("checkout_session_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mpesa_transactions_pending_checkout_session"
            ON "mpesa_transactions" ("checkout_session_id")
            WHERE "checkout_session_id" IS NOT NULL AND "status" = 'pending'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_transactions_pending_checkout_session"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mpesa_transactions_checkout_session"`);
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            DROP CONSTRAINT IF EXISTS "FK_mpesa_transactions_cashier"
        `);
        await queryRunner.query(`
            ALTER TABLE "mpesa_transactions"
            DROP COLUMN IF EXISTS "checkout_session_id",
            DROP COLUMN IF EXISTS "cashier_id"
        `);
    }
}
