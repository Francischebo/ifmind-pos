import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Customer } from "../entity/Customer";

const customerRepository = AppDataSource.getRepository(Customer);

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
            const { name, phone, email } = req.body;
            
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

            customerRepository.merge(customer, req.body);
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
