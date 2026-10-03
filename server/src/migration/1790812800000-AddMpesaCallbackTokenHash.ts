import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMpesaCallbackTokenHash1790812800000 implements MigrationInterface {
    name = "AddMpesaCallbackTokenHash1790812800000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mpesa_transactions" ADD COLUMN IF NOT EXISTS "callback_token_hash" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "mpesa_transactions" DROP COLUMN IF EXISTS "callback_token_hash"`);
    }
}
