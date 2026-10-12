import { EntityManager, IsNull } from "typeorm";
import { TaxClass } from "../entity/TaxClass";
import { Product } from "../entity/Product";

export class TaxService {
    static async initDefaultTaxClass(manager: EntityManager) {
        try {
            const standardTaxDefinitions = [
                { name: "Standard VAT 16%", rate: 16.0, is_default: true },
                { name: "Zero Rated 0%", rate: 0.0, is_default: false },
                { name: "Exempt 0%", rate: 0.0, is_default: false },
                { name: "Special Rate 8%", rate: 8.0, is_default: false },
            ];

            const existingTaxes = await manager.find(TaxClass);
            let defaultTax = existingTaxes.find((t) => t.is_default);

            if (existingTaxes.length === 0) {
                for (const def of standardTaxDefinitions) {
                    const tc = new TaxClass();
                    tc.name = def.name;
                    tc.rate = def.rate;
                    tc.is_default = def.is_default;
                    const saved = await manager.save(tc);
                    if (def.is_default) {
                        defaultTax = saved;
                    }
                }
                console.log("Standard Tax Classes initialized: Standard VAT 16%, Zero Rated 0%, Exempt 0%, Special Rate 8%.");
            } else {
                if (!defaultTax) {
                    const standard = existingTaxes.find((t) => Math.abs(Number(t.rate) - 16) < 0.01) || existingTaxes[0];
                    standard.is_default = true;
                    defaultTax = await manager.save(standard);
                }
            }

            // Migrate products that don't have a tax class yet
            if (defaultTax) {
                const productsWithoutTaxClass = await manager.find(Product, { where: { tax_class_id: IsNull() } });
                if (productsWithoutTaxClass.length > 0) {
                    for (const p of productsWithoutTaxClass) {
                        p.tax_class = defaultTax;
                        if (!p.tax_rate) {
                            p.tax_rate = defaultTax.rate;
                        }
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
