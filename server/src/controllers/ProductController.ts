import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Product } from "../entity/Product";
import { Category } from "../entity/Category";
import { TaxClass } from "../entity/TaxClass";
import { WarehouseStock } from "../entity/WarehouseStock";

const productRepository = AppDataSource.getRepository(Product);
const categoryRepository = AppDataSource.getRepository(Category);
const warehouseStockRepository = AppDataSource.getRepository(WarehouseStock);

export class ProductController {
    static async getAllProducts(req: Request, res: Response) {
        try {
            const { warehouse_id } = req.query;
            let products = await productRepository.find({ relations: ["category", "tax_class", "parent"] });

            if (warehouse_id) {
                const stocks = await warehouseStockRepository.find({
                    where: { warehouse_id: warehouse_id as string }
                });
                
                // Map stocks by product_id
                const stockMap = new Map(stocks.map(s => [s.product_id, s.stock_on_hand]));
                
                products = products.map(p => ({
                    ...p,
                    stock_on_hand: stockMap.get(p.id) || 0
                }));
            }

            res.json(products);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching products" });
        }
    }

    static async getProduct(req: Request, res: Response) {
        try {
            const product = await productRepository.findOne({ 
                where: { id: req.params.id as string },
                relations: ["category", "tax_class", "parent"]
            });
            if (!product) return res.status(404).json({ message: "Product not found" });
            res.json(product);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching product" });
        }
    }

    static async createProduct(req: Request, res: Response) {
        // Run in transaction to handle variants safely
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { category_id, tax_class_id, variants, ...productData } = req.body;
            
            const category = category_id ? await queryRunner.manager.findOneBy(Category, { id: category_id }) : null;
            const tax_class = tax_class_id ? await queryRunner.manager.findOneBy(TaxClass, { id: tax_class_id }) : null;

            // Check if this is a parent with variants
            if (variants && Array.isArray(variants) && variants.length > 0) {
                // Create Parent
                const parent = new Product();
                Object.assign(parent, productData);
                parent.category = category as any;
                parent.tax_class = tax_class as any;
                parent.is_parent = true;
                parent.stock_on_hand = 0; // Parent itself doesn't hold physical stock, children do

                const savedParent = await queryRunner.manager.save(parent);

                // Create Children (Variants)
                const createdVariants = [];
                for (const variant of variants) {
                    const child = new Product();
                    Object.assign(child, productData); // Base data
                    Object.assign(child, variant); // Override with variant specific data (sku, barcode, price, etc.)
                    child.category = category as any;
                    child.tax_class = tax_class as any;
                    child.parent = savedParent;
                    child.is_parent = false;
                    const savedChild = await queryRunner.manager.save(child);
                    createdVariants.push(savedChild);
                }

                await queryRunner.commitTransaction();
                return res.status(201).json({ parent: savedParent, variants: createdVariants });
            } else {
                // Create standard single product
                const product = new Product();
                Object.assign(product, productData);
                product.category = category as any;
                product.tax_class = tax_class as any;

                const savedProduct = await queryRunner.manager.save(product);
                await queryRunner.commitTransaction();
                return res.status(201).json(savedProduct);
            }
        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(error);
            return res.status(500).json({ message: "Error creating product" });
        } finally {
            await queryRunner.release();
        }
    }

    static async updateProduct(req: Request, res: Response) {
        try {
            const product = await productRepository.findOneBy({ id: req.params.id as string });
            if (!product) return res.status(404).json({ message: "Product not found" });

            if (req.body.category_id) {
                const category = await categoryRepository.findOneBy({ id: req.body.category_id });
                if (category) product.category = category;
            }

            productRepository.merge(product, req.body);
            const results = await productRepository.save(product);
            res.json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error updating product" });
        }
    }

    static async deleteProduct(req: Request, res: Response) {
        try {
            const results = await productRepository.delete(req.params.id as string);
            res.json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error deleting product" });
        }
    }
}
