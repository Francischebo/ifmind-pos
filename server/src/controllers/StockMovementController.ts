import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { StockMovement } from "../entity/StockMovement";

export class StockMovementController {
    static async list(req: Request, res: Response) {
        try {
            const movementType = req.query.type as string | undefined;
            const movements = await AppDataSource.getRepository(StockMovement).find({
                where: movementType ? { movement_type: movementType } : undefined,
                relations: ["product"],
                order: { created_at: "DESC" },
                take: 500,
            });
            res.json(movements);
        } catch (error) {
            console.error("Error fetching stock movements:", error);
            res.status(500).json({ message: "Error fetching stock movements" });
        }
    }
}
