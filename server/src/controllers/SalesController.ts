import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppDataSource } from "../data-source";
import { Sale, SaleStatus, PaymentMethod, EtimsStatus } from "../entity/Sale";
import { SaleItem } from "../entity/SaleItem";
import { Product } from "../entity/Product";
import { User } from "../entity/User";
import { Customer } from "../entity/Customer";
import { Warehouse } from "../entity/Warehouse";
import { WarehouseStock } from "../entity/WarehouseStock";
import { ProductBatch } from "../entity/ProductBatch";
import { SaleItemBatch } from "../entity/SaleItemBatch";
import { CreditNote } from "../entity/CreditNote";
import { StoreCredit, StoreCreditStatus } from "../entity/StoreCredit";
import { AccountingService } from "../services/AccountingService";
import { InventoryService } from "../services/InventoryService";
import { EtimsService } from "../services/etims/EtimsService";
import { SocketService } from "../services/SocketService";
import { MpesaTransaction } from "../entity/MpesaTransaction";
import { PaymentCheckoutSession } from "../entity/PaymentCheckoutSession";
import { Shift, ShiftStatus } from "../entity/Shift";
import { Invoice, InvoiceStatus } from "../entity/Invoice";
import { getReservedQuantity } from "../services/CheckoutReservationService";
import { In, IsNull } from "typeorm";

const saleRepository = AppDataSource.getRepository(Sale);
const saleItemRepository = AppDataSource.getRepository(SaleItem);
const productRepository = AppDataSource.getRepository(Product);

const SALE_ALLOWED_PAYMENT_METHODS = new Set(Object.values(PaymentMethod));
const BLOCKED_BATCH_QUALITY_STATUSES = new Set(["pending", "rejected", "failed", "hold", "on_hold"]);

const isBatchBlockedForSale = (batch: ProductBatch): boolean => {
    const status = (batch.quality_check_status ?? "").toLowerCase().trim();
    return status.length > 0 && BLOCKED_BATCH_QUALITY_STATUSES.has(status);
};

export interface SanitizedSaleItemPayload {
    product_id: string;
    quantity: number;
}

export interface SanitizedSalePayload {
    items: SanitizedSaleItemPayload[];
    payment_method?: PaymentMethod;
    customer_id?: string;
    warehouse_id?: string;
    loyalty_discount?: number;
    idempotency_key?: string;
    cash_amount?: number;
    mpesa_amount?: number;
    store_credit_amount?: number;
    store_credit_barcode?: string;
    mpesa_transaction_ids?: string[];
    checkout_session_id?: string;
    expected_total_amount?: number;
    offline_created_at?: Date;
}

export const calculateCashChange = (
    cashAmount: number,
    mpesaAmount: number,
    storeCreditAmount: number,
    totalAmount: number,
) => {
    const cashCents = Math.round(cashAmount * 100);
    const paidCents = Math.round((cashAmount + mpesaAmount + storeCreditAmount) * 100);
    const totalCents = Math.round(totalAmount * 100);
    return Math.min(cashCents, Math.max(0, paidCents - totalCents)) / 100;
};

export const deriveSalePaymentMethod = (
    cashAmount: number,
    mpesaAmount: number,
    storeCreditAmount: number,
): PaymentMethod => {
    const tenderMethods = [
        cashAmount > 0 ? PaymentMethod.CASH : null,
        mpesaAmount > 0 ? PaymentMethod.MPESA : null,
        storeCreditAmount > 0 ? PaymentMethod.STORE_CREDIT : null,
    ].filter((method): method is PaymentMethod => method !== null);
    if (tenderMethods.length > 1) return PaymentMethod.HYBRID;
    if (tenderMethods.length === 1) return tenderMethods[0];
    throw new Error("At least one payment tender is required");
};

export const sanitizeSalePayload = (input: unknown): SanitizedSalePayload => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Sale payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        throw new Error("At least one sale item is required");
    }

    const sanitizedItems: SanitizedSaleItemPayload[] = payload.items.map((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Each sale item must be an object");
        }

        const itemPayload = item as Record<string, unknown>;
        const product_id = typeof itemPayload.product_id === "string" ? itemPayload.product_id.trim() : "";
        const quantity = Number(itemPayload.quantity);

        if (!product_id) throw new Error("Each sale item requires a product_id");
        if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Each sale item quantity must be a positive whole number");

        return { product_id, quantity };
    });

    const sanitized: SanitizedSalePayload = { items: sanitizedItems };

    if (payload.payment_method !== undefined) {
        const payment_method = typeof payload.payment_method === "string" ? payload.payment_method.trim().toLowerCase() : "";
        if (!SALE_ALLOWED_PAYMENT_METHODS.has(payment_method as PaymentMethod)) {
            throw new Error("payment_method is invalid");
        }
        sanitized.payment_method = payment_method as PaymentMethod;
    }

    [
        ["customer_id", payload.customer_id],
        ["warehouse_id", payload.warehouse_id],
        ["store_credit_barcode", payload.store_credit_barcode],
    ].forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (typeof value !== "string") throw new Error(`${key} must be a string`);
        const trimmed = value.trim();
        if (!trimmed) return;
        sanitized[key as keyof SanitizedSalePayload] = trimmed as never;
    });

    [
        ["loyalty_discount", payload.loyalty_discount],
        ["cash_amount", payload.cash_amount],
        ["mpesa_amount", payload.mpesa_amount],
        ["store_credit_amount", payload.store_credit_amount],
    ].forEach(([key, value]) => {
        if (value === undefined) return;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
            throw new Error(`${key} must be a non-negative number`);
        }
        sanitized[key as keyof SanitizedSalePayload] = numeric as never;
    });

    if (payload.idempotency_key !== undefined) {
        const idempotency_key = typeof payload.idempotency_key === "string" ? payload.idempotency_key.trim() : "";
        if (!idempotency_key) throw new Error("idempotency_key is required when provided");
        if (idempotency_key.length > 200) throw new Error("idempotency_key must be 200 characters or less");
        sanitized.idempotency_key = idempotency_key;
    }

    if (payload.mpesa_transaction_ids !== undefined) {
        if (!Array.isArray(payload.mpesa_transaction_ids) ||
            payload.mpesa_transaction_ids.length === 0 ||
            payload.mpesa_transaction_ids.length > 10 ||
            payload.mpesa_transaction_ids.some((id) => typeof id !== "string" || !id.trim())) {
            throw new Error("mpesa_transaction_ids must contain 1 to 10 transaction IDs");
        }
        const ids = payload.mpesa_transaction_ids.map((id) => (id as string).trim());
        if (new Set(ids).size !== ids.length) throw new Error("M-Pesa transaction IDs must be unique");
        sanitized.mpesa_transaction_ids = ids;
    }

    if (payload.checkout_session_id !== undefined) {
        const checkout_session_id = typeof payload.checkout_session_id === "string" ? payload.checkout_session_id.trim() : "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkout_session_id)) {
            throw new Error("checkout_session_id must be a valid UUID");
        }
        sanitized.checkout_session_id = checkout_session_id;
    }

    if (payload.expected_total_amount !== undefined) {
        const expectedTotal = Number(payload.expected_total_amount);
        if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
            throw new Error("expected_total_amount must be a positive number");
        }
        sanitized.expected_total_amount = expectedTotal;
    }

    if (payload.offline_created_at !== undefined) {
        if (typeof payload.offline_created_at !== "string") {
            throw new Error("offline_created_at must be a valid ISO date");
        }
        const offlineCreatedAt = new Date(payload.offline_created_at);
        if (!Number.isFinite(offlineCreatedAt.getTime())) {
            throw new Error("offline_created_at must be a valid ISO date");
        }
        sanitized.offline_created_at = offlineCreatedAt;
    }

    if (
        (sanitized.offline_created_at && sanitized.expected_total_amount === undefined) ||
        (!sanitized.offline_created_at && sanitized.expected_total_amount !== undefined)
    ) {
        throw new Error("Offline sale metadata must include both offline_created_at and expected_total_amount");
    }
    if (sanitized.offline_created_at && !sanitized.idempotency_key) {
        throw new Error("Offline sales require an idempotency_key");
    }

    return sanitized;
};

export const sanitizeVoidSalePayload = (input: unknown): { reason: string } => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Void sale payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    if (payload.reason !== undefined && typeof payload.reason !== "string") {
        throw new Error("reason must be a string");
    }

    const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
    if (reason.length > 500) {
        throw new Error("reason must be 500 characters or less");
    }

    return { reason: reason || "Customer Return/Void" };
};

export interface SanitizedParkedSalePayload {
    items: SanitizedSaleItemPayload[];
    customer_id?: string;
    warehouse_id?: string;
    loyalty_discount?: number;
}

export const sanitizeParkedSalePayload = (input: unknown): SanitizedParkedSalePayload => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Parked sale payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
        throw new Error("At least one parked sale item is required");
    }

    const sanitizedItems: SanitizedSaleItemPayload[] = payload.items.map((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Each parked sale item must be an object");
        }

        const itemPayload = item as Record<string, unknown>;
        const product_id = typeof itemPayload.product_id === "string" ? itemPayload.product_id.trim() : "";
        const quantity = Number(itemPayload.quantity);

        if (!product_id) throw new Error("Each parked sale item requires a product_id");
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new Error("Each parked sale item quantity must be a positive whole number");
        }

        return { product_id, quantity };
    });

    const sanitized: SanitizedParkedSalePayload = { items: sanitizedItems };

    ["customer_id", "warehouse_id"].forEach((key) => {
        const value = payload[key];
        if (value === undefined || value === null) return;
        if (typeof value !== "string") throw new Error(`${key} must be a string`);
        const trimmed = value.trim();
        if (!trimmed) return;
        sanitized[key as keyof SanitizedParkedSalePayload] = trimmed as never;
    });

    if (payload.loyalty_discount !== undefined) {
        const loyaltyDiscount = Number(payload.loyalty_discount);
        if (!Number.isFinite(loyaltyDiscount) || loyaltyDiscount < 0) {
            throw new Error("loyalty_discount must be a non-negative number");
        }
        sanitized.loyalty_discount = loyaltyDiscount;
    }

    return sanitized;
};

export class SalesController {
    static async getAllSales(req: Request, res: Response) {
        try {
            const etimsStatus = typeof req.query.etims_status === "string" ? req.query.etims_status.trim().toLowerCase() : undefined;
            const whereClause: Record<string, unknown> = {};
            if (etimsStatus && etimsStatus !== "all") {
                whereClause.etims_status = etimsStatus;
            }
            const sales = await saleRepository.find({
                where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
                relations: ["items", "items.product", "cashier", "customer"],
                order: { created_at: "DESC" },
                take: 100,
            });
            res.json(sales);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching sales" });
        }
    }

    static async getSaleById(req: Request, res: Response) {
        try {
            const sale = await saleRepository.findOne({
                where: { id: req.params.id as string },
                relations: ["items", "items.product", "cashier", "cashier.profile", "customer"],
            });
            if (!sale) return res.status(404).json({ message: "Sale not found" });

            const mpesaTransaction = await AppDataSource.getRepository(MpesaTransaction).findOne({
                where: { sale_id: sale.id, status: "completed" },
                order: { created_at: "DESC" },
            });
            res.json({ sale, mpesaTransaction });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching sale" });
        }
    }

    static async getStoreCreditBalance(req: Request, res: Response) {
        try {
            const barcode = typeof req.params.barcode === "string"
                ? req.params.barcode.trim()
                : "";
            if (!barcode || barcode.length > 20) {
                return res.status(400).json({ message: "A valid store credit barcode is required" });
            }

            const storeCredit = await AppDataSource.getRepository(StoreCredit).findOne({
                where: { barcode, status: StoreCreditStatus.ACTIVE },
            });
            if (!storeCredit ||
                (storeCredit.expires_at && storeCredit.expires_at <= new Date()) ||
                Number(storeCredit.current_balance) <= 0) {
                return res.status(404).json({
                    message: "Store credit barcode is invalid, expired, inactive, or has no balance",
                });
            }

            return res.json({
                barcode: storeCredit.barcode,
                current_balance: Number(storeCredit.current_balance),
            });
        } catch (error) {
            console.error("Error checking store credit barcode:", error);
            return res.status(500).json({ message: "Unable to check store credit balance" });
        }
    }

    static async createSale(req: AuthenticatedRequest, res: Response) {
        // Run as a database transaction
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const {
                items,
                payment_method,
                customer_id,
                warehouse_id,
                loyalty_discount,
                idempotency_key,
                cash_amount,
                mpesa_amount,
                store_credit_amount,
                store_credit_barcode,
                mpesa_transaction_ids,
                checkout_session_id,
                expected_total_amount,
                offline_created_at,
            } = sanitizeSalePayload(req.body);

            const normalizedIdempotencyKey = typeof idempotency_key === "string"
                ? idempotency_key.trim()
                : "";
            const cashier = await queryRunner.manager.findOneBy(User, { id: req.user!.id });
            if (!cashier) throw new Error("Cashier not found");

            if (normalizedIdempotencyKey) {
                await queryRunner.query(
                    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
                    [cashier.id, normalizedIdempotencyKey],
                );
                const existingSale = await queryRunner.manager.findOne(Sale, {
                    where: {
                        cashier: { id: cashier.id },
                        idempotency_key: normalizedIdempotencyKey,
                    },
                    relations: ["items", "items.product", "customer", "warehouse"],
                });
                if (existingSale) {
                    const requestedItems = items
                        .map((item) => `${item.product_id}:${item.quantity}`)
                        .sort();
                    const existingItems = (existingSale.items || [])
                        .map((item) => `${item.product?.id}:${item.quantity}`)
                        .sort();
                    const amountInCents = (value: unknown) =>
                        Math.round(Number(value || 0) * 100);
                    const requestedPaymentMethod =
                        (amountInCents(cash_amount) > 0 || amountInCents(mpesa_amount) > 0 || amountInCents(store_credit_amount) > 0)
                            ? deriveSalePaymentMethod(cash_amount || 0, mpesa_amount || 0, store_credit_amount || 0)
                            : (payment_method || existingSale.payment_method);
                    const sameSaleRequest =
                        JSON.stringify(requestedItems) === JSON.stringify(existingItems) &&
                        existingSale.payment_method === requestedPaymentMethod &&
                        amountInCents(existingSale.cash_amount) === amountInCents(cash_amount) &&
                        amountInCents(existingSale.mpesa_amount) === amountInCents(mpesa_amount) &&
                        amountInCents(existingSale.store_credit_amount) === amountInCents(store_credit_amount) &&
                        amountInCents(existingSale.total_amount) === amountInCents(expected_total_amount ?? existingSale.total_amount) &&
                        amountInCents(existingSale.loyalty_discount) === amountInCents(loyalty_discount) &&
                        (existingSale.offline_created_at?.toISOString() || null) === (offline_created_at?.toISOString() || null) &&
                        (existingSale.customer?.id || null) === (customer_id || null) &&
                        (existingSale.warehouse?.id || null) === (warehouse_id || null) &&
                        (existingSale.store_credit_barcode || null) === (store_credit_barcode || null);
                    if (!sameSaleRequest) {
                        await queryRunner.rollbackTransaction();
                        return res.status(409).json({
                            message: "Idempotency key was already used for a different sale",
                        });
                    }

                    const existingTransactions = await queryRunner.manager.find(MpesaTransaction, {
                        where: { sale_id: existingSale.id },
                    });
                    const requestedTransactionIds = [...(mpesa_transaction_ids || [])].sort();
                    const existingTransactionIds = existingTransactions
                        .map((transaction) => transaction.id)
                        .sort();
                    if (JSON.stringify(requestedTransactionIds) !== JSON.stringify(existingTransactionIds) ||
                        (checkout_session_id &&
                            existingTransactions.some((transaction) =>
                                transaction.checkout_session_id !== checkout_session_id))) {
                        await queryRunner.rollbackTransaction();
                        return res.status(409).json({
                            message: "Idempotency key was already used for a different sale",
                        });
                    }

                    await queryRunner.commitTransaction();
                    return res.status(200).json({ message: "Sale already processed", sale: existingSale });
                }
            }

            // Enforce open shift
            const openShift = await queryRunner.manager.findOne(Shift, {
                where: { cashier_id: cashier.id, status: ShiftStatus.OPEN },
                lock: { mode: "pessimistic_write" },
            });
            if (!openShift) {
                throw new Error("You must open a shift before processing a sale.");
            }

            let checkoutSession: PaymentCheckoutSession | null = null;
            if (checkout_session_id) {
                checkoutSession = await queryRunner.manager.findOne(PaymentCheckoutSession, {
                    where: { id: checkout_session_id, cashier_id: cashier.id, status: "reserved" },
                    lock: { mode: "pessimistic_write" },
                });
                if (!checkoutSession) throw new Error("Reserved checkout session was not found or is no longer active");
                const itemsMatch = checkoutSession.items.length === items.length &&
                    checkoutSession.items.every((reservedItem) =>
                        items.some((item) => item.product_id === reservedItem.product_id &&
                            item.quantity === reservedItem.quantity));
                if (!itemsMatch || checkoutSession.warehouse_id !== (warehouse_id || null) ||
                    checkoutSession.customer_id !== (customer_id || null) ||
                    checkoutSession.store_credit_barcode !== (store_credit_barcode || null) ||
                    Math.round(Number(checkoutSession.loyalty_discount) * 100) !== Math.round(Number(loyalty_discount || 0) * 100)) {
                    throw new Error("Sale details do not match the reserved checkout session");
                }
            }

            const productIds = Array.from(new Set(items.map((item) => item.product_id))).sort();
            for (const productId of productIds) {
                const lockedProduct = await queryRunner.manager.findOne(Product, {
                    where: { id: productId },
                    lock: { mode: "pessimistic_write" },
                });
                if (!lockedProduct) throw new Error(`Product with id ${productId} not found`);
            }
            const reservedSessions = await queryRunner.manager.find(PaymentCheckoutSession, {
                where: { status: "reserved" },
            });
            const checkoutItems = new Map(checkoutSession?.items.map((item) => [item.product_id, item]) || []);

            let customer = null;
            if (customer_id) {
                customer = await queryRunner.manager.findOne(Customer, {
                    where: { id: customer_id },
                    lock: { mode: "pessimistic_write" },
                });
                if (!customer) throw new Error("Customer not found");
            }

            let warehouse = null;
            if (warehouse_id) {
                warehouse = await queryRunner.manager.findOneBy(Warehouse, { id: warehouse_id });
                if (!warehouse) throw new Error("Warehouse not found");
            }

            let calculatedSubtotal = 0;
            let calculatedTaxAmount = 0;
            let calculatedTotalCogs = 0;
            const saleItems: SaleItem[] = [];
            const batchDeductionLog: { saleItem: SaleItem; batch: ProductBatch; deducted: number }[] = [];
            
            // Queue for socket updates after successful transaction
            const inventoryUpdates: { productId: string; newStockLevel: number; warehouseId: string | null }[] = [];
            const inventoryMovementInputs: Array<{
                productId: string;
                quantityBefore: number;
                quantityChange: number;
                locationId: string | null;
                unitCost: number;
            }> = [];

            for (const item of items) {
                const product = await queryRunner.manager.findOne(Product, { 
                    where: { id: item.product_id },
                    relations: ["tax_class"]
                });
                if (!product) {
                    throw new Error(`Product with id ${item.product_id} not found`);
                }

                // Check and decrement branch-specific stock if warehouse provided
                let movementQuantityBefore = Number(product.stock_on_hand);
                const reservedGlobal = getReservedQuantity(reservedSessions, product.id, checkout_session_id);
                if (Number(product.stock_on_hand) - reservedGlobal < item.quantity) {
                    throw new Error(`Insufficient unreserved global stock for product ${product.name}`);
                }
                if (warehouse_id) {
                    const branchStock = await queryRunner.manager.findOne(WarehouseStock, {
                        where: { warehouse_id, product_id: item.product_id },
                        lock: { mode: "pessimistic_write" },
                    });
                    const reservedBranch = getReservedQuantity(reservedSessions, product.id, checkout_session_id, warehouse_id);
                    if (!branchStock || Number(branchStock.stock_on_hand) - reservedBranch < item.quantity) {
                        throw new Error(`Insufficient unreserved branch stock for product ${product.name}`);
                    }
                    movementQuantityBefore = branchStock.stock_on_hand;
                    branchStock.stock_on_hand -= item.quantity;
                    await queryRunner.manager.save(branchStock);
                } else {
                    if (product.stock_on_hand < item.quantity) {
                        throw new Error(`Insufficient global stock for product ${product.name}`);
                    }
                }

                // Decrement global stock as well
                product.stock_on_hand -= item.quantity;
                await queryRunner.manager.save(product);

                const checkoutItem = checkoutItems.get(product.id);
                const unitPrice = checkoutItem ? Number(checkoutItem.unit_price) : Number(product.retail_price);
                const lineTotal = unitPrice * item.quantity;
                const taxRate = checkoutItem
                    ? Number(checkoutItem.tax_rate)
                    : product.tax_class ? Number(product.tax_class.rate) : Number(product.tax_rate) || 0;
                const itemTax = (lineTotal * taxRate) / 100;

                calculatedSubtotal += lineTotal;
                calculatedTaxAmount += itemTax;

                const saleItem = new SaleItem();
                // sale item will be linked to sale after sale is saved
                saleItem.product = product;
                saleItem.quantity = item.quantity;
                saleItem.unit_price = unitPrice;
                saleItem.tax_rate = taxRate;
                saleItem.line_total = lineTotal;
                saleItems.push(saleItem);

                // Setup FEFO Batch Deduction
                let qtyToDeduct = item.quantity;
                let itemCogs = 0;
                const batches = await queryRunner.manager.find(ProductBatch, {
                    where: { product_id: product.id },
                    order: {
                        expiry_date: "ASC",
                        created_at: "ASC"
                    }
                });
                const saleableBatches = batches.filter((batch) => !isBatchBlockedForSale(batch));
                const blockedBatchQuantity = batches
                    .filter((batch) => isBatchBlockedForSale(batch))
                    .reduce((sum, batch) => sum + Math.max(0, Number(batch.current_quantity) || 0), 0);
                const approvedBatchQuantity = saleableBatches.reduce((sum, batch) => sum + Math.max(0, Number(batch.current_quantity) || 0), 0);

                if (blockedBatchQuantity > 0 && approvedBatchQuantity < item.quantity) {
                    throw new Error(`Product ${product.name} has pending or rejected QC stock and cannot be sold until cleared.`);
                }

                for (const batch of saleableBatches) {
                    if (qtyToDeduct <= 0) break;
                    if (batch.current_quantity > 0) {
                        const deductAmount = Math.min(batch.current_quantity, qtyToDeduct);
                        batch.current_quantity -= deductAmount;
                        qtyToDeduct -= deductAmount;
                        itemCogs += Number(batch.unit_cost) * deductAmount;
                        await queryRunner.manager.save(batch);
                        batchDeductionLog.push({ saleItem, batch, deducted: deductAmount });
                    }
                }
                if (qtyToDeduct > 0) {
                    itemCogs += Number(product.unit_cost || 0) * qtyToDeduct;
                }
                saleItem.unit_cost = Number((itemCogs / item.quantity).toFixed(4));
                saleItem.cogs_total = Number(itemCogs.toFixed(2));
                calculatedTotalCogs += itemCogs;
                inventoryMovementInputs.push({
                    productId: product.id,
                    quantityBefore: movementQuantityBefore,
                    quantityChange: -item.quantity,
                    locationId: warehouse_id ?? null,
                    unitCost: Number(saleItem.unit_cost),
                });

                // Push inventory update event
                inventoryUpdates.push({
                    productId: product.id,
                    newStockLevel: product.stock_on_hand,
                    warehouseId: warehouse_id || null
                });
            }

            const appliedDiscount = loyalty_discount || 0;
            if (!Number.isFinite(Number(appliedDiscount)) || Number(appliedDiscount) < 0 || Number(appliedDiscount) > calculatedSubtotal) {
                throw new Error("Invalid loyalty discount");
            }

            const subtotalWithDiscount = Math.max(0, calculatedSubtotal - appliedDiscount);
            const calculatedTotal = subtotalWithDiscount + calculatedTaxAmount;

            if (offline_created_at) {
                if (
                    payment_method !== PaymentMethod.CASH ||
                    Boolean(customer_id) ||
                    Number(loyalty_discount || 0) !== 0 ||
                    Number(mpesa_amount || 0) !== 0 ||
                    Number(store_credit_amount || 0) !== 0 ||
                    Boolean(store_credit_barcode) ||
                    Boolean(checkout_session_id) ||
                    Boolean(mpesa_transaction_ids?.length)
                ) {
                    throw new Error("Offline captures are restricted to walk-in cash sales without discounts");
                }
                if (
                    expected_total_amount === undefined ||
                    Math.round(expected_total_amount * 100) !== Math.round(calculatedTotal * 100)
                ) {
                    await queryRunner.rollbackTransaction();
                    return res.status(409).json({
                        message: "Current server price or tax differs from the provisional offline sale. Review it before recording a replacement sale.",
                    });
                }
            }

            const paymentAmounts = [cash_amount, mpesa_amount, store_credit_amount]
                .map((value) => Number((value || 0).toFixed(2)));
            if (paymentAmounts.some((value) => !Number.isFinite(value) || value < 0)) {
                throw new Error("Payment amounts must be valid non-negative numbers");
            }
            if (checkoutSession) {
                if (Math.round(Number(checkoutSession.cash_amount) * 100) !== Math.round(paymentAmounts[0] * 100) ||
                    Math.round(Number(checkoutSession.store_credit_amount) * 100) !== Math.round(paymentAmounts[2] * 100)) {
                    throw new Error("Sale payment amounts do not match the reserved checkout");
                }
                const checkoutTransactions = await queryRunner.manager.find(MpesaTransaction, {
                    where: { checkout_session_id: checkoutSession.id, cashier_id: cashier.id },
                    lock: { mode: "pessimistic_write" },
                });
                if (checkoutTransactions.some((transaction) => transaction.status === "pending")) {
                    throw new Error("An M-Pesa payment is still pending for this checkout");
                }
                const confirmedTransactionIds = checkoutTransactions
                    .filter((transaction) => transaction.status === "completed")
                    .map((transaction) => transaction.id)
                    .sort();
                const requestedTransactionIds = [...(mpesa_transaction_ids || [])].sort();
                if (confirmedTransactionIds.length !== requestedTransactionIds.length ||
                    confirmedTransactionIds.some((id, index) => id !== requestedTransactionIds[index])) {
                    throw new Error("Sale must include every confirmed M-Pesa payment for this checkout");
                }
            }
            const totalPaid = paymentAmounts.reduce((sum, value) => sum + value, 0);
            if (Math.round(totalPaid * 100) < Math.round(calculatedTotal * 100)) {
                throw new Error("Payment is less than the sale total");
            }
            if (Math.round((paymentAmounts[1] + paymentAmounts[2]) * 100) > Math.round(calculatedTotal * 100)) {
                throw new Error("M-Pesa and store credit cannot exceed the sale total");
            }
            if (paymentAmounts[1] > 0 && (!checkout_session_id || !mpesa_transaction_ids?.length)) {
                throw new Error("M-Pesa payments require confirmed checkout transactions");
            }
            if (paymentAmounts[1] === 0 && mpesa_transaction_ids?.length) {
                throw new Error("M-Pesa transaction references were provided without an M-Pesa payment");
            }

            if (!payment_method || !Object.values(PaymentMethod).includes(payment_method)) {
                throw new Error("Invalid payment method");
            }

            let confirmedMpesaTransactions: MpesaTransaction[] = [];
            if (paymentAmounts[1] > 0) {
                confirmedMpesaTransactions = await queryRunner.manager.find(MpesaTransaction, {
                    where: {
                        id: In(mpesa_transaction_ids as string[]),
                        checkout_session_id,
                        cashier_id: cashier.id,
                        status: "completed",
                        sale_id: IsNull(),
                    },
                    lock: { mode: "pessimistic_write" },
                });
                const confirmedAmountCents = confirmedMpesaTransactions.reduce(
                    (sum, transaction) => sum + Math.round(Number(transaction.amount) * 100),
                    0,
                );
                if (confirmedMpesaTransactions.length !== mpesa_transaction_ids?.length ||
                    confirmedAmountCents !== Math.round(paymentAmounts[1] * 100)) {
                    throw new Error("Confirmed M-Pesa transactions do not match the sale payment");
                }
            }

            const sale = new Sale();
            sale.cashier = cashier;
            sale.customer = customer;
            sale.warehouse = warehouse;
            sale.payment_method = deriveSalePaymentMethod(
                paymentAmounts[0],
                paymentAmounts[1],
                paymentAmounts[2],
            );
            sale.subtotal = calculatedSubtotal;
            sale.tax_amount = calculatedTaxAmount;
            sale.total_amount = calculatedTotal;
            sale.cash_amount = paymentAmounts[0];
            sale.mpesa_amount = paymentAmounts[1];
            sale.store_credit_amount = paymentAmounts[2];
            sale.store_credit_barcode = null;
            sale.change_amount = calculateCashChange(
                sale.cash_amount,
                sale.mpesa_amount,
                sale.store_credit_amount,
                calculatedTotal,
            );
            sale.payment_status = "paid";
            sale.loyalty_discount = appliedDiscount;
            sale.idempotency_key = normalizedIdempotencyKey || null;
            sale.offline_created_at = offline_created_at || null;
            sale.status = SaleStatus.COMPLETED;

            // Handle Store Credit deductions
            if (sale.store_credit_amount > 0) {
                if (store_credit_barcode) {
                    const sc = await queryRunner.manager.findOne(StoreCredit, {
                        where: { barcode: store_credit_barcode, status: StoreCreditStatus.ACTIVE },
                        lock: { mode: "pessimistic_write" },
                    });
                    if (!sc || (sc.expires_at && sc.expires_at <= new Date()) ||
                        Math.round(Number(sc.current_balance) * 100) <
                            Math.round(Number(sale.store_credit_amount) * 100)) {
                        throw new Error("Invalid or insufficient store credit barcode");
                    }
                    const remainingBalanceCents =
                        Math.round(Number(sc.current_balance) * 100) -
                        Math.round(Number(sale.store_credit_amount) * 100);
                    sc.current_balance = remainingBalanceCents / 100;
                    if (remainingBalanceCents === 0) sc.status = StoreCreditStatus.REDEEMED;
                    await queryRunner.manager.save(sc);
                    sale.store_credit_barcode = sc.barcode;
                } else if (customer) {
                    const account = await queryRunner.manager.findOne(Customer, {
                        where: { id: customer.id },
                        lock: { mode: "pessimistic_write" },
                    });
                    if (!account || Number(account.store_credit_balance) < sale.store_credit_amount) {
                        throw new Error("Insufficient customer store credit balance");
                    }
                    account.store_credit_balance =
                        Number(account.store_credit_balance) - sale.store_credit_amount;
                    await queryRunner.manager.save(account);
                } else {
                    throw new Error("Insufficient store credit balance");
                }
            }

            // Initialize eTIMS fiscal tracking fields
            const etimsMode = EtimsService.resolveEtimsMode();
            sale.etims_status = etimsMode === "off" ? EtimsStatus.NOT_APPLICABLE : EtimsStatus.PENDING;
            sale.etims_attempts = 0;
            sale.etims_last_error = null;
            sale.etims_submitted_at = null;
            sale.etims_receipt_no = null;
            sale.etims_qr_code = null;
            sale.etims_signature = null;

            await queryRunner.manager.save(sale);

            const invoice = queryRunner.manager.create(Invoice, {
                invoice_number: `INV-${sale.id.toUpperCase().replace(/-/g, "")}`,
                sale,
                customer,
                subtotal: calculatedSubtotal,
                tax_amount: calculatedTaxAmount,
                discount_amount: appliedDiscount,
                total_amount: calculatedTotal,
                paid_amount: calculatedTotal,
                balance_due: 0,
                status: InvoiceStatus.PAID,
                issued_at: new Date(),
                paid_at: new Date(),
                created_by: cashier.id,
            });
            await queryRunner.manager.save(invoice);

            for (const transaction of confirmedMpesaTransactions) {
                transaction.sale_id = sale.id;
                transaction.sale = sale;
                await queryRunner.manager.save(transaction);
            }

            if (checkoutSession) {
                checkoutSession.status = "completed";
                await queryRunner.manager.save(checkoutSession);
            }

            for (const movementInput of inventoryMovementInputs) {
                await InventoryService.recordMovement(queryRunner.manager, {
                    ...movementInput,
                    movementType: "sale",
                    referenceType: "sale",
                    referenceId: sale.id,
                    createdBy: cashier.id,
                });
            }

            // Save sale items
            for (const saleItem of saleItems) {
                saleItem.sale = sale;
                await queryRunner.manager.save(saleItem);
            }

            // Save SaleItemBatch FEFO correlation correctly
            for (const log of batchDeductionLog) {
                const sib = new SaleItemBatch();
                sib.sale_item = log.saleItem;
                sib.product_batch = log.batch;
                sib.quantity_deducted = log.deducted;
                await queryRunner.manager.save(sib);
            }

            if (customer) {
                customer.purchase_count += 1;
                customer.total_purchases = Number(customer.total_purchases) + calculatedTotal;
                if (customer.purchase_count > 5) {
                    customer.is_frequent = true;
                }
                await queryRunner.manager.save(customer);
            }

            // Record into Accounting Ledger
            const isCash = payment_method === "cash";
            await AccountingService.recordSale(
                queryRunner.manager,
                sale.id,
                calculatedTotal,
                subtotalWithDiscount,
                calculatedTaxAmount,
                calculatedTotalCogs,
                isCash,
                Math.max(0, Number(sale.cash_amount) - Number(sale.change_amount)),
                sale.mpesa_amount,
                sale.store_credit_amount
            );

            openShift.expected_cash = Number(openShift.expected_cash) +
                Math.max(0, Number(sale.cash_amount) - Number(sale.change_amount));
            openShift.mpesa_total = Number(openShift.mpesa_total) + Number(sale.mpesa_amount);
            await queryRunner.manager.save(openShift);

            await queryRunner.commitTransaction();

            let finalSale = sale;
            if (sale.etims_status === EtimsStatus.PENDING) {
                try {
                    const signed = await EtimsService.processSaleSigning(sale.id);
                    if (signed) {
                        finalSale = signed;
                    }
                } catch (err) {
                    console.error("Asynchronous eTIMS sale signing failed:", err);
                }
            }
            
            // Emit Socket events after success
            try {
                SocketService.emitNewSale(sale.id);
                for (const update of inventoryUpdates) {
                    SocketService.emitInventoryUpdated(update.productId, update.newStockLevel, update.warehouseId || undefined);
                }
            } catch (err) {
                console.error("Socket emit failed", err);
            }

            res.status(201).json(finalSale);

        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error creating sale" });
        } finally {
            await queryRunner.release();
        }
    }

    static async voidSale(req: AuthenticatedRequest, res: Response) {
        const saleId = req.params.id;
        const { reason } = sanitizeVoidSalePayload(req.body ?? {});

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const sale = await queryRunner.manager.findOne(Sale, {
                where: { id: saleId },
                relations: ["items", "items.product", "cashier", "customer", "warehouse"]
            });

            if (!sale) throw new Error("Sale not found");
            if (sale.status === SaleStatus.VOIDED) throw new Error("Sale is already voided");

            const cashier = await queryRunner.manager.findOneBy(User, { id: req.user!.id });
            if (!cashier) throw new Error("Cashier not found");

            let calculatedTotalCogs = 0;
            const inventoryUpdates: { productId: string; newStockLevel: number; warehouseId: string | null }[] = [];

            // Reverse Items
            for (const item of sale.items) {
                const product = item.product;
                
                const itemCogs = Number(
                    item.cogs_total ?? Number(item.unit_cost ?? product.unit_cost ?? 0) * item.quantity,
                );
                calculatedTotalCogs += itemCogs;

                // Revert global stock
                product.stock_on_hand += item.quantity;
                await queryRunner.manager.save(product);

                // Revert branch stock if applicable
                if (sale.warehouse) {
                    const branchStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                        warehouse_id: sale.warehouse.id,
                        product_id: product.id
                    });
                    if (branchStock) {
                        branchStock.stock_on_hand += item.quantity;
                        await queryRunner.manager.save(branchStock);
                    }
                }

                // Revert ProductBatch (just put it back in the newest active batch)
                const batch = await queryRunner.manager.findOne(ProductBatch, {
                    where: { product_id: product.id },
                    order: { created_at: "DESC" }
                });
                if (batch) {
                    batch.current_quantity += item.quantity;
                    await queryRunner.manager.save(batch);
                }

                inventoryUpdates.push({
                    productId: product.id,
                    newStockLevel: product.stock_on_hand,
                    warehouseId: sale.warehouse ? sale.warehouse.id : null
                });
            }

            sale.status = SaleStatus.VOIDED;
            await queryRunner.manager.save(sale);

            // Create Credit Note
            const creditNote = new CreditNote();
            creditNote.sale = sale;
            creditNote.amount = sale.total_amount;
            creditNote.reason = reason || "Customer Return/Void";
            creditNote.cashier = cashier;
            const etimsMode = EtimsService.resolveEtimsMode();
            creditNote.etims_status = etimsMode === "off" ? EtimsStatus.NOT_APPLICABLE : EtimsStatus.PENDING;
            creditNote.etims_attempts = 0;
            creditNote.etims_last_error = null;
            creditNote.etims_submitted_at = null;
            creditNote.etims_note_no = null;
            creditNote.etims_qr_code = null;
            creditNote.etims_signature = null;
            await queryRunner.manager.save(creditNote);

            const settlement = {
                cash: Math.max(0, Number(sale.cash_amount || 0) - Number(sale.change_amount || 0)),
                mpesa: Number(sale.mpesa_amount || 0),
                storeCredit: Number(sale.store_credit_amount || 0),
            };
            if (settlement.storeCredit > 0) {
                if (sale.store_credit_barcode) {
                    const storeCredit = await queryRunner.manager.findOne(StoreCredit, {
                        where: { barcode: sale.store_credit_barcode },
                        lock: { mode: "pessimistic_write" },
                    });
                    if (!storeCredit) throw new Error("Redeemed store credit voucher could not be found for restoration");
                    storeCredit.current_balance = Number(storeCredit.current_balance) + settlement.storeCredit;
                    storeCredit.status = storeCredit.expires_at && storeCredit.expires_at <= new Date()
                        ? StoreCreditStatus.EXPIRED
                        : StoreCreditStatus.ACTIVE;
                    await queryRunner.manager.save(storeCredit);
                } else if (sale.customer) {
                    const customer = await queryRunner.manager.findOne(Customer, {
                        where: { id: sale.customer.id },
                        lock: { mode: "pessimistic_write" },
                    });
                    if (!customer) throw new Error("Customer store credit balance could not be restored");
                    customer.store_credit_balance = Number(customer.store_credit_balance) + settlement.storeCredit;
                    await queryRunner.manager.save(customer);
                } else {
                    throw new Error("Redeemed store credit source is missing and cannot be safely restored");
                }
            }
            await AccountingService.recordSaleReversal(
                queryRunner.manager,
                sale.id,
                sale.total_amount,
                sale.subtotal,
                sale.tax_amount,
                calculatedTotalCogs,
                settlement
            );

            await queryRunner.commitTransaction();

            let finalCreditNote = creditNote;
            if (creditNote.etims_status === EtimsStatus.PENDING) {
                try {
                    const signed = await EtimsService.processCreditNoteSigning(creditNote.id);
                    if (signed) {
                        finalCreditNote = signed;
                    }
                } catch (err) {
                    console.error("Asynchronous eTIMS void credit note signing failed:", err);
                }
            }

            try {
                for (const update of inventoryUpdates) {
                    SocketService.emitInventoryUpdated(update.productId, update.newStockLevel, update.warehouseId || undefined);
                }
            } catch (err) {
                console.error("Socket emit failed", err);
            }

            res.status(200).json({ message: "Sale voided successfully", creditNote: finalCreditNote });

        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error voiding sale" });
        } finally {
            await queryRunner.release();
        }
    }

    static async parkSale(req: AuthenticatedRequest, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        try {
            const { items, customer_id, warehouse_id, loyalty_discount = 0 } =
                sanitizeParkedSalePayload(req.body ?? {});
            await queryRunner.connect();
            await queryRunner.startTransaction();

            const cashier = await queryRunner.manager.findOneBy(User, { id: req.user!.id });
            if (!cashier) throw new Error("Cashier not found");

            const customer = customer_id
                ? await queryRunner.manager.findOneBy(Customer, { id: customer_id })
                : null;
            if (customer_id && !customer) throw new Error("Customer not found");

            const warehouse = warehouse_id
                ? await queryRunner.manager.findOneBy(Warehouse, { id: warehouse_id })
                : null;
            if (warehouse_id && !warehouse) throw new Error("Warehouse not found");

            const products = await queryRunner.manager.find(Product, {
                where: { id: In(items.map((item) => item.product_id)) },
                relations: ["tax_class"],
            });
            const productsById = new Map(products.map((product) => [product.id, product]));
            const missingProduct = items.find((item) => !productsById.has(item.product_id));
            if (missingProduct) throw new Error(`Product ${missingProduct.product_id} not found`);

            const saleItems: SaleItem[] = items.map((item): SaleItem => {
                const product = productsById.get(item.product_id)!;
                const unitPrice = Number(product.retail_price);
                const taxRate = product.tax_class
                    ? Number(product.tax_class.rate)
                    : Number(product.tax_rate) || 0;
                const lineTotal = unitPrice * item.quantity;
                return queryRunner.manager.create(SaleItem, {
                    product,
                    quantity: item.quantity,
                    unit_price: unitPrice,
                    unit_cost: Number(product.unit_cost || 0),
                    tax_rate: taxRate,
                    line_total: lineTotal,
                });
            });
            const subtotal: number = saleItems.reduce<number>(
                (total, item) => total + Number(item.line_total),
                0,
            );
            if (loyalty_discount > subtotal) {
                throw new Error("Loyalty discount cannot exceed the parked sale subtotal");
            }
            const taxAmount: number = saleItems.reduce<number>(
                (total, item) =>
                    total + (Number(item.line_total) * Number(item.tax_rate)) / 100,
                0,
            );
            const sale: Sale = queryRunner.manager.create(Sale, {
                cashier,
                customer,
                warehouse,
                payment_method: PaymentMethod.CASH,
                subtotal,
                tax_amount: taxAmount,
                total_amount: Math.max(0, subtotal - loyalty_discount) + taxAmount,
                loyalty_discount,
                status: SaleStatus.PARKED,
            });
            const savedSale: Sale = await queryRunner.manager.save(sale);
            saleItems.forEach((item) => {
                item.sale = savedSale;
            });
            const savedItems: SaleItem[] = await queryRunner.manager.save(saleItems);
            await queryRunner.commitTransaction();

            res.status(201).json({
                ...savedSale,
                warehouse,
                items: savedItems,
            });
        } catch (error) {
            if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Error parking sale" });
        } finally {
            await queryRunner.release();
        }
    }

    static async getParkedSales(req: AuthenticatedRequest, res: Response) {
        try {
            const sales = await saleRepository.find({
                where: { status: SaleStatus.PARKED, cashier: { id: req.user!.id } },
                relations: ["items", "items.product", "customer", "warehouse"]
            });
            res.json(sales);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching parked sales" });
        }
    }
}
