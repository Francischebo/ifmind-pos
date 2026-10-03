import { EntityManager } from "typeorm";
import { Product } from "../entity/Product";
import { StockMovement } from "../entity/StockMovement";
import { WarehouseStock } from "../entity/WarehouseStock";

export interface InventoryMovementInput {
    productId: string;
    movementType: string;
    quantityChange: number;
    quantityBefore: number;
    locationId: string | null;
    unitCost: number | null;
    referenceType: string;
    referenceId: string | null;
    notes?: string | null;
    createdBy: string;
}

export class InventoryService {
    static async getTotalStockByProduct(manager: EntityManager): Promise<Map<string, number>> {
        const rows: { product_id: string; stock_on_hand: string | number }[] = await manager.query(
            `SELECT "product_id", SUM("stock_on_hand")::int AS "stock_on_hand"
             FROM "warehouse_stocks"
             GROUP BY "product_id"`,
        );
        return new Map(rows.map((row) => [row.product_id, Number(row.stock_on_hand)]));
    }

    static getTotalStockOnHand(
        product: Pick<Product, "id" | "stock_on_hand">,
        totalsByProduct: ReadonlyMap<string, number>,
    ): number {
        const warehouseTotal = totalsByProduct.get(product.id);
        return warehouseTotal === undefined ? Number(product.stock_on_hand) || 0 : warehouseTotal;
    }

    static async initializeStock(
        manager: EntityManager,
        productId: string,
        warehouseId: string,
        quantity: number,
        createdBy: string,
    ): Promise<void> {
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new Error("Opening stock must be a positive whole number");
        }

        const product = await manager.findOneByOrFail(Product, { id: productId });
        if (Number(product.stock_on_hand) !== quantity) {
            throw new Error("Opening quantity must match the product aggregate balance");
        }

        const existingStock = await manager.findOneBy(WarehouseStock, {
            warehouse_id: warehouseId,
            product_id: productId,
        });
        if (existingStock) {
            throw new Error("Opening stock has already been initialized for this product and warehouse");
        }

        await manager.save(WarehouseStock, manager.create(WarehouseStock, {
            warehouse_id: warehouseId,
            product_id: productId,
            stock_on_hand: quantity,
        }));
        await this.recordMovement(manager, {
            productId,
            movementType: "initial_stock",
            quantityChange: quantity,
            quantityBefore: 0,
            locationId: warehouseId,
            unitCost: Number(product.unit_cost || 0),
            referenceType: "initial",
            referenceId: productId,
            notes: "Opening stock at product creation",
            createdBy,
        });
    }

    static async recordMovement(manager: EntityManager, input: InventoryMovementInput): Promise<StockMovement> {
        const quantityAfter = input.quantityBefore + input.quantityChange;
        if (!Number.isInteger(input.quantityChange) || input.quantityChange === 0 ||
            !Number.isInteger(input.quantityBefore) || input.quantityBefore < 0 || quantityAfter < 0) {
            throw new Error("Inventory movement must describe a valid non-negative stock change");
        }

        const movement = manager.create(StockMovement, {
            product_id: input.productId,
            movement_type: input.movementType,
            quantity: input.quantityChange,
            quantity_before: input.quantityBefore,
            quantity_after: quantityAfter,
            unit_cost: input.unitCost,
            reference_type: input.referenceType,
            reference_id: input.referenceId,
            location_id: input.locationId,
            notes: input.notes ?? null,
            created_by: input.createdBy,
        });
        return manager.save(movement);
    }

    static async receiveStock(
        manager: EntityManager,
        productId: string,
        warehouseId: string,
        quantity: number,
        referenceId: string,
        createdBy: string,
    ): Promise<number> {
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new Error("Received quantity must be a positive whole number");
        }

        const warehouseResult = await manager.query(
            `INSERT INTO "warehouse_stocks" ("warehouse_id", "product_id", "stock_on_hand")
             VALUES ($1, $2, $3)
             ON CONFLICT ("warehouse_id", "product_id")
             DO UPDATE SET
                "stock_on_hand" = "warehouse_stocks"."stock_on_hand" + EXCLUDED."stock_on_hand",
                "updated_at" = now()
             RETURNING "stock_on_hand"`,
            [warehouseId, productId, quantity],
        );
        await manager.increment(Product, { id: productId }, "stock_on_hand", quantity);

        const product = await manager.findOneByOrFail(Product, { id: productId });
        const warehouseQuantityAfter = Number(warehouseResult[0].stock_on_hand);
        await this.recordMovement(manager, {
            productId,
            movementType: "purchase_receipt",
            quantityChange: quantity,
            quantityBefore: warehouseQuantityAfter - quantity,
            locationId: warehouseId,
            unitCost: Number(product.unit_cost),
            referenceType: "delivery_note",
            referenceId,
            createdBy,
        });
        return Number(product.stock_on_hand);
    }
}