import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSaleItemUnitCostSnapshot1791060000000 implements MigrationInterface {
    name = "AddSaleItemUnitCostSnapshot1791060000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ADD COLUMN IF NOT EXISTS "unit_cost" numeric(12,4),
            ADD COLUMN IF NOT EXISTS "cogs_total" numeric(12,2)
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ALTER COLUMN "unit_cost" TYPE numeric(12,4)
            USING "unit_cost"::numeric(12,4)
        `);
        await queryRunner.query(`
            UPDATE "sale_items" AS sale_item
            SET "unit_cost" = product."unit_cost",
                "cogs_total" = ROUND(product."unit_cost" * sale_item."quantity", 2)
            FROM "products" AS product
            WHERE sale_item."product_id" = product."id"
              AND (sale_item."unit_cost" IS NULL OR sale_item."cogs_total" IS NULL)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            DROP COLUMN IF EXISTS "cogs_total",
            DROP COLUMN IF EXISTS "unit_cost"
        `);
    }
}
