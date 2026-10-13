import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOtpAttemptsColumn1791130000000 implements MigrationInterface {
    name = "AddOtpAttemptsColumn1791130000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "otp_codes"
            ADD COLUMN IF NOT EXISTS "attempts" integer NOT NULL DEFAULT 0
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "otp_codes"
            DROP COLUMN IF EXISTS "attempts"
        `);
    }
}
