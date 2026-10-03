import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Setting } from "../entity/Setting";
import { LoyaltyMember } from "../entity/LoyaltyMember";
import { Customer } from "../entity/Customer";
import { normalizeProductUnitOfMeasures } from "../services/ProductCatalogSettings";

const settingRepository = AppDataSource.getRepository(Setting);
const loyaltyMemberRepository = AppDataSource.getRepository(LoyaltyMember);
const customerRepository = AppDataSource.getRepository(Customer);

const RECEIPT_SETTING_KEYS = new Set([
    "company_name",
    "company_address",
    "company_phone",
    "tax_pin",
    "company_logo",
    "receipt_footer",
    "mpesa_paybill",
    "mpesa_till_number",
    "mpesa_shortcode",
]);

const SETTINGS_KEYS = new Set([
    "company_name",
    "company_address",
    "company_phone",
    "tax_pin",
    "mpesa_paybill",
    "mpesa_till_number",
    "mpesa_shortcode",
    "mpesa_callback_url",
    "receipt_footer",
    "loyalty_points_rate",
    "loyalty_points_per_amount",
    "loyalty_points_value",
    "loyalty_tier_silver_min",
    "loyalty_tier_gold_min",
    "loyalty_tier_platinum_min",
    "product_unit_of_measures",
]);

const getTierFromSpent = (totalSpent: number): string => {
    if (totalSpent >= 300000) return "Platinum";
    if (totalSpent >= 150000) return "Gold";
    if (totalSpent >= 50000) return "Silver";
    return "Bronze";
};

const LOYALTY_TIERS = new Set(["Bronze", "Silver", "Gold", "Platinum"]);

export const sanitizeLoyaltyMemberPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Loyalty member payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const customer_id = typeof payload.customer_id === "string" ? payload.customer_id.trim() : "";
    const points = Number(payload.points);
    const total_spent = Number(payload.total_spent);
    const tier = typeof payload.tier === "string" ? payload.tier.trim() : "";

    if (!customer_id) throw new Error("customer_id is required");
    if (!Number.isFinite(points) || points < 0) throw new Error("points must be a non-negative number");
    if (!Number.isFinite(total_spent) || total_spent < 0) throw new Error("total_spent must be a non-negative number");
    if (!tier || !LOYALTY_TIERS.has(tier)) throw new Error("tier is invalid");

    return {
        customer_id,
        points,
        total_spent,
        tier,
    };
};

export const sanitizeLoyaltyPointsPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Loyalty points payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const points = Number(payload.points);
    const amount = Number(payload.amount);

    if (!Number.isFinite(points) || points <= 0) throw new Error("points must be a positive number");
    if (!Number.isFinite(amount) || amount < 0) throw new Error("amount must be a non-negative number");

    return { points, amount };
};

export const sanitizeSettingsPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Record<string, string>;
    }

    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!SETTINGS_KEYS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (key === "product_unit_of_measures") {
            let parsed: unknown;
            try {
                parsed = typeof value === "string" ? JSON.parse(value) : value;
            } catch {
                throw new Error("Product units must be a valid JSON list.");
            }
            sanitized[key] = JSON.stringify(normalizeProductUnitOfMeasures(parsed));
            continue;
        }

        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
            sanitized[key] = String(value);
        }
    }

    return sanitized;
};

export const getCompanyLogoMimeType = (buffer: Buffer): string | null => {
    if (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return "image/png";
    }
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return "image/jpeg";
    }
    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }
    return null;
};

const buildSettingsMap = (settings: Setting[]) => {
    const settingsMap = settings.reduce((acc, setting) => {
        if (setting.key === "company_logo") {
            return acc;
        }
        acc[setting.key] = setting.value ?? "";
        return acc;
    }, {} as Record<string, string>);
    const logoSetting = settings.find((setting) => setting.key === "company_logo");
    if (logoSetting) {
        settingsMap.company_logo = `/api/company-logo?v=${logoSetting.updated_at.getTime()}`;
    }
    return settingsMap;
};

export class LoyaltyController {
    static async getReceiptSettings(req: Request, res: Response) {
        try {
            const settings = await settingRepository.find();
            return res.json(buildSettingsMap(settings.filter((setting) => RECEIPT_SETTING_KEYS.has(setting.key))));
        } catch (error) {
            console.error("Error fetching receipt settings:", error);
            return res.status(500).json({ message: "Error fetching receipt settings" });
        }
    }

    static async getSettings(req: Request, res: Response) {
        try {
            const settings = await settingRepository.find();
            return res.json(buildSettingsMap(settings));
        } catch (error) {
            console.error("Error fetching loyalty settings:", error);
            return res.status(500).json({ message: "Error fetching loyalty settings" });
        }
    }

    static async saveSettings(req: Request, res: Response) {
        try {
            const incoming = sanitizeSettingsPayload(req.body.settings ?? req.body);
            if (!incoming || Object.keys(incoming).length === 0) {
                return res.status(400).json({ message: "Invalid settings payload" });
            }

            const existing = await settingRepository.find();
            const existingMap = new Map(existing.map((item) => [item.key, item]));

            for (const [key, value] of Object.entries(incoming)) {
                const record = existingMap.get(key) ?? new Setting();
                record.key = key;
                record.value = value;
                existingMap.set(key, record);
            }

            await settingRepository.save(Array.from(existingMap.values()));
            const saved = await settingRepository.find();
            return res.json(buildSettingsMap(saved));
        } catch (error) {
            console.error("Error saving loyalty settings:", error);
            if (error instanceof Error && /Product unit|Configure at least|Configure no more|Product units/.test(error.message)) {
                return res.status(400).json({ message: error.message });
            }
            return res.status(500).json({ message: "Error saving loyalty settings" });
        }
    }

    static async uploadCompanyLogo(req: Request & { file?: { size: number; buffer: Buffer } }, res: Response) {
        try {
            const file = req.file;
            if (!file || file.size === 0) {
                return res.status(400).json({ message: "Choose a non-empty PNG, JPEG, or WebP logo file." });
            }

            const mimeType = getCompanyLogoMimeType(file.buffer);
            if (!mimeType) {
                return res.status(400).json({ message: "The logo must be a valid PNG, JPEG, or WebP image." });
            }

            const record = settingRepository.create({
                key: "company_logo",
                value: `data:${mimeType};base64,${file.buffer.toString("base64")}`,
            });
            const saved = await settingRepository.save(record);
            return res.status(200).json({
                company_logo: `/api/company-logo?v=${saved.updated_at.getTime()}`,
            });
        } catch (error) {
            console.error("Error saving company logo:", error);
            return res.status(500).json({ message: "Unable to save the company logo. Please try again." });
        }
    }

    static async deleteCompanyLogo(_req: Request, res: Response) {
        try {
            await settingRepository.delete({ key: "company_logo" });
            return res.status(200).json({ company_logo: null });
        } catch (error) {
            console.error("Error removing company logo:", error);
            return res.status(500).json({ message: "Unable to remove the company logo. Please try again." });
        }
    }

    static async getCompanyLogo(_req: Request, res: Response) {
        try {
            const setting = await settingRepository.findOneBy({ key: "company_logo" });
            const match = setting?.value?.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
            if (!match) {
                return res.status(404).json({ message: "No company logo has been uploaded." });
            }

            const buffer = Buffer.from(match[2], "base64");
            if (getCompanyLogoMimeType(buffer) !== match[1]) {
                return res.status(500).json({ message: "The saved company logo is invalid." });
            }

            return res
                .status(200)
                .set({
                    "Content-Type": match[1],
                    "Content-Length": String(buffer.length),
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "X-Content-Type-Options": "nosniff",
                })
                .send(buffer);
        } catch (error) {
            console.error("Error loading company logo:", error);
            return res.status(500).json({ message: "Unable to load the company logo." });
        }
    }

    static async getMembers(req: Request, res: Response) {
        try {
            const members = await loyaltyMemberRepository.find({
                relations: ["customer"],
                order: { points: "DESC" }
            });

            const payload = members.map((member) => ({
                id: member.id,
                customer_id: member.customer_id,
                points: Number(member.points || 0),
                tier: member.tier,
                total_spent: Number(member.total_spent || 0),
                created_at: member.created_at,
                customer: member.customer
                    ? {
                        id: member.customer.id,
                        name: member.customer.name,
                        phone: member.customer.phone,
                    }
                    : null,
            }));

            return res.json(payload);
        } catch (error) {
            console.error("Error fetching loyalty members:", error);
            return res.status(500).json({ message: "Error fetching loyalty members" });
        }
    }

    static async createMember(req: Request, res: Response) {
        try {
            const { customer_id, points, total_spent, tier } = sanitizeLoyaltyMemberPayload(req.body ?? {});

            const existing = await loyaltyMemberRepository.findOne({ where: { customer_id } });
            if (existing) {
                return res.status(400).json({ message: "Loyalty member already exists for this customer" });
            }

            const customer = await customerRepository.findOneBy({ id: customer_id });
            if (!customer) {
                return res.status(404).json({ message: "Customer not found" });
            }

            const member = new LoyaltyMember();
            member.customer = customer;
            member.customer_id = customer.id;
            member.points = Number(points || 0);
            member.total_spent = Number(total_spent || 0);
            member.tier = tier || getTierFromSpent(Number(total_spent || 0));

            const saved = await loyaltyMemberRepository.save(member);
            return res.status(201).json(saved);
        } catch (error) {
            console.error("Error creating loyalty member:", error);
            return res.status(400).json({ message: error instanceof Error ? error.message : "Error creating loyalty member" });
        }
    }

    static async addPoints(req: Request, res: Response) {
        try {
            const member = await loyaltyMemberRepository.findOne({
                where: { id: req.params.id as string },
                relations: ["customer"],
            });

            if (!member) {
                return res.status(404).json({ message: "Loyalty member not found" });
            }

            const { points: pointsToAdd, amount: saleAmount } = sanitizeLoyaltyPointsPayload(req.body ?? {});

            member.points += pointsToAdd;
            member.total_spent = Number(member.total_spent || 0) + saleAmount;
            member.tier = getTierFromSpent(Number(member.total_spent));

            await loyaltyMemberRepository.save(member);
            return res.json(member);
        } catch (error) {
            console.error("Error adding loyalty points:", error);
            return res.status(400).json({ message: error instanceof Error ? error.message : "Error adding loyalty points" });
        }
    }

    static async redeemPoints(req: Request, res: Response) {
        try {
            const member = await loyaltyMemberRepository.findOne({
                where: { id: req.params.id as string },
                relations: ["customer"],
            });

            if (!member) {
                return res.status(404).json({ message: "Loyalty member not found" });
            }

            const { points: pointsToRedeem } = sanitizeLoyaltyPointsPayload(req.body ?? {});
            if (member.points < pointsToRedeem) {
                return res.status(400).json({ message: "Insufficient loyalty points" });
            }

            member.points -= pointsToRedeem;
            member.tier = getTierFromSpent(Number(member.total_spent));

            await loyaltyMemberRepository.save(member);
            return res.json(member);
        } catch (error) {
            console.error("Error redeeming loyalty points:", error);
            return res.status(400).json({ message: error instanceof Error ? error.message : "Error redeeming loyalty points" });
        }
    }

    static async ensureMemberForCustomer(customerId: string, saleAmount: number, pointsToAward: number) {
        const member = await loyaltyMemberRepository.findOne({
            where: { customer_id: customerId },
            relations: ["customer"],
        });

        if (member) {
            member.points += pointsToAward;
            member.total_spent = Number(member.total_spent || 0) + saleAmount;
            member.tier = getTierFromSpent(Number(member.total_spent));
            return loyaltyMemberRepository.save(member);
        }

        const customer = await customerRepository.findOneBy({ id: customerId });
        if (!customer) {
            return null;
        }

        const newMember = new LoyaltyMember();
        newMember.customer = customer;
        newMember.customer_id = customer.id;
        newMember.points = pointsToAward;
        newMember.total_spent = saleAmount;
        newMember.tier = getTierFromSpent(Number(saleAmount));
        return loyaltyMemberRepository.save(newMember);
    }
}
