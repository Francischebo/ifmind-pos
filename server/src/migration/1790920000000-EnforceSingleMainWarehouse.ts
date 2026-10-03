import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceSingleMainWarehouse1790920000000 implements MigrationInterface {
    name = "EnforceSingleMainWarehouse1790920000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            WITH ranked_main_warehouses AS (
                SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS position
                FROM "warehouses"
                WHERE "is_main" = true
            )
            UPDATE "warehouses" AS warehouse
            SET "is_main" = false
            FROM ranked_main_warehouses
            WHERE warehouse."id" = ranked_main_warehouses."id"
              AND ranked_main_warehouses.position > 1
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_warehouses_single_main"
            ON "warehouses" ("is_main")
            WHERE "is_main" = true
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_warehouses_single_main"`);
    }
}