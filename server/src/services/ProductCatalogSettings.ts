export const DEFAULT_PRODUCT_UNIT_OF_MEASURES = [
    "piece",
    "each",
    "kg",
    "g",
    "grams",
    "litre",
    "ml",
    "pack",
    "box",
    "dozen",
];

export const normalizeProductUnitOfMeasures = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
        throw new Error("Product units must be provided as a list.");
    }
    if (input.length === 0) {
        throw new Error("Configure at least one product unit of measure.");
    }
    if (input.length > 100) {
        throw new Error("Configure no more than 100 product units of measure.");
    }

    const units: string[] = [];
    const seen = new Set<string>();
    for (const value of input) {
        if (typeof value !== "string" || !value.trim()) {
            throw new Error("Product unit names must be non-empty text.");
        }
        const unit = value.trim();
        if (unit.length > 50) {
            throw new Error("Product unit names must be 50 characters or fewer.");
        }
        const key = unit.toLocaleLowerCase();
        if (seen.has(key)) {
            throw new Error(`Product unit "${unit}" is listed more than once.`);
        }
        seen.add(key);
        units.push(unit);
    }

    return units;
};

export const parseProductUnitOfMeasures = (value: string | null | undefined): string[] => {
    if (value === null || value === undefined || value.trim() === "") {
        return DEFAULT_PRODUCT_UNIT_OF_MEASURES;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error("Product unit settings are invalid JSON. Re-save the product units in Settings.");
    }
    return normalizeProductUnitOfMeasures(parsed);
};

export const isConfiguredProductUnit = (unit: string, configuredUnits: string[]) =>
    configuredUnits.some((configuredUnit) => configuredUnit.toLocaleLowerCase() === unit.trim().toLocaleLowerCase());
