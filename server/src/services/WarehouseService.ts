import { EntityManager } from "typeorm";
import { Warehouse } from "../entity/Warehouse";

const MAIN_WAREHOUSE_LOCK_ID = 1082143057;

export class WarehouseService {
    static async lockMainWarehouse(manager: EntityManager): Promise<void> {
        await manager.query("SELECT pg_advisory_xact_lock($1)", [MAIN_WAREHOUSE_LOCK_ID]);
    }

    static async promoteToMain(manager: EntityManager, warehouse: Warehouse): Promise<void> {
        await this.lockMainWarehouse(manager);
        await manager.update(Warehouse, { is_main: true }, { is_main: false });
        warehouse.is_main = true;
    }

    static async initDefaultWarehouse(manager: EntityManager): Promise<Warehouse> {
        return manager.transaction(async (transactionManager) => {
            await this.lockMainWarehouse(transactionManager);
            let defaultWarehouse = await transactionManager.findOneBy(Warehouse, { is_main: true });

            if (!defaultWarehouse) {
                defaultWarehouse = new Warehouse();
                defaultWarehouse.name = "Main Warehouse";
                defaultWarehouse.location_address = "Headquarters";
                defaultWarehouse.is_main = true;
                await transactionManager.save(defaultWarehouse);
                console.log("Default Main Warehouse created.");
            }

            return defaultWarehouse;
        });
    }
}
