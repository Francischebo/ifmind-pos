# cfi-POS Architecture & Flow Documentation

## 1. System Overview & Request Flow

cfi-POS is an enterprise retail POS system tailored for Kenyan retail stores, featuring offline resilience, Safaricom M-Pesa tender integration, Kenya Revenue Authority (KRA) eTIMS tax compliance, and double-entry accounting.

```
[ Client Browser / Mobile Till (React + Vite PWA) ]
                       |
        +--------------+--------------+
        |                             |
 [ Vercel / Nginx Proxy ]    [ ServiceWorker / IndexedDB ]
        |                    (Offline Queue & Conflict Vault)
        v
 [ Node.js 22 + Express 5 Backend (REST & Socket.IO) ]
   - Rate limiters (IP & user-keyed)
   - Helmet (strict CSP, frameguard) & CORS
   - Auth & Role Middleware (`authenticateJWT`, `requireRole`, `requireRoles`)
        |
        v
 [ PostgreSQL 16 Database ]
   - TypeORM Data Source (20 migrations)
   - Pessimistic Row Locking (`PESSIMISTIC_WRITE`)
   - Serializable / Advisory locks for race-safe jobs
```

### Request Flow Topologies
1. **Docker Compose / On-Premise Single-Origin**:
   - Nginx terminates TLS and acts as reverse proxy on port 80/443.
   - Routes `/api/*` and `/socket.io/*` to Node.js backend (`server:3000`).
   - Serves static assets (`dist/`) for all other paths with fallback to `index.html`.
   - Cookies (`jwt_token`) are strictly first-party (`SameSite=Strict`).
2. **Decoupled Cloud (Vercel Frontend + Render/VPS Backend)**:
   - Frontend hosted on Vercel (`app.example.co.ke` or `*.vercel.app`).
   - Backend hosted on Render (`api.example.co.ke` or `*.onrender.com`).
   - Requires custom subdomains under a unified root domain (e.g. `*.example.co.ke` with `COOKIE_DOMAIN=.example.co.ke`), or Vercel edge rewrites for `/api` proxying to avoid third-party cookie dropping.

---

## 2. Authentication Flow

Authentication enforces password authentication followed by mandatory two-factor email One-Time Password (OTP) verification.

```
1. POST /api/auth/login { email, password }
   - Rate limited by IP (loginLimiter).
   - Validates bcrypt password hash.
   - Generates 6-digit cryptographic OTP (expires in 10 minutes) stored in `otp_codes`.
   - Sends OTP email via Resend / SMTP.
   - Issues short-lived, restricted JWT containing ONLY `{ id, email }` (no `role`).

2. POST /api/auth/verify-otp { email, otp }
   - Rate limited by IP (otpLimiter).
   - Validates OTP against hash in `otp_codes`.
   - Issues full-privilege session JWT payload: `{ id, email, role }`.
   - Sets secure httpOnly cookie `jwt_token` (Path=/; HttpOnly; SameSite; Secure in prod).

3. Subsequent Requests (e.g. /api/auth/me, /api/sales):
   - `authenticateJWT` checks cookie or `Authorization: Bearer <token>`.
   - Verifies JWT signature and explicitly requires `decoded.role` to prevent OTP-token escalation.
```

---

## 3. Sale Transaction Flow

The sale pipeline guarantees atomic stock allocation, idempotency, and financial integrity:

```
[ Cashier Till Client ]
   |
   |-- 1. Checks open shift (GET /api/shifts/current) -> Must be active
   |-- 2. Optional: Reserves checkout items (POST /api/sales/checkouts) -> locks stock
   |-- 3. Issues POST /api/sales with `idempotency_key`, items, payments
         |
         v
   [ Backend SalesController.createSale (Transaction) ]
         |
         |-- Acquires advisory lock on `idempotency_key` (prevents double submits)
         |-- Verifies active cashier shift
         |-- Sorts product IDs canonically to prevent database deadlocks
         |-- Acquires `PESSIMISTIC_WRITE` locks on inventory rows
         |-- Validates stock availability; decrements quantity
         |-- Creates `Sale` and `SaleItem` records
         |-- Records stock movement ledger (`StockMovement`)
         |-- Dispatches double-entry accounting entries:
         |     DR Cash / Bank / M-Pesa / Store Credit
         |     CR Sales Revenue & CR Tax Payable
         |-- Calculates customer loyalty points
         v
   [ Post-Sale Processing ]
         |-- Commit Database Transaction
         |-- Dispatch real-time WebSocket event (`sale_created`, `inventory_updated`)
         |-- eTIMS Fiscalization: Signs invoice asynchronously and updates fiscal signature
```

---

## 4. Warehouse-Scoped Stock

- Product opening stock is initialized in the active warehouse selected during product creation; product imports can name a warehouse and otherwise use the main warehouse.
- `GET /api/products?warehouse_id=<id>` reports each product's balance in that active warehouse. The Products inventory view hides products with no stock at the selected warehouse.
- `GET /api/products` reports the sum of warehouse balances for each product. Products with no warehouse balance retain the legacy product-level quantity until stock is assigned to a warehouse.
- The POS always sells from one selected warehouse and uses that branch's balance for availability and inventory updates. The all-warehouse view is a consolidated inventory view, not a sell-from-anywhere mode.
- Receipts, adjustments, sales, returns, and stocktakes update warehouse balances and the product aggregate in the same transaction. Transfers move balances between warehouses without changing the aggregate.

---

## 5. Safaricom M-Pesa Flow

M-Pesa payments (STK Push & Paybill C2B) are processed with strict amount/phone validation and anti-replay guards:

```
1. Till initiates STK Push:
   POST /api/payments/mpesa/stk-push { checkoutSessionId, phoneNumber, amount }
   - Backend reserves inventory via `PaymentCheckoutSession`.
   - Generates password using Daraja Passkey & timestamp.
   - Calls Safaricom Daraja STK Push API (`/mpesa/stkpush/v1/processrequest`).
   - Saves `MpesaTransaction` with `status: "pending"`.

2. Safaricom Callback:
   POST /api/webhooks/mpesa/callback?token=<MPESA_CALLBACK_TOKEN>
   - Validates query callback security token.
   - Extracts `MpesaReceiptNumber`, `Amount`, `PhoneNumber`, and `ResultCode`.
   - Acquires advisory lock on `checkout_request_id`.
   - Enforces 3-point reconciliation:
       * ResultCode == 0 (Success)
       * Received Amount == Expected Transaction Amount
       * Received Phone matches initiated Phone
       * `MpesaReceiptNumber` is unique across all transactions
   - Marks `MpesaTransaction` as `completed`.
   - Emits WebSocket event `mpesa:payment_received` to unlock till UI.
```

---

## 6. Offline-First Synchronization Flow

When connectivity drops, the POS till functions offline using browser storage:

```
1. Offline Transaction Capture:
   - Till stores pending sales in browser IndexedDB `offline_sales_queue`.
   - Captures local timestamp, idempotency key, cashier ID, items, and payments.
   - Prints offline provisional receipt with clear offline notice.

2. Reconnection & Audit Sync:
   - `useOfflineSync` hook detects network reconnection (`navigator.onLine`).
   - Reads pending offline transactions in FIFO sequence.
   - Submits each sale with original `idempotency_key`.

3. Conflict & Vault Handling:
   - If stock is insufficient or product was modified/deleted during offline period:
     * Backend rejects or flags sale.
     * Frontend moves conflicting transaction to `IndexedDB conflict_vault`.
     * Alerts supervisor/manager for manual discrepancy resolution.
```
