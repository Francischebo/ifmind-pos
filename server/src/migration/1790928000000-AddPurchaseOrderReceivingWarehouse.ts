import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPurchaseOrderReceivingWarehouse1790928000000 implements MigrationInterface {
    name = "AddPurchaseOrderReceivingWarehouse1790928000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "warehouse_id" uuid`);
        await queryRunner.query(`
            UPDATE "purchase_orders" AS purchase_order
            SET "warehouse_id" = (
                SELECT warehouse."id"
                FROM "warehouses" AS warehouse
                WHERE warehouse."is_active" = true
                ORDER BY warehouse."is_main" DESC, warehouse."created_at" ASC
                LIMIT 1
            )
            WHERE purchase_order."warehouse_id" IS NULL
              AND EXISTS (SELECT 1 FROM "warehouses" WHERE "is_active" = true)
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'FK_purchase_orders_warehouse'
                ) THEN
                    ALTER TABLE "purchase_orders"
                    ADD CONSTRAINT "FK_purchase_orders_warehouse"
                    FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id");
                END IF;
            END $$
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "FK_purchase_orders_warehouse"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "warehouse_id"`);
    }
}