import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Vendor } from "../entity/Vendor";

export class VendorController {
    static async getAllVendors(req: Request, res: Response) {
        try {
            const vendorRepo = AppDataSource.getRepository(Vendor);
            const vendors = await vendorRepo.find({ order: { name: "ASC" } });
            res.json(vendors);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching vendors" });
        }
    }

    static async getVendor(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const vendorRepo = AppDataSource.getRepository(Vendor);
            const vendor = await vendorRepo.findOne({ where: { id } });
            if (!vendor) {
                return res.status(404).json({ message: "Vendor not found" });
            }
            res.json(vendor);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching vendor" });
        }
    }

    static async createVendor(req: Request, res: Response) {
        try {
            const vendorRepo = AppDataSource.getRepository(Vendor);
            const newVendor = vendorRepo.create(req.body);
            await vendorRepo.save(newVendor);
            res.status(201).json(newVendor);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error creating vendor" });
        }
    }

    static async updateVendor(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const vendorRepo = AppDataSource.getRepository(Vendor);
            const vendor = await vendorRepo.findOne({ where: { id } });
            if (!vendor) {
                return res.status(404).json({ message: "Vendor not found" });
            }
            vendorRepo.merge(vendor, req.body);
            await vendorRepo.save(vendor);
            res.json(vendor);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error updating vendor" });
        }
    }

    static async deleteVendor(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const vendorRepo = AppDataSource.getRepository(Vendor);
            const vendor = await vendorRepo.findOne({ where: { id } });
            if (!vendor) {
                return res.status(404).json({ message: "Vendor not found" });
            }
            await vendorRepo.remove(vendor);
            res.status(204).send();
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error deleting vendor" });
        }
    }
}
