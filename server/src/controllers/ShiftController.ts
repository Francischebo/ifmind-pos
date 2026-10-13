import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppDataSource } from "../data-source";
import { Shift, ShiftStatus } from "../entity/Shift";
import { User } from "../entity/User";
import { Sale, SaleStatus } from "../entity/Sale";
import { Between, In, IsNull } from "typeorm";
import { ReturnRequest, ReturnStatus, RefundMethod, MpesaRefundStatus } from "../entity/ReturnRequest";
import { CreditNote } from "../entity/CreditNote";
import { MpesaTransaction } from "../entity/MpesaTransaction";
import { getErrorMessage } from "../utils/errors";

const shiftRepo = AppDataSource.getRepository(Shift);

export const sanitizeShiftCurrency = (value: unknown, fieldName: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`${fieldName} must be a non-negative number`);
    }
    return Number(parsed.toFixed(2));
};

export class ShiftController {
    
    // Open Register
    static async openShift(req: AuthenticatedRequest, res: Response) {
        try {
            const { opening_float } = req.body;
            const cashier = await AppDataSource.manager.findOneBy(User, { id: req.user!.id });

            if (!cashier) return res.status(401).json({ message: "Invalid user" });

            const parsedOpeningFloat = sanitizeShiftCurrency(opening_float ?? 0, "opening_float");

            // Give a clear response for the common case; the unique index handles concurrent opens.
            const existing = await shiftRepo.findOneBy({ cashier_id: cashier.id, status: ShiftStatus.OPEN });
            if (existing) {
                return res.status(409).json({ message: "You already have an open shift. Close it before opening a new one." });
            }

            const shift = new Shift();
            shift.cashier = cashier;
            shift.opening_float = parsedOpeningFloat;
            await shiftRepo.save(shift);

            res.status(201).json(shift);
        } catch (err) {
            const databaseCode = err && typeof err === "object" && "code" in err
                ? err.code
                : err && typeof err === "object" && "driverError" in err
                    ? (err as { driverError?: { code?: unknown } }).driverError?.code
                    : undefined;
            if (databaseCode === "23505") {
                return res.status(409).json({ message: "You already have an open shift. Close it before opening a new one." });
            }
            console.error("Failed to open shift:", err);
            res.status(400).json({ message: "Failed to open shift", error: getErrorMessage(err, "Unknown error") });
        }
    }

    // Z-Report / Close Register
    static async closeShift(req: AuthenticatedRequest, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const id = req.params.id;
            const { actual_cash, notes } = req.body;
            if (actual_cash === undefined || actual_cash === null ||
                (typeof actual_cash === "string" && actual_cash.trim() === "")) {
                throw new Error("actual_cash is required when closing a shift");
            }

            await queryRunner.connect();
            await queryRunner.startTransaction();

            const shift = await queryRunner.manager.findOne(Shift, {
                where: { id },
                lock: { mode: "pessimistic_write" },
            });
            if (!shift) {
                await queryRunner.rollbackTransaction();
                return res.status(404).json({ message: "Shift not found" });
            }

            if (shift.status === ShiftStatus.CLOSED) {
                await queryRunner.rollbackTransaction();
                return res.status(400).json({ message: "Shift is already closed." });
            }

            if (shift.cashier_id !== req.user!.id && req.user!.role !== "admin") {
                await queryRunner.rollbackTransaction();
                return res.status(403).json({ message: "Not authorized to close this shift." });
            }

            const parsedActualCash = sanitizeShiftCurrency(actual_cash, "actual_cash");
            const sanitizedNotes = typeof notes === "string" ? notes.trim().slice(0, 500) : "";
            const unresolvedPayments = await queryRunner.manager.find(MpesaTransaction, {
                where: [
                    { cashier_id: shift.cashier_id, status: "pending" },
                    { cashier_id: shift.cashier_id, status: "completed", sale_id: IsNull() },
                ],
                lock: { mode: "pessimistic_write" },
            });
            if (unresolvedPayments.length > 0) {
                await queryRunner.rollbackTransaction();
                return res.status(409).json({
                    message: "Resolve pending M-Pesa payments and finalize completed checkouts before closing this shift.",
                });
            }

            shift.end_time = new Date();

            // Calculate Expectancies
            const sales = await queryRunner.manager.find(Sale, {
                where: {
                    cashier: { id: shift.cashier_id },
                    created_at: Between(shift.start_time, shift.end_time),
                    status: In([SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED])
                }
            });

            let expected_cash = Number(shift.opening_float);
            let mpesa_total = 0;
            let total_sales = 0;

            for (const sale of sales) {
                expected_cash += Math.max(0, Number(sale.cash_amount) - Number(sale.change_amount || 0));
                mpesa_total += Number(sale.mpesa_amount);
                total_sales += Number(sale.total_amount);
            }

            const refunds = await queryRunner.manager.find(ReturnRequest, {
                where: [
                    {
                        requested_by: { id: shift.cashier_id },
                        status: ReturnStatus.APPROVED,
                        refund_method: RefundMethod.CASH,
                        updated_at: Between(shift.start_time, shift.end_time),
                    },
                    {
                        mpesa_refund_completed_by: { id: shift.cashier_id },
                        status: ReturnStatus.APPROVED,
                        refund_method: RefundMethod.MPESA,
                        mpesa_refund_status: MpesaRefundStatus.COMPLETED,
                        mpesa_refund_completed_at: Between(shift.start_time, shift.end_time),
                    },
                ],
                relations: ["items", "items.sale_item"],
            });
            const refundIds = refunds.map((refund) => refund.id);
            const creditNotes = refundIds.length > 0
                ? await queryRunner.manager.find(CreditNote, {
                    where: { return_request: { id: In(refundIds) } },
                    relations: ["return_request"],
                })
                : [];
            const refundAmounts = new Map(
                creditNotes
                    .filter((creditNote) => creditNote.return_request)
                    .map((creditNote) => [creditNote.return_request!.id, Number(creditNote.amount)]),
            );

            for (const returnRequest of refunds) {
                if (returnRequest.refund_method === RefundMethod.CASH) {
                    const recordedRefundAmount = refundAmounts.get(returnRequest.id);
                    if (recordedRefundAmount !== undefined) {
                        expected_cash -= recordedRefundAmount;
                    } else {
                        for (const returnItem of returnRequest.items) {
                            const saleItem = returnItem.sale_item;
                            const returnedSubtotal = Number(saleItem.line_total) / saleItem.quantity * returnItem.quantity;
                            expected_cash -= returnedSubtotal * (1 + Number(saleItem.tax_rate) / 100);
                        }
                    }
                }
                if (returnRequest.refund_method === RefundMethod.MPESA) {
                    mpesa_total -= Number(returnRequest.mpesa_refund_amount);
                }
            }

            shift.expected_cash = expected_cash;
            shift.mpesa_total = mpesa_total;
            shift.total_sales = total_sales;
            shift.actual_cash = parsedActualCash;
            shift.notes = sanitizedNotes;
            shift.status = ShiftStatus.CLOSED;

            await queryRunner.manager.save(shift);
            await queryRunner.commitTransaction();

            res.json({
                message: "Shift closed. Z-Report generated.",
                shift
            });

        } catch (err) {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            res.status(400).json({ message: "Failed to close shift", error: getErrorMessage(err, "Unknown error") });
        } finally {
            await queryRunner.release();
        }
    }

    static async getCurrentShift(req: AuthenticatedRequest, res: Response) {
        try {
            const shift = await shiftRepo.findOne({
                where: { cashier_id: req.user!.id, status: ShiftStatus.OPEN },
                relations: ["cashier"]
            });
            if (!shift) return res.status(404).json({ message: "No open shift found" });
            res.json(shift);
        } catch (err) {
            res.status(400).json({ message: "Failed to fetch shift" });
        }
    }

    static async getAllShifts(req: AuthenticatedRequest, res: Response) {
        try {
            const canViewAll = ["supervisor", "manager", "admin"].includes(req.user!.role);
            const whereClause = canViewAll ? {} : { cashier_id: req.user!.id };
            const shifts = await shiftRepo.find({
                where: whereClause,
                relations: ["cashier"],
                order: { start_time: "DESC" },
                take: 50 // Limit to last 50 shifts for performance
            });
            res.json(shifts);
        } catch (err) {
            res.status(400).json({ message: "Failed to fetch shifts", error: getErrorMessage(err, "Unknown error") });
        }
    }
}
