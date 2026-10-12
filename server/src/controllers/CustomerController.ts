import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Customer } from "../entity/Customer";

const customerRepository = AppDataSource.getRepository(Customer);

const CUSTOMER_ALLOWED_FIELDS = new Set([
    "name",
    "phone",
    "email",
    "total_purchases",
    "purchase_count",
    "is_frequent",
    "credit_limit",
    "credit_balance",
    "store_credit_balance",
]);

export const sanitizeCustomerPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Partial<Customer>;
    }

    const sanitized: Partial<Customer> = {};
    const textFields = new Set(["name", "phone", "email"]);
    const numericFields = new Set([
        "total_purchases",
        "purchase_count",
        "credit_limit",
        "credit_balance",
        "store_credit_balance",
    ]);
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!CUSTOMER_ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (textFields.has(key) && typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "" && (key === "name" || key === "phone")) continue;
            if (key === "name") sanitized.name = trimmed;
            else if (key === "phone") sanitized.phone = trimmed;
            else sanitized.email = trimmed;
            continue;
        }

        if (numericFields.has(key)) {
            const numericValue = typeof value === "number"
                ? value
                : typeof value === "string" && value.trim()
                    ? Number(value)
                    : Number.NaN;
            if (!Number.isFinite(numericValue)) continue;
            if (key === "total_purchases") sanitized.total_purchases = numericValue;
            else if (key === "purchase_count") sanitized.purchase_count = numericValue;
            else if (key === "credit_limit") sanitized.credit_limit = numericValue;
            else if (key === "credit_balance") sanitized.credit_balance = numericValue;
            else sanitized.store_credit_balance = numericValue;
            continue;
        }

        if (key === "is_frequent" && typeof value === "boolean") {
            sanitized.is_frequent = value;
        }
    }

    return sanitized;
};

export class CustomerController {
    static async getAllCustomers(req: Request, res: Response) {
        try {
            const customers = await customerRepository.find({
                order: { purchase_count: "DESC" }
            });
            res.json(customers);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching customers" });
        }
    }

    static async getCustomer(req: Request, res: Response) {
        try {
            const customer = await customerRepository.findOneBy({ id: req.params.id as string });
            if (!customer) return res.status(404).json({ message: "Customer not found" });
            res.json(customer);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching customer" });
        }
    }

    static async createCustomer(req: Request, res: Response) {
        try {
            const payload = sanitizeCustomerPayload(req.body);
            const { name, phone, email } = payload;

            if (!name || !phone) {
                return res.status(400).json({ message: "Customer name and phone are required" });
            }

            const existing = await customerRepository.findOneBy({ phone });
            if (existing) {
                return res.status(400).json({ message: "Customer with this phone number already exists" });
            }

            const customer = customerRepository.create({ name, phone, email });
            await customerRepository.save(customer);
            res.status(201).json(customer);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error creating customer" });
        }
    }

    static async updateCustomer(req: Request, res: Response) {
        try {
            const customer = await customerRepository.findOneBy({ id: req.params.id as string });
            if (!customer) return res.status(404).json({ message: "Customer not found" });

            customerRepository.merge(customer, sanitizeCustomerPayload(req.body));
            const results = await customerRepository.save(customer);
            res.json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error updating customer" });
        }
    }

    static async deleteCustomer(req: Request, res: Response) {
        try {
            const results = await customerRepository.delete(req.params.id as string);
            res.json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error deleting customer" });
        }
    }
}
