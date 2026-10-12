import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceUniqueSupplierInvoiceNumber1790930000000 implements MigrationInterface {
    name = "EnforceUniqueSupplierInvoiceNumber1790930000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "supplier_invoices"
                    GROUP BY "vendor_id", upper(btrim("invoice_number"))
                    HAVING count(*) > 1
                ) THEN
                    RAISE EXCEPTION 'Duplicate supplier invoice numbers exist for a vendor; reconcile them before applying this migration';
                END IF;
            END $$
        `);
        await queryRunner.query(`
            UPDATE "supplier_invoices"
            SET "invoice_number" = upper(btrim("invoice_number"))
            WHERE "invoice_number" <> upper(btrim("invoice_number"))
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_supplier_invoice_vendor_number"
            ON "supplier_invoices" ("vendor_id", "invoice_number")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_supplier_invoice_vendor_number"`);
    }
}