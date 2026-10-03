import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateStockMovementLedger1790936000000 implements MigrationInterface {
    name = "CreateStockMovementLedger1790936000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "stock_movements" (
                "id" uuid NOT NULL DEFAULT gen_random_uuid(),
                "product_id" uuid NOT NULL,
                "movement_type" varchar NOT NULL,
                "quantity" integer NOT NULL,
                "quantity_before" integer NOT NULL,
                "quantity_after" integer NOT NULL,
                "unit_cost" numeric(12,2),
                "reference_type" varchar NOT NULL,
                "reference_id" uuid,
                "location_id" uuid,
                "notes" text,
                "created_by" uuid NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id"),
                CONSTRAINT "FK_stock_movements_product" FOREIGN KEY ("product_id")
                    REFERENCES "products"("id") ON DELETE RESTRICT
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_stock_movements_product_created"
            ON "stock_movements" ("product_id", "created_at" DESC)
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_stock_movements_reference"
            ON "stock_movements" ("reference_type", "reference_id")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_stock_movements_location_created"
            ON "stock_movements" ("location_id", "created_at" DESC)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const tableExists = await queryRunner.hasTable("stock_movements");
        if (!tableExists) return;

        const [{ has_rows: hasRows }] = await queryRunner.query(
            `SELECT EXISTS (SELECT 1 FROM "stock_movements") AS has_rows`
        );
        if (hasRows) {
            throw new Error("Stock movement history is retained; archive it before reverting this migration");
        }

        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_location_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_reference"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_stock_movements_product_created"`);
        await queryRunner.query(`DROP TABLE "stock_movements"`);
    }
}