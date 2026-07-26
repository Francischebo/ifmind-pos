import cron from "node-cron";
import { AppDataSource } from "../data-source";
import { Product } from "../entity/Product";
import { PurchaseRequisition, RequisitionStatus } from "../entity/PurchaseRequisition";

export class CronService {
    static init() {
        // Run every midnight: '0 0 * * *'
        cron.schedule('0 0 * * *', async () => {
            console.log("Running Auto-Reorder Cron Job...");
            await this.generateAutoRequisitions();
        });
        console.log("CronService initialized.");
    }

    private static async generateAutoRequisitions() {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();

        try {
            // Find products where stock_on_hand < reorder_level
            const products = await queryRunner.manager.createQueryBuilder(Product, "product")
                .where("product.stock_on_hand < product.reorder_level")
                .getMany();

            if (products.length === 0) {
                console.log("No auto-reorders needed today.");
                return;
            }

            console.log(`Found ${products.length} products below reorder thresholds.`);

            await queryRunner.startTransaction();

            for (const product of products) {
                // Check if a pending requisition already exists to prevent duplicates
                const existing = await queryRunner.manager.findOne(PurchaseRequisition, {
                    where: [
                        { product_id: product.id, status: RequisitionStatus.DRAFT },
                        { product_id: product.id, status: RequisitionStatus.PENDING_MANAGER }
                    ]
                });

                if (existing) continue; // Skip

                const reqQty = Math.max((product.reorder_level * 2) - product.stock_on_hand, 10); // arbitrary auto-reorder logic

                const requisition = new PurchaseRequisition();
                requisition.product = product;
                requisition.requested_quantity = reqQty;
                requisition.status = RequisitionStatus.DRAFT;
                requisition.requested_by = "SYSTEM"; // Using text identifier normally, but column is User ID. 
                // Wait! requested_by is a string ID tracking to a User.
                // If it's SYSTEM_AUTO, we'll assign it to an "admin" user or a predefined system user uuid.
                // For safety, we'll look up the first admin user.
                const admin = await queryRunner.manager.createQueryBuilder("User", "user")
                    .where("user.role = :role", { role: "admin" })
                    .getOne();

                if (admin) {
                     requisition.requester = admin as any; 
                } else {
                     continue; // Cannot assign without valid ID because of FK constraint
                }

                requisition.is_auto_generated = true;
                requisition.notes = `Auto-generated: Current stock is ${product.stock_on_hand}, lower than reorder level ${product.reorder_level}.`;

                await queryRunner.manager.save(requisition);
                console.log(`Auto-generated draft PR for ${product.name}.`);
            }

            await queryRunner.commitTransaction();

        } catch (error) {
            if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
            console.error("Auto-Reorder Cron Job failed:", error);
        } finally {
            await queryRunner.release();
        }
    }
}
