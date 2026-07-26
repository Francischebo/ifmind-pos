import { EntityManager } from "typeorm";
import { Warehouse } from "../entity/Warehouse";

export class WarehouseService {
    static async initDefaultWarehouse(manager: EntityManager): Promise<Warehouse> {
        let defaultWarehouse = await manager.findOneBy(Warehouse, { is_main: true });
        
        if (!defaultWarehouse) {
            defaultWarehouse = new Warehouse();
            defaultWarehouse.name = "Main Warehouse";
            defaultWarehouse.location_address = "Headquarters";
            defaultWarehouse.is_main = true;
            await manager.save(defaultWarehouse);
            console.log("Default Main Warehouse created.");
        }
        
        return defaultWarehouse;
    }
}
