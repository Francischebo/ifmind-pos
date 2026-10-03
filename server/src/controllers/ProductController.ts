import { Request, Response } from "express";
import { parse as parseCsv } from "csv-parse/sync";
import readXlsxFile from "read-excel-file/node";
import { AppDataSource } from "../data-source";
import { Product } from "../entity/Product";
import { Category } from "../entity/Category";
import { TaxClass } from "../entity/TaxClass";
import { Warehouse } from "../entity/Warehouse";
import { WarehouseStock } from "../entity/WarehouseStock";
import { PaymentCheckoutSession } from "../entity/PaymentCheckoutSession";
import { InventoryService } from "../services/InventoryService";
import { isConfiguredProductUnit, parseProductUnitOfMeasures } from "../services/ProductCatalogSettings";
import { Setting } from "../entity/Setting";

const productRepository = AppDataSource.getRepository(Product);
const categoryRepository = AppDataSource.getRepository(Category);
const taxClassRepository = AppDataSource.getRepository(TaxClass);
const warehouseStockRepository = AppDataSource.getRepository(WarehouseStock);

class ProductInventoryValidationError extends Error {}

const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
    "sku",
    "barcode",
    "name",
    "category_name",
    "tax_class_name",
    "unit_cost",
    "retail_price",
    "tax_rate",
    "unit_of_measure",
    "reorder_level",
    "stock_on_hand",
    "location",
    "warehouse_name",
];

const escapeCsvValue = (value: unknown) => {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const readImportValue = (row: Record<string, unknown>, keys: string[]) => {
    const normalizeHeader = (header: string) => header
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
    const aliases = new Set(keys.map(normalizeHeader));
    const removableSuffixes = ["kes", "kshs", "ksh", "units", "unit", "pcs", "pieces"];

    for (const [header, value] of Object.entries(row)) {
        if (value === undefined || value === null || String(value).trim() === "") {
            continue;
        }

        let normalizedHeader = normalizeHeader(header);
        if (aliases.has(normalizedHeader)) {
            return value;
        }

        for (const suffix of removableSuffixes) {
            if (normalizedHeader.endsWith(suffix)) {
                normalizedHeader = normalizedHeader.slice(0, -suffix.length);
                if (aliases.has(normalizedHeader)) {
                    return value;
                }
                break;
            }
        }
    }

    return undefined;
};

export const normalizeProductImportRow = (row: Record<string, unknown>) => {
    const getValue = (...keys: string[]) => readImportValue(row, keys);

    return {
        sku: String(getValue("sku", "product_sku", "product code", "item code") ?? "").trim(),
        barcode: String(getValue("barcode", "product_barcode") ?? "").trim() || null,
        name: String(getValue("name", "product_name", "product name") ?? "").trim(),
        category_name: String(getValue("category_name", "category name", "category", "product_category") ?? "").trim(),
        tax_class_name: String(getValue("tax_class_name", "tax class name", "tax_class", "tax class", "tax_name") ?? "").trim(),
        warehouse_name: String(getValue("warehouse_name", "warehouse name", "warehouse", "warehouse_name_1") ?? "").trim(),
        unit_cost: getValue("unit_cost", "cost_price", "purchase_price", "purchase cost", "cost"),
        retail_price: getValue("retail_price", "selling_price", "sale_price", "selling price", "sale price"),
        tax_rate: getValue("tax_rate", "vat_rate"),
        unit_of_measure: String(getValue("unit_of_measure", "unit of measure", "uom", "unit") ?? "piece").trim() || "piece",
        reorder_level: getValue("reorder_level", "reorder level", "minimum_stock", "minimum stock"),
        stock_on_hand: getValue("stock_on_hand", "stock on hand", "opening_stock", "opening stock", "quantity", "opening quantity"),
        location: String(getValue("location", "store_location", "store location") ?? "main").trim() || "main",
    };
};

const detectCsvDelimiter = (buffer: Buffer) => {
    const firstLine = buffer.toString("utf8").split(/\r?\n/, 1)[0] ?? "";
    const counts = new Map([[",", 0], [";", 0], ["\t", 0], ["|", 0]]);
    let insideQuotes = false;

    for (let index = 0; index < firstLine.length; index += 1) {
        const character = firstLine[index];
        if (character === '"' && firstLine[index + 1] === '"' && insideQuotes) {
            index += 1;
        } else if (character === '"') {
            insideQuotes = !insideQuotes;
        } else if (!insideQuotes && counts.has(character)) {
            counts.set(character, (counts.get(character) ?? 0) + 1);
        }
    }

    return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] || ",";
};

export const parseProductImportFile = async (buffer: Buffer, originalName: string): Promise<Record<string, unknown>[]> => {
    if (originalName.toLowerCase().endsWith(".csv")) {
        return parseCsv(buffer, {
            bom: true,
            columns: true,
            delimiter: detectCsvDelimiter(buffer),
            skip_empty_lines: true,
            trim: true,
            max_record_size: 100_000,
        }) as Record<string, unknown>[];
    }

    const sheets = await readXlsxFile(buffer);
    const sheetRows = sheets[0]?.data;
    if (!sheetRows?.length) {
        throw new Error("The file does not contain visible worksheet data.");
    }

    const headers = sheetRows[0].map((value) => String(value ?? "").trim());
    return sheetRows.slice(1)
        .filter((row) => row.some((value) => value !== null && String(value).trim() !== ""))
        .map((row) => Object.fromEntries(
            headers.flatMap((header, index) => header ? [[header, row[index] === null || row[index] === undefined ? "" : String(row[index])]] : []),
        ));
};

export const parseProductImportNumber = (value: unknown): number => {
    if (typeof value === "number") {
        return value;
    }

    const normalized = String(value ?? "")
        .trim()
        .replace(/^(?:KES|KSHS?|KSh)\s*/i, "")
        .replace(/\s/g, "");
    const groupedNumber = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    return Number(groupedNumber.test(normalized) ? normalized.replace(/,/g, "") : normalized);
};

export const selectProductImportWarehouse = <T extends { name: string; is_main: boolean }>(
    warehouseName: string,
    openingStock: number,
    warehouses: T[],
): T | undefined => {
    if (warehouseName) {
        return warehouses.find(
            (warehouse) => warehouse.name.trim().toLowerCase() === warehouseName.trim().toLowerCase(),
        );
    }

    if (openingStock > 0) {
        return warehouses.find((warehouse) => warehouse.is_main) ?? warehouses[0];
    }

    return undefined;
};

export const getProductImportPersistenceError = (error: unknown): string => {
    const databaseError = error && typeof error === "object"
        ? error as { code?: string; constraint?: string; column?: string; driverError?: { code?: string; constraint?: string; column?: string } }
        : {};
    const driverError = databaseError.driverError ?? databaseError;
    const code = driverError.code;
    const constraint = driverError.constraint?.toLowerCase() ?? "";

    if (code === "23505") {
        if (constraint.includes("barcode")) {
            return "Barcode already exists in the system.";
        }
        if (constraint.includes("sku")) {
            return "SKU already exists in the system.";
        }
        return "A value that must be unique already exists in the system.";
    }
    if (code === "23503") {
        return "A referenced category or tax class no longer exists. Refresh the catalog and retry.";
    }
    if (code === "23502") {
        return `A required product field${driverError.column ? ` (${driverError.column})` : ""} is missing.`;
    }
    if (code === "22003") {
        return "A numeric value exceeds the supported product field range.";
    }
    if (code === "22P02") {
        return "A product field contains a value in an unsupported format.";
    }

    return "Could not save this product. Check its values and verify the SKU and barcode are unique.";
};

const PRODUCT_ALLOWED_FIELDS = new Set([
    "sku",
    "barcode",
    "name",
    "category_id",
    "tax_class_id",
    "unit_cost",
    "retail_price",
    "tax_rate",
    "unit_of_measure",
    "reorder_level",
    "stock_on_hand",
    "location",
    "parent_id",
    "is_parent",
    "variant_attributes",
]);

export const sanitizeProductPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return {} as Record<string, any>;
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (!PRODUCT_ALLOWED_FIELDS.has(key) || value === undefined || value === null) {
            continue;
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed === "" && (key === "sku" || key === "name" || key === "location" || key === "unit_of_measure")) {
                continue;
            }
            sanitized[key] = trimmed;
            continue;
        }

        if (typeof value === "number") {
            if (!Number.isFinite(value)) {
                continue;
            }
            sanitized[key] = value;
            continue;
        }

        if (typeof value === "boolean") {
            sanitized[key] = value;
            continue;
        }

        if (typeof value === "object") {
            sanitized[key] = value;
        }
    }

    return sanitized;
};

export class ProductController {
    static getImportTemplate(req: Request, res: Response) {
        const csv = PRODUCT_IMPORT_TEMPLATE_HEADERS.map(escapeCsvValue).join(",");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=product_import_template.csv");
        res.status(200).send(csv);
    }

    static async importProducts(req: Request, res: Response) {
        const uploadedFile = (req as Request & { file?: { buffer: Buffer; originalname: string; mimetype: string } }).file;

        if (!uploadedFile || !uploadedFile.buffer || uploadedFile.buffer.length === 0) {
            return res.status(400).json({ message: "Please upload a CSV or XLSX file." });
        }

        const allowedExtensions = [".csv", ".xlsx"];
        const originalName = uploadedFile.originalname.toLowerCase();
        const hasAllowedExtension = allowedExtensions.some((extension) => originalName.endsWith(extension));
        const mimeType = uploadedFile.mimetype.toLowerCase();
        const hasAllowedMime = [
            "text/csv",
            "application/csv",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ].includes(mimeType);

        if (!hasAllowedExtension && !hasAllowedMime) {
            return res.status(400).json({ message: "Only CSV or Excel files are supported." });
        }

        try {
            let rows: Record<string, unknown>[];
            try {
                rows = await parseProductImportFile(uploadedFile.buffer, originalName);
            } catch {
                return res.status(400).json({ message: "The uploaded file could not be read as a valid CSV or XLSX workbook." });
            }

            if (!rows.length) {
                return res.status(400).json({ message: "The uploaded file does not contain any rows to import." });
            }
            if (rows.length > 1000) {
                return res.status(400).json({ message: "A single import can contain at most 1,000 product rows." });
            }

            const actorId = (req as Request & { user?: { id: string } }).user?.id;
            if (!actorId) throw new Error("Product creator is required");

            const existingProducts = await productRepository.find({ select: ["sku", "barcode"] });
            const existingSkus = new Set(existingProducts.map((product) => product.sku.trim().toLowerCase()));
            const existingBarcodes = new Set(existingProducts
                .map((product) => product.barcode?.trim().toLowerCase())
                .filter((barcode): barcode is string => Boolean(barcode)));
            const seenSkus = new Set<string>();
            const seenBarcodes = new Set<string>();
            const createdProducts: Array<{ sku: string; name: string; stock_on_hand: number; warehouse?: string }> = [];
            const errors: string[] = [];

            const queryRunner = AppDataSource.createQueryRunner();
            await queryRunner.connect();
            await queryRunner.startTransaction();

            try {
                const categories = await queryRunner.manager.find(Category);
                const taxClasses = await queryRunner.manager.find(TaxClass);
                const warehouses = await queryRunner.manager.find(Warehouse, { where: { is_active: true } });
                const productUnitSetting = await queryRunner.manager.findOneBy(Setting, {
                    key: "product_unit_of_measures",
                });
                const configuredUnits = parseProductUnitOfMeasures(productUnitSetting?.value);
                const categoryByName = new Map(categories.map((category) => [category.name.trim().toLowerCase(), category]));
                const taxClassByName = new Map(taxClasses.map((taxClass) => [taxClass.name.trim().toLowerCase(), taxClass]));

                for (const [index, rawRow] of rows.entries()) {
                    const row = normalizeProductImportRow(rawRow as Record<string, unknown>);
                    const rowNumber = index + 2;
                    const sku = row.sku;
                    const name = row.name;

                    if (!sku) {
                        errors.push(`Row ${rowNumber}: SKU is required.`);
                        continue;
                    }

                    if (seenSkus.has(sku.toLowerCase()) || existingSkus.has(sku.toLowerCase())) {
                        errors.push(`Row ${rowNumber}: SKU "${sku}" already exists in the system.`);
                        continue;
                    }

                    if (!name) {
                        errors.push(`Row ${rowNumber}: Product name is required.`);
                        continue;
                    }

                    if (!isConfiguredProductUnit(row.unit_of_measure, configuredUnits)) {
                        errors.push(
                            `Row ${rowNumber}: Unit of measure "${row.unit_of_measure}" is not configured. Add it in Settings > Product Catalog before importing. Configured units: ${configuredUnits.join(", ")}.`,
                        );
                        continue;
                    }

                    const barcodeKey = row.barcode?.toLowerCase();
                    if (barcodeKey && (existingBarcodes.has(barcodeKey) || seenBarcodes.has(barcodeKey))) {
                        errors.push(`Row ${rowNumber}: Barcode "${row.barcode}" already exists in the system or this file.`);
                        continue;
                    }

                    const category = row.category_name
                        ? categoryByName.get(row.category_name.toLowerCase())
                        : null;
                    if (row.category_name && !category) {
                        errors.push(`Row ${rowNumber}: Category "${row.category_name}" is not configured. Add it in Settings > Product Catalog before importing.`);
                        continue;
                    }

                    const taxClass = row.tax_class_name
                        ? taxClassByName.get(row.tax_class_name.toLowerCase())
                        : null;
                    if (row.tax_class_name && !taxClass) {
                        errors.push(`Row ${rowNumber}: Tax class "${row.tax_class_name}" was not found.`);
                        continue;
                    }

                    if (row.unit_cost === undefined || String(row.unit_cost).trim() === "") {
                        errors.push(`Row ${rowNumber}: unit_cost is required.`);
                        continue;
                    }

                    if (row.retail_price === undefined || String(row.retail_price).trim() === "") {
                        errors.push(`Row ${rowNumber}: retail_price is required.`);
                        continue;
                    }

                    const numericUnitCost = parseProductImportNumber(row.unit_cost);
                    const numericRetailPrice = parseProductImportNumber(row.retail_price);
                    const numericTaxRate = parseProductImportNumber(row.tax_rate ?? 16);
                    const numericReorderLevel = parseProductImportNumber(row.reorder_level ?? 0);
                    const numericStock = parseProductImportNumber(row.stock_on_hand ?? 0);

                    if (!Number.isFinite(numericUnitCost) || numericUnitCost < 0) {
                        errors.push(`Row ${rowNumber}: unit_cost must be a valid non-negative number.`);
                        continue;
                    }
                    if (numericUnitCost > 99_999_999.99) {
                        errors.push(`Row ${rowNumber}: unit_cost exceeds the maximum supported value of 99,999,999.99.`);
                        continue;
                    }

                    if (!Number.isFinite(numericRetailPrice) || numericRetailPrice < 0) {
                        errors.push(`Row ${rowNumber}: retail_price must be a valid non-negative number.`);
                        continue;
                    }
                    if (numericRetailPrice > 99_999_999.99) {
                        errors.push(`Row ${rowNumber}: retail_price exceeds the maximum supported value of 99,999,999.99.`);
                        continue;
                    }

                    if (!Number.isFinite(numericTaxRate) || numericTaxRate < 0) {
                        errors.push(`Row ${rowNumber}: tax_rate must be a valid non-negative number.`);
                        continue;
                    }
                    if (numericTaxRate > 999.99) {
                        errors.push(`Row ${rowNumber}: tax_rate exceeds the maximum supported value of 999.99.`);
                        continue;
                    }

                    if (!Number.isInteger(numericReorderLevel) || numericReorderLevel < 0) {
                        errors.push(`Row ${rowNumber}: reorder_level must be a non-negative whole number.`);
                        continue;
                    }

                    if (!Number.isInteger(numericStock) || numericStock < 0) {
                        errors.push(`Row ${rowNumber}: stock_on_hand must be a non-negative whole number.`);
                        continue;
                    }

                    const warehouse = selectProductImportWarehouse(row.warehouse_name, numericStock, warehouses) ?? null;

                    if (row.warehouse_name && !warehouse) {
                        errors.push(`Row ${rowNumber}: Active warehouse "${row.warehouse_name}" was not found.`);
                        continue;
                    }

                    if (numericStock > 0 && !warehouse) {
                        errors.push(`Row ${rowNumber}: stock_on_hand is greater than zero but no active warehouse is available. Create or activate a warehouse, or set opening stock to zero.`);
                        continue;
                    }

                    const productPayload = sanitizeProductPayload({
                        sku,
                        barcode: row.barcode || undefined,
                        name,
                        category_id: category?.id,
                        tax_class_id: taxClass?.id,
                        unit_cost: numericUnitCost,
                        retail_price: numericRetailPrice,
                        tax_rate: numericTaxRate,
                        unit_of_measure: row.unit_of_measure || "piece",
                        reorder_level: numericReorderLevel,
                        stock_on_hand: numericStock,
                        location: row.location || "main",
                    });

                    const product = new Product();
                    Object.assign(product, productPayload);
                    product.category = category as any;
                    product.tax_class = taxClass as any;

                    const savepoint = `product_import_row_${index}`;
                    await queryRunner.query(`SAVEPOINT ${savepoint}`);
                    try {
                        const savedProduct = await queryRunner.manager.save(product);
                        if (savedProduct.stock_on_hand > 0 && warehouse) {
                            await InventoryService.initializeStock(
                                queryRunner.manager,
                                savedProduct.id,
                                warehouse.id,
                                Number(savedProduct.stock_on_hand),
                                actorId,
                            );
                        }

                        await queryRunner.query(`RELEASE SAVEPOINT ${savepoint}`);
                        createdProducts.push({
                            sku: savedProduct.sku,
                            name: savedProduct.name,
                            stock_on_hand: savedProduct.stock_on_hand,
                            warehouse: warehouse?.name,
                        });
                        seenSkus.add(savedProduct.sku.trim().toLowerCase());
                        existingSkus.add(savedProduct.sku.trim().toLowerCase());
                        if (barcodeKey) {
                            seenBarcodes.add(barcodeKey);
                            existingBarcodes.add(barcodeKey);
                        }
                    } catch (error) {
                        await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
                        await queryRunner.query(`RELEASE SAVEPOINT ${savepoint}`);
                        errors.push(`Row ${rowNumber}: ${getProductImportPersistenceError(error)}`);
                    }
                }

                await queryRunner.commitTransaction();
                return res.status(201).json({
                    created: createdProducts.length,
                    skipped: errors.length,
                    summary: `Created ${createdProducts.length} products. ${errors.length} rows were skipped.`,
                    results: createdProducts,
                    errors,
                });
            } catch (error) {
                await queryRunner.rollbackTransaction();
                throw error;
            } finally {
                await queryRunner.release();
            }
        } catch (error) {
            console.error("Product import failed", error);
            return res.status(500).json({ message: error instanceof Error ? error.message : "Error importing products" });
        }
    }

    static async getInventoryAlerts(req: Request, res: Response) {
        try {
            const [products, totalsByProduct] = await Promise.all([
                productRepository.find({
                    select: ["id", "name", "sku", "stock_on_hand", "reorder_level"],
                    order: { stock_on_hand: "ASC" },
                }),
                InventoryService.getTotalStockByProduct(AppDataSource.manager),
            ]);
            const inventory = products
                .map((product) => ({
                    ...product,
                    stock_on_hand: InventoryService.getTotalStockOnHand(product, totalsByProduct),
                }))
                .filter((product) => product.stock_on_hand <= Number(product.reorder_level))
                .sort((left, right) => {
                    const leftStock = Number(left.stock_on_hand);
                    const rightStock = Number(right.stock_on_hand);
                    const leftReorderLevel = Number(left.reorder_level);
                    const rightReorderLevel = Number(right.reorder_level);
                    const urgencyDifference =
                        (leftReorderLevel > 0 ? leftStock / leftReorderLevel : leftStock) -
                        (rightReorderLevel > 0 ? rightStock / rightReorderLevel : rightStock);
                    return urgencyDifference || leftStock - rightStock || left.name.localeCompare(right.name);
                });
            res.json(inventory);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching inventory alerts" });
        }
    }

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
            } else {
                const totalsByProduct = await InventoryService.getTotalStockByProduct(AppDataSource.manager);
                products = products.map((product) => ({
                    ...product,
                    stock_on_hand: InventoryService.getTotalStockOnHand(product, totalsByProduct),
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
            const totalsByProduct = await InventoryService.getTotalStockByProduct(AppDataSource.manager);
            product.stock_on_hand = InventoryService.getTotalStockOnHand(product, totalsByProduct);
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
            const actorId = (req as Request & { user?: { id: string } }).user?.id;
            if (!actorId) throw new Error("Product creator is required");

            const rawBody = req.body && typeof req.body === "object" ? req.body : {};
            const variants = Array.isArray(rawBody.variants) ? rawBody.variants : [];
            const { category_id, tax_class_id, ...productData } = sanitizeProductPayload(rawBody);
            const warehouseId = typeof rawBody.warehouse_id === "string" ? rawBody.warehouse_id.trim() : "";
            const sanitizedVariants = variants.map((variant: unknown) => sanitizeProductPayload(variant));
            const openingQuantities: number[] = sanitizedVariants.length > 0
                ? sanitizedVariants.map((variant: Record<string, unknown>) => Number(variant.stock_on_hand ?? 0))
                : [Number(productData.stock_on_hand ?? 0)];

            if (openingQuantities.some((quantity) => !Number.isInteger(quantity) || quantity < 0)) {
                throw new ProductInventoryValidationError("Opening stock quantities must be non-negative whole numbers");
            }
            if (openingQuantities.some((quantity) => quantity > 0) && !warehouseId) {
                throw new ProductInventoryValidationError("Select a warehouse for opening stock");
            }

            const initialWarehouse = warehouseId
                ? await queryRunner.manager.findOne(Warehouse, { where: { id: warehouseId, is_active: true } })
                : null;
            if (warehouseId && !initialWarehouse) {
                throw new ProductInventoryValidationError("Opening stock warehouse must be active");
            }

            const category = category_id ? await queryRunner.manager.findOneBy(Category, { id: category_id }) : null;
            const tax_class = tax_class_id ? await queryRunner.manager.findOneBy(TaxClass, { id: tax_class_id }) : null;

            // Check if this is a parent with variants
            if (variants.length > 0) {
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
                for (const sanitizedVariant of sanitizedVariants) {
                    const child = new Product();
                    Object.assign(child, productData); // Base data
                    Object.assign(child, sanitizedVariant); // Override with variant specific data (sku, barcode, price, etc.)
                    child.category = category as any;
                    child.tax_class = tax_class as any;
                    child.parent = savedParent;
                    child.is_parent = false;
                    const savedChild = await queryRunner.manager.save(child);
                    if (savedChild.stock_on_hand > 0 && initialWarehouse) {
                        await InventoryService.initializeStock(
                            queryRunner.manager,
                            savedChild.id,
                            initialWarehouse.id,
                            Number(savedChild.stock_on_hand),
                            actorId,
                        );
                    }
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
                if (savedProduct.stock_on_hand > 0 && initialWarehouse) {
                    await InventoryService.initializeStock(
                        queryRunner.manager,
                        savedProduct.id,
                        initialWarehouse.id,
                        Number(savedProduct.stock_on_hand),
                        actorId,
                    );
                }
                await queryRunner.commitTransaction();
                return res.status(201).json(savedProduct);
            }
        } catch (error) {
            await queryRunner.rollbackTransaction();
            if (error instanceof ProductInventoryValidationError) {
                return res.status(400).json({ message: error.message });
            }
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

            const { category_id, tax_class_id, ...productFields } = sanitizeProductPayload(req.body);
            const requestedStock = productFields.stock_on_hand;
            delete productFields.stock_on_hand;
            if (requestedStock !== undefined && Number(requestedStock) !== Number(product.stock_on_hand)) {
                return res.status(400).json({ message: "Use an inventory adjustment or stocktake to change stock levels" });
            }

            if (category_id !== undefined && category_id !== null && category_id !== "") {
                const category = await categoryRepository.findOneBy({ id: category_id });
                if (category) product.category = category;
            }

            if (tax_class_id !== undefined && tax_class_id !== null && tax_class_id !== "") {
                const taxClass = await taxClassRepository.findOneBy({ id: tax_class_id });
                if (taxClass) product.tax_class = taxClass;
            }

            productRepository.merge(product, productFields);
            const results = await productRepository.save(product);
            res.json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error updating product" });
        }
    }

    static async deleteProduct(req: Request, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const product = await queryRunner.manager.findOne(Product, {
                where: { id: req.params.id as string },
                lock: { mode: "pessimistic_write" },
            });
            if (!product) {
                await queryRunner.rollbackTransaction();
                return res.status(404).json({ message: "Product not found" });
            }
            const activeSessions = await queryRunner.manager.find(PaymentCheckoutSession, {
                where: { status: "reserved" },
            });
            if (activeSessions.some((session) => session.items.some((item) => item.product_id === product.id))) {
                await queryRunner.rollbackTransaction();
                return res.status(409).json({ message: "Product cannot be deleted while reserved for an active checkout" });
            }
            const results = await queryRunner.manager.delete(Product, { id: product.id });
            await queryRunner.commitTransaction();
            return res.json(results);
        } catch (error) {
            console.error(error);
            await queryRunner.rollbackTransaction();
            res.status(500).json({ message: "Error deleting product" });
        } finally {
            await queryRunner.release();
        }
    }
}
