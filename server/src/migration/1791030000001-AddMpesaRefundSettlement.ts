import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMpesaRefundSettlement1791030000001 implements MigrationInterface {
    name = "AddMpesaRefundSettlement1791030000001";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "return_requests"
            ADD COLUMN IF NOT EXISTS "mpesa_refund_status" character varying NOT NULL DEFAULT 'not_required',
            ADD COLUMN IF NOT EXISTS "mpesa_refund_amount" numeric(10,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "mpesa_refund_receipt" character varying(64),
            ADD COLUMN IF NOT EXISTS "mpesa_refund_completed_at" TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS "mpesa_refund_completed_by" uuid
        `);
        await queryRunner.query(`
            UPDATE "return_requests" AS request
            SET "mpesa_refund_status" = 'pending',
                "mpesa_refund_amount" = COALESCE((
                    SELECT ROUND(SUM(
                        (sale_item."line_total" / NULLIF(sale_item."quantity", 0) * return_item."quantity")
                        * (1 + sale_item."tax_rate" / 100)
                    ), 2)
                    FROM "return_items" AS return_item
                    JOIN "sale_items" AS sale_item ON sale_item."id" = return_item."sale_item_id"
                    WHERE return_item."return_request_id" = request."id"
                ), 0)
            WHERE request."status" = 'approved'
              AND request."refund_method" = 'mpesa'
              AND request."mpesa_refund_status" = 'not_required'
        `);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'FK_return_requests_mpesa_refund_completed_by'
                ) THEN
                    ALTER TABLE "return_requests"
                    ADD CONSTRAINT "FK_return_requests_mpesa_refund_completed_by"
                    FOREIGN KEY ("mpesa_refund_completed_by") REFERENCES "users"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_return_requests_mpesa_refund_receipt"
            ON "return_requests" ("mpesa_refund_receipt")
            WHERE "mpesa_refund_receipt" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_return_requests_mpesa_refund_receipt"`);
        await queryRunner.query(`
            ALTER TABLE "return_requests"
            DROP CONSTRAINT IF EXISTS "FK_return_requests_mpesa_refund_completed_by",
            DROP COLUMN IF EXISTS "mpesa_refund_completed_by",
            DROP COLUMN IF EXISTS "mpesa_refund_completed_at",
            DROP COLUMN IF EXISTS "mpesa_refund_receipt",
            DROP COLUMN IF EXISTS "mpesa_refund_amount",
            DROP COLUMN IF EXISTS "mpesa_refund_status"
        `);
    }
}
