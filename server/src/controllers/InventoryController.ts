import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { Product } from "../entity/Product";
import { User } from "../entity/User";
import { Warehouse } from "../entity/Warehouse";
import { WarehouseStock } from "../entity/WarehouseStock";
import { ProductBatch } from "../entity/ProductBatch";
import { InventoryAdjustment, AdjustmentType } from "../entity/InventoryAdjustment";
import { InventoryTransfer, TransferStatus } from "../entity/InventoryTransfer";
import { StockTake, StockTakeStatus } from "../entity/StockTake";
import { StockTakeItem } from "../entity/StockTakeItem";
import { AccountingService } from "../services/AccountingService";
import { SocketService } from "../services/SocketService";

export class InventoryController {
    
    static async createAdjustment(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { product_id, warehouse_id, type, quantity_adjusted, reason } = req.body;
            
            const authorizer = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            const product = await queryRunner.manager.findOneBy(Product, { id: product_id });
            const warehouse = await queryRunner.manager.findOneBy(Warehouse, { id: warehouse_id });

            if (!authorizer || !product || !warehouse) {
                throw new Error("Invalid references for adjustment");
            }

            if (quantity_adjusted === 0) throw new Error("Adjustment quantity cannot be 0");

            const isShrinkage = quantity_adjusted < 0;
            const absoluteQty = Math.abs(quantity_adjusted);

            // Update Global Stock
            product.stock_on_hand += quantity_adjusted;
            await queryRunner.manager.save(product);

            // Update Warehouse Stock
            let branchStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                warehouse_id: warehouse.id,
                product_id: product.id
            });

            if (!branchStock) {
                branchStock = new WarehouseStock();
                branchStock.warehouse_id = warehouse.id;
                branchStock.product_id = product.id;
                branchStock.stock_on_hand = 0;
            }

            if (isShrinkage && branchStock.stock_on_hand < absoluteQty) {
                throw new Error("Branch does not have enough stock to shrink");
            }
            branchStock.stock_on_hand += quantity_adjusted;
            await queryRunner.manager.save(branchStock);

            // Fetch active batches and adjust
            const batches = await queryRunner.manager.find(ProductBatch, {
                where: { product_id: product.id },
                order: { expiry_date: "ASC", created_at: "ASC" }
            });

            let qtyToAdjust = absoluteQty;
            if (isShrinkage) {
                // FEFO deduction
                for (const batch of batches) {
                    if (qtyToAdjust <= 0) break;
                    if (batch.current_quantity > 0) {
                        const deductAmount = Math.min(batch.current_quantity, qtyToAdjust);
                        batch.current_quantity -= deductAmount;
                        qtyToAdjust -= deductAmount;
                        await queryRunner.manager.save(batch);
                    }
                }
            } else {
                // Positive adjustment, add to the latest batch or create one?
                // For simplicity, add to the most recent batch or first batch
                if (batches.length > 0) {
                    const latestBatch = batches[batches.length - 1];
                    latestBatch.current_quantity += qtyToAdjust;
                    await queryRunner.manager.save(latestBatch);
                }
            }

            // Accounting
            const unitCost = product.unit_cost || 0;
            const totalValue = Number(unitCost) * absoluteQty;

            const adjustment = new InventoryAdjustment();
            adjustment.product = product;
            adjustment.warehouse = warehouse;
            adjustment.authorizer = authorizer;
            adjustment.type = type;
            adjustment.quantity_adjusted = quantity_adjusted;
            adjustment.unit_cost = unitCost;
            adjustment.total_value_adjusted = totalValue;
            adjustment.reason = reason;
            await queryRunner.manager.save(adjustment);

            await AccountingService.recordInventoryAdjustment(
                queryRunner.manager,
                adjustment.id,
                totalValue,
                isShrinkage
            );

            await queryRunner.commitTransaction();

            SocketService.emitInventoryUpdated(product.id, product.stock_on_hand, warehouse.id);

            res.status(201).json(adjustment);

        } catch(err: any) {
            await queryRunner.rollbackTransaction();
            console.error(err);
            res.status(400).json({ message: err.message || "Error creating adjustment" });
        } finally {
            await queryRunner.release();
        }
    }

    static async createTransfer(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const { product_id, from_warehouse_id, to_warehouse_id, quantity } = req.body;
            
            const requester = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            const product = await queryRunner.manager.findOneBy(Product, { id: product_id });
            const from_warehouse = await queryRunner.manager.findOneBy(Warehouse, { id: from_warehouse_id });
            const to_warehouse = await queryRunner.manager.findOneBy(Warehouse, { id: to_warehouse_id });

            if (!requester || !product || !from_warehouse || !to_warehouse) {
                throw new Error("Invalid references for transfer");
            }

            if (quantity <= 0) throw new Error("Quantity must be greater than 0");

            // Check From Warehouse Stock
            const fromStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                warehouse_id: from_warehouse.id,
                product_id: product.id
            });

            if (!fromStock || fromStock.stock_on_hand < quantity) {
                throw new Error("Source warehouse does not have enough stock");
            }

            const transfer = new InventoryTransfer();
            transfer.product = product;
            transfer.from_warehouse = from_warehouse;
            transfer.to_warehouse = to_warehouse;
            transfer.quantity = quantity;
            transfer.requester = requester;
            transfer.status = TransferStatus.PENDING;
            
            await queryRunner.manager.save(transfer);
            await queryRunner.commitTransaction();

            res.status(201).json(transfer);
        } catch(err: any) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: err.message || "Error creating transfer" });
        } finally {
            await queryRunner.release();
        }
    }

    static async updateTransferStatus(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            const fulfiller = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            const transfer = await queryRunner.manager.findOne(InventoryTransfer, { 
                where: { id },
                relations: ["product", "from_warehouse", "to_warehouse"]
            });

            if (!fulfiller || !transfer) throw new Error("Invalid transfer reference");
            if (transfer.status !== TransferStatus.PENDING && transfer.status !== TransferStatus.IN_TRANSIT) {
                throw new Error(`Cannot update transfer in ${transfer.status} status`);
            }

            transfer.status = status;
            transfer.fulfiller = fulfiller;

            if (status === TransferStatus.COMPLETED) {
                // Deduct from Source Warehouse Stock
                const fromStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                    warehouse_id: transfer.from_warehouse.id,
                    product_id: transfer.product.id
                });
                
                if (!fromStock || fromStock.stock_on_hand < transfer.quantity) {
                    throw new Error("Source warehouse no longer has enough stock to complete transfer");
                }
                fromStock.stock_on_hand -= transfer.quantity;
                await queryRunner.manager.save(fromStock);

                // Add to Destination Warehouse Stock
                let toStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                    warehouse_id: transfer.to_warehouse.id,
                    product_id: transfer.product.id
                });
                if (!toStock) {
                    toStock = new WarehouseStock();
                    toStock.warehouse_id = transfer.to_warehouse.id;
                    toStock.product_id = transfer.product.id;
                    toStock.stock_on_hand = 0;
                }
                toStock.stock_on_hand += transfer.quantity;
                await queryRunner.manager.save(toStock);

                // Emit sockets
                SocketService.emitInventoryUpdated(transfer.product.id, transfer.product.stock_on_hand, transfer.from_warehouse.id);
                SocketService.emitInventoryUpdated(transfer.product.id, transfer.product.stock_on_hand, transfer.to_warehouse.id);
            }

            await queryRunner.manager.save(transfer);
            await queryRunner.commitTransaction();

            res.status(200).json(transfer);
        } catch(err: any) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: err.message || "Error updating transfer" });
        } finally {
            await queryRunner.release();
        }
    }

    static async getAdjustments(req: Request, res: Response) {
        try {
            const adjustments = await AppDataSource.manager.find(InventoryAdjustment, {
                relations: ["product", "warehouse", "authorizer"],
                order: { created_at: "DESC" }
            });
            res.status(200).json(adjustments);
        } catch (err: any) {
            res.status(500).json({ message: err.message || "Error fetching adjustments" });
        }
    }

    static async getTransfers(req: Request, res: Response) {
        try {
            const transfers = await AppDataSource.manager.find(InventoryTransfer, {
                relations: ["product", "from_warehouse", "to_warehouse", "requester", "fulfiller"],
                order: { created_at: "DESC" }
            });
            res.status(200).json(transfers);
        } catch (err: any) {
            res.status(500).json({ message: err.message || "Error fetching transfers" });
        }
    }

    static async getAllStockTakes(req: Request, res: Response) {
        try {
            const stockTakes = await AppDataSource.manager.find(StockTake, {
                relations: ["warehouse", "creator", "completer", "items", "items.product"],
                order: { created_at: "DESC" }
            });
            res.status(200).json(stockTakes);
        } catch (err: any) {
            res.status(500).json({ message: err.message || "Error fetching stock takes" });
        }
    }

    static async initiateStockTake(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { warehouse_id, notes } = req.body;
            const creator = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            const warehouse = await queryRunner.manager.findOneBy(Warehouse, { id: warehouse_id });

            if (!creator || !warehouse) {
                throw new Error("Invalid references");
            }

            // Check if there's already an active stock take for this warehouse
            const existing = await queryRunner.manager.findOne(StockTake, {
                where: [
                    { warehouse_id, status: StockTakeStatus.PENDING },
                    { warehouse_id, status: StockTakeStatus.IN_PROGRESS }
                ]
            });
            if (existing) {
                throw new Error("An active stock take already exists for this warehouse");
            }

            const stockTake = new StockTake();
            stockTake.warehouse = warehouse;
            stockTake.creator = creator;
            stockTake.notes = notes;
            stockTake.status = StockTakeStatus.PENDING;
            await queryRunner.manager.save(stockTake);

            // Populate items based on current warehouse stock
            const stocks = await queryRunner.manager.find(WarehouseStock, {
                where: { warehouse_id },
                relations: ["product"]
            });

            const items: StockTakeItem[] = [];
            for (const stock of stocks) {
                const item = new StockTakeItem();
                item.stock_take = stockTake;
                item.product = stock.product;
                item.expected_quantity = stock.stock_on_hand;
                items.push(item);
            }

            // Save items
            if (items.length > 0) {
                await queryRunner.manager.save(items);
            }

            await queryRunner.commitTransaction();

            // Fetch fully populated
            const created = await queryRunner.manager.findOne(StockTake, {
                where: { id: stockTake.id },
                relations: ["warehouse", "creator", "items", "items.product"]
            });
            res.status(201).json(created);
        } catch (err: any) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: err.message || "Error initiating stock take" });
        } finally {
            await queryRunner.release();
        }
    }

    static async updateStockTakeCounts(req: Request, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { id } = req.params;
            const { items, status } = req.body; // items is array of { id, counted_quantity }

            const stockTake = await queryRunner.manager.findOne(StockTake, {
                where: { id: id as string },
                relations: ["items"]
            });

            if (!stockTake) throw new Error("Stock Take not found");
            if (stockTake.status === StockTakeStatus.COMPLETED || stockTake.status === StockTakeStatus.CANCELLED) {
                throw new Error("Cannot update a closed stock take");
            }

            for (const updateItem of items) {
                const stItem = stockTake.items.find(i => i.id === updateItem.id);
                if (stItem) {
                    stItem.counted_quantity = updateItem.counted_quantity;
                    stItem.discrepancy = updateItem.counted_quantity !== null 
                        ? updateItem.counted_quantity - stItem.expected_quantity 
                        : null;
                    await queryRunner.manager.save(stItem);
                }
            }

            if (status) {
                stockTake.status = status;
                await queryRunner.manager.save(stockTake);
            }

            await queryRunner.commitTransaction();
            res.status(200).json({ message: "Counts updated successfully" });
        } catch (err: any) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: err.message || "Error updating counts" });
        } finally {
            await queryRunner.release();
        }
    }

    static async completeStockTake(req: any, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const { id } = req.params;
            const completer = await queryRunner.manager.findOneBy(User, { id: req.user.id });
            const stockTake = await queryRunner.manager.findOne(StockTake, {
                where: { id: id as string },
                relations: ["warehouse", "items", "items.product"]
            });

            if (!completer || !stockTake) throw new Error("Stock Take not found");
            if (stockTake.status === StockTakeStatus.COMPLETED || stockTake.status === StockTakeStatus.CANCELLED) {
                throw new Error("Stock take is already closed");
            }

            // Apply discrepancies
            for (const item of stockTake.items) {
                if (item.counted_quantity !== null && item.discrepancy != null && item.discrepancy !== 0) {
                    const quantity_adjusted = item.discrepancy as number;
                    const isShrinkage = quantity_adjusted < 0;
                    const absoluteQty = Math.abs(quantity_adjusted);

                    // Update Global Stock
                    item.product.stock_on_hand += quantity_adjusted;
                    await queryRunner.manager.save(item.product);

                    // Update Warehouse Stock
                    let branchStock = await queryRunner.manager.findOneBy(WarehouseStock, {
                        warehouse_id: stockTake.warehouse.id,
                        product_id: item.product.id
                    });
                    if (branchStock) {
                        branchStock.stock_on_hand += quantity_adjusted;
                        await queryRunner.manager.save(branchStock);
                    }

                    // Create Inventory Adjustment record
                    const unitCost = item.product.unit_cost || 0;
                    const totalValue = Number(unitCost) * absoluteQty;

                    const adjustment = new InventoryAdjustment();
                    adjustment.product = item.product;
                    adjustment.warehouse = stockTake.warehouse;
                    adjustment.authorizer = completer;
                    adjustment.type = isShrinkage ? AdjustmentType.MISCOUNT : AdjustmentType.MISCOUNT; 
                    adjustment.quantity_adjusted = quantity_adjusted;
                    adjustment.unit_cost = unitCost;
                    adjustment.total_value_adjusted = totalValue;
                    adjustment.reason = `Stock Take ${stockTake.id} Discrepancy`;
                    await queryRunner.manager.save(adjustment);

                    // Accounting
                    await AccountingService.recordInventoryAdjustment(
                        queryRunner.manager,
                        adjustment.id,
                        totalValue,
                        isShrinkage
                    );

                    SocketService.emitInventoryUpdated(item.product.id, item.product.stock_on_hand, stockTake.warehouse.id);
                }
            }

            stockTake.status = StockTakeStatus.COMPLETED;
            stockTake.completer = completer;
            stockTake.completed_at = new Date();
            await queryRunner.manager.save(stockTake);

            await queryRunner.commitTransaction();
            res.status(200).json(stockTake);
        } catch (err: any) {
            await queryRunner.rollbackTransaction();
            res.status(400).json({ message: err.message || "Error completing stock take" });
        } finally {
            await queryRunner.release();
        }
    }
}
