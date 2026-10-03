import { EntityManager } from "typeorm";
import { Account, AccountType } from "../entity/Account";
import { JournalEntry } from "../entity/JournalEntry";
import { JournalLine } from "../entity/JournalLine";

export interface SaleSettlementAmounts {
    cash?: number;
    mpesa?: number;
    storeCredit?: number;
    mpesaRefundPayable?: number;
    receivable?: number;
}

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
        await this.getOrCreateAccount(manager, "1010", "M-Pesa Clearing", AccountType.ASSET);
        await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);
        await this.getOrCreateAccount(manager, "1300", "Inventory", AccountType.ASSET);
        await this.getOrCreateAccount(manager, "2000", "Accounts Payable", AccountType.LIABILITY);
        await this.getOrCreateAccount(manager, "2400", "M-Pesa Refunds Payable", AccountType.LIABILITY);
        await this.getOrCreateAccount(manager, "2200", "VAT Payable", AccountType.LIABILITY);
        await this.getOrCreateAccount(manager, "4000", "Sales Revenue", AccountType.REVENUE);
        await this.getOrCreateAccount(manager, "5000", "Cost of Goods Sold", AccountType.EXPENSE);
        await this.getOrCreateAccount(manager, "5100", "Inventory Shrinkage", AccountType.EXPENSE);
    }

    private static async writeSettlementLines(
        manager: EntityManager,
        entry: JournalEntry,
        totalAmount: number,
        settlement: SaleSettlementAmounts,
        side: "debit" | "credit"
    ) {
        if (!Number.isFinite(totalAmount) || totalAmount < 0) {
            throw new Error("Settlement total must be a valid non-negative amount");
        }

        const settlementAccounts = [
            { amount: settlement.cash, code: "1000", name: "Cash", type: AccountType.ASSET },
            { amount: settlement.mpesa, code: "1010", name: "M-Pesa Clearing", type: AccountType.ASSET },
            { amount: settlement.storeCredit, code: "2300", name: "Store Credit Liability", type: AccountType.LIABILITY },
            { amount: settlement.mpesaRefundPayable, code: "2400", name: "M-Pesa Refunds Payable", type: AccountType.LIABILITY },
            { amount: settlement.receivable, code: "1200", name: "Accounts Receivable", type: AccountType.ASSET },
        ];
        let remaining = totalAmount;

        for (const settlementAccount of settlementAccounts) {
            const requestedAmount = Number(settlementAccount.amount ?? 0);
            if (!Number.isFinite(requestedAmount) || requestedAmount < 0) {
                throw new Error("Settlement amounts must be valid non-negative amounts");
            }

            const amount = Math.min(remaining, requestedAmount);
            if (amount <= 0) continue;

            const account = await this.getOrCreateAccount(
                manager,
                settlementAccount.code,
                settlementAccount.name,
                settlementAccount.type
            );
            const line = new JournalLine();
            line.journal_entry = entry;
            line.account = account;
            line[side] = amount;
            await manager.save(line);
            remaining -= amount;
        }

        if (remaining > 0) {
            const account = await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);
            const line = new JournalLine();
            line.journal_entry = entry;
            line.account = account;
            line[side] = remaining;
            await manager.save(line);
        }
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
        isCash: boolean,
        cashAmount?: number,
        mpesaAmount?: number,
        storeCreditAmount?: number
    ) {
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

        // Debit the actual settlement accounts; legacy callers retain the cash/receivable behavior.
        if (cashAmount !== undefined || mpesaAmount !== undefined || storeCreditAmount !== undefined) {
            await this.writeSettlementLines(manager, entry, totalAmount, {
                cash: cashAmount,
                mpesa: mpesaAmount,
                storeCredit: storeCreditAmount,
            }, "debit");
        } else {
            await this.writeSettlementLines(manager, entry, totalAmount, {
                cash: isCash ? totalAmount : 0,
                receivable: isCash ? 0 : totalAmount,
            }, "debit");
        }

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

    static async recordInvoicePayment(
        manager: EntityManager,
        invoiceId: string,
        amount: number
    ) {
        const cashAcc = await this.getOrCreateAccount(manager, "1000", "Cash", AccountType.ASSET);
        const arAcc = await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);

        const entry = new JournalEntry();
        entry.reference_id = invoiceId;
        entry.reference_type = "INVOICE_PAYMENT";
        entry.description = `Payment received for Invoice ID: ${invoiceId}`;
        await manager.save(entry);

        const debitCash = new JournalLine();
        debitCash.journal_entry = entry;
        debitCash.account = cashAcc;
        debitCash.debit = amount;
        await manager.save(debitCash);

        const creditReceivable = new JournalLine();
        creditReceivable.journal_entry = entry;
        creditReceivable.account = arAcc;
        creditReceivable.credit = amount;
        await manager.save(creditReceivable);
    }

    static async recordSupplierPayment(
        manager: EntityManager,
        paymentId: string,
        invoiceId: string,
        amount: number
    ) {
        const cashAcc = await this.getOrCreateAccount(manager, "1000", "Cash", AccountType.ASSET);
        const apAcc = await this.getOrCreateAccount(manager, "2000", "Accounts Payable", AccountType.LIABILITY);

        const entry = new JournalEntry();
        entry.reference_id = paymentId;
        entry.reference_type = "SUPPLIER_PAYMENT";
        entry.description = `Payment for supplier invoice ID: ${invoiceId}`;
        await manager.save(entry);

        const debitPayable = new JournalLine();
        debitPayable.journal_entry = entry;
        debitPayable.account = apAcc;
        debitPayable.debit = amount;
        await manager.save(debitPayable);

        const creditCash = new JournalLine();
        creditCash.journal_entry = entry;
        creditCash.account = cashAcc;
        creditCash.credit = amount;
        await manager.save(creditCash);
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
        settlement: SaleSettlementAmounts
    ) {
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

        await this.writeSettlementLines(manager, entry, totalAmount, settlement, "credit");

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

    static async recordMpesaRefundPayout(manager: EntityManager, returnRequestId: string, amount: number) {
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("M-Pesa refund payout must be a valid positive amount");
        }

        const refundPayableAcc = await this.getOrCreateAccount(
            manager,
            "2400",
            "M-Pesa Refunds Payable",
            AccountType.LIABILITY
        );
        const mpesaAcc = await this.getOrCreateAccount(manager, "1010", "M-Pesa Clearing", AccountType.ASSET);
        const entry = new JournalEntry();
        entry.reference_id = returnRequestId;
        entry.reference_type = "MPESA_REFUND_PAYOUT";
        entry.description = `Confirmed M-Pesa refund payout for return ${returnRequestId}`;
        await manager.save(entry);

        const debitPayable = new JournalLine();
        debitPayable.journal_entry = entry;
        debitPayable.account = refundPayableAcc;
        debitPayable.debit = amount;
        await manager.save(debitPayable);

        const creditMpesa = new JournalLine();
        creditMpesa.journal_entry = entry;
        creditMpesa.account = mpesaAcc;
        creditMpesa.credit = amount;
        await manager.save(creditMpesa);
    }

    static async recordMpesaReceivablePayment(
        manager: EntityManager,
        saleId: string,
        amount: number,
        referenceType: "MPESA_PAYMENT" | "PESAPAL_PAYMENT" = "MPESA_PAYMENT"
    ) {
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("M-Pesa payment amount must be a valid positive amount");
        }

        const mpesaAcc = await this.getOrCreateAccount(manager, "1010", "M-Pesa Clearing", AccountType.ASSET);
        const receivableAcc = await this.getOrCreateAccount(manager, "1200", "Accounts Receivable", AccountType.ASSET);
        const entry = new JournalEntry();
        entry.reference_id = saleId;
        entry.reference_type = referenceType;
        entry.description = `M-Pesa payment received for Sale ID: ${saleId}`;
        await manager.save(entry);

        const debitMpesa = new JournalLine();
        debitMpesa.journal_entry = entry;
        debitMpesa.account = mpesaAcc;
        debitMpesa.debit = amount;
        await manager.save(debitMpesa);

        const creditReceivable = new JournalLine();
        creditReceivable.journal_entry = entry;
        creditReceivable.account = receivableAcc;
        creditReceivable.credit = amount;
        await manager.save(creditReceivable);
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
