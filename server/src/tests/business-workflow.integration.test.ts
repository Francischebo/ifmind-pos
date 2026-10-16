import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import jwt from "jsonwebtoken";
import { createHmac, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";

interface IntegrationApiObject {
    id: string;
    status: string;
    message: string;
    error: string;
    sku: string;
    sale: IntegrationApiObject;
    request: IntegrationApiObject;
    invoice: IntegrationApiObject;
    shift: IntegrationApiObject;
    items: IntegrationApiObject[];
    results: IntegrationApiObject[];
    movements: IntegrationApiObject[];
    purchaseOrders: IntegrationApiObject[];
    invoices: IntegrationApiObject[];
    storeCreditBarcode: string;
    mpesaRefundPending: boolean;
    quantity: number;
    quantity_before: number;
    quantity_after: number;
    total_amount: number;
    balance_due: number;
    amount: number;
    ResultCode: number;
    predictions: {
        salesForecast: { historyDays: number; next7Days: number };
        inventoryAlerts: unknown[];
        recommendations: unknown[];
    };
    creditNote: {
        id: string;
        amount: number;
        etims_note_no: string;
        etims_qr_code: string;
        etims_signature: string;
        etims_status?: string;
    };
    requested_by: { id: string };
    name: string;
    product: { name: string };
    store_credit_voucher: { barcode: string; current_balance: number };
    po: { status: string };
    invoice_number: string;
    payment: { id: string };
    errors: string[];
    user: { email: string; role: string };
    profile: { full_name: string };
    stock_on_hand: number;
    success: boolean;
    source: string;
    subtotal: number;
    unit_cost: number;
    tax_amount: number;
    cash_amount: number;
    change_amount: number;
    payment_method: string;
    payment_status: string;
    sale_id: string;
    customer: { name: string };
    cogs_total: number;
    sale_item: { product: { name: string } };
    checkout_request_id: string;
    mpesa_amount: number;
    paybill_c2b_enabled: boolean;
    transaction_id: string;
    account_reference: string;
    expected_cash: number;
    mpesa_total: number;
    received_quantity: number;
    created: number;
    skipped: number;
    phone: string;
    otp_token: string;
    requires_otp: boolean;
    token: string;
}

const loadModule = createRequire(__filename);
const dotenv = loadModule("dotenv");
dotenv.config();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
    throw new Error("Integration tests require TEST_DATABASE_URL pointing to a dedicated test database.");
}

const testDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\/+/, ""));
if (!/test|testing|integration/i.test(testDatabaseName)) {
    throw new Error("TEST_DATABASE_URL must use a database name containing 'test' or 'integration'.");
}
if (!process.env.JWT_SECRET) {
    throw new Error("Integration tests require JWT_SECRET.");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.TYPEORM_SYNCHRONIZE = "true";

const { app } = loadModule("../index") as typeof import("../index");
const { AppDataSource } = loadModule("../data-source") as typeof import("../data-source");
const { User, AppRole } = loadModule("../entity/User") as typeof import("../entity/User");
const { OtpCode } = loadModule("../entity/OtpCode") as typeof import("../entity/OtpCode");
const { MpesaTransaction } = loadModule("../entity/MpesaTransaction") as typeof import("../entity/MpesaTransaction");
const { Setting } = loadModule("../entity/Setting") as typeof import("../entity/Setting");
const { hashMpesaCallbackToken } = loadModule("../controllers/PaymentController") as typeof import("../controllers/PaymentController");
const { Product } = loadModule("../entity/Product") as typeof import("../entity/Product");
const { Category } = loadModule("../entity/Category") as typeof import("../entity/Category");
const { TaxClass } = loadModule("../entity/TaxClass") as typeof import("../entity/TaxClass");
const { Customer } = loadModule("../entity/Customer") as typeof import("../entity/Customer");
const { StoreCredit, StoreCreditStatus } = loadModule("../entity/StoreCredit") as typeof import("../entity/StoreCredit");
const { Vendor } = loadModule("../entity/Vendor") as typeof import("../entity/Vendor");
const { Warehouse } = loadModule("../entity/Warehouse") as typeof import("../entity/Warehouse");
const { WarehouseStock } = loadModule("../entity/WarehouseStock") as typeof import("../entity/WarehouseStock");
const { StockMovement } = loadModule("../entity/StockMovement") as typeof import("../entity/StockMovement");
const { StockTake } = loadModule("../entity/StockTake") as typeof import("../entity/StockTake");
const { InventoryAdjustment } = loadModule("../entity/InventoryAdjustment") as typeof import("../entity/InventoryAdjustment");
const { Sale, PaymentMethod, SaleStatus } = loadModule("../entity/Sale") as typeof import("../entity/Sale");
const { SaleItem } = loadModule("../entity/SaleItem") as typeof import("../entity/SaleItem");
const { Invoice } = loadModule("../entity/Invoice") as typeof import("../entity/Invoice");
const { Shift, ShiftStatus } = loadModule("../entity/Shift") as typeof import("../entity/Shift");
const { PurchaseOrder } = loadModule("../entity/PurchaseOrder") as typeof import("../entity/PurchaseOrder");
const { DeliveryNote } = loadModule("../entity/DeliveryNote") as typeof import("../entity/DeliveryNote");
const { SupplierInvoice, InvoiceStatus } = loadModule("../entity/SupplierInvoice") as typeof import("../entity/SupplierInvoice");
const { SupplierPayment } = loadModule("../entity/SupplierPayment") as typeof import("../entity/SupplierPayment");
const { ProductBatch } = loadModule("../entity/ProductBatch") as typeof import("../entity/ProductBatch");
const { ReturnRequest, MpesaRefundStatus } = loadModule("../entity/ReturnRequest") as typeof import("../entity/ReturnRequest");
const { CreditNote } = loadModule("../entity/CreditNote") as typeof import("../entity/CreditNote");
const { JournalEntry } = loadModule("../entity/JournalEntry") as typeof import("../entity/JournalEntry");
const { JournalLine } = loadModule("../entity/JournalLine") as typeof import("../entity/JournalLine");
const { AccountingService } = loadModule("../services/AccountingService") as typeof import("../services/AccountingService");
const { SocketService } = loadModule("../services/SocketService") as typeof import("../services/SocketService");
const { io: createSocketClient } = loadModule("socket.io-client") as typeof import("socket.io-client");
const { Client: PgClient } = loadModule("pg") as typeof import("pg");
const { EtimsMockService } = loadModule("../services/EtimsMockService") as typeof import("../services/EtimsMockService");
const { EnforceSingleMainWarehouse1790920000000 } = loadModule("../migration/1790920000000-EnforceSingleMainWarehouse") as typeof import("../migration/1790920000000-EnforceSingleMainWarehouse");
const { AddPurchaseOrderReceivingWarehouse1790928000000 } = loadModule("../migration/1790928000000-AddPurchaseOrderReceivingWarehouse") as typeof import("../migration/1790928000000-AddPurchaseOrderReceivingWarehouse");
const { EnforceUniqueSupplierInvoiceNumber1790930000000 } = loadModule("../migration/1790930000000-EnforceUniqueSupplierInvoiceNumber") as typeof import("../migration/1790930000000-EnforceUniqueSupplierInvoiceNumber");
const { CreateStockMovementLedger1790936000000 } = loadModule("../migration/1790936000000-CreateStockMovementLedger") as typeof import("../migration/1790936000000-CreateStockMovementLedger");
const { AddMpesaCheckoutSessions1791000000000 } = loadModule("../migration/1791000000000-AddMpesaCheckoutSessions") as typeof import("../migration/1791000000000-AddMpesaCheckoutSessions");
const { CreatePaymentCheckoutSessions1791010000000 } = loadModule("../migration/1791010000000-CreatePaymentCheckoutSessions") as typeof import("../migration/1791010000000-CreatePaymentCheckoutSessions");
const { AddMpesaPaybillReferences1791020000000 } = loadModule("../migration/1791020000000-AddMpesaPaybillReferences") as typeof import("../migration/1791020000000-AddMpesaPaybillReferences");
const { AddSaleStoreCreditBarcode1791030000000 } = loadModule("../migration/1791030000000-AddSaleStoreCreditBarcode") as typeof import("../migration/1791030000000-AddSaleStoreCreditBarcode");
const { AddMpesaRefundSettlement1791030000001 } = loadModule("../migration/1791030000001-AddMpesaRefundSettlement") as typeof import("../migration/1791030000001-AddMpesaRefundSettlement");
const { AddCreditNoteEtimsFields1791040000000 } = loadModule("../migration/1791040000000-AddCreditNoteEtimsFields") as typeof import("../migration/1791040000000-AddCreditNoteEtimsFields");
const { LinkCreditNotesToReturns1791040000001 } = loadModule("../migration/1791040000001-LinkCreditNotesToReturns") as typeof import("../migration/1791040000001-LinkCreditNotesToReturns");
const { EnforceOneOpenShiftPerCashier1791050000000 } = loadModule("../migration/1791050000000-EnforceOneOpenShiftPerCashier") as typeof import("../migration/1791050000000-EnforceOneOpenShiftPerCashier");
const { AddSaleItemUnitCostSnapshot1791060000000 } = loadModule("../migration/1791060000000-AddSaleItemUnitCostSnapshot") as typeof import("../migration/1791060000000-AddSaleItemUnitCostSnapshot");
const { AllowParkedSales1791070000000 } = loadModule("../migration/1791070000000-AllowParkedSales") as typeof import("../migration/1791070000000-AllowParkedSales");
const { CreateCustomerInvoices1791080000000 } = loadModule("../migration/1791080000000-CreateCustomerInvoices") as typeof import("../migration/1791080000000-CreateCustomerInvoices");
const { AddMpesaMismatchHandling1791120000000 } = loadModule("../migration/1791120000000-AddMpesaMismatchHandling") as typeof import("../migration/1791120000000-AddMpesaMismatchHandling");
const { EmailService } = loadModule("../services/EmailService") as typeof import("../services/EmailService");
const originalSendOtpEmail = EmailService.sendOtpEmail;

const adminEmail = `integration-admin-${Date.now()}@example.com`;
const registeredAuthEmail = `integration-auth-${Date.now()}@example.com`;
let adminUserId = "";
let createdEtimsFailureCashierId = "";
let createdProductSku = "";
let createdImportedProductSku = "";
let createdQcProductSku = "";
let createdCustomerPhone = "";
let createdVendorId = "";
let createdReceivingWarehouseId = "";
let createdAggregateWarehouseId = "";
let createdTransferWarehouseId = "";
let createdStockTakeId = "";
let createdSaleId = "";
let createdMpesaSaleId = "";
let createdPaybillSaleId = "";
let createdCallbackSaleId = "";
let createdConcurrentCallbackSaleId = "";
let createdDiscountedSaleId = "";
let createdTaxRoundingSaleId = "";
let createdEtimsFailureSaleId = "";
let createdNoShiftSaleId = "";
let createdPesapalSaleId = "";
let createdWarehouseReceiptSaleId = "";
let createdHybridAccountingReferenceId = "";
let createdPurchaseOrderId = "";
let createdRejectedPurchaseOrderId = "";
let createdPartialPurchaseOrderId = "";
const createdSupplierInvoiceIds: string[] = [];
const createdSupplierPaymentIds: string[] = [];
let createdReturnRequestId = "";
let createdDiscountedReturnRequestId = "";
let createdSecondDiscountedReturnRequestId = "";
let createdFirstTaxRoundingReturnId = "";
let createdSecondTaxRoundingReturnId = "";
let createdEtimsFailureReturnId = "";
let createdNoShiftCashReturnId = "";
let createdUnresolvedMpesaTransactionId = "";
let createdExchangeReturnRequestId = "";
let createdMpesaReturnRequestId = "";

test.before(async () => {
    await AppDataSource.initialize();
    const encryptionCheck = await AppDataSource.query(
        "SELECT public.decrypt_sensitive_data(public.encrypt_sensitive_data($1)) AS plaintext",
        ["integration-encryption-check"]
    );
    assert.equal(encryptionCheck[0].plaintext, "integration-encryption-check");
    const repeatedEncryption = await AppDataSource.query(
        "SELECT public.encrypt_sensitive_data($1) AS first_ciphertext, public.encrypt_sensitive_data($1) AS second_ciphertext",
        ["same-plaintext"]
    );
    assert.notEqual(
        repeatedEncryption[0].first_ciphertext,
        repeatedEncryption[0].second_ciphertext,
        "Sensitive data encryption should use a fresh random salt for each value"
    );
    await AccountingService.initChartOfAccounts(AppDataSource.manager);

    const userRepository = AppDataSource.getRepository(User);
    const user = userRepository.create({
        email: adminEmail,
        password_hash: "hashed-password",
        role: AppRole.ADMIN,
        is_active: true,
    });
    await userRepository.save(user);
    adminUserId = user.id;

    const invoiceMigration = new CreateCustomerInvoices1791080000000();
    const invoiceMigrationRunner = AppDataSource.createQueryRunner();
    await invoiceMigrationRunner.connect();
    try {
        await invoiceMigration.up(invoiceMigrationRunner);
    } finally {
        await invoiceMigrationRunner.release();
    }
});

test.after(async () => {
    if (AppDataSource.isInitialized) {
        try {
            for (const returnRequestId of [createdReturnRequestId, createdDiscountedReturnRequestId, createdSecondDiscountedReturnRequestId, createdFirstTaxRoundingReturnId, createdSecondTaxRoundingReturnId, createdEtimsFailureReturnId, createdNoShiftCashReturnId, createdExchangeReturnRequestId, createdMpesaReturnRequestId]) {
                if (returnRequestId) {
                    await AppDataSource.getRepository(ReturnRequest).delete({ id: returnRequestId });
                }
            }
            for (const saleId of [createdSaleId, createdMpesaSaleId, createdPaybillSaleId, createdCallbackSaleId, createdConcurrentCallbackSaleId, createdDiscountedSaleId, createdTaxRoundingSaleId, createdEtimsFailureSaleId, createdNoShiftSaleId, createdPesapalSaleId, createdWarehouseReceiptSaleId, createdHybridAccountingReferenceId]) {
                if (saleId) {
                    await AppDataSource.query(
                        `DELETE FROM "sale_item_batches"
                         WHERE "sale_item_id" IN (SELECT "id" FROM "sale_items" WHERE "sale_id" = $1)`,
                        [saleId],
                    );
                }
            }
            for (const paymentId of createdSupplierPaymentIds) {
                const paymentJournalEntries = await AppDataSource.getRepository(JournalEntry).findBy({
                    reference_id: paymentId,
                    reference_type: "SUPPLIER_PAYMENT",
                });
                for (const journalEntry of paymentJournalEntries) {
                    await AppDataSource.getRepository(JournalLine).delete({ journal_entry_id: journalEntry.id });
                    await AppDataSource.getRepository(JournalEntry).delete({ id: journalEntry.id });
                }
                await AppDataSource.getRepository(SupplierPayment).delete({ id: paymentId });
            }
            if (createdSupplierInvoiceIds.length > 0) {
                await AppDataSource.getRepository(SupplierInvoice).delete(createdSupplierInvoiceIds);
            }
            if (createdPurchaseOrderId) {
                await AppDataSource.getRepository(DeliveryNote).delete({ po_id: createdPurchaseOrderId });
                await AppDataSource.getRepository(ProductBatch).delete({ po_id: createdPurchaseOrderId });
                const purchaseJournalEntries = await AppDataSource.getRepository(JournalEntry).findBy({
                    reference_id: createdPurchaseOrderId,
                });
                for (const journalEntry of purchaseJournalEntries) {
                    await AppDataSource.getRepository(JournalLine).delete({ journal_entry_id: journalEntry.id });
                    await AppDataSource.getRepository(JournalEntry).delete({ id: journalEntry.id });
                }
                await AppDataSource.getRepository(PurchaseOrder).delete({ id: createdPurchaseOrderId });
            }
            if (createdRejectedPurchaseOrderId) {
                await AppDataSource.getRepository(DeliveryNote).delete({ po_id: createdRejectedPurchaseOrderId });
                await AppDataSource.getRepository(PurchaseOrder).delete({ id: createdRejectedPurchaseOrderId });
            }
            if (createdPartialPurchaseOrderId) {
                await AppDataSource.getRepository(DeliveryNote).delete({ po_id: createdPartialPurchaseOrderId });
                await AppDataSource.getRepository(ProductBatch).delete({ po_id: createdPartialPurchaseOrderId });
                const partialReceiptJournals = await AppDataSource.getRepository(JournalEntry).findBy({
                    reference_id: createdPartialPurchaseOrderId,
                });
                for (const journalEntry of partialReceiptJournals) {
                    await AppDataSource.getRepository(JournalLine).delete({ journal_entry_id: journalEntry.id });
                    await AppDataSource.getRepository(JournalEntry).delete({ id: journalEntry.id });
                }
                await AppDataSource.getRepository(PurchaseOrder).delete({ id: createdPartialPurchaseOrderId });
            }
            for (const saleId of [createdSaleId, createdMpesaSaleId, createdPaybillSaleId, createdCallbackSaleId, createdConcurrentCallbackSaleId, createdDiscountedSaleId, createdTaxRoundingSaleId, createdEtimsFailureSaleId, createdNoShiftSaleId, createdPesapalSaleId, createdWarehouseReceiptSaleId, createdHybridAccountingReferenceId]) {
                if (saleId) {
                    await AppDataSource.getRepository(Invoice).delete({ sale_id: saleId });
                    const creditNotes = await AppDataSource.getRepository(CreditNote).find({
                        where: { sale: { id: saleId } },
                    });
                    for (const creditNote of creditNotes) {
                        await AppDataSource.getRepository(CreditNote).delete({ id: creditNote.id });
                    }
                    const journalEntries = await AppDataSource.getRepository(JournalEntry).findBy({ reference_id: saleId });
                    for (const journalEntry of journalEntries) {
                        await AppDataSource.getRepository(JournalLine).delete({ journal_entry_id: journalEntry.id });
                        await AppDataSource.getRepository(JournalEntry).delete({ id: journalEntry.id });
                    }
                    await AppDataSource.getRepository(Sale).delete({ id: saleId });
                }
            }
            if (adminUserId) {
                if (createdEtimsFailureCashierId) {
                    await AppDataSource.getRepository(User).delete({ id: createdEtimsFailureCashierId });
                }
                await AppDataSource.getRepository(Shift).delete({ cashier_id: adminUserId });
            }
            if (createdProductSku) {
                const testProduct = await AppDataSource.getRepository(Product).findOneBy({ sku: createdProductSku });
                if (testProduct) {
                    await AppDataSource.getRepository(StockMovement).delete({ product_id: testProduct.id });
                }
                if (createdStockTakeId) {
                    await AppDataSource.getRepository(StockTake).delete({ id: createdStockTakeId });
                }
                if (createdReceivingWarehouseId) {
                    await AppDataSource.getRepository(InventoryAdjustment).delete({ warehouse_id: createdReceivingWarehouseId });
                    await AppDataSource.query(
                        `DELETE FROM "inventory_transfers"
                         WHERE "from_warehouse_id" = $1 OR "to_warehouse_id" = $1`,
                        [createdReceivingWarehouseId],
                    );
                    const remainingSales = await AppDataSource.getRepository(Sale).find({
                        where: { warehouse: { id: createdReceivingWarehouseId } },
                    });
                    for (const remainingSale of remainingSales) {
                        await AppDataSource.getRepository(Invoice).delete({ sale_id: remainingSale.id });
                        await AppDataSource.query(
                            `DELETE FROM "sale_item_batches" WHERE "sale_item_id" IN (SELECT "id" FROM "sale_items" WHERE "sale_id" = $1)`,
                            [remainingSale.id],
                        );
                        await AppDataSource.getRepository(SaleItem).delete({ sale: { id: remainingSale.id } });
                        await AppDataSource.getRepository(Sale).delete({ id: remainingSale.id });
                    }
                    await AppDataSource.getRepository(WarehouseStock).delete({ warehouse_id: createdReceivingWarehouseId });
                    await AppDataSource.getRepository(Warehouse).delete({ id: createdReceivingWarehouseId });
                }
                if (createdAggregateWarehouseId) {
                    await AppDataSource.getRepository(WarehouseStock).delete({ warehouse_id: createdAggregateWarehouseId });
                    await AppDataSource.getRepository(Warehouse).delete({ id: createdAggregateWarehouseId });
                }
                if (createdTransferWarehouseId) {
                    await AppDataSource.getRepository(WarehouseStock).delete({ warehouse_id: createdTransferWarehouseId });
                    await AppDataSource.getRepository(Warehouse).delete({ id: createdTransferWarehouseId });
                }
                if (testProduct) {
                    await AppDataSource.getRepository(ProductBatch).delete({ product_id: testProduct.id });
                }
                await AppDataSource.getRepository(Product).delete({ sku: createdProductSku });
            }
            if (createdImportedProductSku) {
                const importedProduct = await AppDataSource.getRepository(Product).findOneBy({ sku: createdImportedProductSku });
                if (importedProduct) {
                    await AppDataSource.getRepository(StockMovement).delete({ product_id: importedProduct.id });
                    await AppDataSource.getRepository(WarehouseStock).delete({ product_id: importedProduct.id });
                    await AppDataSource.getRepository(Product).delete({ id: importedProduct.id });
                }
            }
            if (createdQcProductSku) {
                const qcProduct = await AppDataSource.getRepository(Product).findOneBy({ sku: createdQcProductSku });
                if (qcProduct) {
                    await AppDataSource.getRepository(StockMovement).delete({ product_id: qcProduct.id });
                    await AppDataSource.getRepository(WarehouseStock).delete({ product_id: qcProduct.id });
                    await AppDataSource.getRepository(ProductBatch).delete({ product_id: qcProduct.id });
                    await AppDataSource.getRepository(Product).delete({ id: qcProduct.id });
                }
            }
            if (createdCustomerPhone) {
                await AppDataSource.getRepository(Customer).delete({ phone: createdCustomerPhone });
            }
            if (createdVendorId) {
                await AppDataSource.getRepository(Vendor).delete({ id: createdVendorId });
            }
            if (adminUserId) {
                await AppDataSource.getRepository(User).delete({ id: adminUserId });
            }
            if (registeredAuthEmail) {
                await AppDataSource.getRepository(User).delete({ email: registeredAuthEmail });
            }
        } finally {
            EmailService.sendOtpEmail = originalSendOtpEmail;
            await AppDataSource.destroy();
        }
    }
});

test("PostgreSQL advisory locking permits only one scheduled task runner", async () => {
    const firstRunner = AppDataSource.createQueryRunner();
    const secondRunner = AppDataSource.createQueryRunner();
    await firstRunner.connect();
    await secondRunner.connect();

    try {
        const firstLock = await firstRunner.query(
            "SELECT pg_try_advisory_lock($1) AS acquired",
            [71943001],
        ) as Array<{ acquired: boolean }>;
        const secondLock = await secondRunner.query(
            "SELECT pg_try_advisory_lock($1) AS acquired",
            [71943001],
        ) as Array<{ acquired: boolean }>;
        assert.equal(firstLock[0]?.acquired, true);
        assert.equal(secondLock[0]?.acquired, false);

        await firstRunner.query("SELECT pg_advisory_unlock($1)", [71943001]);
        const retriedLock = await secondRunner.query(
            "SELECT pg_try_advisory_lock($1) AS acquired",
            [71943001],
        ) as Array<{ acquired: boolean }>;
        assert.equal(retriedLock[0]?.acquired, true);
        await secondRunner.query("SELECT pg_advisory_unlock($1)", [71943001]);
    } finally {
        await firstRunner.release();
        await secondRunner.release();
    }
});

test("Socket.IO broadcasts events received from and published to other PostgreSQL-connected instances", async () => {
    const server = createHttpServer();
    const peerDatabaseClient = new PgClient({
        connectionString: testDatabaseUrl,
        application_name: "cfi-pos-socket-integration-test",
    });
    let socket: ReturnType<typeof createSocketClient> | undefined;
    await SocketService.init(server);
    server.listen(0);
    await once(server, "listening");

    try {
        const port = (server.address() as AddressInfo).port;
        await peerDatabaseClient.connect();
        await peerDatabaseClient.query("LISTEN cfi_pos_socket_events");

        const token = jwt.sign(
            { id: adminUserId, email: adminEmail, role: AppRole.ADMIN },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" },
        );
        socket = createSocketClient(`http://127.0.0.1:${port}`, {
            autoConnect: false,
            auth: { token },
            transports: ["websocket"],
        });
        const connected = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Socket.IO connection timed out.")), 5000);
            socket?.once("connect", () => {
                clearTimeout(timeout);
                resolve();
            });
            socket?.once("connect_error", (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
        socket.connect();
        await connected;

        const incomingEvent = new Promise<{ sale_id: string }>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Cross-instance Socket.IO event timed out.")), 5000);
            socket?.once("new_sale", (payload: { sale_id: string }) => {
                clearTimeout(timeout);
                resolve(payload);
            });
        });
        await peerDatabaseClient.query(
            "SELECT pg_notify($1, $2)",
            [
                "cfi_pos_socket_events",
                JSON.stringify({
                    instanceId: "another-api-instance",
                    event: "new_sale",
                    payload: { sale_id: "sale-published-by-peer" },
                }),
            ],
        );
        const receivedPeerEvent = await incomingEvent;
        assert.deepEqual(receivedPeerEvent, { sale_id: "sale-published-by-peer" });

        const publishedNotification = once(peerDatabaseClient, "notification", {
            signal: AbortSignal.timeout(5000),
        });
        SocketService.emitNewSale("sale-published-by-this-instance");
        const [notification] = await publishedNotification;
        assert.equal(notification.channel, "cfi_pos_socket_events");
        const publishedEvent = JSON.parse(notification.payload || "{}") as {
            instanceId: string;
            event: string;
            payload: { sale_id: string };
        };
        assert.equal(typeof publishedEvent.instanceId, "string");
        assert.equal(publishedEvent.event, "new_sale");
        assert.deepEqual(publishedEvent.payload, { sale_id: "sale-published-by-this-instance" });
    } finally {
        socket?.disconnect();
        await peerDatabaseClient.end().catch(() => undefined);
        await SocketService.close();
    }
});

test("admin can access protected product workflow and reject unauthorized requests", async () => {
    const server = app.listen(0);
    await once(server, "listening");

    try {
        const port = (server.address() as AddressInfo).port;
        const token = jwt.sign(
            { id: adminUserId, email: adminEmail, role: AppRole.ADMIN },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
        );
        const tokenHeader = { Authorization: `Bearer ${token}` };

        const settingRepository = AppDataSource.getRepository(Setting);
        const originalCompanyLogo = await settingRepository.findOneBy({ key: "company_logo" });
        try {
            const unauthenticatedLogoResponse = await fetch(`http://127.0.0.1:${port}/api/settings/company-logo`, {
                method: "POST",
                body: new FormData(),
            });
            assert.equal(unauthenticatedLogoResponse.status, 401, "Logo uploads must require admin authentication");

            const logoForm = new FormData();
            logoForm.append(
                "logo",
                new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
                    type: "image/png",
                }),
                "company-logo.png",
            );
            const uploadLogoResponse = await fetch(`http://127.0.0.1:${port}/api/settings/company-logo`, {
                method: "POST",
                headers: tokenHeader,
                body: logoForm,
            });
            assert.equal(uploadLogoResponse.status, 200, "An admin should be able to upload a supported logo image");
            const uploadedLogo = await uploadLogoResponse.json() as { company_logo: string };
            assert.match(uploadedLogo.company_logo, /^\/api\/company-logo\?v=/);

            const receiptSettingsResponse = await fetch(`http://127.0.0.1:${port}/api/receipt-settings`, {
                headers: tokenHeader,
            });
            const receiptSettings = await receiptSettingsResponse.json() as Record<string, string>;
            assert.equal(receiptSettings.company_logo, uploadedLogo.company_logo);

            const logoImageResponse = await fetch(`http://127.0.0.1:${port}${uploadedLogo.company_logo}`);
            assert.equal(logoImageResponse.status, 200);
            assert.match(logoImageResponse.headers.get("content-type") || "", /^image\/png/);

            const removeLogoResponse = await fetch(`http://127.0.0.1:${port}/api/settings/company-logo`, {
                method: "DELETE",
                headers: tokenHeader,
            });
            assert.equal(removeLogoResponse.status, 200);
            assert.equal(
                (await removeLogoResponse.json() as { company_logo: string | null }).company_logo,
                null,
            );
        } finally {
            if (originalCompanyLogo) {
                await settingRepository.save(originalCompanyLogo);
            } else {
                await settingRepository.delete({ key: "company_logo" });
            }
        }

        const receivingWarehouse = await AppDataSource.getRepository(Warehouse).save(
            AppDataSource.getRepository(Warehouse).create({
                name: `Integration Receiving Warehouse ${randomUUID().slice(0, 8)}`,
                location_address: "Integration test",
                is_main: false,
                is_active: true,
            })
        );
        createdReceivingWarehouseId = receivingWarehouse.id;
        const aggregateWarehouse = await AppDataSource.getRepository(Warehouse).save(
            AppDataSource.getRepository(Warehouse).create({
                name: `Integration Aggregate Warehouse ${randomUUID().slice(0, 8)}`,
                location_address: "Integration test",
                is_main: false,
                is_active: true,
            })
        );
        createdAggregateWarehouseId = aggregateWarehouse.id;

        const forbiddenResponse = await fetch(`http://127.0.0.1:${port}/api/products`, {
            headers: { "Content-Type": "application/json" },
        });
        assert.equal(forbiddenResponse.status, 401);

        const sku = `INT-${Date.now()}-${randomUUID().slice(0, 6)}`;
        createdProductSku = sku;
        const createResponse = await fetch(`http://127.0.0.1:${port}/api/products`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                sku,
                name: "Integration Product",
                unit_cost: 10,
                retail_price: 18,
                tax_rate: 0,
                stock_on_hand: 12,
                warehouse_id: receivingWarehouse.id,
                reorder_level: 2,
                location: "main",
            }),
        });

        assert.equal(createResponse.status, 201, "Product creation should return HTTP 201");
        const createdProduct = (await createResponse.json()) as IntegrationApiObject;
        assert.equal(createdProduct.sku, sku);
        const openingStockMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            product_id: createdProduct.id,
            movement_type: "initial_stock",
            reference_type: "initial",
            reference_id: createdProduct.id,
        });
        assert.equal(openingStockMovement.quantity, 12);
        assert.equal(openingStockMovement.quantity_before, 0);
        assert.equal(openingStockMovement.quantity_after, 12);
        assert.equal(openingStockMovement.location_id, receivingWarehouse.id);
        const openingWarehouseStock = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: createdProduct.id,
        });
        assert.equal(openingWarehouseStock.stock_on_hand, 12);

        await AppDataSource.getRepository(WarehouseStock).save(
            AppDataSource.getRepository(WarehouseStock).create({
                warehouse_id: aggregateWarehouse.id,
                product_id: createdProduct.id,
                stock_on_hand: 3,
            })
        );
        await AppDataSource.getRepository(Product).update(createdProduct.id, { stock_on_hand: 15 });

        const allWarehouseProductsResponse = await fetch(`http://127.0.0.1:${port}/api/products`, {
            headers: tokenHeader,
        });
        assert.equal(allWarehouseProductsResponse.status, 200);
        const allWarehouseProducts = await allWarehouseProductsResponse.json() as IntegrationApiObject[];
        assert.equal(
            Number(allWarehouseProducts.find((product) => product.id === createdProduct.id)?.stock_on_hand),
            15,
            "All-warehouse product stock should sum the balances from every warehouse",
        );
        for (const [warehouse, expectedStock] of [[receivingWarehouse, 12], [aggregateWarehouse, 3]] as const) {
            const warehouseProductsResponse = await fetch(
                `http://127.0.0.1:${port}/api/products?warehouse_id=${encodeURIComponent(warehouse.id)}`,
                { headers: tokenHeader },
            );
            assert.equal(warehouseProductsResponse.status, 200);
            const warehouseProducts = await warehouseProductsResponse.json() as IntegrationApiObject[];
            assert.equal(
                Number(warehouseProducts.find((product) => product.id === createdProduct.id)?.stock_on_hand),
                expectedStock,
                `Warehouse-scoped product stock should only include ${warehouse.name}`,
            );
        }
        await AppDataSource.getRepository(WarehouseStock).delete({
            warehouse_id: aggregateWarehouse.id,
            product_id: createdProduct.id,
        });
        await AppDataSource.getRepository(Product).update(createdProduct.id, { stock_on_hand: 12 });

        await AppDataSource.getRepository(Product).update(createdProduct.id, {
            stock_on_hand: 0,
            reorder_level: 20,
        });
        const productListResponse = await fetch(`http://127.0.0.1:${port}/api/products`, {
            headers: tokenHeader,
        });
        assert.equal(productListResponse.status, 200);
        const listedProducts = await productListResponse.json() as IntegrationApiObject[];
        assert.equal(
            Number(listedProducts.find((product) => product.id === createdProduct.id)?.stock_on_hand),
            12,
            "The product list should calculate current stock from its warehouse balances instead of a stale zero aggregate",
        );
        const productDetailsResponse = await fetch(`http://127.0.0.1:${port}/api/products/${createdProduct.id}`, {
            headers: tokenHeader,
        });
        assert.equal(productDetailsResponse.status, 200);
        const productDetails = await productDetailsResponse.json() as IntegrationApiObject;
        assert.equal(
            Number(productDetails.stock_on_hand),
            12,
            "Product details should use the same calculated warehouse total",
        );
        const stockAlertsResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/alerts`, {
            headers: tokenHeader,
        });
        assert.equal(stockAlertsResponse.status, 200);
        const stockAlerts = await stockAlertsResponse.json() as IntegrationApiObject[];
        assert.equal(
            Number(stockAlerts.find((product) => product.id === createdProduct.id)?.stock_on_hand),
            12,
            "Reorder alerts should use the same calculated warehouse total",
        );
        await AppDataSource.getRepository(Product).update(createdProduct.id, {
            stock_on_hand: 12,
            reorder_level: 2,
        });

        const predictionResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/predictions`, {
            headers: tokenHeader,
        });
        assert.equal(predictionResponse.status, 200, "The report should generate data-backed estimates");
        const predictionResult = await predictionResponse.json() as IntegrationApiObject;
        assert.equal(predictionResult.success, true);
        assert.equal(predictionResult.source, "statistical");
        assert.equal(predictionResult.predictions.salesForecast.historyDays, 90);
        assert.ok(Number.isFinite(predictionResult.predictions.salesForecast.next7Days));
        assert.ok(Array.isArray(predictionResult.predictions.inventoryAlerts));
        assert.ok(Array.isArray(predictionResult.predictions.recommendations));

        const directStockEditResponse = await fetch(`http://127.0.0.1:${port}/api/products/${createdProduct.id}`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ stock_on_hand: 999 }),
        });
        assert.equal(directStockEditResponse.status, 400, "Product metadata updates must not bypass the inventory ledger");
        const unchangedProduct = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(unchangedProduct.stock_on_hand, 12);

        const salePayload = {
            items: [{ product_id: createdProduct.id, quantity: 2 }],
            payment_method: "mpesa",
            cash_amount: 40,
            warehouse_id: receivingWarehouse.id,
            idempotency_key: `integration-${randomUUID()}`,
        };

        const saleWithoutShift = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify(salePayload),
        });
        assert.equal(saleWithoutShift.status, 400, "Sale creation must require an open shift");

        await AppDataSource.getRepository(Warehouse).update(receivingWarehouse.id, { is_active: false });
        const parkedSaleAtInactiveWarehouse = await fetch(`http://127.0.0.1:${port}/api/sales/park`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                warehouse_id: receivingWarehouse.id,
            }),
        });
        assert.equal(parkedSaleAtInactiveWarehouse.status, 400, "Parked sales must reject inactive warehouses");
        await AppDataSource.getRepository(Warehouse).update(receivingWarehouse.id, { is_active: true });

        const qcSku = `QC-${Date.now()}-${randomUUID().slice(0, 6)}`;
        createdQcProductSku = qcSku;
        const qcProductResponse = await fetch(`http://127.0.0.1:${port}/api/products`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sku: qcSku,
                name: "QC Integration Product",
                unit_cost: 10,
                retail_price: 18,
                tax_rate: 0,
                stock_on_hand: 5,
                warehouse_id: receivingWarehouse.id,
                reorder_level: 1,
                location: "qc",
            }),
        });
        assert.equal(qcProductResponse.status, 201, "QC product creation should succeed");
        const qcProduct = (await qcProductResponse.json()) as IntegrationApiObject;
        await AppDataSource.getRepository(ProductBatch).save(AppDataSource.getRepository(ProductBatch).create({
            product_id: qcProduct.id,
            batch_number: `QC-${Date.now()}`,
            initial_quantity: 5,
            current_quantity: 5,
            unit_cost: 10,
            quality_check_status: "pending",
        }));

        const blockedQcSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: qcProduct.id, quantity: 1 }],
                payment_method: "cash",
                cash_amount: 18,
                warehouse_id: receivingWarehouse.id,
                idempotency_key: `qc-blocked-${randomUUID()}`,
            }),
        });
        assert.equal(blockedQcSaleResponse.status, 400, "Sales must reject stock from pending QC batches");
        const qcProductAfterBlockedSale = await AppDataSource.getRepository(Product).findOneByOrFail({ id: qcProduct.id });
        assert.equal(qcProductAfterBlockedSale.stock_on_hand, 5, "Pending QC stock must remain locked from sale");
        await AppDataSource.getRepository(StockMovement).delete({ product_id: qcProduct.id });
        await AppDataSource.getRepository(WarehouseStock).delete({ product_id: qcProduct.id });
        await AppDataSource.getRepository(ProductBatch).delete({ product_id: qcProduct.id });
        await AppDataSource.getRepository(Product).delete({ id: qcProduct.id });
        createdQcProductSku = "";

        const callbackSale = new Sale();
        callbackSale.cashier = await AppDataSource.getRepository(User).findOneByOrFail({ id: adminUserId });
        callbackSale.subtotal = 18;
        callbackSale.tax_amount = 0;
        callbackSale.total_amount = 18;
        callbackSale.payment_method = PaymentMethod.MPESA;
        callbackSale.status = SaleStatus.COMPLETED;
        callbackSale.cash_amount = 0;
        callbackSale.mpesa_amount = 0;
        callbackSale.store_credit_amount = 0;
        callbackSale.loyalty_discount = 0;
        callbackSale.payment_status = "pending";
        const savedCallbackSale = await AppDataSource.getRepository(Sale).save(callbackSale);
        createdCallbackSaleId = savedCallbackSale.id;

        const openShiftResponses = await Promise.all([
            fetch(`http://127.0.0.1:${port}/api/shifts/open`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ opening_float: 100 }),
            }),
            fetch(`http://127.0.0.1:${port}/api/shifts/open`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ opening_float: 100 }),
            }),
        ]);
        assert.deepEqual(
            openShiftResponses.map((response) => response.status).sort(),
            [201, 409],
            "Concurrent shift opens must create exactly one active till",
        );
        const openShiftResponse = openShiftResponses.find((response) => response.status === 201)!;
        const openedShift = (await openShiftResponse.json()) as IntegrationApiObject;
        assert.equal(
            await AppDataSource.getRepository(Shift).countBy({ cashier_id: adminUserId, status: ShiftStatus.OPEN }),
            1,
        );

        await AppDataSource.getRepository(Warehouse).update(receivingWarehouse.id, { is_active: false });
        const completedSaleAtInactiveWarehouse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...salePayload,
                payment_method: "cash",
                idempotency_key: `inactive-warehouse-${randomUUID()}`,
            }),
        });
        assert.equal(completedSaleAtInactiveWarehouse.status, 400, "Completed sales must reject inactive warehouses");
        await AppDataSource.getRepository(Warehouse).update(receivingWarehouse.id, { is_active: true });

        const expiredStoreCredit = await AppDataSource.getRepository(StoreCredit).save(
            AppDataSource.getRepository(StoreCredit).create({
                barcode: `EX${randomUUID().replace(/-/g, "").slice(0, 16)}`,
                original_amount: 18,
                current_balance: 18,
                status: StoreCreditStatus.ACTIVE,
                expires_at: new Date(Date.now() - 60_000),
            }),
        );
        const activeStoreCredit = await AppDataSource.getRepository(StoreCredit).save(
            AppDataSource.getRepository(StoreCredit).create({
                barcode: `AC${randomUUID().replace(/-/g, "").slice(0, 16)}`,
                original_amount: 300,
                current_balance: 300,
                status: StoreCreditStatus.ACTIVE,
                expires_at: new Date(Date.now() + 60 * 60 * 1000),
            }),
        );
        try {
            const activeCreditLookup = await fetch(
                `http://127.0.0.1:${port}/api/store-credits/${encodeURIComponent(activeStoreCredit.barcode)}`,
                { headers: tokenHeader },
            );
            assert.equal(activeCreditLookup.status, 200, "Active voucher balance should be available to checkout");
            const activeCreditBody = await activeCreditLookup.json() as { current_balance: number };
            assert.equal(Number(activeCreditBody.current_balance), 300);

            await AppDataSource.getRepository(StoreCredit).update(activeStoreCredit.id, {
                current_balance: 0,
                status: StoreCreditStatus.REDEEMED,
            });
            const redeemedCreditLookup = await fetch(
                `http://127.0.0.1:${port}/api/store-credits/${encodeURIComponent(activeStoreCredit.barcode)}`,
                { headers: tokenHeader },
            );
            assert.equal(redeemedCreditLookup.status, 404, "A fully redeemed barcode must no longer be usable");

            const expiredCreditLookup = await fetch(
                `http://127.0.0.1:${port}/api/store-credits/${encodeURIComponent(expiredStoreCredit.barcode)}`,
                { headers: tokenHeader },
            );
            assert.equal(expiredCreditLookup.status, 404, "Expired voucher must not be presented as usable credit");

            const expiredCreditSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: [{ product_id: createdProduct.id, quantity: 1 }],
                    payment_method: "store_credit",
                    store_credit_amount: 18,
                    store_credit_barcode: expiredStoreCredit.barcode,
                    idempotency_key: `expired-store-credit-${randomUUID()}`,
                }),
            });
            assert.equal(expiredCreditSaleResponse.status, 400, "Expired barcode credit must not be accepted for a sale");
            assert.match((await expiredCreditSaleResponse.json() as IntegrationApiObject).message, /store credit barcode/i);
            assert.equal(
                Number((await AppDataSource.getRepository(StoreCredit).findOneByOrFail({ id: expiredStoreCredit.id })).current_balance),
                18,
                "Rejected expired store credit must retain its balance",
            );
        } finally {
            await AppDataSource.getRepository(StoreCredit).delete({ id: expiredStoreCredit.id });
            await AppDataSource.getRepository(StoreCredit).delete({ id: activeStoreCredit.id });
        }

        const callbackToken = `${randomUUID()}${randomUUID()}`;
        const checkoutRequestId = `checkout-${randomUUID()}`;
        const mpesaTransaction = AppDataSource.getRepository(MpesaTransaction).create({
            sale_id: savedCallbackSale.id,
            transaction_code: `CALLBACK-${randomUUID()}`,
            phone_number: "254700000000",
            amount: 18,
            status: "pending",
            checkout_request_id: checkoutRequestId,
            callback_token_hash: hashMpesaCallbackToken(callbackToken),
            callback_received: false,
        });
        await AppDataSource.getRepository(MpesaTransaction).save(mpesaTransaction);
        const failedCallbackToken = `${randomUUID()}${randomUUID()}`;
        const failedCheckoutRequestId = `checkout-${randomUUID()}`;
        await AppDataSource.getRepository(MpesaTransaction).save(
            AppDataSource.getRepository(MpesaTransaction).create({
                sale_id: savedCallbackSale.id,
                transaction_code: `CALLBACK-${randomUUID()}`,
                phone_number: "254700000000",
                amount: 18,
                status: "pending",
                checkout_request_id: failedCheckoutRequestId,
                callback_token_hash: hashMpesaCallbackToken(failedCallbackToken),
                callback_received: false,
            }),
        );
        const mpesaCallbackBody = (amount: number, receipt: string, phoneNumber = "254700000000") => ({
            Body: {
                stkCallback: {
                    CheckoutRequestID: checkoutRequestId,
                    ResultCode: 0,
                    ResultDesc: "The service request is processed successfully.",
                    CallbackMetadata: {
                        Item: [
                            { Name: "Amount", Value: amount },
                            { Name: "MpesaReceiptNumber", Value: receipt },
                            { Name: "PhoneNumber", Value: phoneNumber },
                        ],
                    },
                },
            },
        });
        const failedCallbackPayload = {
            Body: {
                stkCallback: {
                    CheckoutRequestID: failedCheckoutRequestId,
                    ResultCode: 1032,
                    ResultDesc: "Request cancelled by user",
                },
            },
        };
        const failedCallbackUrl = `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${failedCallbackToken}`;
        const failedCallbackResponse = await fetch(failedCallbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(failedCallbackPayload),
        });
        assert.equal(failedCallbackResponse.status, 200);
        const reorderedFailedCallbackResponse = await fetch(failedCallbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                Body: {
                    stkCallback: {
                        ResultDesc: "Request cancelled by user",
                        ResultCode: 1032,
                        CheckoutRequestID: failedCheckoutRequestId,
                    },
                },
            }),
        });
        assert.equal(
            reorderedFailedCallbackResponse.status,
            200,
            "Reordered duplicate failure callbacks should be acknowledged idempotently",
        );
        const conflictingFailureReplayResponse = await fetch(failedCallbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ...failedCallbackPayload,
                Body: {
                    stkCallback: {
                        ...failedCallbackPayload.Body.stkCallback,
                        ResultCode: 1,
                    },
                },
            }),
        });
        assert.equal(conflictingFailureReplayResponse.status, 409);

        const malformedCallbackResponse = await fetch(`http://127.0.0.1:${port}/api/webhooks/mpesa/callback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ Body: { stkCallback: { ResultCode: 0 } } }),
        });
        assert.equal(malformedCallbackResponse.status, 400, "Callback without checkout ID should be rejected");

        const forgedCallbackResponse = await fetch(`http://127.0.0.1:${port}/api/webhooks/mpesa/callback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mpesaCallbackBody(18, `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}`)),
        });
        assert.equal(forgedCallbackResponse.status, 401, "Callback without the transaction token must be rejected");

        const alteredAmountResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mpesaCallbackBody(19, `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}`)),
            }
        );
        assert.equal(alteredAmountResponse.status, 400, "Callback amount must match the requested amount");

        const fractionalAmountResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mpesaCallbackBody(18.001, `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}`)),
            },
        );
        assert.equal(
            fractionalAmountResponse.status,
            400,
            "STK callback amounts must be whole shillings and exactly match the request",
        );

        const missingPhoneResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Body: {
                        stkCallback: {
                            CheckoutRequestID: checkoutRequestId,
                            ResultCode: 0,
                            CallbackMetadata: {
                                Item: [
                                    { Name: "Amount", Value: 18 },
                                    { Name: "MpesaReceiptNumber", Value: `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}` },
                                ],
                            },
                        },
                    },
                }),
            },
        );
        assert.equal(missingPhoneResponse.status, 400, "Successful STK callback must include the paying phone number");

        const alteredPhoneResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mpesaCallbackBody(18, `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}`, "254712345678")),
            },
        );
        assert.equal(alteredPhoneResponse.status, 400, "STK callback phone must match the requested phone");

        const validReceipt = `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}`;
        const validCallbackBody = mpesaCallbackBody(18, validReceipt);
        const validCallbackResponses = await Promise.all([
            fetch(`http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validCallbackBody),
            }),
            fetch(`http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validCallbackBody),
            }),
        ]);
        assert.deepEqual(
            validCallbackResponses.map((response) => response.status),
            [200, 200],
            "Concurrent identical callbacks should be serialized and idempotently acknowledged",
        );

        const replayResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${callbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(mpesaCallbackBody(19, `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}`)),
            }
        );
        assert.equal(replayResponse.status, 409, "A conflicting duplicate callback must not be acknowledged as valid");
        const persistedMpesaTransaction = await AppDataSource.getRepository(MpesaTransaction).findOneByOrFail({ id: mpesaTransaction.id });
        assert.equal(persistedMpesaTransaction.status, "completed");
        assert.equal(Number(persistedMpesaTransaction.amount), 18);
        assert.equal(persistedMpesaTransaction.mpesa_receipt_number, validReceipt);
        const callbackPaidSale = await AppDataSource.getRepository(Sale).findOneByOrFail({ id: savedCallbackSale.id });
        assert.equal(Number(callbackPaidSale.mpesa_amount), 18);
        assert.equal(callbackPaidSale.payment_status, "paid");
        const callbackJournalEntries = await AppDataSource.getRepository(JournalEntry).findBy({
            reference_id: savedCallbackSale.id,
            reference_type: "MPESA_PAYMENT",
        });
        assert.equal(callbackJournalEntries.length, 1, "Callback replay must not duplicate ledger entries");
        const callbackJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: callbackJournalEntries[0].id },
            relations: ["account"],
        });
        assert.ok(callbackJournalLines.some((line) =>
            line.account.code === "1010" && Number(line.debit) === 18
        ), "STK callback settlement must debit M-Pesa clearing, not cash");
        assert.ok(callbackJournalLines.some((line) =>
            line.account.code === "1200" && Number(line.credit) === 18
        ));
        assert.ok(!callbackJournalLines.some((line) =>
            line.account.code === "1000" && Number(line.debit) > 0
        ));

        const concurrentCallbackSale = await AppDataSource.getRepository(Sale).save(
            AppDataSource.getRepository(Sale).create({
                cashier: await AppDataSource.getRepository(User).findOneByOrFail({ id: adminUserId }),
                subtotal: 36,
                tax_amount: 0,
                total_amount: 36,
                payment_method: PaymentMethod.MPESA,
                status: SaleStatus.PENDING,
                cash_amount: 0,
                mpesa_amount: 0,
                store_credit_amount: 0,
                change_amount: 0,
                loyalty_discount: 0,
                payment_status: "pending",
            })
        );
        createdConcurrentCallbackSaleId = concurrentCallbackSale.id;
        const concurrentTransactions = await Promise.all([1, 2].map(async () => {
            const token = `${randomUUID()}${randomUUID()}`;
            const checkoutId = `checkout-${randomUUID()}`;
            const transaction = AppDataSource.getRepository(MpesaTransaction).create({
                sale_id: concurrentCallbackSale.id,
                transaction_code: `CALLBACK-${randomUUID()}`,
                phone_number: "254700000000",
                amount: 18,
                status: "pending",
                checkout_request_id: checkoutId,
                callback_token_hash: hashMpesaCallbackToken(token),
                callback_received: false,
            });
            await AppDataSource.getRepository(MpesaTransaction).save(transaction);
            return { token, checkoutId };
        }));
        const concurrentCallbackResponses = await Promise.all(concurrentTransactions.map(({ token, checkoutId }) =>
            fetch(`http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${token}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Body: {
                        stkCallback: {
                            CheckoutRequestID: checkoutId,
                            ResultCode: 0,
                            CallbackMetadata: {
                                Item: [
                                    { Name: "Amount", Value: 18 },
                                    { Name: "MpesaReceiptNumber", Value: `RCP${randomUUID().replace(/-/g, "").slice(0, 12)}` },
                                    { Name: "PhoneNumber", Value: "254700000000" },
                                ],
                            },
                        },
                    },
                }),
            })
        ));
        assert.deepEqual(
            concurrentCallbackResponses.map((response) => response.status),
            [200, 200],
            "Distinct concurrent payments for one sale should both settle",
        );
        const concurrentlyPaidSale = await AppDataSource.getRepository(Sale).findOneByOrFail({
            id: concurrentCallbackSale.id,
        });
        assert.equal(Number(concurrentlyPaidSale.mpesa_amount), 36);
        assert.equal(concurrentlyPaidSale.payment_status, "paid");
        assert.equal(
            await AppDataSource.getRepository(JournalEntry).countBy({
                reference_id: concurrentCallbackSale.id,
                reference_type: "MPESA_PAYMENT",
            }),
            2,
            "Each confirmed receipt should have exactly one settlement journal",
        );

        const originalPesapalSecret = process.env.PESAPAL_IPN_SECRET;
        const pesapalSecret = "isolated-integration-pesapal-secret";
        process.env.PESAPAL_IPN_SECRET = pesapalSecret;
        const pesapalTrackingId = `pesapal-${randomUUID()}`;
        const pesapalSale = await AppDataSource.getRepository(Sale).save(
            AppDataSource.getRepository(Sale).create({
                cashier: await AppDataSource.getRepository(User).findOneByOrFail({ id: adminUserId }),
                subtotal: 18,
                tax_amount: 0,
                total_amount: 18,
                payment_method: PaymentMethod.MPESA,
                status: SaleStatus.PENDING,
                cash_amount: 0,
                mpesa_amount: 0,
                store_credit_amount: 0,
                change_amount: 0,
                loyalty_discount: 0,
                payment_status: "pending",
                pesapal_tracking_id: pesapalTrackingId,
                pesapal_status: "pending",
            })
        );
        createdPesapalSaleId = pesapalSale.id;
        const pesapalPayload = {
            OrderTrackingId: pesapalTrackingId,
            OrderNotificationType: "IPNCHANGE",
            OrderMerchantReference: `sale-${pesapalSale.id}`,
        };
        const pesapalSignature = createHmac("sha256", pesapalSecret)
            .update(Object.keys(pesapalPayload).sort().map((key) =>
                `${key}=${pesapalPayload[key as keyof typeof pesapalPayload]}`
            ).join("&"))
            .digest("hex");
        const pesapalNotifications = await Promise.all([1, 2].map(() =>
            fetch(`http://127.0.0.1:${port}/api/webhooks/pesapal/ipn`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-pesapal-signature": pesapalSignature,
                },
                body: JSON.stringify(pesapalPayload),
            })
        ));
        if (originalPesapalSecret === undefined) delete process.env.PESAPAL_IPN_SECRET;
        else process.env.PESAPAL_IPN_SECRET = originalPesapalSecret;
        assert.deepEqual(
            pesapalNotifications.map((response) => response.status),
            [200, 200],
            "Concurrent identical Pesapal notifications must be accepted without duplicate journals",
        );
        const pesapalJournalEntries = await AppDataSource.getRepository(JournalEntry).findBy({
            reference_id: pesapalSale.id,
            reference_type: "PESAPAL_PAYMENT",
        });
        assert.equal(pesapalJournalEntries.length, 1);
        const pesapalJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: pesapalJournalEntries[0].id },
            relations: ["account"],
        });
        assert.ok(pesapalJournalLines.some((line) =>
            line.account.code === "1010" && Number(line.debit) === 18
        ), "Pesapal M-Pesa settlement must debit M-Pesa clearing, not cash");
        assert.ok(pesapalJournalLines.some((line) =>
            line.account.code === "1200" && Number(line.credit) === 18
        ));
        assert.ok(!pesapalJournalLines.some((line) =>
            line.account.code === "1000" && Number(line.debit) > 0
        ));

        const underpaidSale = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ ...salePayload, cash_amount: 1, idempotency_key: `underpaid-${randomUUID()}` }),
        });
        assert.equal(underpaidSale.status, 400, "Underpaid sales must be rejected");
        const stockAfterUnderpaidSale = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(stockAfterUnderpaidSale.stock_on_hand, 12, "Rejected underpaid sale must roll back inventory changes");

        const discountedSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: 2 }],
                payment_method: "cash",
                cash_amount: 30,
                loyalty_discount: 6,
                warehouse_id: receivingWarehouse.id,
                idempotency_key: `discounted-${randomUUID()}`,
            }),
        });
        assert.equal(discountedSaleResponse.status, 201, "Discounted sale should be created");
        const discountedSale = (await discountedSaleResponse.json()) as IntegrationApiObject;
        createdDiscountedSaleId = discountedSale.id;
        assert.equal(Number(discountedSale.subtotal), 36);
        assert.equal(Number(discountedSale.total_amount), 30);
        const discountedSaleJournal = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: discountedSale.id,
            reference_type: "SALE",
        });
        const discountedSaleLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: discountedSaleJournal.id },
            relations: ["account"],
        });
        assert.ok(discountedSaleLines.some((line) =>
            line.account.code === "1000" && Number(line.debit) === 30
        ));
        assert.ok(discountedSaleLines.some((line) =>
            line.account.code === "4000" && Number(line.credit) === 30
        ), "Posted revenue must exclude the loyalty discount");

        const discountedSaleDetailsResponse = await fetch(
            `http://127.0.0.1:${port}/api/sales/${discountedSale.id}`,
            { headers: tokenHeader },
        );
        const discountedSaleDetails = (await discountedSaleDetailsResponse.json() as IntegrationApiObject).sale;
        assert.equal(Number(discountedSaleDetails.items[0].unit_cost), 10);
        const discountedReturnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: discountedSale.id,
                reason: "Verify loyalty discount allocation on refund",
                items: [{ sale_item_id: discountedSaleDetails.items[0].id, quantity: 1 }],
            }),
        });
        assert.equal(discountedReturnResponse.status, 201);
        const discountedReturn = (await discountedReturnResponse.json() as IntegrationApiObject).request;
        createdDiscountedReturnRequestId = discountedReturn.id;
        const costChangedProduct = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        const originalDiscountedProductCost = costChangedProduct.unit_cost;
        let discountedReturnApproval: Response;
        try {
            costChangedProduct.unit_cost = 25;
            await AppDataSource.getRepository(Product).save(costChangedProduct);
            discountedReturnApproval = await fetch(
                `http://127.0.0.1:${port}/api/admin/returns/approve/${discountedReturn.id}`,
                {
                    method: "POST",
                    headers: { ...tokenHeader, "Content-Type": "application/json" },
                    body: JSON.stringify({ refund_method: "cash" }),
                },
            );
        } finally {
            costChangedProduct.unit_cost = originalDiscountedProductCost;
            await AppDataSource.getRepository(Product).save(costChangedProduct);
        }
        assert.equal(discountedReturnApproval.status, 200);
        const discountedReturnResult = await discountedReturnApproval.json() as IntegrationApiObject;
        assert.equal(Number(discountedReturnResult.creditNote.amount), 15);
        assert.match(discountedReturnResult.creditNote.etims_note_no, /^TEST-CN-ETIMS-/);
        assert.match(discountedReturnResult.creditNote.etims_qr_code, /invoice=TEST-CN-ETIMS-/);
        assert.match(discountedReturnResult.creditNote.etims_signature, /^TEST-CNSIG-/);
        const persistedSignedCreditNote = await AppDataSource.getRepository(CreditNote).findOneOrFail({
            where: { id: discountedReturnResult.creditNote.id },
            relations: ["return_request"],
        });
        assert.equal(persistedSignedCreditNote.return_request?.id, discountedReturn.id);
        assert.equal(persistedSignedCreditNote.etims_note_no, discountedReturnResult.creditNote.etims_note_no);
        assert.equal(persistedSignedCreditNote.etims_qr_code, discountedReturnResult.creditNote.etims_qr_code);
        assert.equal(persistedSignedCreditNote.etims_signature, discountedReturnResult.creditNote.etims_signature);
        const secondDiscountedReturnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: discountedSale.id,
                reason: "Verify cumulative loyalty discount allocation",
                items: [{ sale_item_id: discountedSaleDetails.items[0].id, quantity: 1 }],
            }),
        });
        assert.equal(secondDiscountedReturnResponse.status, 201);
        const secondDiscountedReturn = (await secondDiscountedReturnResponse.json() as IntegrationApiObject).request;
        createdSecondDiscountedReturnRequestId = secondDiscountedReturn.id;
        const secondDiscountedReturnApproval = await fetch(
            `http://127.0.0.1:${port}/api/admin/returns/approve/${secondDiscountedReturn.id}`,
            {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ refund_method: "store_credit" }),
            },
        );
        assert.equal(secondDiscountedReturnApproval.status, 200);
        const secondDiscountedReturnResult = await secondDiscountedReturnApproval.json() as IntegrationApiObject;
        assert.equal(Number(secondDiscountedReturnResult.creditNote.amount), 15);
        const discountedReversals = await AppDataSource.getRepository(JournalEntry).findBy({
            reference_id: discountedSale.id,
            reference_type: "SALE_VOID",
        });
        assert.equal(discountedReversals.length, 2);
        const allDiscountedReversalLines = (await Promise.all(discountedReversals.map((entry) =>
            AppDataSource.getRepository(JournalLine).find({
                where: { journal_entry_id: entry.id },
                relations: ["account"],
            })
        ))).flat();
        assert.equal(
            allDiscountedReversalLines
                .filter((line) => line.account.code === "4000")
                .reduce((sum, line) => sum + Number(line.debit), 0),
            30,
            "Sequential partial returns must reverse revenue only up to the amount actually paid",
        );
        assert.equal(
            allDiscountedReversalLines
                .filter((line) => line.account.code === "2300")
                .reduce((sum, line) => sum + Number(line.credit), 0),
            15,
            "Only the store-credit return should post to the store-credit liability",
        );
        assert.equal(
            allDiscountedReversalLines
                .filter((line) => line.account.code === "1000")
                .reduce((sum, line) => sum + Number(line.credit), 0),
            15,
            "Cash refunds must be reconciled against the credited discounted amount",
        );
        assert.equal(
            allDiscountedReversalLines
                .filter((line) => line.account.code === "5000")
                .reduce((sum, line) => sum + Number(line.credit), 0),
            20,
            "Return COGS reversals must use the unit cost snapshotted on each sale item",
        );

        const productRepository = AppDataSource.getRepository(Product);
        const productForTaxRounding = await productRepository.findOneByOrFail({ id: createdProduct.id });
        const originalRetailPrice = productForTaxRounding.retail_price;
        const originalTaxRate = productForTaxRounding.tax_rate;
        try {
            productForTaxRounding.retail_price = 0.05;
            productForTaxRounding.tax_rate = 10;
            await productRepository.save(productForTaxRounding);

            const taxRoundingSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: [{ product_id: createdProduct.id, quantity: 2 }],
                    payment_method: "cash",
                    cash_amount: 0.11,
                    warehouse_id: receivingWarehouse.id,
                    idempotency_key: `tax-rounding-${randomUUID()}`,
                }),
            });
            assert.equal(taxRoundingSaleResponse.status, 201);
            const taxRoundingSale = (await taxRoundingSaleResponse.json()) as IntegrationApiObject;
            createdTaxRoundingSaleId = taxRoundingSale.id;
            assert.equal(Number(taxRoundingSale.total_amount), 0.11);
            assert.equal(Number(taxRoundingSale.tax_amount), 0.01);

            const taxRoundingSaleDetailsResponse = await fetch(
                `http://127.0.0.1:${port}/api/sales/${taxRoundingSale.id}`,
                { headers: tokenHeader },
            );
            const taxRoundingSaleDetails = (await taxRoundingSaleDetailsResponse.json() as IntegrationApiObject).sale;
            const taxRoundingCreditNotes: number[] = [];
            for (let index = 0; index < 2; index += 1) {
                const returnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
                    method: "POST",
                    headers: { ...tokenHeader, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        sale_id: taxRoundingSale.id,
                        reason: "Verify cumulative tax allocation across partial returns",
                        items: [{ sale_item_id: taxRoundingSaleDetails.items[0].id, quantity: 1 }],
                    }),
                });
                assert.equal(returnResponse.status, 201);
                const returnRequest = (await returnResponse.json() as IntegrationApiObject).request;
                if (index === 0) createdFirstTaxRoundingReturnId = returnRequest.id;
                else createdSecondTaxRoundingReturnId = returnRequest.id;
                const approvalResponse = await fetch(
                    `http://127.0.0.1:${port}/api/admin/returns/approve/${returnRequest.id}`,
                    {
                        method: "POST",
                        headers: { ...tokenHeader, "Content-Type": "application/json" },
                        body: JSON.stringify({ refund_method: "store_credit" }),
                    },
                );
                assert.equal(approvalResponse.status, 200);
                const approvalResult = await approvalResponse.json() as IntegrationApiObject;
                taxRoundingCreditNotes.push(Number(approvalResult.creditNote.amount));
            }
            assert.deepEqual(taxRoundingCreditNotes, [0.06, 0.05]);
            const taxRoundingReversals = await AppDataSource.getRepository(JournalEntry).findBy({
                reference_id: taxRoundingSale.id,
                reference_type: "SALE_VOID",
            });
            const taxRoundingReversalLines = (await Promise.all(taxRoundingReversals.map((entry) =>
                AppDataSource.getRepository(JournalLine).find({
                    where: { journal_entry_id: entry.id },
                    relations: ["account"],
                })
            ))).flat();
            assert.equal(
                taxRoundingReversalLines
                    .filter((line) => line.account.code === "2200")
                    .reduce((sum, line) => sum + Number(line.debit), 0),
                0.01,
                "Partial returns must not reverse more tax than the sale recorded",
            );
            assert.equal(
                taxRoundingReversalLines
                    .filter((line) => line.account.code === "2300")
                    .reduce((sum, line) => sum + Number(line.credit), 0),
                0.11,
            );
        } finally {
            productForTaxRounding.retail_price = originalRetailPrice;
            productForTaxRounding.tax_rate = originalTaxRate;
            await productRepository.save(productForTaxRounding);
        }

        const etimsFailureCashier = await AppDataSource.getRepository(User).save(
            AppDataSource.getRepository(User).create({
                email: `integration-etims-cashier-${randomUUID()}@example.com`,
                password_hash: "hashed-password",
                role: AppRole.CASHIER,
                is_active: true,
            })
        );
        createdEtimsFailureCashierId = etimsFailureCashier.id;
        const etimsFailureSale = await AppDataSource.getRepository(Sale).save(
            AppDataSource.getRepository(Sale).create({
                cashier: etimsFailureCashier,
                subtotal: 36,
                tax_amount: 0,
                total_amount: 36,
                payment_method: PaymentMethod.CASH,
                status: SaleStatus.COMPLETED,
                cash_amount: 36,
                mpesa_amount: 0,
                store_credit_amount: 0,
                change_amount: 0,
                loyalty_discount: 0,
                payment_status: "paid",
            })
        );
        createdEtimsFailureSaleId = etimsFailureSale.id;
        const etimsFailureSaleItem = await AppDataSource.getRepository(SaleItem).save(
            AppDataSource.getRepository(SaleItem).create({
                sale: etimsFailureSale,
                product: createdProduct,
                quantity: 2,
                unit_price: 18,
                tax_rate: 0,
                line_total: 36,
            })
        );
        const etimsFailureReturnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: etimsFailureSale.id,
                reason: "Verify decoupled return succeeds when eTIMS signing fails",
                items: [{ sale_item_id: etimsFailureSaleItem.id, quantity: 1 }],
            }),
        });
        assert.equal(etimsFailureReturnResponse.status, 201);
        const etimsFailureReturn = (await etimsFailureReturnResponse.json() as IntegrationApiObject).request;
        createdEtimsFailureReturnId = etimsFailureReturn.id;
        const returnItems = await AppDataSource.getRepository(ReturnRequest).findOneOrFail({
            where: { id: etimsFailureReturn.id },
            relations: ["items"],
        });
        const originalSignCreditNote = EtimsMockService.signCreditNote;
        let signingFailureResponse: Response;
        EtimsMockService.signCreditNote = async () => {
            throw new Error("Simulated eTIMS credit-note signing failure");
        };
        try {
            signingFailureResponse = await fetch(
                `http://127.0.0.1:${port}/api/admin/returns/approve/${etimsFailureReturn.id}`,
                {
                    method: "POST",
                    headers: { ...tokenHeader, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        refund_method: "store_credit",
                        items_conditions: [{
                            return_item_id: returnItems.items[0].id,
                            condition: "damaged",
                        }],
                    }),
                },
            );
        } finally {
            EtimsMockService.signCreditNote = originalSignCreditNote;
        }
        // Decoupled eTIMS signing: Return approval succeeds with HTTP 200 even when eTIMS signing fails
        assert.equal(signingFailureResponse.status, 200);
        const failureApprovalResult = await signingFailureResponse.json() as IntegrationApiObject;
        assert.equal(failureApprovalResult.creditNote.etims_status, "pending");

        const approvedReturn = await AppDataSource.getRepository(ReturnRequest).findOneByOrFail({
            id: etimsFailureReturn.id,
        });
        assert.equal(approvedReturn.status, "approved");

        const pendingCreditNote = await AppDataSource.getRepository(CreditNote).findOneOrFail({
            where: { id: failureApprovalResult.creditNote.id },
        });
        assert.equal(pendingCreditNote.etims_status, "pending");
        assert.equal(pendingCreditNote.etims_attempts, 1);
        assert.match(pendingCreditNote.etims_last_error || "", /credit-note signing failure/i);
        const cashierToken = jwt.sign(
            {
                id: etimsFailureCashier.id,
                email: etimsFailureCashier.email,
                role: AppRole.CASHIER,
            },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" },
        );
        const cashierTokenHeader = { Authorization: `Bearer ${cashierToken}` };
        const noShiftSale = await AppDataSource.getRepository(Sale).save(
            AppDataSource.getRepository(Sale).create({
                cashier: etimsFailureCashier,
                subtotal: 36,
                tax_amount: 0,
                total_amount: 36,
                payment_method: PaymentMethod.CASH,
                status: SaleStatus.COMPLETED,
                cash_amount: 36,
                mpesa_amount: 0,
                store_credit_amount: 0,
                change_amount: 0,
                loyalty_discount: 0,
                payment_status: "paid",
            })
        );
        createdNoShiftSaleId = noShiftSale.id;
        const noShiftSaleItem = await AppDataSource.getRepository(SaleItem).save(
            AppDataSource.getRepository(SaleItem).create({
                sale: noShiftSale,
                product: createdProduct,
                quantity: 2,
                unit_price: 18,
                tax_rate: 0,
                line_total: 36,
            })
        );
        const noShiftCashReturnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...cashierTokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: noShiftSale.id,
                reason: "Verify cash refund requires an active cashier shift",
                items: [{ sale_item_id: noShiftSaleItem.id, quantity: 1 }],
            }),
        });
        assert.equal(noShiftCashReturnResponse.status, 201);
        const noShiftCashReturn = (await noShiftCashReturnResponse.json() as IntegrationApiObject).request;
        createdNoShiftCashReturnId = noShiftCashReturn.id;
        const cashierReturnsResponse = await fetch(`http://127.0.0.1:${port}/api/returns`, {
            headers: cashierTokenHeader,
        });
        assert.equal(cashierReturnsResponse.status, 200, "Cashiers should be able to view their own return requests");
        const cashierReturns = await cashierReturnsResponse.json() as IntegrationApiObject[];
        assert.ok(cashierReturns.length > 0);
        assert.ok(cashierReturns.every((request) => request.requested_by.id === etimsFailureCashier.id));
        assert.ok(cashierReturns.some((request) => request.id === noShiftCashReturn.id));
        const noShiftCashApprovalResponse = await fetch(
            `http://127.0.0.1:${port}/api/admin/returns/approve/${noShiftCashReturn.id}`,
            {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ refund_method: "cash" }),
            },
        );
        assert.equal(noShiftCashApprovalResponse.status, 400);
        assert.match(
            (await noShiftCashApprovalResponse.json() as IntegrationApiObject).message,
            /open a shift for the requesting cashier/i,
        );
        const unprocessedCashReturn = await AppDataSource.getRepository(ReturnRequest).findOneByOrFail({
            id: noShiftCashReturn.id,
        });
        assert.equal(unprocessedCashReturn.status, "pending");
        assert.equal(
            await AppDataSource.getRepository(CreditNote).countBy({ sale: { id: noShiftSale.id } }),
            0,
        );

        const stockBeforeDecisionRace = await productRepository.findOneByOrFail({ id: createdProduct.id });
        const decisionRaceResponses = await Promise.all([
            fetch(`http://127.0.0.1:${port}/api/admin/returns/approve/${noShiftCashReturn.id}`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ refund_method: "store_credit" }),
            }),
            fetch(`http://127.0.0.1:${port}/api/admin/returns/reject/${noShiftCashReturn.id}`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ rejection_reason: "Concurrent decision test" }),
            }),
        ]);
        assert.equal(
            decisionRaceResponses.filter((response) => response.status === 200).length,
            1,
            "Concurrent approval and rejection must have exactly one winner",
        );
        const decisionRaceReturn = await AppDataSource.getRepository(ReturnRequest).findOneByOrFail({
            id: noShiftCashReturn.id,
        });
        const decisionRaceCreditNotes = await AppDataSource.getRepository(CreditNote).countBy({
            sale: { id: noShiftSale.id },
        });
        const decisionRaceReversals = await AppDataSource.getRepository(JournalEntry).countBy({
            reference_id: noShiftSale.id,
            reference_type: "SALE_VOID",
        });
        const stockAfterDecisionRace = await productRepository.findOneByOrFail({ id: createdProduct.id });
        if (decisionRaceReturn.status === "approved") {
            assert.equal(decisionRaceCreditNotes, 1);
            assert.equal(decisionRaceReversals, 1);
            assert.equal(
                stockAfterDecisionRace.stock_on_hand,
                stockBeforeDecisionRace.stock_on_hand + 1,
                "A winning approval should restore sellable returned inventory once",
            );
        } else {
            assert.equal(decisionRaceReturn.status, "rejected");
            assert.equal(decisionRaceCreditNotes, 0);
            assert.equal(decisionRaceReversals, 0);
            assert.equal(
                stockAfterDecisionRace.stock_on_hand,
                stockBeforeDecisionRace.stock_on_hand,
                "A winning rejection must not alter inventory",
            );
        }

        const batchExpiryBase = new Date();
        const productBatchRepository = AppDataSource.getRepository(ProductBatch);
        await productBatchRepository.save([
            productBatchRepository.create({
                product_id: createdProduct.id,
                batch_number: `COGS-A-${randomUUID().slice(0, 8)}`,
                expiry_date: new Date(batchExpiryBase.getFullYear() + 1, batchExpiryBase.getMonth(), batchExpiryBase.getDate()),
                initial_quantity: 1,
                current_quantity: 1,
                unit_cost: 12,
                quality_check_status: "passed",
            }),
            productBatchRepository.create({
                product_id: createdProduct.id,
                batch_number: `COGS-B-${randomUUID().slice(0, 8)}`,
                expiry_date: new Date(batchExpiryBase.getFullYear() + 2, batchExpiryBase.getMonth(), batchExpiryBase.getDate()),
                initial_quantity: 1,
                current_quantity: 1,
                unit_cost: 13,
                quality_check_status: "passed",
            }),
        ]);

        const concurrentSaleResponses = await Promise.all([
            fetch(`http://127.0.0.1:${port}/api/sales`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify(salePayload),
            }),
            fetch(`http://127.0.0.1:${port}/api/sales`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify(salePayload),
            }),
        ]);
        assert.deepEqual(
            concurrentSaleResponses.map((response) => response.status).sort(),
            [200, 201],
            "Concurrent retries with one key should create exactly one sale",
        );
        const createdResponse = concurrentSaleResponses.find((response) => response.status === 201)!;
        const createdSale = (await createdResponse.json()) as IntegrationApiObject;
        createdSaleId = createdSale.id;
        assert.equal(Number(createdSale.total_amount), 36);
        assert.equal(createdSale.status, "completed");
        assert.equal(Number(createdSale.cash_amount), 40);
        assert.equal(Number(createdSale.change_amount), 4);
        assert.equal(createdSale.payment_method, "cash", "Sale tender type must be derived from the actual tender amounts");
        assert.equal(createdSale.payment_status, "paid");
        const invoice = await AppDataSource.getRepository(Invoice).findOneByOrFail({ sale_id: createdSale.id });
        assert.equal(invoice.invoice_number, `INV-${createdSale.id.toUpperCase().replace(/-/g, "")}`);
        assert.equal(Number(invoice.total_amount), 36);
        assert.equal(Number(invoice.paid_amount), 36, "Cash change must not be counted as invoice payment");
        assert.equal(Number(invoice.balance_due), 0);
        assert.equal(invoice.status, "paid");
        const invoicesResponse = await fetch(`http://127.0.0.1:${port}/api/invoices?status=paid`, {
            headers: tokenHeader,
        });
        assert.equal(invoicesResponse.status, 200);
        const listedInvoices = await invoicesResponse.json() as IntegrationApiObject[];
        const listedInvoice = listedInvoices.find((entry) => entry.sale_id === createdSale.id);
        assert.ok(listedInvoice, "Completed sales must be retrievable from the invoice list");
        assert.equal(Number(listedInvoice.total_amount), 36);
        assert.equal(listedInvoice.customer?.name, undefined, "Walk-in invoices should not require a customer relation");
        const returnInvoiceSearch = await fetch(
            `http://127.0.0.1:${port}/api/returns/search?invoice_number=${encodeURIComponent(invoice.invoice_number)}`,
            { headers: tokenHeader },
        );
        assert.equal(returnInvoiceSearch.status, 200);
        const returnableSales = await returnInvoiceSearch.json() as IntegrationApiObject[];
        assert.equal(returnableSales.length, 1);
        assert.equal(returnableSales[0].id, createdSale.id);
        assert.equal(returnableSales[0].invoice_number, invoice.invoice_number);
        const uuidReturnSearch = await fetch(
            `http://127.0.0.1:${port}/api/returns/search?invoice_number=${createdSale.id}`,
            { headers: tokenHeader },
        );
        assert.equal(uuidReturnSearch.status, 200);
        assert.deepEqual(await uuidReturnSearch.json(), [], "Return lookup should use the invoice number, not the sale UUID");

        const duplicateSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify(salePayload),
        });
        assert.equal(duplicateSaleResponse.status, 200, "Idempotent retry should return the existing sale");
        assert.equal(
            await AppDataSource.getRepository(Invoice).countBy({ sale_id: createdSale.id }),
            1,
            "Idempotent sale retries must not create duplicate invoices",
        );
        const mismatchedIdempotencyResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...salePayload,
                items: [{ product_id: createdProduct.id, quantity: 1 }],
            }),
        });
        assert.equal(mismatchedIdempotencyResponse.status, 409, "A key reused for a different cart must be rejected");
        assert.match(
            (await mismatchedIdempotencyResponse.json() as IntegrationApiObject).message,
            /already used for a different sale/i,
        );
        const otherCashierDuplicateResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...cashierTokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify(salePayload),
        });
        assert.equal(otherCashierDuplicateResponse.status, 400, "Another cashier must not receive a sale from a reused idempotency key");
        assert.match((await otherCashierDuplicateResponse.json() as IntegrationApiObject).message, /open a shift/i);

        const listResponse = await fetch(`http://127.0.0.1:${port}/api/products`, {
            headers: tokenHeader,
        });

        assert.equal(listResponse.status, 200);
        const productList = (await listResponse.json()) as IntegrationApiObject[];
        assert.ok(Array.isArray(productList));
        const listedProduct = productList.find((product: IntegrationApiObject) => product.sku === sku);
        assert.ok(listedProduct);
        assert.equal(listedProduct.stock_on_hand, 10, "Successful sale should decrement stock exactly once");

        const journalEntry = await AppDataSource.getRepository(JournalEntry).findOneBy({
            reference_id: createdSaleId,
            reference_type: "SALE",
        });
        assert.ok(journalEntry, "Successful sale should create an accounting journal entry");
        const saleJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: journalEntry!.id },
            relations: ["account"],
        });
        assert.ok(saleJournalLines.some((line) => line.account.code === "1000" && Number(line.debit) === 36));
        assert.ok(
            saleJournalLines.some((line) => line.account.code === "5000" && Number(line.debit) === 25),
            "Sale COGS must use the costs of the FEFO batches actually consumed",
        );
        assert.ok(!saleJournalLines.some((line) => line.account.code === "1010" && Number(line.debit) > 0));

        createdHybridAccountingReferenceId = randomUUID();
        await AccountingService.recordSale(
            AppDataSource.manager,
            createdHybridAccountingReferenceId,
            36,
            36,
            0,
            0,
            false,
            18,
            18,
            0,
        );
        const hybridJournalEntry = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: createdHybridAccountingReferenceId,
            reference_type: "SALE",
        });
        const hybridJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: hybridJournalEntry.id },
            relations: ["account"],
        });
        assert.ok(hybridJournalLines.some((line) => line.account.code === "1000" && Number(line.debit) === 18));
        assert.ok(hybridJournalLines.some((line) => line.account.code === "1010" && Number(line.debit) === 18));
        assert.equal(hybridJournalLines.reduce((sum, line) => sum + Number(line.debit), 0), 36);

        const saleDetailsResponse = await fetch(`http://127.0.0.1:${port}/api/sales/${createdSaleId}`, {
            headers: tokenHeader,
        });
        assert.equal(saleDetailsResponse.status, 200);
        const saleDetails = (await saleDetailsResponse.json() as IntegrationApiObject).sale;
        const saleItemId = saleDetails.items[0].id;
        assert.equal(Number(saleDetails.items[0].unit_cost), 12.5);
        assert.equal(Number(saleDetails.items[0].cogs_total), 25);

        const excessiveReturnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: createdSaleId,
                reason: "Excess quantity should be rejected",
                items: [{ sale_item_id: saleItemId, quantity: 3 }],
            }),
        });
        assert.equal(excessiveReturnResponse.status, 400, "Return quantity above the sold quantity must be rejected");

        const returnRequestResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: createdSaleId,
                reason: "Integration workflow return",
                items: [{ sale_item_id: saleItemId, quantity: 1 }],
            }),
        });
        assert.equal(returnRequestResponse.status, 201, "Valid return request should be created");
        const returnRequestBody = (await returnRequestResponse.json()) as IntegrationApiObject;
        createdReturnRequestId = returnRequestBody.request.id;

        const approvalResponse = await fetch(`http://127.0.0.1:${port}/api/admin/returns/approve/${createdReturnRequestId}`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ refund_method: "store_credit" }),
        });
        assert.equal(approvalResponse.status, 200, "Manager should be able to approve a valid store-credit return");
        const storeCreditApprovalBody = await approvalResponse.json() as IntegrationApiObject;
        assert.ok(storeCreditApprovalBody.storeCreditBarcode, "A return without a customer must create a store-credit voucher");
        const returnedStoreCredit = await AppDataSource.getRepository(StoreCredit).findOneByOrFail({
            barcode: storeCreditApprovalBody.storeCreditBarcode,
        });
        assert.equal(Number(returnedStoreCredit.current_balance), 18);
        const returnsListResponse = await fetch(`http://127.0.0.1:${port}/api/returns`, {
            headers: tokenHeader,
        });
        assert.equal(returnsListResponse.status, 200);
        const returnsList = await returnsListResponse.json() as IntegrationApiObject[];
        const listedWalkInReturn = returnsList.find((request) => request.id === createdReturnRequestId);
        assert.ok(listedWalkInReturn, "Approved walk-in return should remain traceable in return history");
        assert.equal(listedWalkInReturn.invoice_number, `INV-${createdSaleId.toUpperCase().replace(/-/g, "")}`);
        assert.equal(listedWalkInReturn.items[0].sale_item.product.name, "Integration Product");
        assert.equal(listedWalkInReturn.items[0].quantity, 1);
        assert.equal(listedWalkInReturn.store_credit_voucher.barcode, returnedStoreCredit.barcode);
        assert.equal(Number(listedWalkInReturn.store_credit_voucher.current_balance), 18);
        const cashSaleReversal = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: createdSaleId,
            reference_type: "SALE_VOID",
        });
        const storeCreditRefundLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: cashSaleReversal.id },
            relations: ["account"],
        });
        assert.ok(storeCreditRefundLines.some((line) =>
            line.account.code === "2300" && Number(line.credit) === 18
        ), "Store-credit refunds must credit the store-credit liability account");

        const returnedProduct = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(returnedProduct.stock_on_hand, 11, "Approving a sellable return should restore stock");
        const returnedStockMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            product_id: createdProduct.id,
            movement_type: "sale_return",
            reference_type: "return",
            reference_id: createdReturnRequestId,
        });
        assert.equal(returnedStockMovement.quantity, 1);
        assert.equal(returnedStockMovement.quantity_before, 10);
        assert.equal(returnedStockMovement.quantity_after, 11);

        const returnedSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales/${createdSaleId}`, {
            headers: tokenHeader,
        });
        const returnedSaleDetails = (await returnedSaleResponse.json() as IntegrationApiObject).sale;
        assert.equal(returnedSaleDetails.status, "partially_refunded");

        const exchangeReturnResponse = await fetch(`http://127.0.0.1:${port}/api/returns/request`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                sale_id: createdSaleId,
                reason: "Integration exchange issued as store credit",
                items: [{ sale_item_id: saleItemId, quantity: 1 }],
            }),
        });
        assert.equal(exchangeReturnResponse.status, 201);
        const exchangeReturnBody = await exchangeReturnResponse.json() as IntegrationApiObject;
        createdExchangeReturnRequestId = exchangeReturnBody.request.id;
        const savedExchangeReturn = await AppDataSource.getRepository(ReturnRequest).findOneOrFail({
            where: { id: createdExchangeReturnRequestId },
            relations: ["items"],
        });
        const exchangeApprovalResponse = await fetch(`http://127.0.0.1:${port}/api/admin/returns/approve/${createdExchangeReturnRequestId}`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                refund_method: "exchange",
                items_conditions: [{
                    return_item_id: savedExchangeReturn.items[0].id,
                    condition: "damaged",
                }],
            }),
        });
        assert.equal(exchangeApprovalResponse.status, 200, "Exchange approval should issue store-credit value");
        const exchangeApprovalBody = await exchangeApprovalResponse.json() as IntegrationApiObject;
        assert.ok(exchangeApprovalBody.storeCreditBarcode);
        const exchangeCredit = await AppDataSource.getRepository(StoreCredit).findOneByOrFail({
            barcode: exchangeApprovalBody.storeCreditBarcode,
        });
        assert.equal(Number(exchangeCredit.current_balance), 18);
        const exchangeReversalEntries = await AppDataSource.getRepository(JournalEntry).find({
            where: { reference_id: createdSaleId, reference_type: "SALE_VOID" },
            relations: ["lines", "lines.account"],
        });
        const exchangeLiabilityCredits = exchangeReversalEntries
            .flatMap((entry) => entry.lines)
            .filter((line) => line.account.code === "2300" && Number(line.credit) === 18);
        assert.equal(exchangeLiabilityCredits.length, 2, "Both store-credit and exchange returns must credit store-credit liability");
        assert.equal(
            exchangeReversalEntries
                .flatMap((entry) => entry.lines)
                .filter((line) => line.account.code === "5000")
                .reduce((sum, line) => sum + Number(line.credit), 0),
            25,
            "Sequential partial returns must reverse the original batch COGS exactly",
        );

        const checkoutSessionId = randomUUID();
        const stkCheckoutRequestId = `checkout-${randomUUID()}`;
        const merchantRequestId = `merchant-${randomUUID()}`;
        const reservedCheckoutResponse = await fetch(`http://127.0.0.1:${port}/api/sales/checkouts`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                checkout_session_id: checkoutSessionId,
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                warehouse_id: receivingWarehouse.id,
            }),
        });
        assert.equal(reservedCheckoutResponse.status, 201, "Checkout must reserve stock before starting a mobile payment");
        const reservedCheckout = await reservedCheckoutResponse.json() as IntegrationApiObject;
        assert.equal(Number(reservedCheckout.total_amount), 18);
        const reservedProductDeleteResponse = await fetch(`http://127.0.0.1:${port}/api/products/${createdProduct.id}`, {
            method: "DELETE",
            headers: tokenHeader,
        });
        assert.equal(
            reservedProductDeleteResponse.status,
            409,
            "Products in active checkout reservations must not be deleted",
        );
        const productBeforeConflictingSale = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        const conflictingSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: Number(productBeforeConflictingSale.stock_on_hand) }],
                payment_method: "cash",
                cash_amount: Number(productBeforeConflictingSale.stock_on_hand) * Number(productBeforeConflictingSale.retail_price),
                idempotency_key: `reservation-conflict-${randomUUID()}`,
            }),
        });
        assert.equal(conflictingSaleResponse.status, 400, "Other sales must not consume stock reserved for an active checkout");
        const productAfterConflictingSale = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(productAfterConflictingSale.stock_on_hand, productBeforeConflictingSale.stock_on_hand);
        const alteredStkTenderResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/stk-push`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                phone_number: "0712345678",
                amount: 17,
                cash_amount: 1,
                checkout_session_id: checkoutSessionId,
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                warehouse_id: receivingWarehouse.id,
            }),
        });
        assert.equal(alteredStkTenderResponse.status, 400, "STK payment must use the cash tender saved with the reservation");
        const originalFetch = globalThis.fetch;
        const originalMpesaEnvironment = {
            consumerKey: process.env.MPESA_CONSUMER_KEY,
            consumerSecret: process.env.MPESA_CONSUMER_SECRET,
            passkey: process.env.MPESA_PASSKEY,
            apiBaseUrl: process.env.MPESA_API_BASE_URL,
            callbackUrl: process.env.MPESA_CALLBACK_URL,
        };
        let callbackUrl = "";
        await AppDataSource.getRepository(Setting).save({
            key: "mpesa_shortcode",
            value: "174379",
        });
        process.env.MPESA_CONSUMER_KEY = "integration-consumer-key";
        process.env.MPESA_CONSUMER_SECRET = "integration-consumer-secret";
        process.env.MPESA_PASSKEY = "integration-passkey";
        process.env.MPESA_API_BASE_URL = "https://mock-daraja.test";
        process.env.MPESA_CALLBACK_URL = "https://pos.example.test/api/webhooks/mpesa/callback";
        globalThis.fetch = async (...args) => {
            const [input, init] = args;
            const url = String(input);
            if (url.startsWith("https://mock-daraja.test/oauth/")) {
                return Response.json({ access_token: "integration-access-token" });
            }
            if (url.startsWith("https://mock-daraja.test/mpesa/stkpush/")) {
                const body = JSON.parse(String(init?.body)) as { CallBackURL: string; Amount: number };
                assert.equal(body.Amount, 18, "Daraja must receive the validated whole-shilling amount");
                callbackUrl = body.CallBackURL;
                return Response.json({
                    ResponseCode: "0",
                    CheckoutRequestID: stkCheckoutRequestId,
                    MerchantRequestID: merchantRequestId,
                });
            }
            return originalFetch(...args);
        };
        let mpesaInitiationResponse: Response;
        try {
            const tooLargeStkResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/stk-push`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: "0712345678",
                    amount: 19,
                    checkout_session_id: checkoutSessionId,
                    items: [{ product_id: createdProduct.id, quantity: 1 }],
                    warehouse_id: receivingWarehouse.id,
                }),
            });
            assert.equal(tooLargeStkResponse.status, 400, "STK amount above the server-priced balance must be rejected");

            mpesaInitiationResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/stk-push`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone_number: "0712345678",
                    amount: 18,
                    checkout_session_id: checkoutSessionId,
                    items: [{ product_id: createdProduct.id, quantity: 1 }],
                    warehouse_id: receivingWarehouse.id,
                }),
            });
        } finally {
            globalThis.fetch = originalFetch;
            const envKeys = [
                ["MPESA_CONSUMER_KEY", originalMpesaEnvironment.consumerKey],
                ["MPESA_CONSUMER_SECRET", originalMpesaEnvironment.consumerSecret],
                ["MPESA_PASSKEY", originalMpesaEnvironment.passkey],
                ["MPESA_API_BASE_URL", originalMpesaEnvironment.apiBaseUrl],
                ["MPESA_CALLBACK_URL", originalMpesaEnvironment.callbackUrl],
            ] as const;
            for (const [key, value] of envKeys) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
        assert.equal(mpesaInitiationResponse.status, 200, "Valid STK request should be accepted by the mocked Daraja gateway");
        const mpesaInitiation = await mpesaInitiationResponse.json() as IntegrationApiObject;
        assert.equal(mpesaInitiation.checkout_request_id, stkCheckoutRequestId);
        assert.ok(callbackUrl, "The mocked Daraja request should include a callback URL");
        const saleWhileStkPendingResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                payment_method: "mpesa",
                cash_amount: 0,
                mpesa_amount: 18,
                checkout_session_id: checkoutSessionId,
                warehouse_id: receivingWarehouse.id,
                idempotency_key: `sale-while-stk-pending-${randomUUID()}`,
            }),
        });
        assert.equal(saleWhileStkPendingResponse.status, 400, "A sale must not close a checkout while STK confirmation is pending");
        assert.match((await saleWhileStkPendingResponse.json() as IntegrationApiObject).message, /M-Pesa payment is still pending/i);

        const pendingCheckout = await AppDataSource.getRepository(MpesaTransaction).findOneByOrFail({
            checkout_request_id: stkCheckoutRequestId,
        });
        assert.equal(pendingCheckout.cashier_id, adminUserId);
        assert.equal(pendingCheckout.checkout_session_id, checkoutSessionId);
        assert.equal(pendingCheckout.sale_id, null, "STK must not create or prematurely post a sale");

        const stkCallbackToken = new URL(callbackUrl).searchParams.get("callback_token");
        assert.ok(stkCallbackToken);
        await AppDataSource.getRepository(MpesaTransaction).update(
            { id: pendingCheckout.id },
            { checkout_request_id: null, merchant_request_id: null },
        );
        const stkCallbackResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/callback?callback_token=${stkCallbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Body: {
                        stkCallback: {
                            CheckoutRequestID: stkCheckoutRequestId,
                            MerchantRequestID: merchantRequestId,
                            ResultCode: 0,
                            ResultDesc: "The service request is processed successfully.",
                            CallbackMetadata: {
                                Item: [
                                    { Name: "Amount", Value: 18 },
                                    { Name: "MpesaReceiptNumber", Value: `STK${randomUUID().replace(/-/g, "").slice(0, 12)}` },
                                    { Name: "PhoneNumber", Value: "254712345678" },
                                ],
                            },
                        },
                    },
                }),
            },
        );
        assert.equal(stkCallbackResponse.status, 200, "Callback should recover a transaction before request identifiers are persisted");
        await AppDataSource.getRepository(MpesaTransaction).update(
            { id: pendingCheckout.id },
            { checkout_request_id: stkCheckoutRequestId, merchant_request_id: merchantRequestId },
        );
        const callbackBeforeInitiationResponse = await AppDataSource.getRepository(MpesaTransaction).findOneByOrFail({
            id: pendingCheckout.id,
        });
        assert.equal(
            callbackBeforeInitiationResponse.status,
            "completed",
            "Late identifier persistence must not overwrite callback settlement",
        );
        const confirmedCheckoutResponse = await fetch(
            `http://127.0.0.1:${port}/api/payments/mpesa/${stkCheckoutRequestId}`,
            { headers: tokenHeader },
        );
        assert.equal(confirmedCheckoutResponse.status, 200);
        const confirmedCheckout = await confirmedCheckoutResponse.json() as IntegrationApiObject;
        assert.equal(confirmedCheckout.status, "completed");
        assert.equal(Number(confirmedCheckout.amount), 18);

        const unconfirmedPaymentSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                payment_method: "mpesa",
                mpesa_amount: 18,
                warehouse_id: receivingWarehouse.id,
                idempotency_key: `integration-mpesa-unconfirmed-${randomUUID()}`,
            }),
        });
        assert.equal(unconfirmedPaymentSaleResponse.status, 400, "M-Pesa sale without confirmed transaction references must be rejected");

        const mpesaIdempotencyKey = `integration-mpesa-${randomUUID()}`;
        const mpesaSalePayload = {
            items: [{ product_id: createdProduct.id, quantity: 1 }],
            payment_method: "mpesa",
            mpesa_amount: 18,
            mpesa_transaction_ids: [pendingCheckout.id],
            checkout_session_id: checkoutSessionId,
            warehouse_id: receivingWarehouse.id,
            idempotency_key: mpesaIdempotencyKey,
        };
        const mpesaSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify(mpesaSalePayload),
        });
        assert.equal(mpesaSaleResponse.status, 201, "Fully paid M-Pesa sale should be created");
        const mpesaSale = (await mpesaSaleResponse.json()) as IntegrationApiObject;
        createdMpesaSaleId = mpesaSale.id;
        assert.equal(mpesaSale.payment_status, "paid");
        assert.equal(Number(mpesaSale.mpesa_amount), 18);
        const mpesaSaleJournal = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: createdMpesaSaleId,
            reference_type: "SALE",
        });
        const mpesaSaleJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: mpesaSaleJournal.id },
            relations: ["account"],
        });
        assert.ok(mpesaSaleJournalLines.some((line) =>
            line.account.code === "1010" && Number(line.debit) === 18
        ), "Confirmed STK tenders must debit M-Pesa clearing, not cash");
        const attachedCheckout = await AppDataSource.getRepository(MpesaTransaction).findOneByOrFail({
            checkout_request_id: stkCheckoutRequestId,
        });
        assert.equal(attachedCheckout.sale_id, createdMpesaSaleId, "Confirmed checkout should be consumed by exactly one sale");
        const duplicateMpesaSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify(mpesaSalePayload),
        });
        assert.equal(duplicateMpesaSaleResponse.status, 200, "Retrying a processed checkout must return the original sale");
        assert.equal((await duplicateMpesaSaleResponse.json() as IntegrationApiObject).sale.id, createdMpesaSaleId);

        const reusedCheckoutResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ ...mpesaSalePayload, idempotency_key: `reuse-${randomUUID()}` }),
        });
        assert.equal(reusedCheckoutResponse.status, 400, "A confirmed M-Pesa checkout cannot be reused for another sale");

        const c2bEnvironment = {
            consumerKey: process.env.MPESA_CONSUMER_KEY,
            consumerSecret: process.env.MPESA_CONSUMER_SECRET,
            apiBaseUrl: process.env.MPESA_API_BASE_URL,
            callbackBaseUrl: process.env.MPESA_C2B_CALLBACK_BASE_URL,
            callbackToken: process.env.MPESA_C2B_CALLBACK_TOKEN,
        };
        await AppDataSource.getRepository(Setting).save({ key: "mpesa_paybill", value: "123456" });
        process.env.MPESA_CONSUMER_KEY = "integration-consumer-key";
        process.env.MPESA_CONSUMER_SECRET = "integration-consumer-secret";
        process.env.MPESA_API_BASE_URL = "https://mock-daraja.test";
        process.env.MPESA_C2B_CALLBACK_BASE_URL = "https://pos.example.test";
        process.env.MPESA_C2B_CALLBACK_TOKEN = "a".repeat(64);
        let c2bConfirmationUrl = "";
        let failNextC2bRegistration = false;
        const fetchBeforeC2bRegistration = globalThis.fetch;
        globalThis.fetch = async (...args) => {
            const [input, init] = args;
            const url = String(input);
            if (url.startsWith("https://mock-daraja.test/oauth/")) {
                return Response.json({ access_token: "integration-c2b-access-token" });
            }
            if (url.startsWith("https://mock-daraja.test/mpesa/c2b/v1/registerurl")) {
                const body = JSON.parse(String(init?.body)) as { ConfirmationURL: string; ValidationURL: string };
                c2bConfirmationUrl = body.ConfirmationURL;
                assert.ok(body.ValidationURL.startsWith("https://"));
                if (failNextC2bRegistration) {
                    failNextC2bRegistration = false;
                    return Response.json({ ResponseCode: "1", ResponseDescription: "Temporary registration failure" });
                }
                return Response.json({ ResponseCode: "0", ResponseDescription: "Success" });
            }
            return fetchBeforeC2bRegistration(...args);
        };
        try {
            const registerC2bResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/c2b/register`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            assert.equal(registerC2bResponse.status, 200, "Admin should register Paybill callback URLs with the mocked Daraja endpoint");
            failNextC2bRegistration = true;
            const failedReregistrationResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/c2b/register`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            assert.equal(failedReregistrationResponse.status, 502, "Failed callback re-registration should report provider failure");
            const configAfterFailedReregistrationResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/config`, {
                headers: tokenHeader,
            });
            const configAfterFailedReregistration = await configAfterFailedReregistrationResponse.json() as IntegrationApiObject;
            assert.equal(
                configAfterFailedReregistration.paybill_c2b_enabled,
                true,
                "Failed callback re-registration must preserve the previously active Paybill registration",
            );
        } finally {
            globalThis.fetch = fetchBeforeC2bRegistration;
            const c2bEnvKeys = [
                ["MPESA_CONSUMER_KEY", c2bEnvironment.consumerKey],
                ["MPESA_CONSUMER_SECRET", c2bEnvironment.consumerSecret],
                ["MPESA_API_BASE_URL", c2bEnvironment.apiBaseUrl],
            ] as const;
            for (const [key, value] of c2bEnvKeys) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
        assert.ok(c2bConfirmationUrl, "C2B callback registration should provide a confirmation URL");
        const paymentConfigResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/config`, {
            headers: tokenHeader,
        });
        const paymentConfig = await paymentConfigResponse.json() as IntegrationApiObject;
        assert.equal(paymentConfig.paybill_c2b_enabled, true);

        const paybillCheckoutSessionId = randomUUID();
        const paybillReservationResponse = await fetch(`http://127.0.0.1:${port}/api/sales/checkouts`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                checkout_session_id: paybillCheckoutSessionId,
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                warehouse_id: receivingWarehouse.id,
            }),
        });
        assert.equal(paybillReservationResponse.status, 201);
        await AppDataSource.getRepository(MpesaTransaction).save(
            AppDataSource.getRepository(MpesaTransaction).create({
                cashier_id: adminUserId,
                checkout_session_id: paybillCheckoutSessionId,
                transaction_code: `FAILED_RETRY_${randomUUID()}`,
                phone_number: "254712345678",
                amount: 18,
                status: "failed",
                created_at: new Date(Date.now() + 60_000),
            }),
        );
        const alteredPaybillTenderResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/paybill-intent`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                checkout_session_id: paybillCheckoutSessionId,
                phone_number: "0712345678",
                amount: 17,
                cash_amount: 1,
            }),
        });
        assert.equal(alteredPaybillTenderResponse.status, 400, "Paybill intent must use the cash tender saved with the reservation");
        const paybillIntentResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/paybill-intent`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                checkout_session_id: paybillCheckoutSessionId,
                phone_number: "0712345678",
                amount: 18,
            }),
        });
        assert.equal(paybillIntentResponse.status, 201, "Paybill checkout should return a unique automatic matching reference");
        const paybillIntent = await paybillIntentResponse.json() as IntegrationApiObject;
        const recoveredPaybillStatusResponse = await fetch(
            `http://127.0.0.1:${port}/api/payments/mpesa/session/${paybillCheckoutSessionId}`,
            { headers: tokenHeader },
        );
        assert.equal(recoveredPaybillStatusResponse.status, 200);
        const recoveredPaybillStatus = await recoveredPaybillStatusResponse.json() as IntegrationApiObject;
        assert.equal(recoveredPaybillStatus.id, paybillIntent.transaction_id);
        assert.equal(recoveredPaybillStatus.status, "pending", "Refresh recovery must prioritize an active request over a later-dated failed attempt");
        const duplicatePaybillIntentResponse = await fetch(`http://127.0.0.1:${port}/api/payments/mpesa/paybill-intent`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                checkout_session_id: paybillCheckoutSessionId,
                phone_number: "0712345678",
                amount: 18,
            }),
        });
        assert.equal(duplicatePaybillIntentResponse.status, 409, "A checkout must not accept concurrent pending M-Pesa requests");
        const paybillCallbackToken = new URL(c2bConfirmationUrl).searchParams.get("callback_token");
        assert.ok(paybillCallbackToken);
        const c2bNotification = {
            TransID: `C2B${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`,
            TransAmount: "18.00",
            BusinessShortCode: "123456",
            BillRefNumber: paybillIntent.account_reference,
            MSISDN: "254712345678",
        };
        const c2bValidationResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/c2b/validation?callback_token=${paybillCallbackToken}`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c2bNotification) },
        );
        assert.equal((await c2bValidationResponse.json() as IntegrationApiObject).ResultCode, 0);
        const alteredC2bResponse = await fetch(
            `http://127.0.0.1:${port}/api/webhooks/mpesa/c2b/confirmation?callback_token=${paybillCallbackToken}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...c2bNotification, TransAmount: "19.00" }),
            },
        );
        assert.equal(alteredC2bResponse.status, 400, "C2B confirmation amount must match the reserved payment amount");
        const c2bConfirmUrl = `http://127.0.0.1:${port}/api/webhooks/mpesa/c2b/confirmation?callback_token=${paybillCallbackToken}`;
        const validC2bResponses = await Promise.all([
            fetch(c2bConfirmUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(c2bNotification),
            }),
            fetch(c2bConfirmUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(c2bNotification),
            }),
        ]);
        assert.deepEqual(
            validC2bResponses.map((response) => response.status),
            [200, 200],
            "Concurrent identical C2B callbacks should be serialized and idempotently acknowledged",
        );
        const alteredC2bReplayResponse = await fetch(c2bConfirmUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...c2bNotification, TransAmount: "19.00" }),
        });
        assert.equal(alteredC2bReplayResponse.status, 400, "A conflicting C2B replay must not be acknowledged as valid");
        const paybillTransaction = await AppDataSource.getRepository(MpesaTransaction).findOneByOrFail({
            id: paybillIntent.transaction_id,
        });
        assert.equal(paybillTransaction.status, "completed");
        assert.equal(paybillTransaction.mpesa_receipt_number, c2bNotification.TransID);

        const paybillSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                payment_method: "mpesa",
                mpesa_amount: 18,
                mpesa_transaction_ids: [paybillTransaction.id],
                checkout_session_id: paybillCheckoutSessionId,
                warehouse_id: receivingWarehouse.id,
                idempotency_key: `paybill-sale-${randomUUID()}`,
            }),
        });
        assert.equal(paybillSaleResponse.status, 201, "Verified Paybill payment should be consumable by exactly one sale");
        const paybillSale = await paybillSaleResponse.json() as IntegrationApiObject;
        createdPaybillSaleId = paybillSale.id;
        assert.equal(paybillSale.payment_status, "paid");
        const paybillSaleJournal = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: paybillSale.id,
            reference_type: "SALE",
        });
        const paybillSaleJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: paybillSaleJournal.id },
            relations: ["account"],
        });
        assert.ok(paybillSaleJournalLines.some((line) =>
            line.account.code === "1010" && Number(line.debit) === 18
        ), "Confirmed Paybill tenders must debit M-Pesa clearing, not cash");
        const attachedPaybillTransaction = await AppDataSource.getRepository(MpesaTransaction).findOneByOrFail({
            id: paybillTransaction.id,
        });
        assert.equal(attachedPaybillTransaction.sale_id, paybillSale.id);
        if (c2bEnvironment.callbackBaseUrl === undefined) delete process.env.MPESA_C2B_CALLBACK_BASE_URL;
        else process.env.MPESA_C2B_CALLBACK_BASE_URL = c2bEnvironment.callbackBaseUrl;
        if (c2bEnvironment.callbackToken === undefined) delete process.env.MPESA_C2B_CALLBACK_TOKEN;
        else process.env.MPESA_C2B_CALLBACK_TOKEN = c2bEnvironment.callbackToken;

        const mpesaSaleDetailsResponse = await fetch(`http://127.0.0.1:${port}/api/sales/${createdMpesaSaleId}`, {
            headers: tokenHeader,
        });
        const mpesaSaleDetails = (await mpesaSaleDetailsResponse.json() as IntegrationApiObject).sale;
        const mpesaSaleItemId = mpesaSaleDetails.items[0].id;

        const concurrentReturnRequests = await Promise.all([1, 2].map(() =>
            fetch(`http://127.0.0.1:${port}/api/returns/request`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({
                    sale_id: createdMpesaSaleId,
                    reason: "Concurrent integration M-Pesa refund",
                    items: [{ sale_item_id: mpesaSaleItemId, quantity: 1 }],
                }),
            })
        ));
        assert.deepEqual(
            concurrentReturnRequests.map((response) => response.status).sort(),
            [201, 400],
            "Concurrent return requests must reserve no more than the sold quantity",
        );
        const successfulReturnResponse = concurrentReturnRequests.find((response) => response.status === 201);
        assert.ok(successfulReturnResponse);
        const mpesaReturnRequestBody = await successfulReturnResponse.json() as IntegrationApiObject;
        createdMpesaReturnRequestId = mpesaReturnRequestBody.request.id;

        const shiftBeforeMpesaRefundApproval = await AppDataSource.getRepository(Shift).findOneByOrFail({
            id: openedShift.id,
        });
        const concurrentApprovals = await Promise.all([1, 2].map(() =>
            fetch(`http://127.0.0.1:${port}/api/admin/returns/approve/${createdMpesaReturnRequestId}`, {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ refund_method: "mpesa" }),
            })
        ));
        assert.deepEqual(
            concurrentApprovals.map((response) => response.status).sort(),
            [200, 400],
            "Concurrent approvals must apply one inventory and refund reversal",
        );
        const pendingMpesaRefund = await AppDataSource.getRepository(ReturnRequest).findOneByOrFail({
            id: createdMpesaReturnRequestId,
        });
        assert.equal(pendingMpesaRefund.mpesa_refund_status, MpesaRefundStatus.PENDING);
        assert.equal(Number(pendingMpesaRefund.mpesa_refund_amount), 18);
        const mpesaReversalEntry = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: createdMpesaSaleId,
            reference_type: "SALE_VOID",
        });
        const mpesaReversalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: mpesaReversalEntry.id },
            relations: ["account"],
        });
        assert.ok(mpesaReversalLines.some((line) =>
            line.account.code === "2400" && Number(line.credit) === 18
        ), "Approving an M-Pesa refund must create a payable, not record an uncompleted payout");
        assert.ok(!mpesaReversalLines.some((line) => line.account.code === "1010" && Number(line.credit) > 0));
        const shiftAfterMpesaRefundApproval = await AppDataSource.getRepository(Shift).findOneByOrFail({
            id: openedShift.id,
        });
        assert.equal(
            Number(shiftAfterMpesaRefundApproval.mpesa_total),
            Number(shiftBeforeMpesaRefundApproval.mpesa_total),
            "Approval without payout confirmation must not reduce the shift M-Pesa total",
        );

        const mpesaRefundReceipt = `RFD${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
        const mpesaPayoutConfirmationUrl = `http://127.0.0.1:${port}/api/admin/returns/${createdMpesaReturnRequestId}/mpesa-payout`;
        const mpesaPayoutConfirmationResponse = await fetch(mpesaPayoutConfirmationUrl, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ receipt_number: mpesaRefundReceipt }),
        });
        assert.equal(mpesaPayoutConfirmationResponse.status, 200, "Successful Safaricom payout should be recorded");
        const shiftAfterMpesaPayout = await AppDataSource.getRepository(Shift).findOneByOrFail({
            id: openedShift.id,
        });
        assert.equal(
            Number(shiftAfterMpesaPayout.mpesa_total),
            Number(shiftBeforeMpesaRefundApproval.mpesa_total) - 18,
            "Shift M-Pesa totals should change only after payout confirmation",
        );
        const settledMpesaRefund = await AppDataSource.getRepository(ReturnRequest).findOneByOrFail({
            id: createdMpesaReturnRequestId,
        });
        assert.equal(settledMpesaRefund.mpesa_refund_status, MpesaRefundStatus.COMPLETED);
        assert.equal(settledMpesaRefund.mpesa_refund_receipt, mpesaRefundReceipt);

        const payoutJournalEntries = await AppDataSource.getRepository(JournalEntry).findBy({
            reference_id: createdMpesaReturnRequestId,
            reference_type: "MPESA_REFUND_PAYOUT",
        });
        assert.equal(payoutJournalEntries.length, 1);
        const payoutJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: payoutJournalEntries[0].id },
            relations: ["account"],
        });
        assert.ok(payoutJournalLines.some((line) =>
            line.account.code === "2400" && Number(line.debit) === 18
        ));
        assert.ok(payoutJournalLines.some((line) =>
            line.account.code === "1010" && Number(line.credit) === 18
        ));

        const repeatedPayoutConfirmation = await fetch(mpesaPayoutConfirmationUrl, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ receipt_number: mpesaRefundReceipt.toLowerCase() }),
        });
        assert.equal(repeatedPayoutConfirmation.status, 200, "An identical payout retry must be idempotently acknowledged");
        const conflictingPayoutConfirmation = await fetch(mpesaPayoutConfirmationUrl, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ receipt_number: `ALT${randomUUID().replace(/-/g, "").slice(0, 10)}` }),
        });
        assert.equal(conflictingPayoutConfirmation.status, 409, "A different receipt must not replace a completed payout");

        const unresolvedMpesaTransaction = await AppDataSource.getRepository(MpesaTransaction).save(
            AppDataSource.getRepository(MpesaTransaction).create({
                cashier_id: adminUserId,
                sale_id: null,
                checkout_session_id: null,
                transaction_code: `PENDING-CLOSE-${randomUUID()}`,
                phone_number: "254700000001",
                amount: 10,
                status: "pending",
            }),
        );
        createdUnresolvedMpesaTransactionId = unresolvedMpesaTransaction.id;
        const missingActualCashResponse = await fetch(`http://127.0.0.1:${port}/api/shifts/${openedShift.id}/close`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        assert.equal(missingActualCashResponse.status, 400, "Shift close must require a physical cash count");
        assert.match((await missingActualCashResponse.json() as IntegrationApiObject).error, /actual_cash is required/i);
        const shiftAfterMissingCash = await AppDataSource.getRepository(Shift).findOneByOrFail({ id: openedShift.id });
        assert.equal(shiftAfterMissingCash.status, "open", "A missing cash count must not close the shift");
        const blockedCloseResponse = await fetch(`http://127.0.0.1:${port}/api/shifts/${openedShift.id}/close`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ actual_cash: 136 }),
        });
        assert.equal(blockedCloseResponse.status, 409);
        assert.match((await blockedCloseResponse.json() as IntegrationApiObject).message, /resolve pending m-pesa payments/i);
        const stillOpenShift = await AppDataSource.getRepository(Shift).findOneByOrFail({ id: openedShift.id });
        assert.equal(stillOpenShift.status, "open");
        await AppDataSource.getRepository(MpesaTransaction).delete({ id: unresolvedMpesaTransaction.id });
        createdUnresolvedMpesaTransactionId = "";

        const closeShiftResponse = await fetch(`http://127.0.0.1:${port}/api/shifts/${openedShift.id}/close`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ actual_cash: 136 }),
        });
        assert.equal(closeShiftResponse.status, 200, "Cashier should be able to close the shift");
        const closedShift = (await closeShiftResponse.json() as IntegrationApiObject).shift;
        assert.equal(
            closedShift.expected_cash,
            151.11,
            "Cash refunds must reduce expected cash by the recorded discounted refund, not gross item value",
        );
        assert.equal(closedShift.mpesa_total, 18, "Shift M-Pesa totals must include only confirmed payouts as refunds");

        const vendor = await AppDataSource.getRepository(Vendor).save(
            AppDataSource.getRepository(Vendor).create({
                name: `Integration Vendor ${randomUUID().slice(0, 8)}`,
                email: `vendor-${randomUUID().slice(0, 8)}@example.com`,
            })
        );
        createdVendorId = vendor.id;

        const purchaseOrderResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                vendor_id: vendor.id,
                warehouse_id: receivingWarehouse.id,
                items: [{ product_id: createdProduct.id, quantity: 5, unit_cost: 10 }],
            }),
        });
        assert.equal(purchaseOrderResponse.status, 201, "Admin should be able to create a purchase order");
        const createdPurchaseOrder = (await purchaseOrderResponse.json()) as IntegrationApiObject;
        createdPurchaseOrderId = createdPurchaseOrder.id;

        const bypassReceiptStatusResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPurchaseOrderId}/status`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "received" }),
        });
        assert.equal(bypassReceiptStatusResponse.status, 400, "PO must not be marked received without processing a goods receipt");

        const draftReceiveResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    po_item_id: createdPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 1,
                    rejected_quantity: 0,
                }],
            }),
        });
        assert.equal(draftReceiveResponse.status, 400, "Draft PO must not receive goods before it is sent");

        const sentStatusResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPurchaseOrderId}/status`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "sent" }),
        });
        assert.equal(sentStatusResponse.status, 200, "Purchase order should transition to sent");

        const duplicateLineReceiveResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [1, 2].map(() => ({
                    po_item_id: createdPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 3,
                    rejected_quantity: 0,
                })),
            }),
        });
        assert.equal(duplicateLineReceiveResponse.status, 400, "Duplicate receipt lines must be validated against their cumulative quantity");
        const stockAfterDuplicateLineReceive = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(stockAfterDuplicateLineReceive.stock_on_hand, 10, "Rejected duplicate receipt lines must not change stock");

        const excessiveReceiveResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    po_item_id: createdPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 6,
                    rejected_quantity: 0,
                }],
            }),
        });
        assert.equal(excessiveReceiveResponse.status, 400, "Receiving more than the ordered quantity must be rejected as invalid input");
        const excessiveReceiveBody = (await excessiveReceiveResponse.json()) as IntegrationApiObject;
        assert.equal(excessiveReceiveBody.message, "Receiving quantities exceed the purchase order");
        const stockAfterRejectedReceive = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(stockAfterRejectedReceive.stock_on_hand, 10, "Rejected receipt must not change stock");

        const receiveResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    po_item_id: createdPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 5,
                    rejected_quantity: 0,
                    batch_number: "INTEGRATION-BATCH-01",
                    manufacturing_date: "2026-01-01",
                    expiry_date: "2027-01-01",
                    supplier_batch_reference: "SUPPLIER-BATCH-01",
                    environmental_conditions: "Cool and dry",
                }],
            }),
        });
        assert.equal(receiveResponse.status, 200, "Receiving a valid purchase-order quantity should succeed");
        const receivedOrder = (await receiveResponse.json()) as IntegrationApiObject;
        assert.equal(receivedOrder.po.status, "received");

        const replenishedProduct = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(replenishedProduct.stock_on_hand, 15, "Receiving five units should replenish stock after both confirmed M-Pesa sales");

        const receivedWarehouseStock = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: createdProduct.id,
        });
        assert.equal(receivedWarehouseStock.stock_on_hand, 15, "Receiving a PO must replenish its destination warehouse");

        const receivedDeliveryNote = await AppDataSource.getRepository(DeliveryNote).findOneOrFail({
            where: { po_id: createdPurchaseOrderId },
            relations: ["items"],
        });
        assert.equal(receivedDeliveryNote.items[0].batch_number, "INTEGRATION-BATCH-01");
        assert.equal(new Date(receivedDeliveryNote.items[0].expiry_date).toISOString().slice(0, 10), "2027-01-01");
        const deliveryNotesResponse = await fetch(`http://127.0.0.1:${port}/api/delivery-notes`, { headers: tokenHeader });
        assert.equal(deliveryNotesResponse.status, 200);
        const deliveryNotes = await deliveryNotesResponse.json() as IntegrationApiObject[];
        assert.ok(deliveryNotes.some((note) => note.id === receivedDeliveryNote.id));
        const deliveryNoteDetailsResponse = await fetch(`http://127.0.0.1:${port}/api/delivery-notes/${receivedDeliveryNote.id}`, {
            headers: tokenHeader,
        });
        assert.equal(deliveryNoteDetailsResponse.status, 200);
        const deliveryNoteDetails = await deliveryNoteDetailsResponse.json() as IntegrationApiObject;
        assert.equal(deliveryNoteDetails.items.length, 1);
        assert.equal(deliveryNoteDetails.items[0].received_quantity, 5);

        const receiptMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            reference_type: "delivery_note",
            reference_id: receivedDeliveryNote.id,
            product_id: createdProduct.id,
        });
        assert.equal(receiptMovement.movement_type, "purchase_receipt");
        assert.equal(receiptMovement.quantity, 5);
        assert.equal(receiptMovement.quantity_before, 10);
        assert.equal(receiptMovement.quantity_after, 15);
        const receivedProductBatch = await AppDataSource.getRepository(ProductBatch).findOneByOrFail({
            po_id: createdPurchaseOrderId,
            batch_number: "INTEGRATION-BATCH-01",
        });
        assert.equal(new Date(receivedProductBatch.manufacturing_date).toISOString().slice(0, 10), "2026-01-01");
        assert.equal(receivedProductBatch.supplier_batch_reference, "SUPPLIER-BATCH-01");
        assert.equal(receivedProductBatch.environmental_conditions, "Cool and dry");
        const invoicePayload = {
            vendor_id: vendor.id,
            po_id: createdPurchaseOrderId,
            delivery_note_id: receivedDeliveryNote.id,
            invoice_date: "2026-10-02",
            due_date: "2026-11-01",
        };
        const discrepancyInvoiceResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...invoicePayload,
                invoice_number: `INV-DISCREPANCY-${randomUUID()}`,
                subtotal: 49,
                tax_amount: 0,
                total_amount: 49,
            }),
        });
        assert.equal(discrepancyInvoiceResponse.status, 201);
        const discrepancyInvoice = (await discrepancyInvoiceResponse.json() as IntegrationApiObject).invoice;
        createdSupplierInvoiceIds.push(discrepancyInvoice.id);
        assert.equal(discrepancyInvoice.status, InvoiceStatus.DISCREPANCY);

        const blockedPaymentResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices/${discrepancyInvoice.id}/payments`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ amount: 10, payment_method: "bank_transfer" }),
        });
        assert.equal(blockedPaymentResponse.status, 409, "Discrepant supplier invoices must not be paid");
        assert.equal(await AppDataSource.getRepository(SupplierPayment).countBy({ supplier_invoice_id: discrepancyInvoice.id }), 0);

        const matchedInvoiceResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...invoicePayload,
                invoice_number: `INV-MATCHED-${randomUUID()}`,
                subtotal: 50,
                tax_amount: 0,
                total_amount: 50,
            }),
        });
        assert.equal(matchedInvoiceResponse.status, 201);
        const matchedInvoice = (await matchedInvoiceResponse.json() as IntegrationApiObject).invoice;
        createdSupplierInvoiceIds.push(matchedInvoice.id);
        assert.equal(matchedInvoice.status, InvoiceStatus.MATCHED, "Invoice matching must compare against the received GRN value, not the full PO value");

        const duplicateGrnInvoiceResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...invoicePayload,
                invoice_number: `INV-DUPLICATE-GRN-${randomUUID()}`,
                subtotal: 50,
                tax_amount: 0,
                total_amount: 50,
            }),
        });
        assert.equal(duplicateGrnInvoiceResponse.status, 409, "A GRN must not be matched to a second payable supplier invoice");
        assert.equal(await AppDataSource.getRepository(SupplierInvoice).countBy({
            delivery_note_id: receivedDeliveryNote.id,
            status: InvoiceStatus.MATCHED,
        }), 1);

        const duplicateInvoiceResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                ...invoicePayload,
                invoice_number: matchedInvoice.invoice_number.toLowerCase(),
                subtotal: 50,
                tax_amount: 0,
                total_amount: 50,
            }),
        });
        assert.equal(duplicateInvoiceResponse.status, 409, "A vendor's invoice number must not be recorded twice, regardless of case");

        const partialPaymentResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices/${matchedInvoice.id}/payments`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ amount: 20, payment_method: "bank_transfer" }),
        });
        assert.equal(partialPaymentResponse.status, 201);
        const partialPaymentResult = await partialPaymentResponse.json() as IntegrationApiObject;
        createdSupplierPaymentIds.push(partialPaymentResult.payment.id);
        assert.equal(partialPaymentResult.invoice.balance_due, 30);

        const paymentJournalEntry = await AppDataSource.getRepository(JournalEntry).findOneByOrFail({
            reference_id: partialPaymentResult.payment.id,
            reference_type: "SUPPLIER_PAYMENT",
        });
        const paymentJournalLines = await AppDataSource.getRepository(JournalLine).find({
            where: { journal_entry_id: paymentJournalEntry.id },
            relations: ["account"],
        });
        assert.equal(paymentJournalLines.reduce((sum, line) => sum + Number(line.debit), 0), 20);
        assert.equal(paymentJournalLines.reduce((sum, line) => sum + Number(line.credit), 0), 20);
        assert.ok(paymentJournalLines.some((line) => line.account.code === "2000" && Number(line.debit) === 20));
        assert.ok(paymentJournalLines.some((line) => line.account.code === "1000" && Number(line.credit) === 20));

        const finalPaymentResponse = await fetch(`http://127.0.0.1:${port}/api/procurement/supplier-invoices/${matchedInvoice.id}/payments`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ amount: 30, payment_method: "bank_transfer" }),
        });
        assert.equal(finalPaymentResponse.status, 201);
        const finalPaymentResult = await finalPaymentResponse.json() as IntegrationApiObject;
        createdSupplierPaymentIds.push(finalPaymentResult.payment.id);
        assert.equal(finalPaymentResult.invoice.status, InvoiceStatus.PAID);
        assert.equal(finalPaymentResult.invoice.balance_due, 0);

        const rejectedPurchaseOrderResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                vendor_id: vendor.id,
                warehouse_id: receivingWarehouse.id,
                items: [{ product_id: createdProduct.id, quantity: 2, unit_cost: 10 }],
            }),
        });
        assert.equal(rejectedPurchaseOrderResponse.status, 201);
        const rejectedPurchaseOrder = await rejectedPurchaseOrderResponse.json() as IntegrationApiObject;
        createdRejectedPurchaseOrderId = rejectedPurchaseOrder.id;
        const sendRejectedPurchaseOrderResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdRejectedPurchaseOrderId}/status`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "sent" }),
        });
        assert.equal(sendRejectedPurchaseOrderResponse.status, 200);
        const stockBeforeRejectedGoods = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        const rejectAllGoodsResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdRejectedPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    po_item_id: rejectedPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 0,
                    rejected_quantity: 2,
                    rejection_reason: "Failed quality check",
                }],
            }),
        });
        assert.equal(rejectAllGoodsResponse.status, 200, "A rejected-only delivery should be recorded");
        const rejectedReceipt = await AppDataSource.getRepository(DeliveryNote).findOne({
            where: { po_id: createdRejectedPurchaseOrderId },
            relations: ["items"],
        });
        assert.ok(rejectedReceipt);
        assert.equal(rejectedReceipt.total_items, 0);
        assert.equal(rejectedReceipt.items[0].rejected_quantity, 2);
        assert.equal(rejectedReceipt.items[0].rejection_reason, "Failed quality check");
        const stockAfterRejectedGoods = await AppDataSource.getRepository(Product).findOneByOrFail({ id: createdProduct.id });
        assert.equal(stockAfterRejectedGoods.stock_on_hand, stockBeforeRejectedGoods.stock_on_hand);

        const receivingShiftResponse = await fetch(`http://127.0.0.1:${port}/api/shifts/open`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ opening_float: 0 }),
        });
        assert.equal(receivingShiftResponse.status, 201);
        const warehouseSaleResponse = await fetch(`http://127.0.0.1:${port}/api/sales`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{ product_id: createdProduct.id, quantity: 1 }],
                payment_method: "cash",
                cash_amount: 18,
                warehouse_id: receivingWarehouse.id,
                idempotency_key: `warehouse-receipt-sale-${randomUUID()}`,
            }),
        });
        assert.equal(warehouseSaleResponse.status, 201, "Received stock must be available to sell from the destination warehouse");
        const warehouseSaleBody = await warehouseSaleResponse.json() as IntegrationApiObject;
        createdWarehouseReceiptSaleId = warehouseSaleBody.id;
        const saleMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            reference_type: "sale",
            reference_id: createdWarehouseReceiptSaleId,
            product_id: createdProduct.id,
        });
        assert.equal(saleMovement.movement_type, "sale");
        assert.equal(saleMovement.quantity, -1);
        assert.equal(saleMovement.quantity_before, 15);
        assert.equal(saleMovement.quantity_after, 14);
        const remainingWarehouseStock = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: createdProduct.id,
        });
        assert.equal(remainingWarehouseStock.stock_on_hand, 14);

        const stockTakeResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/stock-takes`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ warehouse_id: receivingWarehouse.id, notes: "Integration complete-count control" }),
        });
        assert.equal(stockTakeResponse.status, 201);
        const stockTake = await stockTakeResponse.json() as IntegrationApiObject;
        createdStockTakeId = stockTake.id;
        assert.equal(stockTake.items.length, 1);

        const incompleteCompletionResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/stock-takes/${stockTake.id}/complete`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        assert.equal(incompleteCompletionResponse.status, 400, "Stock takes with uncounted lines must not close");
        const incompleteCompletionBody = await incompleteCompletionResponse.json() as IntegrationApiObject;
        assert.equal(incompleteCompletionBody.message, "Every stock-take item must be counted before completion");

        const saveStockTakeCountsResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/stock-takes/${stockTake.id}/items`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ items: [{ id: stockTake.items[0].id, counted_quantity: 13 }] }),
        });
        assert.equal(saveStockTakeCountsResponse.status, 200);

        const completeStockTakeResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/stock-takes/${stockTake.id}/complete`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        assert.equal(completeStockTakeResponse.status, 200, "A fully counted stock take should complete");
        const unchangedStock = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: createdProduct.id,
        });
        assert.equal(unchangedStock.stock_on_hand, 13, "A stocktake discrepancy must reconcile the warehouse balance");
        const stockTakeAdjustment = await AppDataSource.getRepository(InventoryAdjustment).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            reason: `Stock Take ${stockTake.id} Discrepancy`,
        });
        const stockTakeMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            product_id: createdProduct.id,
            movement_type: "adjustment_out",
            reference_type: "adjustment",
            reference_id: stockTakeAdjustment.id,
        });
        assert.equal(stockTakeMovement.quantity, -1);
        assert.equal(stockTakeMovement.quantity_before, 14);
        assert.equal(stockTakeMovement.quantity_after, 13);

        const editCompletedStockTakeResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/stock-takes/${stockTake.id}/items`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ items: [{ id: stockTake.items[0].id, counted_quantity: 12 }] }),
        });
        assert.equal(editCompletedStockTakeResponse.status, 400, "Completed stock takes must reject count edits");
        const completedStockTake = await AppDataSource.getRepository(StockTake).findOneOrFail({
            where: { id: stockTake.id },
            relations: ["items"],
        });
        assert.equal(completedStockTake.items[0].counted_quantity, 13, "Rejected edits must preserve the audited count");

        const repeatStockTakeCompletionResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/stock-takes/${stockTake.id}/complete`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({}),
        });
        assert.equal(repeatStockTakeCompletionResponse.status, 400, "Completed stock takes must not be reconciled twice");
        assert.equal(
            await AppDataSource.getRepository(InventoryAdjustment).countBy({
                warehouse_id: receivingWarehouse.id,
                reason: `Stock Take ${stockTake.id} Discrepancy`,
            }),
            1,
            "A repeated completion must not create duplicate adjustments",
        );

        const manualAdjustmentResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/adjustment`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                product_id: createdProduct.id,
                warehouse_id: receivingWarehouse.id,
                type: "damage",
                quantity_adjusted: -1,
                reason: "Integration damaged unit",
            }),
        });
        assert.equal(manualAdjustmentResponse.status, 201);
        const manualAdjustment = await manualAdjustmentResponse.json() as IntegrationApiObject;
        const manualAdjustmentMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            product_id: createdProduct.id,
            movement_type: "damaged",
            reference_type: "adjustment",
            reference_id: manualAdjustment.id,
        });
        assert.equal(manualAdjustmentMovement.quantity, -1);
        assert.equal(manualAdjustmentMovement.quantity_before, 13);
        assert.equal(manualAdjustmentMovement.quantity_after, 12);

        const transferWarehouse = await AppDataSource.getRepository(Warehouse).save(
            AppDataSource.getRepository(Warehouse).create({
                name: `Integration Transfer Destination ${randomUUID().slice(0, 8)}`,
                location_address: "Integration test",
                is_main: false,
                is_active: true,
            })
        );
        createdTransferWarehouseId = transferWarehouse.id;
        const transferCreateResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/transfer`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                product_id: createdProduct.id,
                from_warehouse_id: receivingWarehouse.id,
                to_warehouse_id: transferWarehouse.id,
                quantity: 1,
            }),
        });
        assert.equal(transferCreateResponse.status, 201);
        const transfer = await transferCreateResponse.json() as IntegrationApiObject;
        const transferCompleteResponse = await fetch(`http://127.0.0.1:${port}/api/inventory/transfer/${transfer.id}/status`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed" }),
        });
        assert.equal(transferCompleteResponse.status, 200);
        const transferMovements = await AppDataSource.getRepository(StockMovement).findBy({
            product_id: createdProduct.id,
            reference_type: "transfer",
            reference_id: transfer.id,
        });
        assert.equal(transferMovements.length, 2);
        assert.ok(transferMovements.some((movement) => movement.movement_type === "transfer_out" && movement.quantity === -1 && movement.quantity_before === 12 && movement.quantity_after === 11));
        assert.ok(transferMovements.some((movement) => movement.movement_type === "transfer_in" && movement.quantity === 1 && movement.quantity_before === 0 && movement.quantity_after === 1));

        const partialPurchaseOrderResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                vendor_id: vendor.id,
                warehouse_id: receivingWarehouse.id,
                items: [{ product_id: createdProduct.id, quantity: 2, unit_cost: 10 }],
            }),
        });
        assert.equal(partialPurchaseOrderResponse.status, 201);
        const partialPurchaseOrder = await partialPurchaseOrderResponse.json() as IntegrationApiObject;
        assert.equal(partialPurchaseOrder.items.length, 1);
        assert.equal(partialPurchaseOrder.items[0].quantity, 2);
        createdPartialPurchaseOrderId = partialPurchaseOrder.id;
        const sendPartialPurchaseOrderResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPartialPurchaseOrderId}/status`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "sent" }),
        });
        assert.equal(sendPartialPurchaseOrderResponse.status, 200);

        const stockBeforePartialReceipt = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: createdProduct.id,
        });
        const firstPartialReceiptResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPartialPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    po_item_id: partialPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 1,
                    rejected_quantity: 0,
                }],
            }),
        });
        assert.equal(firstPartialReceiptResponse.status, 200);
        const firstPartialReceipt = await firstPartialReceiptResponse.json() as IntegrationApiObject;
        assert.equal(firstPartialReceipt.po.status, "partially_received");
        const persistedAfterFirstPartialReceipt = await AppDataSource.getRepository(PurchaseOrder).findOne({
            where: { id: createdPartialPurchaseOrderId },
            relations: ["items"],
        });
        assert.equal(persistedAfterFirstPartialReceipt?.items[0].id, partialPurchaseOrder.items[0].id);
        assert.equal(persistedAfterFirstPartialReceipt?.items[0].received_quantity, 1);
        const stockAfterFirstPartialReceipt = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: createdProduct.id,
        });
        assert.equal(stockAfterFirstPartialReceipt.stock_on_hand, stockBeforePartialReceipt.stock_on_hand + 1);

        const secondPartialReceiptResponse = await fetch(`http://127.0.0.1:${port}/api/purchase-orders/${createdPartialPurchaseOrderId}/receive`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({
                items: [{
                    po_item_id: partialPurchaseOrder.items[0].id,
                    product_id: createdProduct.id,
                    receiving_quantity: 1,
                    rejected_quantity: 0,
                }],
            }),
        });
        assert.equal(secondPartialReceiptResponse.status, 200);
        const completedPartialReceipt = await secondPartialReceiptResponse.json() as IntegrationApiObject;
        const persistedPartialPurchaseOrder = await AppDataSource.getRepository(PurchaseOrder).findOne({
            where: { id: createdPartialPurchaseOrderId },
            relations: ["items"],
        });
        assert.equal(persistedPartialPurchaseOrder?.items[0].received_quantity, 2);
        assert.equal(persistedPartialPurchaseOrder?.status, "received");
        assert.equal(completedPartialReceipt.po.status, "received");
        const partialDeliveryNotes = await AppDataSource.getRepository(DeliveryNote).find({
            where: { po_id: createdPartialPurchaseOrderId },
        });
        assert.equal(partialDeliveryNotes.length, 2);
        const partialReceiptMovements = await AppDataSource.getRepository(StockMovement).find({
            where: partialDeliveryNotes.map((deliveryNote) => ({
                product_id: createdProduct.id,
                reference_type: "delivery_note",
                reference_id: deliveryNote.id,
            })),
        });
        assert.equal(partialReceiptMovements.length, 2);
        assert.equal(partialReceiptMovements.reduce((sum, movement) => sum + movement.quantity, 0), 2);

        const importedSku = `BULK-${Date.now()}-${randomUUID().slice(0, 6)}`;
        const incompleteSku = `BULK-INVALID-${randomUUID().slice(0, 6)}`;
        createdImportedProductSku = importedSku;
        const importForm = new FormData();
        importForm.append(
            "file",
            new Blob([
                `sku,name,unit_cost,retail_price,tax_rate,reorder_level,stock_on_hand,warehouse_name\n${importedSku},"Bulk, Imported Product",5,9,0,2,7,"${receivingWarehouse.name}"\n${importedSku},Duplicate SKU,5,9,0,2,0,\n${incompleteSku},Missing Price,5,,0,2,0,\n`,
            ], { type: "text/csv" }),
            "products.csv",
        );
        const importResponse = await fetch(`http://127.0.0.1:${port}/api/products/import`, {
            method: "POST",
            headers: tokenHeader,
            body: importForm,
        });
        assert.equal(importResponse.status, 201, "CSV product import should return HTTP 201");
        const importResult = await importResponse.json() as IntegrationApiObject;
        assert.equal(importResult.created, 1);
        assert.equal(importResult.skipped, 2);
        assert.equal(importResult.errors.length, 2);
        assert.match(importResult.errors[0], /Row 3/);
        assert.match(importResult.errors[1], /Row 4/);

        const importedProduct = await AppDataSource.getRepository(Product).findOneByOrFail({ sku: importedSku });
        assert.equal(importedProduct.name, "Bulk, Imported Product");
        assert.equal(importedProduct.stock_on_hand, 7);
        const importedStockMovement = await AppDataSource.getRepository(StockMovement).findOneByOrFail({
            product_id: importedProduct.id,
            movement_type: "initial_stock",
            reference_type: "initial",
            reference_id: importedProduct.id,
        });
        assert.equal(importedStockMovement.quantity, 7);
        const importedWarehouseStock = await AppDataSource.getRepository(WarehouseStock).findOneByOrFail({
            warehouse_id: receivingWarehouse.id,
            product_id: importedProduct.id,
        });
        assert.equal(importedWarehouseStock.stock_on_hand, 7);
        assert.equal(await AppDataSource.getRepository(Product).findOneBy({ sku: incompleteSku }), null);

        const unsupportedImportForm = new FormData();
        unsupportedImportForm.append("file", new Blob(["not a supported import"], { type: "text/plain" }), "products.txt");
        const unsupportedImportResponse = await fetch(`http://127.0.0.1:${port}/api/products/import`, {
            method: "POST",
            headers: tokenHeader,
            body: unsupportedImportForm,
        });
        assert.equal(unsupportedImportResponse.status, 400);
        assert.match((await unsupportedImportResponse.json() as IntegrationApiObject).message, /CSV and Excel files are allowed/i);

        const oversizedImportForm = new FormData();
        oversizedImportForm.append(
            "file",
            new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "text/csv" }),
            "oversized.csv",
        );
        const oversizedImportResponse = await fetch(`http://127.0.0.1:${port}/api/products/import`, {
            method: "POST",
            headers: tokenHeader,
            body: oversizedImportForm,
        });
        assert.equal(oversizedImportResponse.status, 413);
        assert.match((await oversizedImportResponse.json() as IntegrationApiObject).message, /5 MB or smaller/i);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("PostgreSQL API serves a concurrent authenticated read burst without rejecting valid traffic", async () => {
    const server = app.listen(0);
    await once(server, "listening");

    try {
        const port = (server.address() as AddressInfo).port;
        const token = jwt.sign(
            { id: adminUserId, email: adminEmail, role: AppRole.ADMIN },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" },
        );
        const startedAt = Date.now();
        const responses = await Promise.all(
            Array.from({ length: 150 }, () =>
                fetch(`http://127.0.0.1:${port}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ),
        );
        const durationMs = Date.now() - startedAt;
        const statuses = responses.map((response) => response.status);

        assert.deepEqual(
            statuses.filter((status) => status !== 200),
            [],
            `Expected 150 concurrent authenticated reads to succeed; got statuses ${statuses.join(",")}`,
        );
        assert.ok(durationMs < 30000, `Concurrent read burst took ${durationMs}ms`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
});

test("cashiers can only retrieve their own parked sales", async () => {
    const server = app.listen(0);
    await once(server, "listening");
    const cashierRepository = AppDataSource.getRepository(User);
    const saleRepository = AppDataSource.getRepository(Sale);
    let owner: InstanceType<typeof User> | undefined;
    let ownerParkedSale: InstanceType<typeof Sale> | undefined;
    let otherParkedSale: InstanceType<typeof Sale> | undefined;

    try {
        owner = await cashierRepository.save(cashierRepository.create({
            email: `parked-owner-${randomUUID()}@example.test`,
            password_hash: "integration-test",
            role: AppRole.CASHIER,
        }));
        ownerParkedSale = await saleRepository.save(saleRepository.create({
            cashier: owner,
            subtotal: 0,
            tax_amount: 0,
            total_amount: 0,
            payment_method: PaymentMethod.CASH,
            status: SaleStatus.PARKED,
        }));
        otherParkedSale = await saleRepository.save(saleRepository.create({
            cashier: AppDataSource.getRepository(User).create({ id: adminUserId }),
            subtotal: 0,
            tax_amount: 0,
            total_amount: 0,
            payment_method: PaymentMethod.CASH,
            status: SaleStatus.PARKED,
        }));

        const token = jwt.sign(
            { id: owner.id, email: owner.email, role: AppRole.CASHIER },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" },
        );
        const response = await fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sales/parked`,
            { headers: { Authorization: `Bearer ${token}` } },
        );

        assert.equal(response.status, 200);
        const parkedSales = await response.json() as Array<{ id: string }>;
        assert.ok(parkedSales.some((sale) => sale.id === ownerParkedSale?.id));
        assert.ok(parkedSales.every((sale) => sale.id !== otherParkedSale?.id));
    } finally {
        if (ownerParkedSale) await saleRepository.delete({ id: ownerParkedSale.id });
        if (otherParkedSale) await saleRepository.delete({ id: otherParkedSale.id });
        if (owner) await cashierRepository.delete({ id: owner.id });
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("parking a sale with a missing product leaves no partial parked sale", async () => {
    const server = app.listen(0);
    await once(server, "listening");
    const cashierRepository = AppDataSource.getRepository(User);
    const saleRepository = AppDataSource.getRepository(Sale);
    let cashier: InstanceType<typeof User> | undefined;

    try {
        cashier = await cashierRepository.save(cashierRepository.create({
            email: `parked-invalid-${randomUUID()}@example.test`,
            password_hash: "integration-test",
            role: AppRole.CASHIER,
        }));
        const token = jwt.sign(
            { id: cashier.id, email: cashier.email, role: AppRole.CASHIER },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" },
        );
        const parkedCountBefore = await saleRepository.count({
            where: { cashier: { id: cashier.id }, status: SaleStatus.PARKED },
        });
        const response = await fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sales/park`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    items: [{ product_id: randomUUID(), quantity: 1 }],
                }),
            },
        );

        assert.equal(response.status, 400);
        assert.match((await response.json() as IntegrationApiObject).message, /product .* not found/i);
        assert.equal(
            await saleRepository.count({
                where: { cashier: { id: cashier.id }, status: SaleStatus.PARKED },
            }),
            parkedCountBefore,
        );
    } finally {
        if (cashier) await cashierRepository.delete({ id: cashier.id });
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("parked sales retain the product's configured tax rate", async () => {
    const server = app.listen(0);
    await once(server, "listening");
    const cashierRepository = AppDataSource.getRepository(User);
    const categoryRepository = AppDataSource.getRepository(Category);
    const taxClassRepository = AppDataSource.getRepository(TaxClass);
    const productRepository = AppDataSource.getRepository(Product);
    const saleRepository = AppDataSource.getRepository(Sale);
    let cashier: InstanceType<typeof User> | undefined;
    let category: InstanceType<typeof Category> | undefined;
    let taxClass: InstanceType<typeof TaxClass> | undefined;
    let product: InstanceType<typeof Product> | undefined;
    let parkedSaleId = "";

    try {
        cashier = await cashierRepository.save(cashierRepository.create({
            email: `parked-tax-${randomUUID()}@example.test`,
            password_hash: "integration-test",
            role: AppRole.CASHIER,
        }));
        category = await categoryRepository.save(categoryRepository.create({
            name: `Parked Tax Category ${randomUUID()}`,
        }));
        taxClass = await taxClassRepository.save(taxClassRepository.create({
            name: `Parked Tax Class ${randomUUID()}`,
            rate: 16,
            is_default: false,
        }));
        product = await productRepository.save(productRepository.create({
            sku: `PARKED-TAX-${randomUUID()}`,
            name: "Parked Tax Product",
            category,
            unit_cost: 50,
            retail_price: 100,
            tax_class: taxClass,
            tax_rate: 0,
            stock_on_hand: 5,
        }));

        const token = jwt.sign(
            { id: cashier.id, email: cashier.email, role: AppRole.CASHIER },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" },
        );
        const headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
        const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const createResponse = await fetch(`${baseUrl}/api/sales/park`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                items: [{ product_id: product.id, quantity: 2 }],
                customer_id: null,
                warehouse_id: "",
                loyalty_discount: 20,
            }),
        });
        assert.equal(createResponse.status, 201);
        const createdSale = await createResponse.json() as {
            id: string;
            subtotal: number;
            tax_amount: number;
            total_amount: number;
            loyalty_discount: number;
            items: Array<{ unit_price: number; tax_rate: number; line_total: number }>;
        };
        parkedSaleId = createdSale.id;
        assert.equal(Number(createdSale.subtotal), 200);
        assert.equal(Number(createdSale.tax_amount), 32);
        assert.equal(Number(createdSale.total_amount), 212);
        assert.equal(Number(createdSale.loyalty_discount), 20);
        assert.equal(Number(createdSale.items[0].unit_price), 100);
        assert.equal(Number(createdSale.items[0].tax_rate), 16);
        assert.equal(Number(createdSale.items[0].line_total), 200);

        const listResponse = await fetch(`${baseUrl}/api/sales/parked`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(listResponse.status, 200);
        const parkedSales = await listResponse.json() as Array<{
            id: string;
            items: Array<{ tax_rate: number }>;
        }>;
        const restoredSale = parkedSales.find((sale) => sale.id === parkedSaleId);
        assert.ok(restoredSale);
        assert.equal(Number(restoredSale.items[0].tax_rate), 16);
    } finally {
        if (parkedSaleId) await saleRepository.delete({ id: parkedSaleId });
        if (product) await productRepository.delete({ id: product.id });
        if (taxClass) await taxClassRepository.delete({ id: taxClass.id });
        if (category) await categoryRepository.delete({ id: category.id });
        if (cashier) await cashierRepository.delete({ id: cashier.id });
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("admin can create a customer through the API business flow", async () => {
    const server = app.listen(0);
    await once(server, "listening");

    try {
        const port = (server.address() as AddressInfo).port;
        const token = jwt.sign(
            { id: adminUserId, email: adminEmail, role: AppRole.ADMIN },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
        );

        const customerPhone = `+2547${Math.floor(Math.random() * 9000000 + 1000000)}`;
        const customerPayload = {
            name: "Workflow Customer",
            phone: customerPhone,
            email: `customer-${Date.now()}@example.com`,
        };
        createdCustomerPhone = customerPhone;

        const response = await fetch(`http://127.0.0.1:${port}/api/customers`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(customerPayload),
        });

        assert.equal(response.status, 201, "Customer creation should return HTTP 201");
        const createdCustomer = (await response.json()) as IntegrationApiObject;
        assert.equal(createdCustomer.name, customerPayload.name);
        assert.equal(createdCustomer.phone, customerPayload.phone);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("user can register, verify login OTP, and access their profile", async () => {
    const server = app.listen(0);
    await once(server, "listening");
    let capturedOtp = "";
    let otpDeliveryEnabled = false;

    EmailService.sendOtpEmail = async (_email, otpCode) => {
        if (!otpDeliveryEnabled) {
            return false;
        }
        capturedOtp = otpCode;
        return true;
    };

    try {
        const port = (server.address() as AddressInfo).port;
        const publicRegistrationResponse = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: registeredAuthEmail,
                password: "IntegrationPass123!",
                full_name: "Integration Auth User",
            }),
        });
        assert.equal(publicRegistrationResponse.status, 403, "Public registration must be disabled (returns 403)");

        const adminToken = jwt.sign(
            { id: adminUserId, email: adminEmail, role: AppRole.ADMIN },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
        );
        const adminCreateResponse = await fetch(`http://127.0.0.1:${port}/api/users`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
                email: registeredAuthEmail,
                password: "IntegrationPass123!",
                full_name: "Integration Auth User",
                role: AppRole.CASHIER,
            }),
        });
        assert.equal(adminCreateResponse.status, 201, "Admin should create the user via POST /api/users");

        const failedDeliveryResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: registeredAuthEmail, password: "IntegrationPass123!" }),
        });
        assert.equal(failedDeliveryResponse.status, 503, "Failed OTP delivery must not start an authenticated session");
        const failedDeliveryBody = (await failedDeliveryResponse.json()) as IntegrationApiObject;
        assert.equal(failedDeliveryBody.otp_token, undefined);
        assert.match(failedDeliveryBody.message, /OTP email|email provider/i);
        const registeredUser = await AppDataSource.getRepository(User).findOneByOrFail({ email: registeredAuthEmail });
        const activeOtps = await AppDataSource.getRepository(OtpCode).countBy({ user_id: registeredUser.id, is_used: false });
        assert.equal(activeOtps, 0, "OTP from a failed delivery must be invalidated");

        otpDeliveryEnabled = true;
        const loginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: registeredAuthEmail, password: "IntegrationPass123!" }),
        });
        assert.equal(loginResponse.status, 200, "Valid credentials should start OTP verification");
        const loginBody = (await loginResponse.json()) as IntegrationApiObject;
        assert.equal(loginBody.requires_otp, true);
        assert.match(capturedOtp, /^\d{6}$/);

        const invalidCode = capturedOtp === "999999" ? "000000" : "999999";
        const invalidOtpResponse = await fetch(`http://127.0.0.1:${port}/api/auth/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ otp_token: loginBody.otp_token, code: invalidCode }),
        });
        assert.equal(invalidOtpResponse.status, 400, "Invalid OTP must be rejected");

        const verifyResponse = await fetch(`http://127.0.0.1:${port}/api/auth/verify-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ otp_token: loginBody.otp_token, code: capturedOtp }),
        });
        assert.equal(verifyResponse.status, 200, "Valid OTP should complete authentication");
        const verifiedSession = (await verifyResponse.json()) as IntegrationApiObject;
        assert.equal(verifiedSession.user.email, registeredAuthEmail);
        assert.equal(verifiedSession.user.role, "cashier");

        const setCookieHeader = verifyResponse.headers.get("set-cookie") || "";
        assert.match(setCookieHeader, /jwt_token=/i, "OTP verification must set the jwt_token cookie");
        assert.match(setCookieHeader, /HttpOnly/i, "Session cookie must have HttpOnly flag");
        assert.match(setCookieHeader, /Path=\//i, "Session cookie must have Path=/");

        // Extract cookie string for cookie-only authentication test
        const cookieMatch = /(?:^|;\s*)(jwt_token=[^;]+)/.exec(setCookieHeader);
        assert.ok(cookieMatch, "Must be able to extract cookie string");
        const cookieString = cookieMatch[1];

        // 1. Authenticate with Cookie alone (no Authorization header) - matches real frontend behavior
        const cookieOnlyProfileResponse = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
            headers: { Cookie: cookieString },
        });
        assert.equal(cookieOnlyProfileResponse.status, 200, "Cookie authentication without Authorization header must succeed");
        const cookieOnlyProfile = (await cookieOnlyProfileResponse.json()) as IntegrationApiObject;
        assert.equal(cookieOnlyProfile.profile.full_name, "Integration Auth User");

        // 2. Verified access token Authorization header fallback also works
        const profileResponse = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
            headers: { Authorization: `Bearer ${verifiedSession.token}` },
        });
        assert.equal(profileResponse.status, 200, "Verified access token should authorize profile access");
        const profileBody = (await profileResponse.json()) as IntegrationApiObject;
        assert.equal(profileBody.profile.full_name, "Integration Auth User");

        // 3. Logout clears cookie
        const logoutResponse = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
            method: "POST",
            headers: { Cookie: cookieString },
        });
        assert.equal(logoutResponse.status, 200);
        const logoutSetCookie = logoutResponse.headers.get("set-cookie") || "";
        assert.match(logoutSetCookie, /jwt_token=;/i, "Logout must clear the jwt_token cookie");

        // 4. Test configured COOKIE_DOMAIN and COOKIE_SAMESITE in real HTTP verification flow
        const originalCookieDomain = process.env.COOKIE_DOMAIN;
        const originalCookieSameSite = process.env.COOKIE_SAMESITE;
        try {
            process.env.COOKIE_DOMAIN = ".pos.example.co.ke";
            process.env.COOKIE_SAMESITE = "none";

            const crossSiteLoginResponse = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: registeredAuthEmail, password: "IntegrationPass123!" }),
            });
            assert.equal(crossSiteLoginResponse.status, 200);
            const crossSiteLoginBody = (await crossSiteLoginResponse.json()) as IntegrationApiObject;

            const crossSiteVerifyResponse = await fetch(`http://127.0.0.1:${port}/api/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ otp_token: crossSiteLoginBody.otp_token, code: capturedOtp }),
            });
            assert.equal(crossSiteVerifyResponse.status, 200);
            const crossSiteSetCookie = crossSiteVerifyResponse.headers.get("set-cookie") || "";
            assert.match(crossSiteSetCookie, /Domain=\.pos\.example\.co\.ke/i, "Configured COOKIE_DOMAIN must be present");
            assert.match(crossSiteSetCookie, /SameSite=None/i, "Configured COOKIE_SAMESITE=none must be present");
            assert.match(crossSiteSetCookie, /Secure/i, "SameSite=None must enforce Secure flag");
        } finally {
            if (originalCookieDomain !== undefined) {
                process.env.COOKIE_DOMAIN = originalCookieDomain;
            } else {
                delete process.env.COOKIE_DOMAIN;
            }
            if (originalCookieSameSite !== undefined) {
                process.env.COOKIE_SAMESITE = originalCookieSameSite;
            } else {
                delete process.env.COOKIE_SAMESITE;
            }
        }
    } finally {
        EmailService.sendOtpEmail = originalSendOtpEmail;
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("main warehouse can be transferred but cannot be unset", async () => {
    const server = app.listen(0);
    await once(server, "listening");
    const warehouseRepository = AppDataSource.getRepository(Warehouse);
    const originalMain = await warehouseRepository.findOneBy({ is_main: true });
    const createdBaselineWarehouse = !originalMain;
    const baselineWarehouse = originalMain ?? await warehouseRepository.save(warehouseRepository.create({
        name: "Integration Baseline Warehouse",
        location_address: "Test",
        is_main: true,
        is_active: true,
    }));
    const token = jwt.sign(
        { id: adminUserId, email: adminEmail, role: AppRole.ADMIN },
        process.env.JWT_SECRET as string,
        { expiresIn: "1h" }
    );
    const tokenHeader = { Authorization: `Bearer ${token}` };
    const createdWarehouseIds: string[] = [];

    try {
        const firstResponse = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/warehouses`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ name: `Integration Main A ${randomUUID()}`, is_main: true }),
        });
        assert.equal(firstResponse.status, 201);
        const firstWarehouse = await firstResponse.json() as { id: string };
        createdWarehouseIds.push(firstWarehouse.id);
        assert.equal((await warehouseRepository.findOneByOrFail({ id: baselineWarehouse.id })).is_main, false);

        const secondResponse = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/warehouses`, {
            method: "POST",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ name: `Integration Main B ${randomUUID()}`, is_main: true }),
        });
        assert.equal(secondResponse.status, 201);
        const secondWarehouse = await secondResponse.json() as { id: string };
        createdWarehouseIds.push(secondWarehouse.id);

        const concurrentResponses = await Promise.all([1, 2].map((index) => fetch(
            `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/warehouses`,
            {
                method: "POST",
                headers: { ...tokenHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ name: `Integration Concurrent Main ${index} ${randomUUID()}`, is_main: true }),
            }
        )));
        assert.deepEqual(concurrentResponses.map((response) => response.status), [201, 201]);
        const concurrentWarehouses = await Promise.all(
            concurrentResponses.map((response) => response.json() as Promise<{ id: string }>)
        );
        createdWarehouseIds.push(...concurrentWarehouses.map((warehouse) => warehouse.id));

        const mainWarehouses = await warehouseRepository.findBy({ is_main: true });
        assert.equal(mainWarehouses.length, 1, "Concurrent promotions must leave exactly one main warehouse");
        assert.ok(concurrentWarehouses.some((warehouse) => warehouse.id === mainWarehouses[0].id));

        const unsetMainResponse = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/warehouses/${mainWarehouses[0].id}`, {
            method: "PUT",
            headers: { ...tokenHeader, "Content-Type": "application/json" },
            body: JSON.stringify({ is_main: false }),
        });
        assert.equal(unsetMainResponse.status, 400);
        assert.equal((await warehouseRepository.findOneByOrFail({ id: mainWarehouses[0].id })).is_main, true);
    } finally {
        await AppDataSource.transaction(async (manager) => {
            await manager.update(Warehouse, { is_main: true }, { is_main: false });
            if (originalMain) {
                await manager.update(Warehouse, { id: baselineWarehouse.id }, { is_main: true });
            } else if (createdBaselineWarehouse) {
                await manager.delete(Warehouse, { id: baselineWarehouse.id });
            }
            if (createdWarehouseIds.length > 0) {
                await manager.delete(Warehouse, createdWarehouseIds);
            }
        });
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
    }
});

test("main warehouse migration retains one existing primary and can be reverted", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `warehouse_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`
            CREATE TABLE "warehouses" (
                "id" uuid PRIMARY KEY,
                "created_at" timestamptz NOT NULL,
                "is_main" boolean NOT NULL
            )
        `);
        await queryRunner.query(`
            INSERT INTO "warehouses" ("id", "created_at", "is_main") VALUES
                ('00000000-0000-0000-0000-000000000001', '2026-01-01T00:00:00Z', true),
                ('00000000-0000-0000-0000-000000000002', '2026-01-02T00:00:00Z', true)
        `);

        const migration = new EnforceSingleMainWarehouse1790920000000();
        await migration.up(queryRunner);
        const mainWarehouses = await queryRunner.query(`SELECT "id" FROM "warehouses" WHERE "is_main" = true`);
        assert.deepEqual(mainWarehouses.map((warehouse: { id: string }) => warehouse.id), ["00000000-0000-0000-0000-000000000001"]);

        const indexRows = await queryRunner.query(
            "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2",
            [schemaName, "IDX_warehouses_single_main"]
        );
        assert.equal(indexRows.length, 1, "Migration must add the unique main-warehouse index");

        await migration.down(queryRunner);
        const revertedIndexes = await queryRunner.query(
            "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2",
            [schemaName, "IDX_warehouses_single_main"]
        );
        assert.equal(revertedIndexes.length, 0, "Migration rollback must remove the unique index");
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("purchase-order warehouse migration backfills legacy orders and can be reverted", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `po_warehouse_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`
            CREATE TABLE "warehouses" (
                "id" uuid PRIMARY KEY,
                "name" text NOT NULL,
                "is_main" boolean NOT NULL,
                "is_active" boolean NOT NULL,
                "created_at" timestamptz NOT NULL
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "purchase_orders" (
                "id" uuid PRIMARY KEY
            )
        `);
        await queryRunner.query(`
            INSERT INTO "warehouses" ("id", "name", "is_main", "is_active", "created_at") VALUES
                ('00000000-0000-0000-0000-000000000010', 'Inactive Main', true, false, '2026-01-01T00:00:00Z'),
                ('00000000-0000-0000-0000-000000000011', 'Active Main', true, true, '2026-01-02T00:00:00Z')
        `);
        await queryRunner.query(`INSERT INTO "purchase_orders" ("id") VALUES ('00000000-0000-0000-0000-000000000020')`);

        const migration = new AddPurchaseOrderReceivingWarehouse1790928000000();
        await migration.up(queryRunner);
        const backfilledOrders = await queryRunner.query(`SELECT "warehouse_id" FROM "purchase_orders"`);
        assert.deepEqual(backfilledOrders.map((order: { warehouse_id: string }) => order.warehouse_id), ["00000000-0000-0000-0000-000000000011"]);

        const warehouseForeignKeys = await queryRunner.query(
            `SELECT constraint_name FROM information_schema.table_constraints
             WHERE table_schema = $1 AND table_name = 'purchase_orders' AND constraint_name = 'FK_purchase_orders_warehouse'`,
            [schemaName]
        );
        assert.equal(warehouseForeignKeys.length, 1);

        await migration.down(queryRunner);
        const remainingColumns = await queryRunner.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = 'purchase_orders' AND column_name = 'warehouse_id'`,
            [schemaName]
        );
        assert.equal(remainingColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("supplier invoice uniqueness migration rejects legacy duplicates and can be reverted", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `supplier_invoice_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`
            CREATE TABLE "supplier_invoices" (
                "id" uuid PRIMARY KEY,
                "vendor_id" uuid NOT NULL,
                "invoice_number" text NOT NULL
            )
        `);
        await queryRunner.query(`
            INSERT INTO "supplier_invoices" ("id", "vendor_id", "invoice_number") VALUES
                ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000041', ' inv-100 '),
                ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000041', 'INV-100')
        `);

        const migration = new EnforceUniqueSupplierInvoiceNumber1790930000000();
        await queryRunner.query("SAVEPOINT duplicate_invoice_rows");
        await assert.rejects(migration.up(queryRunner), /Duplicate supplier invoice numbers/);
        await queryRunner.query("ROLLBACK TO SAVEPOINT duplicate_invoice_rows");

        await queryRunner.query(`DELETE FROM "supplier_invoices" WHERE "id" = '00000000-0000-0000-0000-000000000032'`);
        await migration.up(queryRunner);
        const normalizedInvoice = await queryRunner.query(`SELECT "invoice_number" FROM "supplier_invoices"`);
        assert.equal(normalizedInvoice[0].invoice_number, "INV-100");

        const indexes = await queryRunner.query(
            "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2",
            [schemaName, "IDX_supplier_invoice_vendor_number"]
        );
        assert.equal(indexes.length, 1);

        await migration.down(queryRunner);
        const revertedIndexes = await queryRunner.query(
            "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = $2",
            [schemaName, "IDX_supplier_invoice_vendor_number"]
        );
        assert.equal(revertedIndexes.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("stock movement ledger migration is repeatable and preserves recorded history on rollback", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `stock_movement_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid PRIMARY KEY)`);
        await queryRunner.query(`INSERT INTO "products" ("id") VALUES ('00000000-0000-0000-0000-000000000051')`);

        const migration = new CreateStockMovementLedger1790936000000();
        await migration.up(queryRunner);
        await migration.up(queryRunner);
        const indexes = await queryRunner.query(
            "SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2",
            [schemaName, "stock_movements"]
        );
        assert.equal(indexes.length, 4, "The repeatable migration should create one table and its three indexes");

        await queryRunner.query(`
            INSERT INTO "stock_movements" (
                "product_id", "movement_type", "quantity", "quantity_before", "quantity_after",
                "reference_type", "created_by"
            ) VALUES (
                '00000000-0000-0000-0000-000000000051', 'initial_stock', 1, 0, 1,
                'initial', '00000000-0000-0000-0000-000000000052'
            )
        `);
        await assert.rejects(migration.down(queryRunner), /history is retained/);
        const retainedRows = await queryRunner.query(`SELECT count(*)::integer AS count FROM "stock_movements"`);
        assert.equal(retainedRows[0].count, 1, "Rollback must not discard movement history");
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("durable checkout and Paybill migrations enforce references and can be reverted", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `payment_checkout_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid PRIMARY KEY)`);
        await queryRunner.query(`CREATE TABLE "warehouses" ("id" uuid PRIMARY KEY)`);
        await queryRunner.query(`CREATE TABLE "customers" ("id" uuid PRIMARY KEY)`);
        await queryRunner.query(`
            CREATE TABLE "mpesa_transactions" (
                "id" uuid PRIMARY KEY,
                "status" character varying NOT NULL DEFAULT 'pending',
                "mpesa_receipt_number" character varying,
                "transaction_code" character varying NOT NULL,
                "phone_number" character varying NOT NULL,
                "amount" numeric(10,2) NOT NULL
            )
        `);
        await queryRunner.query(`
            INSERT INTO "users" ("id") VALUES ('00000000-0000-4000-8000-000000000101');
            INSERT INTO "warehouses" ("id") VALUES ('00000000-0000-4000-8000-000000000102');
            INSERT INTO "customers" ("id") VALUES ('00000000-0000-4000-8000-000000000103')
        `);

        const mpesaCheckoutMigration = new AddMpesaCheckoutSessions1791000000000();
        const checkoutSessionMigration = new CreatePaymentCheckoutSessions1791010000000();
        const paybillReferencesMigration = new AddMpesaPaybillReferences1791020000000();
        await mpesaCheckoutMigration.up(queryRunner);
        await checkoutSessionMigration.up(queryRunner);
        await paybillReferencesMigration.up(queryRunner);
        await mpesaCheckoutMigration.up(queryRunner);
        await checkoutSessionMigration.up(queryRunner);
        await paybillReferencesMigration.up(queryRunner);

        const checkoutSessionId = "00000000-0000-4000-8000-000000000104";
        await queryRunner.query(`
            INSERT INTO "payment_checkout_sessions" (
                "id", "cashier_id", "warehouse_id", "customer_id", "store_credit_barcode", "items",
                "subtotal", "tax_amount", "total_amount"
            ) VALUES ($1, $2, $3, $4, 'SC-TEST-0001', '[]'::jsonb, 10, 0, 10)
        `, [
            checkoutSessionId,
            "00000000-0000-4000-8000-000000000101",
            "00000000-0000-4000-8000-000000000102",
            "00000000-0000-4000-8000-000000000103",
        ]);
        const persistedStoreCreditBarcode = await queryRunner.query(
            `SELECT "store_credit_barcode" FROM "payment_checkout_sessions" WHERE "id" = $1`,
            [checkoutSessionId],
        );
        assert.equal(persistedStoreCreditBarcode[0].store_credit_barcode, "SC-TEST-0001");
        await queryRunner.query(`
            INSERT INTO "mpesa_transactions" (
                "id", "cashier_id", "checkout_session_id", "transaction_code",
                "phone_number", "amount", "status", "account_reference", "mpesa_receipt_number"
            ) VALUES (
                '00000000-0000-4000-8000-000000000105',
                '00000000-0000-4000-8000-000000000101',
                $1, 'C2B_FIRST', '254712345678', 10, 'completed', 'POSREFERENCE001', 'RECEIPT001'
            )
        `, [checkoutSessionId]);

        await queryRunner.query("SAVEPOINT duplicate_account_reference");
        await assert.rejects(queryRunner.query(`
            INSERT INTO "mpesa_transactions" (
                "id", "transaction_code", "phone_number", "amount", "account_reference"
            ) VALUES (
                '00000000-0000-4000-8000-000000000106',
                'C2B_DUPLICATE_REFERENCE', '254712345679', 10, 'POSREFERENCE001'
            )
        `), /duplicate key|unique/i);
        await queryRunner.query("ROLLBACK TO SAVEPOINT duplicate_account_reference");

        await queryRunner.query("SAVEPOINT duplicate_mpesa_receipt");
        await assert.rejects(queryRunner.query(`
            INSERT INTO "mpesa_transactions" (
                "id", "transaction_code", "phone_number", "amount", "mpesa_receipt_number"
            ) VALUES (
                '00000000-0000-4000-8000-000000000107',
                'C2B_DUPLICATE_RECEIPT', '254712345680', 10, 'RECEIPT001'
            )
        `), /duplicate key|unique/i);
        await queryRunner.query("ROLLBACK TO SAVEPOINT duplicate_mpesa_receipt");

        const checkoutForeignKeys = await queryRunner.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_schema = $1
              AND table_name = 'payment_checkout_sessions'
              AND constraint_type = 'FOREIGN KEY'
        `, [schemaName]);
        assert.equal(checkoutForeignKeys.length, 3, "Checkout session ownership and reference constraints must be present");

        await paybillReferencesMigration.down(queryRunner);
        await checkoutSessionMigration.down(queryRunner);
        await mpesaCheckoutMigration.down(queryRunner);

        const remainingCheckoutTable = await queryRunner.query(
            `SELECT to_regclass($1) AS relation`,
            [`${schemaName}.payment_checkout_sessions`],
        );
        assert.equal(remainingCheckoutTable[0].relation, null);
        const remainingMpesaColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'mpesa_transactions'
              AND column_name IN ('cashier_id', 'checkout_session_id', 'account_reference')
        `, [schemaName]);
        assert.equal(remainingMpesaColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("sale store-credit source migration is repeatable and reversible", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `sale_store_credit_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "sales" ("id" uuid PRIMARY KEY)`);

        const migration = new AddSaleStoreCreditBarcode1791030000000();
        await migration.up(queryRunner);
        await migration.up(queryRunner);

        const migratedColumn = await queryRunner.query(`
            SELECT character_maximum_length, is_nullable
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'sales'
              AND column_name = 'store_credit_barcode'
        `, [schemaName]);
        assert.equal(migratedColumn.length, 1);
        assert.equal(migratedColumn[0].character_maximum_length, 20);
        assert.equal(migratedColumn[0].is_nullable, "YES");

        await migration.down(queryRunner);
        const remainingColumn = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'sales'
              AND column_name = 'store_credit_barcode'
        `, [schemaName]);
        assert.equal(remainingColumn.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("M-Pesa refund migration tracks legacy payouts and prevents receipt reuse", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `mpesa_refund_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid PRIMARY KEY)`);
        await queryRunner.query(`CREATE TABLE "return_requests" (
            "id" uuid PRIMARY KEY,
            "status" varchar NOT NULL,
            "refund_method" varchar NOT NULL
        )`);
        await queryRunner.query(`CREATE TABLE "sale_items" (
            "id" uuid PRIMARY KEY,
            "line_total" numeric(10,2) NOT NULL,
            "quantity" integer NOT NULL,
            "tax_rate" numeric(5,2) NOT NULL
        )`);
        await queryRunner.query(`CREATE TABLE "return_items" (
            "return_request_id" uuid NOT NULL,
            "sale_item_id" uuid NOT NULL,
            "quantity" integer NOT NULL
        )`);
        await queryRunner.query(`
            INSERT INTO "return_requests" ("id", "status", "refund_method")
            VALUES ('00000000-0000-4000-8000-000000000201', 'approved', 'mpesa'),
                   ('00000000-0000-4000-8000-000000000202', 'approved', 'mpesa')
        `);
        await queryRunner.query(`
            INSERT INTO "sale_items" ("id", "line_total", "quantity", "tax_rate")
            VALUES ('00000000-0000-4000-8000-000000000203', 20, 2, 10)
        `);
        await queryRunner.query(`
            INSERT INTO "return_items" ("return_request_id", "sale_item_id", "quantity")
            VALUES ('00000000-0000-4000-8000-000000000201',
                    '00000000-0000-4000-8000-000000000203', 1)
        `);

        const migration = new AddMpesaRefundSettlement1791030000001();
        await migration.up(queryRunner);
        await migration.up(queryRunner);

        const legacyRefund = await queryRunner.query(`
            SELECT "mpesa_refund_status", "mpesa_refund_amount"
            FROM "return_requests"
            WHERE "id" = '00000000-0000-4000-8000-000000000201'
        `);
        assert.equal(legacyRefund[0].mpesa_refund_status, "pending");
        assert.equal(Number(legacyRefund[0].mpesa_refund_amount), 11);

        await queryRunner.query("SAVEPOINT duplicate_refund_receipt");
        await queryRunner.query(`
            UPDATE "return_requests"
            SET "mpesa_refund_receipt" = 'RFD12345678'
            WHERE "id" = '00000000-0000-4000-8000-000000000201'
        `);
        await assert.rejects(queryRunner.query(`
            UPDATE "return_requests"
            SET "mpesa_refund_receipt" = 'RFD12345678'
            WHERE "id" = '00000000-0000-4000-8000-000000000202'
        `), /duplicate key|unique/i);
        await queryRunner.query("ROLLBACK TO SAVEPOINT duplicate_refund_receipt");

        await migration.down(queryRunner);
        const remainingColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'return_requests'
              AND column_name LIKE 'mpesa_refund_%'
        `, [schemaName]);
        assert.equal(remainingColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("credit-note eTIMS migration adds signing fields idempotently and can be reverted", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `credit_note_etims_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "credit_notes" ("id" uuid PRIMARY KEY)`);

        const migration = new AddCreditNoteEtimsFields1791040000000();
        await migration.up(queryRunner);
        await migration.up(queryRunner);

        const addedColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'credit_notes'
              AND column_name IN ('etims_note_no', 'etims_qr_code', 'etims_signature')
        `, [schemaName]);
        assert.equal(addedColumns.length, 3);

        await migration.down(queryRunner);
        const remainingColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'credit_notes'
              AND column_name IN ('etims_note_no', 'etims_qr_code', 'etims_signature')
        `, [schemaName]);
        assert.equal(remainingColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("credit-note return link migration is repeatable and reversible", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `credit_note_return_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "return_requests" (
            "id" uuid PRIMARY KEY,
            "sale_id" uuid NOT NULL,
            "reason" text NOT NULL,
            "status" varchar NOT NULL
        )`);
        await queryRunner.query(`CREATE TABLE "credit_notes" (
            "id" uuid PRIMARY KEY,
            "sale_id" uuid NOT NULL,
            "reason" text NOT NULL
        )`);

        const migration = new LinkCreditNotesToReturns1791040000001();
        await queryRunner.query(`
            INSERT INTO "return_requests" ("id", "sale_id", "reason", "status")
            VALUES ('00000000-0000-4000-8000-000000000301',
                    '00000000-0000-4000-8000-000000000303', 'Unique legacy return', 'approved')
        `);
        await queryRunner.query(`
            INSERT INTO "credit_notes" ("id", "sale_id", "reason")
            VALUES ('00000000-0000-4000-8000-000000000302',
                    '00000000-0000-4000-8000-000000000303', 'Unique legacy return')
        `);
        await migration.up(queryRunner);
        await migration.up(queryRunner);

        const linkedLegacyCreditNote = await queryRunner.query(`
            SELECT "return_request_id"
            FROM "credit_notes"
            WHERE "id" = '00000000-0000-4000-8000-000000000302'
        `);
        assert.equal(linkedLegacyCreditNote[0].return_request_id, "00000000-0000-4000-8000-000000000301");

        await migration.down(queryRunner);
        const remainingColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'credit_notes'
              AND column_name = 'return_request_id'
        `, [schemaName]);
        assert.equal(remainingColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("one-open-shift migration rejects existing duplicates and is repeatable", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `one_open_shift_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "shifts" (
            "id" uuid PRIMARY KEY,
            "cashier_id" uuid NOT NULL,
            "status" varchar NOT NULL
        )`);
        await queryRunner.query(`
            INSERT INTO "shifts" ("id", "cashier_id", "status")
            VALUES ('00000000-0000-4000-8000-000000000401',
                    '00000000-0000-4000-8000-000000000402', 'open'),
                   ('00000000-0000-4000-8000-000000000403',
                    '00000000-0000-4000-8000-000000000402', 'open')
        `);

        const migration = new EnforceOneOpenShiftPerCashier1791050000000();
        await queryRunner.query("SAVEPOINT duplicate_open_shifts");
        await assert.rejects(
            migration.up(queryRunner),
            /Multiple open shifts exist for a cashier/i,
        );
        await queryRunner.query("ROLLBACK TO SAVEPOINT duplicate_open_shifts");
        await queryRunner.query(`
            DELETE FROM "shifts"
            WHERE "id" = '00000000-0000-4000-8000-000000000403'
        `);
        await migration.up(queryRunner);
        await migration.up(queryRunner);

        await queryRunner.query("SAVEPOINT duplicate_open_shift");
        await assert.rejects(queryRunner.query(`
            INSERT INTO "shifts" ("id", "cashier_id", "status")
            VALUES ('00000000-0000-4000-8000-000000000404',
                    '00000000-0000-4000-8000-000000000402', 'open')
        `), /duplicate key|unique/i);
        await queryRunner.query("ROLLBACK TO SAVEPOINT duplicate_open_shift");
        await migration.down(queryRunner);

        const indexes = await queryRunner.query(`
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = $1
              AND indexname = 'IDX_shifts_one_open_per_cashier'
        `, [schemaName]);
        assert.equal(indexes.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("sale-item unit-cost migration backfills legacy costs idempotently", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `sale_item_cost_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "products" (
            "id" uuid PRIMARY KEY,
            "unit_cost" numeric(10,2) NOT NULL
        )`);
        await queryRunner.query(`CREATE TABLE "sale_items" (
            "id" uuid PRIMARY KEY,
            "product_id" uuid NOT NULL,
            "quantity" integer NOT NULL
        )`);
        await queryRunner.query(`
            INSERT INTO "products" ("id", "unit_cost")
            VALUES ('00000000-0000-4000-8000-000000000501', 12.34)
        `);
        await queryRunner.query(`
            INSERT INTO "sale_items" ("id", "product_id", "quantity")
            VALUES ('00000000-0000-4000-8000-000000000502',
                    '00000000-0000-4000-8000-000000000501', 3)
        `);

        const migration = new AddSaleItemUnitCostSnapshot1791060000000();
        await migration.up(queryRunner);
        await migration.up(queryRunner);
        const snapshot = await queryRunner.query(`
            SELECT "unit_cost", "cogs_total"
            FROM "sale_items"
            WHERE "id" = '00000000-0000-4000-8000-000000000502'
        `);
        assert.equal(Number(snapshot[0].unit_cost), 12.34);
        assert.equal(Number(snapshot[0].cogs_total), 37.02);

        await migration.down(queryRunner);
        const remainingColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'sale_items'
              AND column_name = 'unit_cost'
        `, [schemaName]);
        assert.equal(remainingColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});

test("parked-sale migration permits the parked status in the database", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
        const migration = new AllowParkedSales1791070000000();
        await migration.up(queryRunner);
        const constraints = await queryRunner.query(`
            SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint
            WHERE conrelid = 'public.sales'::regclass
              AND conname = 'sales_status_check'
        `);

        assert.equal(constraints.length, 1);
        assert.match(constraints[0].definition, /parked/);
        const enumValues = await queryRunner.query(`
            SELECT enumlabel
            FROM pg_enum
            WHERE enumtypid = to_regtype('public.sales_status_enum')
        `);
        if (enumValues.length > 0) {
            assert.ok(enumValues.some((value: { enumlabel: string }) => value.enumlabel === "parked"));
        }
    } finally {
        await queryRunner.release();
    }
});

test("mpesa mismatch handling migration creates mismatch_reason column and status index idempotently", async () => {
    const queryRunner = AppDataSource.createQueryRunner();
    const schemaName = `mpesa_mismatch_migration_${randomUUID().replace(/-/g, "")}`;
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.query(`CREATE SCHEMA "${schemaName}"`);
        await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
        await queryRunner.query(`CREATE TABLE "mpesa_transactions" (
            "id" uuid PRIMARY KEY,
            "status" varchar NOT NULL DEFAULT 'pending',
            "amount" numeric(10,2) NOT NULL
        )`);

        const migration = new AddMpesaMismatchHandling1791120000000();
        await migration.up(queryRunner);
        await migration.up(queryRunner);

        const columns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'mpesa_transactions'
              AND column_name = 'mismatch_reason'
        `, [schemaName]);
        assert.equal(columns.length, 1);

        const indexes = await queryRunner.query(`
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname = $1
              AND indexname = 'IDX_mpesa_transactions_status'
        `, [schemaName]);
        assert.equal(indexes.length, 1);

        await migration.down(queryRunner);

        const remainingColumns = await queryRunner.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = $1
              AND table_name = 'mpesa_transactions'
              AND column_name = 'mismatch_reason'
        `, [schemaName]);
        assert.equal(remainingColumns.length, 0);
    } finally {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        await queryRunner.release();
    }
});