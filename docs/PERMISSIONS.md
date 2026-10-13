# cfi-POS Route Permission Matrix (Baseline)

This table documents every route defined in `server/src/index.ts`, its HTTP method, path, attached middlewares, allowed roles under current code, and the planned Phase 5 least-privilege target.

## Roles Defined in System
- `admin`: Full unrestricted system access.
- `manager`: Store operational management (approvals, procurement, reports, inventory adjustments).
- `supervisor`: Shift and return management, stock adjustments, cashier oversight.
- `cashier`: Point of sale operations, own shift reconciliation, customer lookups.

---

| Method | Path | Middlewares | Current Roles Allowed | Phase 5 Target Roles | Notes / Action Needed in Phase 5 |
|---|---|---|---|---|---|
| **GET** | `/health` | None | Public | Public | PostgreSQL liveness probe |
| **GET** | `/api/health` | None | Public | Public | PostgreSQL liveness probe |
| **GET** | `/` | None | Public | Public | Root welcome JSON |
| **GET** | `/favicon.ico` | None | Public | Public | Browser 204 handler |
| **POST** | `/api/auth/register` | `loginLimiter` | Public | Public (Disabled -> 403) | Controller returns 403. Kept disabled for public. |
| **POST** | `/api/auth/login` | `loginLimiter` | Public | Public | Email + password, issues OTP token |
| **POST** | `/api/auth/verify-otp` | `otpLimiter` | Public | Public | OTP verification, issues session cookie |
| **POST** | `/api/auth/logout` | None | Public | Public | Clears session cookie |
| **GET** | `/api/auth/me` | `authenticateJWT` | Any authenticated user | Any authenticated user | Returns profile of current user |
| **POST** | `/api/auth/change-password` | `authenticateJWT, loginLimiter` | Any authenticated user | Any authenticated user | Password reset for logged-in user |
| **POST** | `/api/auth/log_application_error` | `logPayloadSizeLimiter, loggingLimiter` | Public | Public | Client telemetry |
| **POST** | `/api/auth/log_security_event` | `logPayloadSizeLimiter, loggingLimiter` | Public | Public | Client telemetry |
| **POST** | `/api/auth/log_pwa_security_event` | `logPayloadSizeLimiter, loggingLimiter` | Public | Public | Client telemetry |
| **POST** | `/api/auth/validate_input_data` | `logPayloadSizeLimiter, loggingLimiter` | Public | Public | Client telemetry |
| **POST** | `/api/auth/validate_pwa_cache_integrity` | `logPayloadSizeLimiter, loggingLimiter` | Public | Public | Client telemetry |
| **GET** | `/api/categories` | `authenticateJWT` | Any authenticated user | Any authenticated user | Needed by cashier for POS catalog |
| **POST** | `/api/categories` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Admin/manager catalog management |
| **PUT** | `/api/categories/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Admin/manager catalog management |
| **DELETE** | `/api/categories/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/products` | `authenticateJWT` | Any authenticated user | Any authenticated user | Needed by cashier for scanning |
| **GET** | `/api/products/template` | `authenticateJWT` | Any authenticated user | `admin`, `manager` | Import template download |
| **POST** | `/api/products/import` | `authenticateJWT, requireRole("admin"), handleProductImportUpload` | `admin` | `admin`, `manager` | Bulk inventory import |
| **GET** | `/api/inventory/alerts` | `authenticateJWT` | Any authenticated user | `admin`, `manager`, `supervisor` | Restrict low-stock alert views |
| **GET** | `/api/inventory/predictions` | `authenticateJWT` | Any authenticated user | `admin`, `manager` | Restrict demand forecast |
| **GET** | `/api/products/:id` | `authenticateJWT` | Any authenticated user | Any authenticated user | Needed by cashier for product details |
| **POST** | `/api/products` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Product creation |
| **PUT** | `/api/products/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Product editing |
| **DELETE** | `/api/products/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/sales` | `authenticateJWT` | Any authenticated user | `cashier` (own sales), `supervisor`, `manager`, `admin` (all) | Scope cashier to own sales |
| **POST** | `/api/sales/checkouts` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Include supervisor & manager |
| **GET** | `/api/sales/checkouts/:checkoutSessionId` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Include supervisor & manager |
| **POST** | `/api/sales/checkouts/:checkoutSessionId/cancel` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Include supervisor & manager |
| **POST** | `/api/sales` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Create sale at till |
| **GET** | `/api/store-credits/:barcode` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Scan store credit note |
| **POST** | `/api/sales/park` | `authenticateJWT` | Any authenticated user | `cashier`, `supervisor`, `manager`, `admin` | Park sale at till |
| **GET** | `/api/sales/parked` | `authenticateJWT` | Any authenticated user | `cashier` (own parked), `supervisor`, `manager`, `admin` (all) | Scope cashier to own parked sales |
| **GET** | `/api/sales/:id` | `authenticateJWT` | Any authenticated user | Any authenticated user | View sale receipt/details |
| **GET** | `/api/invoices` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/invoices/:invoiceId/payments` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict from cashier |
| **POST** | `/api/invoices/:invoiceId/payments` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/returns/search` | `authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"])` | `cashier`, `supervisor`, `manager`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Search receipt to return |
| **POST** | `/api/returns/request` | `authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"])` | `cashier`, `supervisor`, `manager`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Initiate return request |
| **GET** | `/api/returns` | `authenticateJWT, requireRoles(["cashier", "supervisor", "manager", "admin"])` | `cashier`, `supervisor`, `manager`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | List return requests |
| **POST** | `/api/admin/returns/approve/:id` | `authenticateJWT, requireRoles(["supervisor", "manager", "admin"])` | `supervisor`, `manager`, `admin` | `supervisor`, `manager`, `admin` | Approve return |
| **POST** | `/api/admin/returns/:id/mpesa-payout` | `authenticateJWT, requireRoles(["supervisor", "manager", "admin"])` | `supervisor`, `manager`, `admin` | `supervisor`, `manager`, `admin` | Issue M-Pesa refund |
| **POST** | `/api/admin/returns/reject/:id` | `authenticateJWT, requireRoles(["supervisor", "manager", "admin"])` | `supervisor`, `manager`, `admin` | `supervisor`, `manager`, `admin` | Reject return |
| **GET** | `/api/customers` | `authenticateJWT` | Any authenticated user | Any authenticated user | Cashier needs to search customer |
| **GET** | `/api/customers/:id` | `authenticateJWT` | Any authenticated user | Any authenticated user | Customer profile |
| **POST** | `/api/customers` | `authenticateJWT` | Any authenticated user | Any authenticated user | Cashier may register customer at till |
| **PUT** | `/api/customers/:id` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Cashiers may not edit customer info |
| **DELETE** | `/api/customers/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/vendors` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Cashiers may not view vendors |
| **GET** | `/api/vendors/:id` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Cashiers may not view vendors |
| **POST** | `/api/vendors` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Create vendor |
| **PUT** | `/api/vendors/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Update vendor |
| **DELETE** | `/api/vendors/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/vendor-portal` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/purchase-orders` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/purchase-orders/:id` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Restrict from cashier |
| **POST** | `/api/purchase-orders` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Create purchase order |
| **PUT** | `/api/purchase-orders/:id/status` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Update PO status |
| **POST** | `/api/purchase-orders/:id/email` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Send PO email |
| **POST** | `/api/purchase-orders/:id/receive` | `authenticateJWT, requireRole("admin")` | `admin` | `supervisor`, `manager`, `admin` | Receive goods into stock |
| **GET** | `/api/delivery-notes` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/delivery-notes/:id` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/procurement/invoices` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/procurement/supplier-invoices` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Restrict from cashier |
| **GET** | `/api/procurement/supplier-invoices/:invoiceId/payments` | `authenticateJWT` | Any authenticated user | `manager`, `admin` | **GAP:** Restrict from cashier |
| **POST** | `/api/procurement/invoice` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Create supplier invoice |
| **POST** | `/api/procurement/invoices` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Create supplier invoice |
| **POST** | `/api/procurement/supplier-invoices` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Create supplier invoice |
| **POST** | `/api/procurement/supplier-invoices/:invoiceId/payments` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Record supplier payment |
| **PUT** | `/api/procurement/requisitions/:id/status` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Update requisition status |
| **POST** | `/api/shifts/open` | `authenticateJWT` | Any authenticated user | Any authenticated user | User opens own shift |
| **POST** | `/api/shifts/:id/close` | `authenticateJWT` | Any authenticated user | Cashier (own shift), `supervisor`, `manager`, `admin` | Scope closure to own shift |
| **GET** | `/api/shifts/current` | `authenticateJWT` | Any authenticated user | Any authenticated user | Returns user's own open shift |
| **GET** | `/api/shifts` | `authenticateJWT` | Any authenticated user | Cashier (own shifts), `supervisor`, `manager`, `admin` (all) | Scope list by role |
| **GET** | `/api/warehouses` | `authenticateJWT` | Any authenticated user | Any authenticated user | Cashier needs warehouse for till |
| **POST** | `/api/warehouses` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **PUT** | `/api/warehouses/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **DELETE** | `/api/warehouses/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/dashboard/stats` | `authenticateJWT` | Any authenticated user | Cashier (own shift totals), `supervisor`, `manager`, `admin` (full financial stats) | **GAP:** Restrict profit & revenue |
| **GET** | `/api/reports/summary` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict financial reports from cashier |
| **GET** | `/api/inventory/movements` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | **GAP:** Restrict stock ledger from cashier |
| **GET** | `/api/users` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **POST** | `/api/users` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **PUT** | `/api/users/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **PUT** | `/api/users/:id/role` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **DELETE** | `/api/users/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/settings` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/receipt-settings` | `authenticateJWT` | Any authenticated user | Any authenticated user | Cashier till receipt template |
| **GET** | `/api/company-logo` | None | Public | Public | Public asset for receipt / UI |
| **POST** | `/api/settings` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **POST** | `/api/settings/company-logo` | `authenticateJWT, requireRole("admin"), handleCompanyLogoUpload` | `admin` | `admin` | Admin only |
| **DELETE** | `/api/settings/company-logo` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/loyalty/settings` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | Loyalty program parameters |
| **POST** | `/api/loyalty/settings` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **GET** | `/api/loyalty/members` | `authenticateJWT` | Any authenticated user | Any authenticated user | Cashier loyalty lookup at checkout |
| **POST** | `/api/loyalty/members` | `authenticateJWT, requireRole("admin")` | `admin` | `cashier`, `supervisor`, `manager`, `admin` | Cashier member enrollment |
| **POST** | `/api/loyalty/members/:id/points` | `authenticateJWT, requireRole("admin")` | `admin` | `admin`, `manager` | Manual point adjustment |
| **POST** | `/api/loyalty/members/:id/redeem` | `authenticateJWT, requireRole("admin")` | `admin` | `cashier`, `supervisor`, `manager`, `admin` | Redeem points at till |
| **GET** | `/api/inventory/adjustments` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | List stock adjustments |
| **POST** | `/api/inventory/adjustment` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Record stock discrepancy |
| **POST** | `/api/inventory/adjustments` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Alias endpoint |
| **GET** | `/api/inventory/transfers` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | Transfer list |
| **POST** | `/api/inventory/transfer` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Transfer initiation |
| **POST** | `/api/inventory/transfers` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Alias endpoint |
| **PUT** | `/api/inventory/transfer/:id/status` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Transfer status transition |
| **PUT** | `/api/inventory/transfers/:id/status` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Alias endpoint |
| **GET** | `/api/inventory/stock-takes` | `authenticateJWT` | Any authenticated user | `supervisor`, `manager`, `admin` | Stock audit list |
| **POST** | `/api/inventory/stock-takes` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Start stock take |
| **POST** | `/api/inventory/stock-takes/initiate` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Alias endpoint |
| **PUT** | `/api/inventory/stock-takes/:id/items` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Record counted quantities |
| **PUT** | `/api/inventory/stock-takes/:id/counts` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Alias endpoint |
| **POST** | `/api/inventory/stock-takes/:id/complete` | `authenticateJWT, requireRoles(["admin", "manager", "supervisor"])` | `admin`, `manager`, `supervisor` | `admin`, `manager`, `supervisor` | Finalize & post adjustments |
| **GET** | `/api/taxes` | `authenticateJWT` | Any authenticated user | Any authenticated user | Cashier needs tax rates for calculation |
| **POST** | `/api/taxes` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **PUT** | `/api/taxes/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **DELETE** | `/api/taxes/:id` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Admin only |
| **POST** | `/api/payments/mpesa/stk-push` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Initiate STK prompt |
| **GET** | `/api/payments/mpesa/config` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Client payment config |
| **POST** | `/api/payments/mpesa/paybill-intent` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Cashier paybill instruction |
| **POST** | `/api/payments/mpesa/c2b/register` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Register Daraja C2B URLs |
| **GET** | `/api/payments/mpesa/session/:checkoutSessionId` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Poll session payment status |
| **GET** | `/api/payments/mpesa/:checkoutRequestId` | `authenticateJWT, requireRoles(["cashier", "admin"])` | `cashier`, `admin` | `cashier`, `supervisor`, `manager`, `admin` | Poll checkout status |
| **POST** | `/api/webhooks/mpesa/callback` | None | Public (Token-verified) | Public (Token-verified) | Daraja STK Push callback |
| **POST** | `/api/webhooks/mpesa/c2b/validation` | None | Public (IP/Credentials) | Public (IP/Credentials) | Daraja C2B Validation hook |
| **POST** | `/api/webhooks/mpesa/c2b/confirmation` | None | Public (IP/Credentials) | Public (IP/Credentials) | Daraja C2B Confirmation hook |
| **POST** | `/api/webhooks/pesapal/ipn` | None | Public | Public | Pesapal IPN callback |
| **GET** | `/api/webhooks/pesapal/ipn` | None | Public | Public | Pesapal IPN verification |
| **GET** | `/api/admin-only` | `authenticateJWT, requireRole("admin")` | `admin` | `admin` | Test admin-only route |
