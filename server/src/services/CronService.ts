import cron from "node-cron";
import { AppDataSource } from "../data-source";
import { Product } from "../entity/Product";
import { AppRole, User } from "../entity/User";
import { PurchaseRequisition, RequisitionStatus } from "../entity/PurchaseRequisition";
import { Sale, EtimsStatus } from "../entity/Sale";
import { CreditNote } from "../entity/CreditNote";
import { EtimsService } from "./etims/EtimsService";

export const AUTO_REORDER_LOCK_ID = 71943001;
export const ETIMS_RETRY_LOCK_ID = 71943002;

const ETIMS_BACKOFF_MINUTES = [1, 5, 15, 30, 60];

export class CronService {
    private static autoReorderTask: ReturnType<typeof cron.schedule> | null = null;
    private static etimsRetryTask: ReturnType<typeof cron.schedule> | null = null;

    static init() {
        if (!this.autoReorderTask) {
            // Run every midnight: '0 0 * * *'
            this.autoReorderTask = cron.schedule('0 0 * * *', async () => {
                console.log("Running Auto-Reorder Cron Job...");
                await this.generateAutoRequisitions();
            });
        }

        if (!this.etimsRetryTask) {
            // Run every 5 minutes: '*/5 * * * *'
            this.etimsRetryTask = cron.schedule('*/5 * * * *', async () => {
                console.log("Running eTIMS Fiscal Retry Cron Job...");
                await this.retryPendingFiscalDocuments();
            });
        }

        console.log("CronService initialized.");
    }

    static stop() {
        this.autoReorderTask?.stop();
        this.autoReorderTask = null;
        this.etimsRetryTask?.stop();
        this.etimsRetryTask = null;
    }

    private static async generateAutoRequisitions() {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        let lockAcquired = false;

        try {
            const lockResult = await queryRunner.query(
                "SELECT pg_try_advisory_lock($1) AS acquired",
                [AUTO_REORDER_LOCK_ID],
            ) as Array<{ acquired: boolean }>;
            lockAcquired = lockResult[0]?.acquired === true;
            if (!lockAcquired) {
                console.log("Auto-reorder is already running on another API instance.");
                return;
            }

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
                requisition.requested_by = "SYSTEM"; 
                const admin = await queryRunner.manager.findOne(User, { where: { role: AppRole.ADMIN } });

                if (admin) {
                     requisition.requester = admin;
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
            if (lockAcquired) {
                try {
                    await queryRunner.query(
                        "SELECT pg_advisory_unlock($1)",
                        [AUTO_REORDER_LOCK_ID],
                    );
                } catch (error) {
                    console.error("Could not release the auto-reorder PostgreSQL advisory lock.", error);
                }
            }
            await queryRunner.release();
        }
    }

    public static async retryPendingFiscalDocuments(ignoreBackoff = false): Promise<{
        retriedSales: number;
        retriedCreditNotes: number;
        failedSales: number;
        failedCreditNotes: number;
    }> {
        const stats = {
            retriedSales: 0,
            retriedCreditNotes: 0,
            failedSales: 0,
            failedCreditNotes: 0,
        };

        if (EtimsService.resolveEtimsMode() === "off") {
            return stats;
        }

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        let lockAcquired = false;

        try {
            const lockResult = await queryRunner.query(
                "SELECT pg_try_advisory_lock($1) AS acquired",
                [ETIMS_RETRY_LOCK_ID],
            ) as Array<{ acquired: boolean }>;
            lockAcquired = lockResult[0]?.acquired === true;
            if (!lockAcquired) {
                console.log("eTIMS retry is already running on another API instance.");
                return stats;
            }

            // 1. Process Pending Sales
            const pendingSales = await queryRunner.manager.createQueryBuilder(Sale, "sale")
                .where("sale.etims_status = :status", { status: EtimsStatus.PENDING })
                .getMany();

            for (const sale of pendingSales) {
                if (sale.etims_attempts >= 5) {
                    sale.etims_status = EtimsStatus.FAILED;
                    await queryRunner.manager.save(sale);
                    stats.failedSales++;
                    continue;
                }

                const attempts = Math.max(0, sale.etims_attempts || 0);
                const delayMin = ETIMS_BACKOFF_MINUTES[Math.min(attempts, ETIMS_BACKOFF_MINUTES.length - 1)];
                const lastTimestamp = new Date(sale.created_at).getTime();
                const elapsedMs = Date.now() - lastTimestamp;

                if (ignoreBackoff || elapsedMs >= delayMin * 60 * 1000) {
                    stats.retriedSales++;
                    await EtimsService.processSaleSigning(sale.id);
                }
            }

            // 2. Process Pending Credit Notes
            const pendingCreditNotes = await queryRunner.manager.createQueryBuilder(CreditNote, "note")
                .where("note.etims_status = :status", { status: EtimsStatus.PENDING })
                .getMany();

            for (const note of pendingCreditNotes) {
                if (note.etims_attempts >= 5) {
                    note.etims_status = EtimsStatus.FAILED;
                    await queryRunner.manager.save(note);
                    stats.failedCreditNotes++;
                    continue;
                }

                const attempts = Math.max(0, note.etims_attempts || 0);
                const delayMin = ETIMS_BACKOFF_MINUTES[Math.min(attempts, ETIMS_BACKOFF_MINUTES.length - 1)];
                const lastTimestamp = new Date(note.created_at).getTime();
                const elapsedMs = Date.now() - lastTimestamp;

                if (ignoreBackoff || elapsedMs >= delayMin * 60 * 1000) {
                    stats.retriedCreditNotes++;
                    await EtimsService.processCreditNoteSigning(note.id);
                }
            }

        } catch (error) {
            console.error("eTIMS Fiscal Retry Cron Job failed:", error);
        } finally {
            if (lockAcquired) {
                try {
                    await queryRunner.query(
                        "SELECT pg_advisory_unlock($1)",
                        [ETIMS_RETRY_LOCK_ID],
                    );
                } catch (error) {
                    console.error("Could not release eTIMS retry PostgreSQL advisory lock.", error);
                }
            }
            await queryRunner.release();
        }

        return stats;
    }
}
