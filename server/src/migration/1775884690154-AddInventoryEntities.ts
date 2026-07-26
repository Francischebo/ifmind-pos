import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInventoryEntities1775884690154 implements MigrationInterface {
    name = 'AddInventoryEntities1775884690154'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "po_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "po_id" uuid NOT NULL, "product_id" uuid NOT NULL, "quantity" integer NOT NULL, "received_quantity" integer NOT NULL DEFAULT '0', "unit_cost" numeric(10,2) NOT NULL, CONSTRAINT "PK_fe9e87653e28514ed8d5e6240c5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "purchase_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "po_number" character varying NOT NULL, "vendor_id" uuid NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "total_amount" numeric(10,2) NOT NULL DEFAULT '0', "created_by" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_05148947415204a897e8beb2553" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "vendors" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "contact_person" character varying, "phone" character varying, "email" character varying, "address" text, "payment_terms" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9c956c9797edfae5c6ddacc4e6e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "product_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "product_id" uuid NOT NULL, "po_id" uuid, "batch_number" character varying NOT NULL, "expiry_date" date, "initial_quantity" integer NOT NULL, "current_quantity" integer NOT NULL, "unit_cost" numeric(10,2) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_843fa9e28be96c903f8c71292fc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "delivery_notes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "po_id" uuid NOT NULL, "vendor_id" uuid NOT NULL, "grn_number" character varying NOT NULL, "received_by" uuid NOT NULL, "total_items" integer NOT NULL DEFAULT '0', "total_value" numeric(10,2) NOT NULL DEFAULT '0', "notes" text, "status" character varying NOT NULL DEFAULT 'completed', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8ba22b28b7392ac676c680dd5d2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "delivery_note_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "delivery_note_id" uuid NOT NULL, "po_item_id" uuid, "product_id" uuid NOT NULL, "ordered_quantity" integer NOT NULL, "received_quantity" integer NOT NULL, "rejected_quantity" integer NOT NULL DEFAULT '0', "rejection_reason" character varying, "unit_cost" numeric(10,2) NOT NULL, "line_total" numeric(10,2) NOT NULL, "batch_number" character varying, "expiry_date" date, CONSTRAINT "PK_d0093bd2efb0757f8142f11f027" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "po_items" ADD CONSTRAINT "FK_0df4396be47b79899e36f415236" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "po_items" ADD CONSTRAINT "FK_aa7605df5ca46a47793eb8cbc9c" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_346ae76b48e8f5042cf93b8df26" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_99f44faa1ca8d7ec9ebef918b06" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_batches" ADD CONSTRAINT "FK_82998c582d28f74cca4eff80a73" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "product_batches" ADD CONSTRAINT "FK_51d5e483236b503551fe8b2e766" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_notes" ADD CONSTRAINT "FK_0e657fd116f0220884b3d40b4a8" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_notes" ADD CONSTRAINT "FK_b26a677921d5b5fdbc872764652" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_notes" ADD CONSTRAINT "FK_7424f1a062d39f526d5e8507519" FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_note_items" ADD CONSTRAINT "FK_2e4fa9b56c698f9c598c218e0cc" FOREIGN KEY ("delivery_note_id") REFERENCES "delivery_notes"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_note_items" ADD CONSTRAINT "FK_edf75aa9b2987d73571834e23f2" FOREIGN KEY ("po_item_id") REFERENCES "po_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_note_items" ADD CONSTRAINT "FK_62c929f35fa58cf614be16479f2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "delivery_note_items" DROP CONSTRAINT "FK_62c929f35fa58cf614be16479f2"`);
        await queryRunner.query(`ALTER TABLE "delivery_note_items" DROP CONSTRAINT "FK_edf75aa9b2987d73571834e23f2"`);
        await queryRunner.query(`ALTER TABLE "delivery_note_items" DROP CONSTRAINT "FK_2e4fa9b56c698f9c598c218e0cc"`);
        await queryRunner.query(`ALTER TABLE "delivery_notes" DROP CONSTRAINT "FK_7424f1a062d39f526d5e8507519"`);
        await queryRunner.query(`ALTER TABLE "delivery_notes" DROP CONSTRAINT "FK_b26a677921d5b5fdbc872764652"`);
        await queryRunner.query(`ALTER TABLE "delivery_notes" DROP CONSTRAINT "FK_0e657fd116f0220884b3d40b4a8"`);
        await queryRunner.query(`ALTER TABLE "product_batches" DROP CONSTRAINT "FK_51d5e483236b503551fe8b2e766"`);
        await queryRunner.query(`ALTER TABLE "product_batches" DROP CONSTRAINT "FK_82998c582d28f74cca4eff80a73"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_99f44faa1ca8d7ec9ebef918b06"`);
        await queryRunner.query(`ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_346ae76b48e8f5042cf93b8df26"`);
        await queryRunner.query(`ALTER TABLE "po_items" DROP CONSTRAINT "FK_aa7605df5ca46a47793eb8cbc9c"`);
        await queryRunner.query(`ALTER TABLE "po_items" DROP CONSTRAINT "FK_0df4396be47b79899e36f415236"`);
        await queryRunner.query(`DROP TABLE "delivery_note_items"`);
        await queryRunner.query(`DROP TABLE "delivery_notes"`);
        await queryRunner.query(`DROP TABLE "product_batches"`);
        await queryRunner.query(`DROP TABLE "vendors"`);
        await queryRunner.query(`DROP TABLE "purchase_orders"`);
        await queryRunner.query(`DROP TABLE "po_items"`);
    }

}
