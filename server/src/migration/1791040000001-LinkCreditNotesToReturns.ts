import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkCreditNotesToReturns1791040000001 implements MigrationInterface {
    name = "LinkCreditNotesToReturns1791040000001";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "credit_notes"
            ADD COLUMN IF NOT EXISTS "return_request_id" uuid
        `);
        await queryRunner.query(`
            WITH unique_returns AS (
                SELECT "sale_id", "reason", min("id"::text)::uuid AS "return_request_id"
                FROM "return_requests"
                WHERE "status" = 'approved'
                GROUP BY "sale_id", "reason"
                HAVING count(*) = 1
            ),
            unique_credit_notes AS (
                SELECT "sale_id", "reason", min("id"::text)::uuid AS "credit_note_id"
                FROM "credit_notes"
                WHERE "return_request_id" IS NULL
                GROUP BY "sale_id", "reason"
                HAVING count(*) = 1
            )
            UPDATE "credit_notes" AS credit_note
            SET "return_request_id" = unique_return."return_request_id"
            FROM unique_credit_notes AS unique_note
            JOIN unique_returns AS unique_return
              ON unique_return."sale_id" = unique_note."sale_id"
             AND unique_return."reason" = unique_note."reason"
            WHERE credit_note."id" = unique_note."credit_note_id"
        `);
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'FK_credit_notes_return_request'
                      AND conrelid = '"credit_notes"'::regclass
                ) THEN
                    ALTER TABLE "credit_notes"
                    ADD CONSTRAINT "FK_credit_notes_return_request"
                    FOREIGN KEY ("return_request_id") REFERENCES "return_requests"("id") ON DELETE SET NULL;
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_credit_notes_return_request"
            ON "credit_notes" ("return_request_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_credit_notes_return_request"`);
        await queryRunner.query(`
            ALTER TABLE "credit_notes"
            DROP CONSTRAINT IF EXISTS "FK_credit_notes_return_request",
            DROP COLUMN IF EXISTS "return_request_id"
        `);
    }
}
