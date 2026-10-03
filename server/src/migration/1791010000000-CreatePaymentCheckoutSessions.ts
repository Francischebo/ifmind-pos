import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePaymentCheckoutSessions1791010000000 implements MigrationInterface {
    name = "CreatePaymentCheckoutSessions1791010000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "payment_checkout_sessions" (
                "id" uuid PRIMARY KEY,
                "cashier_id" uuid NOT NULL,
                "warehouse_id" uuid,
                "customer_id" uuid,
                "store_credit_barcode" character varying(20),
                "items" jsonb NOT NULL,
                "subtotal" numeric(10,2) NOT NULL,
                "tax_amount" numeric(10,2) NOT NULL,
                "total_amount" numeric(10,2) NOT NULL,
                "loyalty_discount" numeric(10,2) NOT NULL DEFAULT 0,
                "cash_amount" numeric(10,2) NOT NULL DEFAULT 0,
                "store_credit_amount" numeric(10,2) NOT NULL DEFAULT 0,
                "status" character varying NOT NULL DEFAULT 'reserved',
                "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT "CHK_payment_checkout_sessions_status"
                    CHECK ("status" IN ('reserved', 'completed', 'cancelled')),
                CONSTRAINT "FK_payment_checkout_sessions_cashier"
                    FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_payment_checkout_sessions_warehouse"
                    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_payment_checkout_sessions_customer"
                    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_payment_checkout_sessions_cashier_status"
            ON "payment_checkout_sessions" ("cashier_id", "status")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_checkout_sessions_cashier_status"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "payment_checkout_sessions"`);
    }
}
