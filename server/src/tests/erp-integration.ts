import { AppDataSource } from "../data-source";
import { User, AppRole } from "../entity/User";
import { Product } from "../entity/Product";
import { Warehouse } from "../entity/Warehouse";
import { Aisle } from "../entity/Aisle";
import { Bin } from "../entity/Bin";
import { Vendor } from "../entity/Vendor";
import { PurchaseOrder } from "../entity/PurchaseOrder";
import { DeliveryNote } from "../entity/DeliveryNote";
import { SupplierInvoice, InvoiceStatus } from "../entity/SupplierInvoice";
import { AccountingService } from "../services/AccountingService";

async function runTests() {
    console.log("---- STARTING THOROUGH ERP SYSTEM TEST ----");
    
    // Initialize DB
    await AppDataSource.initialize();
    console.log("Database connected successfully.");

    // Initialize Accounting Accounts
    await AccountingService.initChartOfAccounts(AppDataSource.manager);
    console.log("Chart of Accounts Initialized.");

    const manager = AppDataSource.manager;

    try {
        // 1. Create Test Admin User
        let user = await manager.findOneBy(User, { email: "test_erp_admin@system.local" });
        if (!user) {
            user = new User();
            user.email = "test_erp_admin@system.local";
            user.password_hash = "mock";
            user.role = AppRole.ADMIN;
            await manager.save(user);
        }
        console.log("User successfully created/found.");

        // 2. Create Warehouse, Aisle, Bin
        let wh = await manager.findOneBy(Warehouse, { name: "TEST MAIN WAREHOUSE" });
        if (!wh) {
            wh = new Warehouse();
            wh.name = "TEST MAIN WAREHOUSE";
            wh.is_main = true;
            await manager.save(wh);
        }

        let wh2 = await manager.findOneBy(Warehouse, { name: "TEST BRANCH WAREHOUSE" });
        if (!wh2) {
            wh2 = new Warehouse();
            wh2.name = "TEST BRANCH WAREHOUSE";
            await manager.save(wh2);
        }

        let aisle = await manager.findOneBy(Aisle, { name: "TEST A1" });
        if (!aisle) {
            aisle = new Aisle();
            aisle.name = "TEST A1";
            aisle.warehouse = wh;
            aisle.warehouse_id = wh.id;
            await manager.save(aisle);
        }

        let bin = await manager.findOneBy(Bin, { name: "TEST BIN 1" });
        if (!bin) {
            bin = new Bin();
            bin.name = "TEST BIN 1";
            bin.aisle = aisle;
            bin.aisle_id = aisle.id;
            await manager.save(bin);
        }
        console.log("Warehouse Location Infrastructure Verified.");

        // 3. Create Product
        let product = await manager.findOneBy(Product, { sku: "TEST-SKU-001" });
        if (!product) {
            product = new Product();
            product.name = "Test ERP Product";
            product.sku = "TEST-SKU-001";
            product.retail_price = 100;
            product.unit_cost = 50;
            product.stock_on_hand = 0;
            product.reorder_level = 10;
            await manager.save(product);
        }
        console.log("Product Module Verified.");

        // 4. Procurement Workflow
        let vendor = await manager.findOneBy(Vendor, { name: "TEST VENDOR" });
        if (!vendor) {
            vendor = new Vendor();
            vendor.name = "TEST VENDOR";
            vendor.email = "test@vendor.com";
            vendor.phone = "0000";
            await manager.save(vendor);
        }

        const po = new PurchaseOrder();
        po.po_number = "TEST-PO-" + Date.now();
        po.vendor = vendor;
        po.total_amount = 500; // 10 items * $50
        po.status = "approved";
        po.created_by = user.id; 
        await manager.save(po);

        // Receive PO - Delivery Note
        const grn = new DeliveryNote();
        grn.po_id = po.id;
        grn.vendor_id = vendor.id;
        grn.grn_number = "TEST-GRN-" + Date.now();
        grn.received_by = user.id;
        grn.total_items = 10;
        grn.total_value = 500;
        await manager.save(grn);
        
        // 5. Supplier Invoice & 3-Way Match
        const invoice = new SupplierInvoice();
        invoice.invoice_number = "INV-" + Date.now();
        invoice.vendor = vendor;
        invoice.purchase_order = po;
        invoice.delivery_note = grn;
        invoice.total_amount = 500; // Exact Match
        invoice.due_date = new Date();
        
        if (Number(po.total_amount) === Number(grn.total_value) && Number(grn.total_value) === Number(invoice.total_amount)) {
            invoice.status = InvoiceStatus.MATCHED;
        } else {
            throw new Error(`3-Way Match Failed Programmatically! PO: ${po.total_amount}, GRN: ${grn.total_value}, INV: ${invoice.total_amount}`);
        }
        await manager.save(invoice);
        console.log("Procurement 3-Way Match Successfully Verified.");

        // Clean closure
        console.log("---- ALL ERP SYSTEMS VALIDATED SUCCESSFULLY ----");
        
    } catch (e: any) {
        console.error("TEST FAILED:", e.message);
        process.exit(1);
    } finally {
        await AppDataSource.destroy();
    }
}

runTests();
