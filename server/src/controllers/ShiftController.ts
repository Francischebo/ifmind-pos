import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Shift, ShiftStatus } from "../entity/Shift";
import { User } from "../entity/User";
import { Sale, SaleStatus } from "../entity/Sale";
import { Between } from "typeorm";

const shiftRepo = AppDataSource.getRepository(Shift);

export class ShiftController {
    
    // Open Register
    static async openShift(req: any, res: Response) {
        try {
            const { opening_float } = req.body;
            const cashier = await AppDataSource.manager.findOneBy(User, { id: req.user.id });
            
            if (!cashier) return res.status(401).json({ message: "Invalid user" });

            // Ensure no open shifts exist for this user
            const existing = await shiftRepo.findOneBy({ cashier_id: cashier.id, status: ShiftStatus.OPEN });
            if (existing) {
                return res.status(400).json({ message: "You already have an open shift. Close it before opening a new one." });
            }

            const shift = new Shift();
            shift.cashier = cashier;
            shift.opening_float = opening_float || 0;
            await shiftRepo.save(shift);

            res.status(201).json(shift);
        } catch (err: any) {
             res.status(400).json({ message: "Failed to open shift", error: err.message });
        }
    }

    // Z-Report / Close Register
    static async closeShift(req: any, res: Response) {
        try {
            const { id } = req.params;
            const { actual_cash, notes } = req.body;
            
            const shift = await shiftRepo.findOne({ where: { id }, relations: ["cashier"] });
            if (!shift) return res.status(404).json({ message: "Shift not found" });

            if (shift.status === ShiftStatus.CLOSED) {
                return res.status(400).json({ message: "Shift is already closed." });
            }

            if (shift.cashier_id !== req.user.id && req.user.role !== "admin") {
                return res.status(403).json({ message: "Not authorized to close this shift." });
            }

            shift.end_time = new Date();
            
            // Calculate Expectancies
            const sales = await AppDataSource.manager.find(Sale, {
                where: {
                    cashier: { id: shift.cashier_id },
                    created_at: Between(shift.start_time, shift.end_time),
                    status: SaleStatus.COMPLETED
                }
            });

            let expected_cash = Number(shift.opening_float);
            let mpesa_total = 0;
            let total_sales = 0;

            for (const sale of sales) {
                expected_cash += Number(sale.cash_amount);
                mpesa_total += Number(sale.mpesa_amount);
                total_sales += Number(sale.total_amount);
            }

            shift.expected_cash = expected_cash;
            shift.mpesa_total = mpesa_total;
            shift.total_sales = total_sales;
            shift.actual_cash = actual_cash;
            shift.notes = notes;
            shift.status = ShiftStatus.CLOSED;

            await shiftRepo.save(shift);

            res.json({
                message: "Shift closed. Z-Report generated.",
                shift
            });

        } catch (err: any) {
            res.status(400).json({ message: "Failed to close shift", error: err.message });
        }
    }

    static async getCurrentShift(req: any, res: Response) {
        try {
            const shift = await shiftRepo.findOne({
                where: { cashier_id: req.user.id, status: ShiftStatus.OPEN },
                relations: ["cashier"]
            });
            if (!shift) return res.status(404).json({ message: "No open shift found" });
            res.json(shift);
        } catch (err: any) {
            res.status(400).json({ message: "Failed to fetch shift" });
        }
    }

    static async getAllShifts(req: any, res: Response) {
        try {
            const whereClause = req.user.role === "admin" ? {} : { cashier_id: req.user.id };
            const shifts = await shiftRepo.find({
                where: whereClause,
                relations: ["cashier"],
                order: { start_time: "DESC" },
                take: 50 // Limit to last 50 shifts for performance
            });
            res.json(shifts);
        } catch (err: any) {
            res.status(400).json({ message: "Failed to fetch shifts", error: err.message });
        }
    }
}
