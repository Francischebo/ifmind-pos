import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSaleStoreCreditBarcode1791030000000 implements MigrationInterface {
    name = "AddSaleStoreCreditBarcode1791030000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "store_credit_barcode" character varying(20)`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "sales" DROP COLUMN IF EXISTS "store_credit_barcode"`);
    }
}
