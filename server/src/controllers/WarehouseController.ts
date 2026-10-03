import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Warehouse } from "../entity/Warehouse";
import { WarehouseService } from "../services/WarehouseService";

class CannotDemoteMainWarehouseError extends Error {}

const WAREHOUSE_ALLOWED_FIELDS = new Set([
    "name",
    "location_address",
    "is_main",
    "is_active",
]);

export const sanitizeWarehousePayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Record<string, any>;
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!WAREHOUSE_ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "" && key === "name") continue;
            sanitized[key] = trimmed;
            continue;
        }

        if (typeof value === "boolean") {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

export class WarehouseController {
    static async getAll(req: Request, res: Response) {
        try {
            const warehouseRepo = AppDataSource.getRepository(Warehouse);
            const warehouses = await warehouseRepo.find({
                where: { is_active: true }
            });
            res.json(warehouses);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching warehouses" });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const payload = sanitizeWarehousePayload(req.body);
            const { name, location_address, is_main } = payload;
            const warehouseRepo = AppDataSource.getRepository(Warehouse);

            if (!name || typeof name !== "string" || !name.trim()) {
                return res.status(400).json({ message: "Warehouse name is required" });
            }

            const warehouse = await AppDataSource.transaction(async (manager) => {
                const newWarehouse = manager.create(Warehouse, {
                    name: name.trim(),
                    location_address: typeof location_address === "string" && location_address.trim() ? location_address.trim() : "",
                    is_main: Boolean(is_main),
                });
                if (newWarehouse.is_main) {
                    await WarehouseService.promoteToMain(manager, newWarehouse);
                }
                return manager.save(newWarehouse);
            });
            res.status(201).json(warehouse);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message || "Error creating warehouse" });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const payload = sanitizeWarehousePayload(req.body);

            const warehouse = await AppDataSource.transaction(async (manager) => {
                const currentWarehouse = await manager.findOneBy(Warehouse, { id: id as string });

                if (!currentWarehouse) {
                    return null;
                }

                if (payload.is_main === false && currentWarehouse.is_main) {
                    throw new CannotDemoteMainWarehouseError("The main warehouse cannot be unset; promote another location instead");
                }

                if (payload.name !== undefined) {
                    if (typeof payload.name !== "string" || !payload.name.trim()) {
                        throw new Error("Warehouse name cannot be empty");
                    }
                    currentWarehouse.name = payload.name.trim();
                }
                if (payload.location_address !== undefined) {
                    currentWarehouse.location_address = payload.location_address ? payload.location_address.trim() : "";
                }
                if (payload.is_main === true && !currentWarehouse.is_main) {
                    await WarehouseService.promoteToMain(manager, currentWarehouse);
                }

                return manager.save(currentWarehouse);
            });

            if (!warehouse) {
                return res.status(404).json({ message: "Warehouse not found" });
            }
            res.status(200).json(warehouse);
        } catch (error: any) {
            if (error instanceof CannotDemoteMainWarehouseError) {
                return res.status(400).json({ message: error.message });
            }
            if (error instanceof Error && error.message === "Warehouse name cannot be empty") {
                return res.status(400).json({ message: error.message });
            }
            console.error(error);
            res.status(500).json({ message: error.message || "Error updating warehouse" });
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const warehouseRepo = AppDataSource.getRepository(Warehouse);
            const warehouse = await warehouseRepo.findOneBy({ id: id as string });
            
            if (!warehouse) {
                return res.status(404).json({ message: "Warehouse not found" });
            }

            if (warehouse.is_main) {
                return res.status(400).json({ message: "Cannot delete the main warehouse" });
            }

            // Instead of deleting, just set to inactive
            warehouse.is_active = false;
            await warehouseRepo.save(warehouse);
            
            res.status(200).json({ message: "Warehouse deactivated successfully" });
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message || "Error deleting warehouse" });
        }
    }
}
