import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { ipKeyGenerator } from "express-rate-limit";
import { createServer } from "http";
import * as jwt from "jsonwebtoken";
import { AppDataSource } from "./data-source";
import { AuthController } from "./controllers/AuthController";
import { ProductController } from "./controllers/ProductController";
import { CategoryController } from "./controllers/CategoryController";
import { SalesController } from "./controllers/SalesController";
import { CustomerController } from "./controllers/CustomerController";
import { DashboardController } from "./controllers/DashboardController";
import { VendorController } from "./controllers/VendorController";
import { PurchaseOrderController } from "./controllers/PurchaseOrderController";
import { PaymentController } from "./controllers/PaymentController";
import { CheckoutController } from "./controllers/CheckoutController";
import { WarehouseController } from "./controllers/WarehouseController";
import { InventoryController } from "./controllers/InventoryController";
import { ProcurementController } from "./controllers/ProcurementController";
import { ShiftController } from "./controllers/ShiftController";
import { ReturnController } from "./controllers/ReturnController";
import { TaxController } from "./controllers/TaxController";
import { UserAdminController } from "./controllers/UserAdminController";
import { LoyaltyController } from "./controllers/LoyaltyController";
import { InvoiceController } from "./controllers/InvoiceController";
import { ReportController } from "./controllers/ReportController";
import { StockMovementController } from "./controllers/StockMovementController";
import { InventoryPredictionController } from "./controllers/InventoryPredictionController";
import { authenticateJWT, requireRole, requireRoles } from "./middleware/auth";
import { SocketService } from "./services/SocketService";
import { CronService } from "./services/CronService";
import { AccountingService } from "./services/AccountingService";
import { WarehouseService } from "./services/WarehouseService";
import { TaxService } from "./services/TaxService";
import { AdminSetupService } from "./services/AdminSetupService";
import { getOtpEmailConfigurationIssues } from "./services/EmailService";

export const app = express();
export const httpServer = createServer(app);

if (process.env.TRUST_PROXY) {
    app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY);
}

const productImportUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const fileName = (file.originalname || "").toLowerCase();
        const isCsv = fileName.endsWith(".csv") || file.mimetype === "text/csv" || file.mimetype === "application/csv";
        const isExcel = fileName.endsWith(".xlsx") || file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        if (isCsv || isExcel) {
            cb(null, true);
            return;
        }

        cb(new Error("Only CSV and Excel files are allowed for bulk product import."));
    },
});

const companyLogoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
});

const handleCompanyLogoUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    companyLogoUpload.single("logo")(req, res, (error?: unknown) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({ message: "The company logo must be 3 MB or smaller." });
            return;
        }

        res.status(400).json({
            message: error instanceof Error ? error.message : "Unable to receive the company logo.",
        });
    });
};

const handleProductImportUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const onUploadComplete: express.NextFunction = (error?: unknown) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            res.status(413).json({ message: "The import file must be 5 MB or smaller." });
            return;
        }

        res.status(400).json({
            message: error instanceof Error ? error.message : "Only CSV and XLSX files are supported for bulk product import.",
        });
    };

    productImportUpload.single("file")(req, res, onUploadComplete);
};

const PORT = Number(process.env.PORT);

if (!process.env.JWT_SECRET) {
    console.error("FATAL: JWT_SECRET is not set. Configure it before starting the server.");
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set. Configure it before starting the server.");
    process.exit(1);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    console.error("FATAL: PORT must be configured as a valid TCP port.");
    process.exit(1);
}

export const defaultAllowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8081",
    "http://127.0.0.1:8081",
];

export const resolveAllowedCorsOrigins = (
    nodeEnv: string = process.env.NODE_ENV || "development",
    corsOriginsEnv: string = process.env.CORS_ORIGINS || "",
    frontendUrlEnv: string = process.env.FRONTEND_URL || "",
): string[] => {
    const configuredOrigins = `${corsOriginsEnv},${frontendUrlEnv}`
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (nodeEnv === "production") {
        return Array.from(new Set(configuredOrigins));
    }

    return Array.from(new Set([...defaultAllowedOrigins, ...configuredOrigins]));
};

const allowedOrigins = resolveAllowedCorsOrigins();

// Security Middlewares
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "https:", "wss:", "http://localhost:3000", "ws://localhost:3000", "http://127.0.0.1:3000", "ws://127.0.0.1:3000"],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
    frameguard: { action: "deny" },
})); // Sets secure HTTP headers including strict CSP
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
})); // Restricted CORS
app.use(express.json({
    limit: "1mb",
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
    },
}));

// Request Logging Middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Rate Limiting to prevent brute-force
interface RateLimitIdentity {
    key: string;
    authenticated: boolean;
}

type RateLimitedRequest = express.Request & { rateLimitIdentity?: RateLimitIdentity };

const attachRateLimitIdentity: express.RequestHandler = (req, _res, next) => {
    const rateLimitedRequest = req as RateLimitedRequest;
    const cookieHeader = req.headers.cookie;
    let cookieToken: string | undefined;
    if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)jwt_token=([^;]+)/);
        if (match) {
            cookieToken = decodeURIComponent(match[1]);
        }
    }
    const authorization = req.headers.authorization;
    const token = cookieToken || (authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined);
    if (token && process.env.JWT_SECRET) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (typeof decoded === "object" && typeof decoded.id === "string" && decoded.id) {
                rateLimitedRequest.rateLimitIdentity = {
                    key: `user:${decoded.id}`,
                    authenticated: true,
                };
                next();
                return;
            }
        } catch {
            // Invalid and expired tokens use the unauthenticated IP bucket.
        }
    }

    rateLimitedRequest.rateLimitIdentity = {
        key: `ip:${ipKeyGenerator(req.ip || "127.0.0.1")}`,
        authenticated: false,
    };
    next();
};

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: (req) => (req as RateLimitedRequest).rateLimitIdentity?.authenticated ? 1200 : 120,
    keyGenerator: (req) =>
        (req as RateLimitedRequest).rateLimitIdentity?.key || `ip:${ipKeyGenerator(req.ip || "127.0.0.1")}`,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
    message: "Too many requests. Please try again later.",
});
app.use("/api/", attachRateLimitIdentity, apiLimiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 10 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `login-ip:${ipKeyGenerator(req.ip || "127.0.0.1")}`,
    message: { message: "Too many login attempts. Please try again after 15 minutes." },
});

const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 20 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many OTP attempts. Please try again later.",
});

const loggingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 30 : 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `log-ip:${ipKeyGenerator(req.ip || "127.0.0.1")}`,
    message: { message: "Too many log submissions. Please try again after 15 minutes." },
});

const logPayloadSizeLimiter: express.RequestHandler = (req, res, next) => {
    const contentLength = Number(req.headers["content-length"]);
    if (contentLength && contentLength > 10 * 1024) {
        return res.status(413).json({ message: "Payload exceeds maximum allowed log size of 10KB." });
    }
    next();
};

// Root and Favicon routes to prevent browser 404s
const healthCheck = async (_req: express.Request, res: express.Response) => {
    try {
        await AppDataSource.query("SELECT 1");
        res.json({ status: "ok" });
    } catch (error) {
        console.error("Health check failed: PostgreSQL is unavailable.", error);
        res.status(503).json({ status: "unavailable" });
    }
};
app.get("/health", healthCheck);
app.get("/api/health", healthCheck);
app.get("/", (req, res) => {
    res.json({ status: "Molabs POS API is running smoothly", version: "1.0.0" });
});
app.get("/favicon.ico", (req, res) => res.status(204).end());

// Auth Routes
app.post("/api/auth/register", loginLimiter, AuthController.register);
app.post("/api/auth/login", loginLimiter, AuthController.login);
app.post("/api/auth/verify-otp", otpLimiter, AuthController.verifyOtp);
app.post("/api/auth/logout", AuthController.logout);
app.get("/api/auth/me", authenticateJWT, AuthController.getProfile);
app.post("/api/auth/change-password", authenticateJWT, loginLimiter, AuthController.changePassword);

// PWA & Security Logging Routes
app.post("/api/auth/log_application_error", logPayloadSizeLimiter, loggingLimiter, AuthController.logEvent);
app.post("/api/auth/log_security_event", logPayloadSizeLimiter, loggingLimiter, AuthController.logEvent);
app.post("/api/auth/log_pwa_security_event", logPayloadSizeLimiter, loggingLimiter, AuthController.logEvent);
app.post("/api/auth/validate_input_data", logPayloadSizeLimiter, loggingLimiter, AuthController.validateData);
app.post("/api/auth/validate_pwa_cache_integrity", logPayloadSizeLimiter, loggingLimiter, AuthController.validateCacheIntegrity);

// Product Routes
app.get("/api/categories", authenticateJWT, CategoryController.list);
app.post("/api/categories", authenticateJWT, requireRole("admin"), CategoryController.create);
app.put("/api/categories/:id", authenticateJWT, requireRole("admin"), CategoryController.update);
app.delete("/api/categories/:id", authenticateJWT, requireRole("admin"), CategoryController.delete);
app.get("/api/products", authenticateJWT, ProductController.getAllProducts);
app.get("/api/products/template", authenticateJWT, ProductController.getImportTemplate);
app.post("/api/products/import", authenticateJWT, requireRole("admin"), handleProductImportUpload, ProductController.importProducts);
app.get("/api/inventory/alerts", authenticateJWT, ProductController.getInventoryAlerts);
app.get("/api/inventory/predictions", authenticateJWT, InventoryPredictionController.getPredictions);
app.get("/api/products/:id", authenticateJWT, ProductController.getProduct);
app.post("/api/products", authenticateJWT, requireRole("admin"), ProductController.createProduct);
app.put("/api/products/:id", authenticateJWT, requireRole("admin"), ProductController.updateProduct);
app.delete("/api/products/:id", authenticateJWT, requireRole("admin"), ProductController.deleteProduct);

// Sales Routes
app.get("/api/sales", authenticateJWT, SalesController.getAllSales);
app.post("/api/sales/checkouts", authenticateJWT, requireRoles(["cashier", "admin"]), CheckoutController.reserve);
app.get("/api/sales/checkouts/:checkoutSessionId", authenticateJWT, requireRoles(["cashier", "admin"]), CheckoutController.get);
app.post("/api/sales/checkouts/:checkoutSessionId/cancel", authenticateJWT, requireRoles(["cashier", "admin"]), CheckoutController.cancel);
app.post("/api/sales", authenticateJWT, requireRoles(["cashier", "admin"]), SalesController.createSale);
app.get("/api/store-credits/:barcode", authenticateJWT, requireRoles(["cashier", "admin"]), SalesController.getStoreCreditBalance);
app.post("/api/sales/park", authenticateJWT, SalesController.parkSale);
app.get("/api/sales/parked", authenticateJWT, SalesController.getParkedSales);
app.get("/api/sales/:id", authenticateJWT, SalesController.getSaleById);

// Customer invoice and receivables routes
app.get("/api/invoices", authenticateJWT, InvoiceController.list);
app.get("/api/invoices/:invoiceId/payments", authenticateJWT, InvoiceController.listPayments);
app.post("/api/invoices/:invoiceId/payments", authenticateJWT, InvoiceController.recordPayment);
// app.post("/api/sales/:id/void", authenticateJWT, requireRole("admin"), SalesController.voidSale); // DEPRECATED: Returns now go through Return Engine

// Returns & Refunds Workflow
app.get("/api/returns/search", authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"]), ReturnController.searchReturnableSales);
app.post("/api/returns/request", authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"]), ReturnController.requestReturn);
app.get("/api/returns", authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"]), ReturnController.getAllRequests);
app.post("/api/admin/returns/approve/:id", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.approveReturn);
app.post("/api/admin/returns/:id/mpesa-payout", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.confirmMpesaRefundPayout);
app.post("/api/admin/returns/reject/:id", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.rejectReturn);
app.post("/admin/returns/approve/:id", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.approveReturn);
app.post("/admin/returns/:id/mpesa-payout", authenticateJWT, requireRoles(["supervisor", "manager", "admin"]), ReturnController.confirmMpesaRefundPayout);
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
app.get("/api/vendor-portal", authenticateJWT, VendorController.getPortalData);

// Purchase Order Routes
app.get("/api/purchase-orders", authenticateJWT, PurchaseOrderController.getAll);
app.get("/api/purchase-orders/:id", authenticateJWT, PurchaseOrderController.getById);
app.post("/api/purchase-orders", authenticateJWT, requireRole("admin"), PurchaseOrderController.create);
app.put("/api/purchase-orders/:id/status", authenticateJWT, requireRole("admin"), PurchaseOrderController.updateStatus);
app.post("/api/purchase-orders/:id/email", authenticateJWT, requireRole("admin"), PurchaseOrderController.sendEmail);
app.post("/api/purchase-orders/:id/receive", authenticateJWT, requireRole("admin"), PurchaseOrderController.receive);
app.get("/api/delivery-notes", authenticateJWT, PurchaseOrderController.getDeliveryNotes);
app.get("/api/delivery-notes/:id", authenticateJWT, PurchaseOrderController.getDeliveryNoteById);

// Procurement (Invoices & Requisitions) Routes
app.get("/api/procurement/invoices", authenticateJWT, ProcurementController.listSupplierInvoices);
app.get("/api/procurement/supplier-invoices", authenticateJWT, ProcurementController.listSupplierInvoices);
app.get("/api/procurement/supplier-invoices/:invoiceId/payments", authenticateJWT, ProcurementController.listSupplierPayments);
app.post("/api/procurement/invoice", authenticateJWT, requireRole("admin"), ProcurementController.createSupplierInvoice);
app.post("/api/procurement/invoices", authenticateJWT, requireRole("admin"), ProcurementController.createSupplierInvoice);
app.post("/api/procurement/supplier-invoices", authenticateJWT, requireRole("admin"), ProcurementController.createSupplierInvoice);
app.post("/api/procurement/supplier-invoices/:invoiceId/payments", authenticateJWT, requireRole("admin"), ProcurementController.recordSupplierPayment);
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
app.get("/api/reports/summary", authenticateJWT, ReportController.getSummary);
app.get("/api/inventory/movements", authenticateJWT, StockMovementController.list);

// Admin user management and settings
app.get("/api/users", authenticateJWT, requireRole("admin"), UserAdminController.listUsers);
app.post("/api/users", authenticateJWT, requireRole("admin"), UserAdminController.createUser);
app.put("/api/users/:id", authenticateJWT, requireRole("admin"), UserAdminController.updateUser);
app.put("/api/users/:id/role", authenticateJWT, requireRole("admin"), UserAdminController.setUserRole);
app.delete("/api/users/:id", authenticateJWT, requireRole("admin"), UserAdminController.deleteUser);

app.get("/api/settings", authenticateJWT, requireRole("admin"), LoyaltyController.getSettings);
app.get("/api/receipt-settings", authenticateJWT, LoyaltyController.getReceiptSettings);
// Branding images are public assets so browser img and receipt markup can load them directly.
app.get("/api/company-logo", LoyaltyController.getCompanyLogo);
app.post("/api/settings", authenticateJWT, requireRole("admin"), LoyaltyController.saveSettings);
app.post("/api/settings/company-logo", authenticateJWT, requireRole("admin"), handleCompanyLogoUpload, LoyaltyController.uploadCompanyLogo);
app.delete("/api/settings/company-logo", authenticateJWT, requireRole("admin"), LoyaltyController.deleteCompanyLogo);
app.get("/api/loyalty/settings", authenticateJWT, LoyaltyController.getSettings);
app.post("/api/loyalty/settings", authenticateJWT, requireRole("admin"), LoyaltyController.saveSettings);
app.get("/api/loyalty/members", authenticateJWT, LoyaltyController.getMembers);
app.post("/api/loyalty/members", authenticateJWT, requireRole("admin"), LoyaltyController.createMember);
app.post("/api/loyalty/members/:id/points", authenticateJWT, requireRole("admin"), LoyaltyController.addPoints);
app.post("/api/loyalty/members/:id/redeem", authenticateJWT, requireRole("admin"), LoyaltyController.redeemPoints);

// Inventory Discrepancy Routes
app.get("/api/inventory/adjustments", authenticateJWT, InventoryController.getAdjustments);
app.post("/api/inventory/adjustment", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.createAdjustment);
app.post("/api/inventory/adjustments", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.createAdjustment);

app.get("/api/inventory/transfers", authenticateJWT, InventoryController.getTransfers);
app.post("/api/inventory/transfer", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.createTransfer);
app.post("/api/inventory/transfers", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.createTransfer);
app.put("/api/inventory/transfer/:id/status", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.updateTransferStatus);
app.put("/api/inventory/transfers/:id/status", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.updateTransferStatus);

app.get("/api/inventory/stock-takes", authenticateJWT, InventoryController.getAllStockTakes);
app.post("/api/inventory/stock-takes", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.initiateStockTake);
app.post("/api/inventory/stock-takes/initiate", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.initiateStockTake);
app.put("/api/inventory/stock-takes/:id/items", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.updateStockTakeCounts);
app.put("/api/inventory/stock-takes/:id/counts", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.updateStockTakeCounts);
app.post("/api/inventory/stock-takes/:id/complete", authenticateJWT, requireRoles(["admin", "manager", "supervisor"]), InventoryController.completeStockTake);

// Tax Engine Routes
app.get("/api/taxes", authenticateJWT, TaxController.getAll);
app.post("/api/taxes", authenticateJWT, requireRole("admin"), TaxController.create);
app.put("/api/taxes/:id", authenticateJWT, requireRole("admin"), TaxController.update);
app.delete("/api/taxes/:id", authenticateJWT, requireRole("admin"), TaxController.delete);

// Payment Webhooks
app.post("/api/payments/mpesa/stk-push", authenticateJWT, requireRoles(["cashier", "admin"]), PaymentController.initiateMpesaStk);
app.get("/api/payments/mpesa/config", authenticateJWT, requireRoles(["cashier", "admin"]), PaymentController.getMpesaPaymentConfig);
app.post("/api/payments/mpesa/paybill-intent", authenticateJWT, requireRoles(["cashier", "admin"]), PaymentController.initiateMpesaPaybill);
app.post("/api/payments/mpesa/c2b/register", authenticateJWT, requireRole("admin"), PaymentController.registerMpesaC2bUrls);
app.get("/api/payments/mpesa/session/:checkoutSessionId", authenticateJWT, requireRoles(["cashier", "admin"]), PaymentController.getMpesaSessionStatus);
app.get("/api/payments/mpesa/:checkoutRequestId", authenticateJWT, requireRoles(["cashier", "admin"]), PaymentController.getMpesaStatus);
app.post("/api/webhooks/mpesa/callback", PaymentController.mpesaCallback);
app.post("/api/webhooks/mpesa/c2b/validation", PaymentController.mpesaC2bValidation);
app.post("/api/webhooks/mpesa/c2b/confirmation", PaymentController.mpesaC2bConfirmation);
app.post("/api/webhooks/pesapal/ipn", PaymentController.pesapalWebhook);
app.get("/api/webhooks/pesapal/ipn", PaymentController.pesapalWebhook);

// Sample protected route
app.get("/api/admin-only", authenticateJWT, requireRole("admin"), (req, res) => {
    res.json({ message: "Welcome Admin!" });
});

// Global 404 handler for API routes
app.use((req, res, next) => {
    res.status(404).json({ error: "Not Found" });
});

// Global error handler
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err instanceof Error ? err.stack : err);
    res.status(500).json({ error: "Internal Server Error" });
});

export const startServer = async () => {
    try {
        if (process.env.NODE_ENV === "production") {
            const emailConfigurationIssues = getOtpEmailConfigurationIssues();
            if (emailConfigurationIssues.length > 0) {
                throw new Error(
                    `Production email delivery is required for OTP login: ${emailConfigurationIssues.join(", ")}.`,
                );
            }
        }

        await AppDataSource.initialize();
        console.log("Database connection established.");

        await AccountingService.initChartOfAccounts(AppDataSource.manager);
        console.log("Chart of accounts initialized.");

        await WarehouseService.initDefaultWarehouse(AppDataSource.manager);

        await TaxService.initDefaultTaxClass(AppDataSource.manager);

        await AdminSetupService.initDefaultAdmin(AppDataSource.manager);

        await SocketService.init(httpServer);
        CronService.init();

        await new Promise<void>((resolve) => {
            httpServer.listen(PORT, () => {
                console.log(`Server and WebSockets listening on port ${PORT}`);
                resolve();
            });
        });
    } catch (error) {
        console.error("FATAL: API startup failed:", error);
        process.exit(1);
    }
};

if (require.main === module) {
    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`Received ${signal}; shutting down gracefully.`);
        CronService.stop();

        const forcedShutdown = setTimeout(() => {
            console.error("Graceful shutdown timed out; closing active HTTP connections.");
            httpServer.closeAllConnections();
            process.exit(1);
        }, 30000);
        forcedShutdown.unref();

        try {
            await SocketService.close();
            if (AppDataSource.isInitialized) {
                await AppDataSource.destroy();
            }
            clearTimeout(forcedShutdown);
        } catch (error) {
            console.error("Graceful shutdown failed.", error);
            process.exitCode = 1;
        }
    };

    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    process.once("SIGINT", () => void shutdown("SIGINT"));
    startServer();
}
