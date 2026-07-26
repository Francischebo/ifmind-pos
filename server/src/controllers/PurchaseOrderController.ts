import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { PurchaseOrder } from "../entity/PurchaseOrder";
import { PoItem } from "../entity/PoItem";
import { DeliveryNote } from "../entity/DeliveryNote";
import { DeliveryNoteItem } from "../entity/DeliveryNoteItem";
import { ProductBatch } from "../entity/ProductBatch";
import { Product } from "../entity/Product";
import { AccountingService } from "../services/AccountingService";

export class PurchaseOrderController {
    static async getAll(req: Request, res: Response) {
        try {
            const poRepo = AppDataSource.getRepository(PurchaseOrder);
            const pos = await poRepo.find({
                relations: ["vendor", "items", "items.product"],
                order: { created_at: "DESC" }
            });
            res.json(pos);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching purchase orders" });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const poRepo = AppDataSource.getRepository(PurchaseOrder);
            const po = await poRepo.findOne({
                where: { id },
                relations: ["vendor", "items", "items.product"]
            });
            if (!po) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            res.json(po);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error fetching purchase order" });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const { vendor_id, total_amount, items, created_by } = req.body;
            const poRepo = AppDataSource.getRepository(PurchaseOrder);
            const poItemRepo = AppDataSource.getRepository(PoItem);

            const poNumber = `PO-${Date.now()}`;
            
            const newPo = poRepo.create({
                po_number: poNumber,
                vendor_id,
                total_amount,
                created_by,
                status: 'draft'
            });

            const savedPo = await poRepo.save(newPo);

            const poItems = items.map((item: any) => poItemRepo.create({
                po_id: savedPo.id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_cost: item.unit_cost
            }));

            await poItemRepo.save(poItems);
            
            res.status(201).json(await poRepo.findOne({ where: { id: savedPo.id }, relations: ["vendor", "items"] }));
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error creating purchase order" });
        }
    }

    static async updateStatus(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const { status } = req.body;
            const poRepo = AppDataSource.getRepository(PurchaseOrder);
            const po = await poRepo.findOne({ where: { id } });
            if (!po) {
                return res.status(404).json({ message: "Purchase order not found" });
            }
            po.status = status;
            await poRepo.save(po);
            res.json(po);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Error updating purchase order status" });
        }
    }

    static async receive(req: Request, res: Response) {
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const id = req.params.id as string;
            const { user_id, items, notes } = req.body; // items is array of { po_item_id, product_id, receiving_quantity, rejected_quantity, rejection_reason, unit_cost, batch_number, expiry_date, manufacturing_date, supplier_batch_reference, environmental_conditions }

            const poRepo = queryRunner.manager.getRepository(PurchaseOrder);
            const poItemRepo = queryRunner.manager.getRepository(PoItem);
            const dnRepo = queryRunner.manager.getRepository(DeliveryNote);
            const dnItemRepo = queryRunner.manager.getRepository(DeliveryNoteItem);
            const batchRepo = queryRunner.manager.getRepository(ProductBatch);
            const productRepo = queryRunner.manager.getRepository(Product);

            const po = await poRepo.findOne({ where: { id }, relations: ["items"] });
            if (!po) {
                return res.status(404).json({ message: "Purchase order not found" });
            }

            const totalItems = items.reduce((sum: number, i: any) => sum + i.receiving_quantity, 0);
            const totalValue = items.reduce((sum: number, i: any) => sum + (i.receiving_quantity * i.unit_cost), 0);
            
            if (totalItems === 0) {
                return res.status(400).json({ message: "No items to receive" });
            }

            const grnNumber = `GRN-${Date.now()}`;

            const newDn = dnRepo.create({
                po_id: po.id,
                vendor_id: po.vendor_id,
                grn_number: grnNumber,
                received_by: user_id,
                total_items: totalItems,
                total_value: totalValue,
                notes,
                status: 'completed'
            });
            const savedDn = await dnRepo.save(newDn);

            let fullyReceived = true;
            let atLeastOneReceived = false;

            for (const requestItem of items) {
                if (requestItem.receiving_quantity > 0 || requestItem.rejected_quantity > 0) {
                    const dnItem = dnItemRepo.create({
                        delivery_note_id: savedDn.id,
                        po_item_id: requestItem.po_item_id,
                        product_id: requestItem.product_id,
                        ordered_quantity: requestItem.ordered_quantity,
                        received_quantity: requestItem.receiving_quantity,
                        rejected_quantity: requestItem.rejected_quantity,
                        rejection_reason: requestItem.rejection_reason,
                        unit_cost: requestItem.unit_cost,
                        line_total: requestItem.receiving_quantity * requestItem.unit_cost,
                        batch_number: requestItem.batch_number,
                        expiry_date: requestItem.expiry_date
                    });
                    await dnItemRepo.save(dnItem);
                }

                if (requestItem.receiving_quantity > 0) {
                    atLeastOneReceived = true;

                    // Update PO Item received quantity
                    const poItem = await poItemRepo.findOne({ where: { id: requestItem.po_item_id } });
                    if (poItem) {
                        poItem.received_quantity += requestItem.receiving_quantity;
                        await poItemRepo.save(poItem);
                    }

                    // Update Product global stock
                    const product = await productRepo.findOne({ where: { id: requestItem.product_id } });
                    if (product) {
                        product.stock_on_hand += requestItem.receiving_quantity;
                        await productRepo.save(product);
                    }

                    // Create ProductBatch for advanced tracking (FIFO)
                    const batch = batchRepo.create({
                        product_id: requestItem.product_id,
                        po_id: po.id,
                        batch_number: requestItem.batch_number || `BATCH-${Date.now()}`,
                        manufacturing_date: requestItem.manufacturing_date || null,
                        expiry_date: requestItem.expiry_date || null,
                        supplier_batch_reference: requestItem.supplier_batch_reference || null,
                        quality_check_status: 'pending',
                        environmental_conditions: requestItem.environmental_conditions || null,
                        initial_quantity: requestItem.receiving_quantity,
                        current_quantity: requestItem.receiving_quantity,
                        unit_cost: requestItem.unit_cost
                    });
                    await batchRepo.save(batch);
                }
            }

            // Calculate overall PO status based on exact PO items vs updated ones
            const currentPoItems = await poItemRepo.find({ where: { po_id: po.id } });
            
            for (const item of currentPoItems) {
                if (item.received_quantity < item.quantity) {
                    fullyReceived = false;
                }
                if (item.received_quantity > 0) {
                    atLeastOneReceived = true;
                }
            }

            if (totalValue > 0) {
                await AccountingService.recordInventoryReceipt(queryRunner.manager, po.id, totalValue);
            }

            if (fullyReceived) {
                po.status = 'received';
            } else if (atLeastOneReceived) {
                po.status = 'partially_received';
            }
            await poRepo.save(po);

            await queryRunner.commitTransaction();
            
            res.json({ message: "Goods received successfully", grn: grnNumber, po });
        } catch (error) {
            await queryRunner.rollbackTransaction();
            console.error(error);
            res.status(500).json({ message: "Error receiving goods" });
        } finally {
            await queryRunner.release();
        }
    }
}
