import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { TaxClass } from "../entity/TaxClass";

const taxRepository = AppDataSource.getRepository(TaxClass);

export const sanitizeTaxClassPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Tax class payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const rate = Number(payload.rate);
    const is_default = payload.is_default === undefined ? false : Boolean(payload.is_default);

    if (!name) throw new Error("name is required");
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("rate must be between 0 and 100");

    return { name, rate, is_default };
};

export const sanitizeTaxClassUpdatePayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Tax class update payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const sanitized: { name?: string; rate?: number; is_default?: boolean } = {};

    if (payload.name !== undefined) {
        const name = typeof payload.name === "string" ? payload.name.trim() : "";
        if (!name) throw new Error("name is required");
        sanitized.name = name;
    }

    if (payload.rate !== undefined) {
        const rate = Number(payload.rate);
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("rate must be between 0 and 100");
        sanitized.rate = rate;
    }

    if (payload.is_default !== undefined) {
        sanitized.is_default = Boolean(payload.is_default);
    }

    return sanitized;
};

export class TaxController {
    static async getAll(req: Request, res: Response) {
        try {
            const taxes = await taxRepository.find({ order: { name: "ASC" } });
            res.json(taxes);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching tax classes" });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const { name, rate, is_default } = sanitizeTaxClassPayload(req.body ?? {});

            if (is_default) {
                await taxRepository.update({}, { is_default: false });
            }

            const tax = new TaxClass();
            tax.name = name.trim();
            tax.rate = rate;
            tax.is_default = is_default;

            await taxRepository.save(tax);
            res.status(201).json(tax);
        } catch (error) {
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error creating tax class" });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { name, rate, is_default } = sanitizeTaxClassUpdatePayload(req.body ?? {});

            const tax = await taxRepository.findOneBy({ id: id as string });
            if (!tax) return res.status(404).json({ message: "Tax class not found" });

            if (is_default !== undefined && is_default && !tax.is_default) {
                await taxRepository.update({}, { is_default: false });
            }

            tax.name = name ?? tax.name;
            tax.rate = rate ?? tax.rate;
            tax.is_default = is_default ?? tax.is_default;

            await taxRepository.save(tax);
            res.json(tax);
        } catch (error) {
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error updating tax class" });
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const tax = await taxRepository.findOneBy({ id: id as string });
            if (!tax) return res.status(404).json({ message: "Tax class not found" });
            
            // Should probably check if it's used by products first, but skipping for simplicity
            await taxRepository.remove(tax);
            res.json({ message: "Tax class deleted" });
        } catch (error) {
            console.error(error);
            res.status(400).json({ message: "Error deleting tax class" });
        }
    }
}
