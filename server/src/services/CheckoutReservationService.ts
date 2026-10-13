import { AppDataSource } from "../data-source";
import { PaymentCheckoutSession } from "../entity/PaymentCheckoutSession";
import { MpesaTransaction } from "../entity/MpesaTransaction";

export const RESERVATION_EXPIRY_LOCK_ID = 71943004;

export interface ExpiryStats {
    examined: number;
    expiredCount: number;
    skippedCount: number;
}

export const getReservedQuantity = (
    sessions: PaymentCheckoutSession[],
    productId: string,
    excludeSessionId?: string,
    warehouseId?: string,
) => sessions
    .filter((session) => session.status === "reserved" && session.id !== excludeSessionId)
    .filter((session) => warehouseId === undefined ||
        session.warehouse_id === warehouseId ||
        session.warehouse_id === null)
    .reduce((total, session) => total + session.items
        .filter((item) => item.product_id === productId)
        .reduce((sum, item) => sum + item.quantity, 0), 0);

export const expireAbandonedCheckoutReservations = async (
    ttlMinutes?: number,
): Promise<ExpiryStats> => {
    const stats: ExpiryStats = {
        examined: 0,
        expiredCount: 0,
        skippedCount: 0,
    };

    const effectiveTtl = ttlMinutes ??
        Math.max(1, parseInt(process.env.CHECKOUT_RESERVATION_TTL_MINUTES || "15", 10) || 15);

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    let lockAcquired = false;

    try {
        const lockResult = await queryRunner.query(
            "SELECT pg_try_advisory_lock($1) AS acquired",
            [RESERVATION_EXPIRY_LOCK_ID],
        ) as Array<{ acquired: boolean }>;
        lockAcquired = lockResult[0]?.acquired === true;

        if (!lockAcquired) {
            console.log("Reservation expiry job is already running on another instance.");
            return stats;
        }

        const expiryThreshold = new Date(Date.now() - effectiveTtl * 60 * 1000);

        const expiredSessions = await queryRunner.manager.createQueryBuilder(PaymentCheckoutSession, "session")
            .where("session.status = :status", { status: "reserved" })
            .andWhere("session.created_at <= :threshold", { threshold: expiryThreshold })
            .orderBy("session.created_at", "ASC")
            .take(100)
            .getMany();

        stats.examined = expiredSessions.length;

        for (const session of expiredSessions) {
            const sessionRunner = AppDataSource.createQueryRunner();
            await sessionRunner.connect();
            await sessionRunner.startTransaction();

            try {
                const lockedSession = await sessionRunner.manager.findOne(PaymentCheckoutSession, {
                    where: { id: session.id },
                    lock: { mode: "pessimistic_write" },
                });

                if (!lockedSession || lockedSession.status !== "reserved") {
                    await sessionRunner.rollbackTransaction();
                    continue;
                }

                // Check linked M-Pesa transactions
                const transactions = await sessionRunner.manager.find(MpesaTransaction, {
                    where: { checkout_session_id: lockedSession.id },
                });

                // Do not cancel if payment is pending, completed, or needs review
                const hasActivePayment = transactions.some(
                    (tx) => tx.status === "pending" || tx.status === "completed" || tx.status === "needs_review",
                );

                if (hasActivePayment) {
                    await sessionRunner.rollbackTransaction();
                    stats.skippedCount++;
                    continue;
                }

                lockedSession.status = "cancelled";
                await sessionRunner.manager.save(lockedSession);
                await sessionRunner.commitTransaction();
                stats.expiredCount++;
                console.log(`Expired abandoned checkout reservation ${lockedSession.id} (inactive for >${effectiveTtl}m).`);
            } catch (err) {
                await sessionRunner.rollbackTransaction();
                console.error(`Error expiring reservation ${session.id}:`, err);
            } finally {
                await sessionRunner.release();
            }
        }
    } catch (error) {
        console.error("Reservation expiry error:", error);
    } finally {
        if (lockAcquired) {
            try {
                await queryRunner.query(
                    "SELECT pg_advisory_unlock($1)",
                    [RESERVATION_EXPIRY_LOCK_ID],
                );
            } catch (error) {
                console.error("Could not release reservation expiry advisory lock:", error);
            }
        }
        await queryRunner.release();
    }

    return stats;
};
