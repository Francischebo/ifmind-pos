import { EntityManager } from "typeorm";
import { Account, AccountType } from "../entity/Account";
import { JournalEntry } from "../entity/JournalEntry";
import { JournalLine } from "../entity/JournalLine";

export class AccountingService {
    /**
     * Helper to get or create default base accounts.
     */
    static async getOrCreateAccount(manager: EntityManager, code: string, name: string, type: AccountType): Promise<Account> {
        let account = await manager.findOneBy(Account, { code });
        if (!account) {
            account = new Account();
            account.code = code;
            account.name = name;
            account.type = type;
            await manager.save(account);
        }
        return account;
    }

    /**
     * Initialize all base chart of accounts.
     */
    static async initChartOfAccounts(manager: EntityManager) {
        await this.getOrCreateAccount(manager, "1000", "Cash", AccountType.ASSET);
        await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);
        await this.getOrCreateAccount(manager, "1300", "Inventory", AccountType.ASSET);
        await this.getOrCreateAccount(manager, "2000", "Accounts Payable", AccountType.LIABILITY);
        await this.getOrCreateAccount(manager, "2200", "VAT Payable", AccountType.LIABILITY);
        await this.getOrCreateAccount(manager, "4000", "Sales Revenue", AccountType.REVENUE);
        await this.getOrCreateAccount(manager, "5000", "Cost of Goods Sold", AccountType.EXPENSE);
        await this.getOrCreateAccount(manager, "5100", "Inventory Shrinkage", AccountType.EXPENSE);
    }

    /**
     * Record a sale journal entry.
     */
    static async recordSale(
        manager: EntityManager,
        saleId: string,
        totalAmount: number,
        subtotal: number,
        taxAmount: number,
        totalCogs: number,
        isCash: boolean
    ) {
        const cashAcc = await this.getOrCreateAccount(manager, "1000", "Cash", AccountType.ASSET);
        const arAcc = await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);
        const salesRevenueAcc = await this.getOrCreateAccount(manager, "4000", "Sales Revenue", AccountType.REVENUE);
        const vatPayableAcc = await this.getOrCreateAccount(manager, "2200", "VAT Payable", AccountType.LIABILITY);
        const cogsAcc = await this.getOrCreateAccount(manager, "5000", "Cost of Goods Sold", AccountType.EXPENSE);
        const inventoryAcc = await this.getOrCreateAccount(manager, "1300", "Inventory", AccountType.ASSET);

        // Create Journal Entry
        const entry = new JournalEntry();
        entry.reference_id = saleId;
        entry.reference_type = "SALE";
        entry.description = `Sale entry for Sale ID: ${saleId}`;
        await manager.save(entry);

        // Debit Cash or AR for totalAmount
        const debitLine = new JournalLine();
        debitLine.journal_entry = entry;
        debitLine.account = isCash ? cashAcc : arAcc;
        debitLine.debit = totalAmount;
        await manager.save(debitLine);

        // Credit Sales for subtotal
        const creditSales = new JournalLine();
        creditSales.journal_entry = entry;
        creditSales.account = salesRevenueAcc;
        creditSales.credit = subtotal;
        await manager.save(creditSales);

        // Credit VAT Payable for taxAmount
        if (taxAmount > 0) {
            const creditVat = new JournalLine();
            creditVat.journal_entry = entry;
            creditVat.account = vatPayableAcc;
            creditVat.credit = taxAmount;
            await manager.save(creditVat);
        }

        // --- COGS / Inventory Reduction ---
        if (totalCogs > 0) {
            const debitCogs = new JournalLine();
            debitCogs.journal_entry = entry;
            debitCogs.account = cogsAcc;
            debitCogs.debit = totalCogs;
            await manager.save(debitCogs);

            const creditInventory = new JournalLine();
            creditInventory.journal_entry = entry;
            creditInventory.account = inventoryAcc;
            creditInventory.credit = totalCogs;
            await manager.save(creditInventory);
        }
    }

    /**
     * Record inventory receipt from Purchase Order
     */
    static async recordInventoryReceipt(
        manager: EntityManager,
        poId: string,
        totalCost: number
    ) {
        const inventoryAcc = await this.getOrCreateAccount(manager, "1300", "Inventory", AccountType.ASSET);
        const apAcc = await this.getOrCreateAccount(manager, "2000", "Accounts Payable", AccountType.LIABILITY);

        const entry = new JournalEntry();
        entry.reference_id = poId;
        entry.reference_type = "PURCHASE";
        entry.description = `Inventory receipt for PO ID: ${poId}`;
        await manager.save(entry);

        // Debit Inventory
        const debitInv = new JournalLine();
        debitInv.journal_entry = entry;
        debitInv.account = inventoryAcc;
        debitInv.debit = totalCost;
        await manager.save(debitInv);

        // Credit Accounts Payable
        const creditAp = new JournalLine();
        creditAp.journal_entry = entry;
        creditAp.account = apAcc;
        creditAp.credit = totalCost;
        await manager.save(creditAp);
    }

    /**
     * Record a sale reversal journal entry (Void/Credit Note).
     */
    static async recordSaleReversal(
        manager: EntityManager,
        saleId: string,
        totalAmount: number,
        subtotal: number,
        taxAmount: number,
        totalCogs: number,
        isCash: boolean
    ) {
        const cashAcc = await this.getOrCreateAccount(manager, "1000", "Cash", AccountType.ASSET);
        const arAcc = await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);
        const salesRevenueAcc = await this.getOrCreateAccount(manager, "4000", "Sales Revenue", AccountType.REVENUE);
        const vatPayableAcc = await this.getOrCreateAccount(manager, "2200", "VAT Payable", AccountType.LIABILITY);
        const cogsAcc = await this.getOrCreateAccount(manager, "5000", "Cost of Goods Sold", AccountType.EXPENSE);
        const inventoryAcc = await this.getOrCreateAccount(manager, "1300", "Inventory", AccountType.ASSET);

        // Create Journal Entry
        const entry = new JournalEntry();
        entry.reference_id = saleId;
        entry.reference_type = "SALE_VOID";
        entry.description = `Reversal entry for Voided Sale ID: ${saleId}`;
        await manager.save(entry);

        // Credit Cash or AR for totalAmount
        const creditLine = new JournalLine();
        creditLine.journal_entry = entry;
        creditLine.account = isCash ? cashAcc : arAcc;
        creditLine.credit = totalAmount;
        await manager.save(creditLine);

        // Debit Sales for subtotal
        const debitSales = new JournalLine();
        debitSales.journal_entry = entry;
        debitSales.account = salesRevenueAcc;
        debitSales.debit = subtotal;
        await manager.save(debitSales);

        // Debit VAT Payable for taxAmount
        if (taxAmount > 0) {
            const debitVat = new JournalLine();
            debitVat.journal_entry = entry;
            debitVat.account = vatPayableAcc;
            debitVat.debit = taxAmount;
            await manager.save(debitVat);
        }

        // --- Reverse COGS / Inventory Reduction ---
        if (totalCogs > 0) {
            const creditCogs = new JournalLine();
            creditCogs.journal_entry = entry;
            creditCogs.account = cogsAcc;
            creditCogs.credit = totalCogs;
            await manager.save(creditCogs);

            const debitInventory = new JournalLine();
            debitInventory.journal_entry = entry;
            debitInventory.account = inventoryAcc;
            debitInventory.debit = totalCogs;
            await manager.save(debitInventory);
        }
    }

    /**
     * Record an inventory adjustment (Shrinkage, Damage)
     */
    static async recordInventoryAdjustment(manager: EntityManager, adjustmentId: string, totalValue: number, isShrinkage: boolean) {
        if (totalValue <= 0) return;

        const inventoryAcc = await this.getOrCreateAccount(manager, "1300", "Inventory", AccountType.ASSET);
        const shrinkageAcc = await this.getOrCreateAccount(manager, "5100", "Inventory Shrinkage", AccountType.EXPENSE);

        const entry = new JournalEntry();
        entry.reference_id = adjustmentId;
        entry.reference_type = "INVENTORY_ADJUSTMENT";
        entry.description = `Inventory adjustment for ID: ${adjustmentId}`;
        await manager.save(entry);

        if (isShrinkage) {
            // Negative adjustment - Expense goes up (debit), Inventory goes down (credit)
            const debitShrinkage = new JournalLine();
            debitShrinkage.journal_entry = entry;
            debitShrinkage.account = shrinkageAcc;
            debitShrinkage.debit = totalValue;
            await manager.save(debitShrinkage);

            const creditInventory = new JournalLine();
            creditInventory.journal_entry = entry;
            creditInventory.account = inventoryAcc;
            creditInventory.credit = totalValue;
            await manager.save(creditInventory);
        } else {
            // Positive adjustment - Inventory goes up (debit), Expense goes down (credit)
            const debitInventory = new JournalLine();
            debitInventory.journal_entry = entry;
            debitInventory.account = inventoryAcc;
            debitInventory.debit = totalValue;
            await manager.save(debitInventory);

            const creditShrinkage = new JournalLine();
            creditShrinkage.journal_entry = entry;
            creditShrinkage.account = shrinkageAcc;
            creditShrinkage.credit = totalValue;
            await manager.save(creditShrinkage);
        }
    }
}
