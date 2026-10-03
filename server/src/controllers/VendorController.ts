import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Vendor } from "../entity/Vendor";
import { PurchaseOrder } from "../entity/PurchaseOrder";
import { SupplierInvoice } from "../entity/SupplierInvoice";

const VENDOR_ALLOWED_FIELDS = new Set([
    "name",
    "contact_person",
    "phone",
    "email",
    "address",
    "payment_terms",
]);

export const sanitizeVendorPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Record<string, any>;
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!VENDOR_ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "" && (key === "name" || key === "email" || key === "phone")) continue;
            sanitized[key] = trimmed;
        }
    }

    return sanitized;
};

export class VendorController {
    static async getPortalData(req: any, res: Response) {
        try {
            const email = req.user?.email;
            if (!email) {
                return res.status(400).json({ message: "Authenticated email is required" });
            }

            const vendor = await AppDataSource.getRepository(Vendor).findOne({ where: { email } });
            if (!vendor) {
                return res.status(404).json({ message: "No vendor account found for this email" });
            }

            const [purchaseOrders, invoices] = await Promise.all([
                AppDataSource.getRepository(PurchaseOrder).find({
                    where: { vendor_id: vendor.id },
                    order: { created_at: "DESC" },
                }),
                AppDataSource.getRepository(SupplierInvoice).find({
                    where: { vendor_id: vendor.id },
                    order: { created_at: "DESC" },
                }),
            ]);

            res.json({ vendor, purchaseOrders, invoices });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching vendor portal data" });
        }
    }

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
            const payload = sanitizeVendorPayload(req.body);
            if (!payload.name) {
                return res.status(400).json({ message: "Vendor name is required" });
            }

            const newVendor = vendorRepo.create(payload);
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
            vendorRepo.merge(vendor, sanitizeVendorPayload(req.body));
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
