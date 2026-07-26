import { EntityManager } from "typeorm";
import { TaxClass } from "../entity/TaxClass";
import { Product } from "../entity/Product";

export class TaxService {
    static async initDefaultTaxClass(manager: EntityManager) {
        try {
            // Check if any tax classes exist
            let defaultTax = await manager.findOne(TaxClass, { where: { is_default: true } });

            if (!defaultTax) {
                // If no default exists but we have some taxes, just pick the first or create one
                const count = await manager.count(TaxClass);
                if (count === 0) {
                    defaultTax = new TaxClass();
                    defaultTax.name = "Standard VAT 16%";
                    defaultTax.rate = 16.0;
                    defaultTax.is_default = true;
                    await manager.save(defaultTax);
                    console.log("Default Tax Class initialized: Standard VAT 16%");
                } else {
                    // Just make the first one default
                    const first = await manager.findOne(TaxClass, { where: {} });
                    if (first) {
                        first.is_default = true;
                        defaultTax = first;
                        await manager.save(first);
                    }
                }
            }

            // Migrate products that don't have a tax class yet
            if (defaultTax) {
                const productsWithoutTaxClass = await manager.find(Product, { where: { tax_class_id: null } as any }); // typeorm null check
                if (productsWithoutTaxClass.length > 0) {
                    for (const p of productsWithoutTaxClass) {
                        p.tax_class = defaultTax;
                        // migrate their legacy rate if it differs? We could create custom classes if it differs,
                        // but to keep it simple we assign the default class. If legacy was 0, it might be an issue.
                        // For MVP let's just assign default.
                    }
                    await manager.save(productsWithoutTaxClass);
                    console.log(`Migrated ${productsWithoutTaxClass.length} products to default tax class.`);
                }
            }
        } catch (error) {
            console.error("Error initializing default tax class:", error);
        }
    }
}
