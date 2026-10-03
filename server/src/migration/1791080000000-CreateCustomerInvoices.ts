import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCustomerInvoices1791080000000 implements MigrationInterface {
    name = "CreateCustomerInvoices1791080000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "invoices" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "invoice_number" varchar NOT NULL UNIQUE,
                "sale_id" uuid,
                "customer_id" uuid,
                "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
                "tax_amount" numeric(12,2) NOT NULL DEFAULT 0,
                "discount_amount" numeric(12,2) NOT NULL DEFAULT 0,
                "total_amount" numeric(12,2) NOT NULL DEFAULT 0,
                "paid_amount" numeric(12,2) NOT NULL DEFAULT 0,
                "balance_due" numeric(12,2) NOT NULL DEFAULT 0,
                "status" varchar NOT NULL DEFAULT 'draft',
                "due_date" date,
                "issued_at" timestamptz,
                "paid_at" timestamptz,
                "notes" text,
                "created_by" uuid NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "FK_invoices_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_invoices_customer" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_invoices_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "invoice_payments" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
                "amount" numeric(12,2) NOT NULL CHECK ("amount" > 0),
                "payment_method" varchar NOT NULL,
                "reference_number" varchar,
                "mpesa_receipt" varchar,
                "notes" text,
                "received_by" uuid NOT NULL REFERENCES "users"("id"),
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoices_sale_id"
            ON "invoices" ("sale_id")
            WHERE "sale_id" IS NOT NULL
        `);
        await queryRunner.query(`
            INSERT INTO "invoices" (
                "invoice_number", "sale_id", "customer_id", "subtotal", "tax_amount",
                "discount_amount", "total_amount", "paid_amount", "balance_due",
                "status", "issued_at", "paid_at", "created_by", "created_at", "updated_at"
            )
            SELECT
                'INV-' || upper(replace(s."id"::text, '-', '')),
                s."id",
                s."customer_id",
                s."subtotal",
                s."tax_amount",
                COALESCE(s."loyalty_discount", 0),
                s."total_amount",
                LEAST(
                    s."total_amount",
                    GREATEST(0, s."cash_amount" - s."change_amount")
                        + s."mpesa_amount" + s."store_credit_amount"
                ),
                GREATEST(
                    0,
                    s."total_amount" - GREATEST(0, s."cash_amount" - s."change_amount")
                        - s."mpesa_amount" - s."store_credit_amount"
                ),
                CASE
                    WHEN GREATEST(0, s."cash_amount" - s."change_amount")
                        + s."mpesa_amount" + s."store_credit_amount" >= s."total_amount"
                    THEN 'paid'
                    WHEN GREATEST(0, s."cash_amount" - s."change_amount")
                        + s."mpesa_amount" + s."store_credit_amount" > 0
                    THEN 'partially_paid'
                    ELSE 'issued'
                END,
                s."created_at",
                CASE
                    WHEN GREATEST(0, s."cash_amount" - s."change_amount")
                        + s."mpesa_amount" + s."store_credit_amount" >= s."total_amount"
                    THEN s."created_at"
                    ELSE NULL
                END,
                s."cashier_id",
                s."created_at",
                s."created_at"
            FROM "sales" s
            WHERE s."status" = 'completed'
              AND s."cashier_id" IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM "invoices" i WHERE i."sale_id" = s."id"
              )
            ON CONFLICT ("sale_id") WHERE "sale_id" IS NOT NULL DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_invoices_sale_id"`);
    }
}
