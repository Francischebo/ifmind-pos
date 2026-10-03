import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Category } from "../entity/Category";
import { Product } from "../entity/Product";

const categoryRepository = AppDataSource.getRepository(Category);

export const sanitizeCategoryName = (input: unknown): string => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Category payload must be an object");
    }

    const name = (input as Record<string, unknown>).name;
    if (typeof name !== "string" || !name.trim()) {
        throw new Error("Category name is required");
    }
    if (name.trim().length > 100) {
        throw new Error("Category name must be 100 characters or fewer");
    }

    return name.trim();
};

const isUniqueViolation = (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");

export class CategoryController {
    static async list(_req: Request, res: Response) {
        try {
            const categories = await categoryRepository.find({ order: { name: "ASC" } });
            return res.json(categories);
        } catch (error) {
            console.error("Error fetching product categories:", error);
            return res.status(500).json({ message: "Unable to load product categories" });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const name = sanitizeCategoryName(req.body ?? {});
            const duplicate = await categoryRepository
                .createQueryBuilder("category")
                .where("LOWER(category.name) = LOWER(:name)", { name })
                .getOne();
            if (duplicate) {
                return res.status(409).json({ message: `Category "${duplicate.name}" already exists.` });
            }

            const category = await categoryRepository.save(categoryRepository.create({ name }));
            return res.status(201).json(category);
        } catch (error) {
            if (isUniqueViolation(error)) {
                return res.status(409).json({ message: "A category with that name already exists." });
            }
            if (error instanceof Error && /Category payload|Category name/.test(error.message)) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error creating product category:", error);
            return res.status(500).json({ message: "Unable to create product category" });
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const name = sanitizeCategoryName(req.body ?? {});
            const category = await categoryRepository.findOneBy({ id: req.params.id as string });
            if (!category) {
                return res.status(404).json({ message: "Category not found" });
            }

            const duplicate = await categoryRepository
                .createQueryBuilder("category")
                .where("LOWER(category.name) = LOWER(:name)", { name })
                .andWhere("category.id <> :id", { id: category.id })
                .getOne();
            if (duplicate) {
                return res.status(409).json({ message: `Category "${duplicate.name}" already exists.` });
            }

            category.name = name;
            return res.json(await categoryRepository.save(category));
        } catch (error) {
            if (isUniqueViolation(error)) {
                return res.status(409).json({ message: "A category with that name already exists." });
            }
            if (error instanceof Error && /Category payload|Category name/.test(error.message)) {
                return res.status(400).json({ message: error.message });
            }
            console.error("Error updating product category:", error);
            return res.status(500).json({ message: "Unable to update product category" });
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            const category = await categoryRepository.findOneBy({ id: req.params.id as string });
            if (!category) {
                return res.status(404).json({ message: "Category not found" });
            }

            const productsUsingCategory = await AppDataSource.getRepository(Product).count({
                where: { category: { id: category.id } },
            });
            if (productsUsingCategory > 0) {
                return res.status(409).json({
                    message: `Cannot delete "${category.name}" because ${productsUsingCategory} product(s) use it. Reassign those products first.`,
                });
            }

            await categoryRepository.remove(category);
            return res.json({ message: "Category deleted" });
        } catch (error) {
            if (isUniqueViolation(error)) {
                return res.status(409).json({ message: "This category is already in use or cannot be deleted." });
            }
            if (error && typeof error === "object" && "code" in error && error.code === "23503") {
                return res.status(409).json({ message: "This category is in use by products and cannot be deleted." });
            }
            console.error("Error deleting product category:", error);
            return res.status(500).json({ message: "Unable to delete product category" });
        }
    }
}
