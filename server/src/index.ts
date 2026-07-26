import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { AppDataSource } from "./data-source";
import { AuthController } from "./controllers/AuthController";
import { ProductController } from "./controllers/ProductController";
import { SalesController } from "./controllers/SalesController";
import { CustomerController } from "./controllers/CustomerController";
import { DashboardController } from "./controllers/DashboardController";
import { VendorController } from "./controllers/VendorController";
import { PurchaseOrderController } from "./controllers/PurchaseOrderController";
import { PaymentController } from "./controllers/PaymentController";
import { WarehouseController } from "./controllers/WarehouseController";
import { InventoryController } from "./controllers/InventoryController";
import { ProcurementController } from "./controllers/ProcurementController";
import { ShiftController } from "./controllers/ShiftController";
import { ReturnController } from "./controllers/ReturnController";
import { TaxController } from "./controllers/TaxController";
import { authenticateJWT, requireRole, requireRoles } from "./middleware/auth";
import { SocketService } from "./services/SocketService";
import { CronService } from "./services/CronService";

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io and Cron
SocketService.init(httpServer);
CronService.init();

const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet()); // Sets secure HTTP headers
app.use(cors({ origin: [process.env.FRONTEND_URL || "http://localhost:5173", "http://localhost:8080", "http://localhost:8081"] })); // Restricted CORS
app.use(express.json()); // Parses incoming JSON automatically

// Request Logging Middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Rate Limiting to prevent brute-force
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again after 15 minutes"
});
app.use("/api/", apiLimiter);

// Root and Favicon routes to prevent browser 404s
app.get("/", (req, res) => {
    res.json({ status: "Molabs POS API is running smoothly", version: "1.0.0" });
});
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Auth Routes
app.post("/api/auth/register", AuthController.register);
app.post("/api/auth/login", AuthController.login);
app.post("/api/auth/verify-otp", AuthController.verifyOtp);
app.get("/api/auth/me", authenticateJWT, AuthController.getProfile);

// PWA & Security Logging Routes
app.post("/api/auth/log_application_error", AuthController.logEvent);
app.post("/api/auth/log_security_event", AuthController.logEvent);
app.post("/api/auth/log_pwa_security_event", AuthController.logEvent);
app.post("/api/auth/validate_input_data", AuthController.validateData);
app.post("/api/auth/validate_pwa_cache_integrity", AuthController.validateData);

// Product Routes
app.get("/api/products", authenticateJWT, ProductController.getAllProducts);
app.get("/api/products/:id", authenticateJWT, ProductController.getProduct);
app.post("/api/products", authenticateJWT, requireRole("admin"), ProductController.createProduct);
app.put("/api/products/:id", authenticateJWT, requireRole("admin"), ProductController.updateProduct);
app.delete("/api/products/:id", authenticateJWT, requireRole("admin"), ProductController.deleteProduct);

// Sales Routes
app.get("/api/sales", authenticateJWT, SalesController.getAllSales);
app.post("/api/sales", authenticateJWT, SalesController.createSale);
app.post("/api/sales/park", authenticateJWT, SalesController.parkSale);
app.get("/api/sales/parked", authenticateJWT, SalesController.getParkedSales);
// app.post("/api/sales/:id/void", authenticateJWT, requireRole("admin"), SalesController.voidSale); // DEPRECATED: Returns now go through Return Engine

// Returns & Refunds Workflow
app.post("/api/returns/request", authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"]), ReturnController.requestReturn);
app.get("/api/returns", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.getAllRequests);
app.post("/admin/returns/approve/:id", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.approveReturn);
app.post("/admin/returns/reject/:id", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.rejectReturn);

// Customer Routes
app.get("/api/customers", authenticateJWT, CustomerController.getAllCustomers);
app.get("/api/customers/:id", authenticateJWT, CustomerController.getCustomer);
app.post("/api/customers", authenticateJWT, CustomerController.createCustomer);
app.put("/api/customers/:id", authenticateJWT, CustomerController.updateCustomer);
app.delete("/api/customers/:id", authenticateJWT, requireRole("admin"), CustomerController.deleteCustomer);

// Vendor Routes
app.get("/api/vendors", authenticateJWT, VendorController.getAllVendors);
app.get("/api/vendors/:id", authenticateJWT, VendorController.getVendor);
app.post("/api/vendors", authenticateJWT, requireRole("admin"), VendorController.createVendor);
app.put("/api/vendors/:id", authenticateJWT, requireRole("admin"), VendorController.updateVendor);
app.delete("/api/vendors/:id", authenticateJWT, requireRole("admin"), VendorController.deleteVendor);

// Purchase Order Routes
app.get("/api/purchase-orders", authenticateJWT, PurchaseOrderController.getAll);
app.get("/api/purchase-orders/:id", authenticateJWT, PurchaseOrderController.getById);
app.post("/api/purchase-orders", authenticateJWT, requireRole("admin"), PurchaseOrderController.create);
app.put("/api/purchase-orders/:id/status", authenticateJWT, requireRole("admin"), PurchaseOrderController.updateStatus);
app.post("/api/purchase-orders/:id/receive", authenticateJWT, requireRole("admin"), PurchaseOrderController.receive);

// Procurement (Invoices & Requisitions) Routes
app.post("/api/procurement/invoice", authenticateJWT, requireRole("admin"), ProcurementController.createSupplierInvoice);
app.put("/api/procurement/requisitions/:id/status", authenticateJWT, requireRole("admin"), ProcurementController.updateRequisitionStatus);

// Shift / Cash Drawer Reconciliation Routes
app.post("/api/shifts/open", authenticateJWT, ShiftController.openShift);
app.post("/api/shifts/:id/close", authenticateJWT, ShiftController.closeShift);
app.get("/api/shifts/current", authenticateJWT, ShiftController.getCurrentShift);
app.get("/api/shifts", authenticateJWT, ShiftController.getAllShifts);

// Warehouse Routes
app.get("/api/warehouses", authenticateJWT, WarehouseController.getAll);
app.post("/api/warehouses", authenticateJWT, requireRole("admin"), WarehouseController.create);
app.put("/api/warehouses/:id", authenticateJWT, requireRole("admin"), WarehouseController.update);
app.delete("/api/warehouses/:id", authenticateJWT, requireRole("admin"), WarehouseController.delete);

// Dashboard Routes
app.get("/api/dashboard/stats", authenticateJWT, DashboardController.getDashboardStats);

// Inventory Discrepancy Routes
app.get("/api/inventory/adjustments", authenticateJWT, InventoryController.getAdjustments);
app.get("/api/inventory/transfers", authenticateJWT, InventoryController.getTransfers);
app.get("/api/inventory/stock-takes", authenticateJWT, InventoryController.getAllStockTakes);
app.post("/api/inventory/stock-takes/initiate", authenticateJWT, InventoryController.initiateStockTake);
app.put("/api/inventory/stock-takes/:id/counts", authenticateJWT, InventoryController.updateStockTakeCounts);
app.post("/api/inventory/stock-takes/:id/complete", authenticateJWT, InventoryController.completeStockTake);

// Tax Engine Routes
app.get("/api/taxes", authenticateJWT, TaxController.getAll);
app.post("/api/taxes", authenticateJWT, TaxController.create);
app.put("/api/taxes/:id", authenticateJWT, TaxController.update);
app.delete("/api/taxes/:id", authenticateJWT, TaxController.delete);

// Payment Webhooks
app.post("/api/webhooks/pesapal/ipn", PaymentController.pesapalWebhook);

// Sample protected route
app.get("/api/admin-only", authenticateJWT, requireRole("admin"), (req, res) => {
    res.json({ message: "Welcome Admin!" });
});

// Global 404 handler for API routes
app.use((req, res, next) => {
    res.status(404).json({ error: "Not Found" });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal Server Error" });
});

// Initialize Database Connection and start server
AppDataSource.initialize().then(async () => {
    console.log("Database connection established smoothly and tables synchronized.");
    
    // Initialize Accounts
    const { AccountingService } = require("./services/AccountingService");
    await AccountingService.initChartOfAccounts(AppDataSource.manager);
    console.log("Chart of accounts initialized.");

    const { WarehouseService } = require("./services/WarehouseService");
    await WarehouseService.initDefaultWarehouse(AppDataSource.manager);

    const { TaxService } = require("./services/TaxService");
    await TaxService.initDefaultTaxClass(AppDataSource.manager);

    httpServer.listen(PORT, () => {
        console.log(`Server and WebSockets running on http://localhost:${PORT}`);
    });
}).catch(error => console.log("TypeORM connection error: ", error));
