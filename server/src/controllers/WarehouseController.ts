import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Warehouse } from "../entity/Warehouse";

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
            const { name, location_address, is_main, phone } = req.body; // note phone is ignored since it's not in entity
            const warehouseRepo = AppDataSource.getRepository(Warehouse);
            
            // If this is set to main, we should probably unset others (simplification for now)
            
            const warehouse = new Warehouse();
            warehouse.name = name;
            warehouse.location_address = location_address;
            warehouse.is_main = is_main || false;
            
            await warehouseRepo.save(warehouse);
            res.status(201).json(warehouse);
        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message || "Error creating warehouse" });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { name, location_address, is_main } = req.body;
            
            const warehouseRepo = AppDataSource.getRepository(Warehouse);
            const warehouse = await warehouseRepo.findOneBy({ id: id as string });
            
            if (!warehouse) {
                return res.status(404).json({ message: "Warehouse not found" });
            }

            if (name !== undefined) warehouse.name = name;
            if (location_address !== undefined) warehouse.location_address = location_address;
            if (is_main !== undefined) warehouse.is_main = is_main;

            await warehouseRepo.save(warehouse);
            res.status(200).json(warehouse);
        } catch (error: any) {
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
