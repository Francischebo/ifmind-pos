# cfi-POS Feature Documentation
**cfi-POS Techiez Limited Company** — Production Retail & Wholesale Point of Sale System

---

## 1. Point of Sale & Checkout (Till Operations)
- **High-Speed Checkout**: Optimized barcode scanning (camera scanner and keyboard wedge) with real-time product search and cart management.
- **Tender Methods**:
  - **Cash**: Automated change calculation, drawer float reconciliation, and cash verification.
  - **M-Pesa STK Push**: Instant checkout prompt sent directly to customer's Safaricom phone with polling and callback confirmation.
  - **M-Pesa Paybill (C2B)**: Automated validation and confirmation callback endpoints with per-request callback token verification.
  - **Store Credit**: Barcode-scanned store credit balance lookup and redemptions.
- **Stock Reservation**: Active reservations during checkout sessions to prevent race conditions and overselling across concurrent tills.
- **Parked Sales**: Park active carts for customers retrieving more items, and retrieve when ready.
- **Shift Enforcement**: Cash sales require an active, open shift with a recorded cash float.
- **Receipts**: Thermal-printer-ready receipt formatting with KRA eTIMS fiscalization data and QR codes.

---

## 2. Returns, Refunds & Store Credit
- **Customer Return Initiation**: Cashiers initiate full or partial returns linked to the original sale and individual line items.
- **Managerial Approval**: Multi-tier review by Supervisors, Managers, or Admins.
- **Inventory Triage**:
  - **Sellable Items**: Automatically returned to inventory with physical stock increments.
  - **Damaged Items**: Written off to inventory shrinkage ledger without restocking damaged goods.
- **Refund Settlement Channels**:
  - **Cash Refund**: Deducted directly from supervisor/manager drawer float.
  - **M-Pesa Refund Settlement**: Recorded as payable, processed through Safaricom, and settled with confirmed M-Pesa receipt code.
  - **Store Credit**: Generates verifiable unique store credit barcodes for customer reuse.
  - **Credit Note Generation**: Produces credit note documents matching KRA fiscal guidelines.

---

## 3. Inventory & Warehouse Logistics
- **Multi-Warehouse & Branch Support**: Isolate inventory per physical warehouse or store location, with a designated unique Main Warehouse.
- **Stock Movements & Tracking**: Full audit trail of stock additions, sales deductions, transfers, returns, and write-offs.
- **Inter-Warehouse Transfers**: Two-phase transfer workflow: Draft → In-Transit (stock deduction from origin) → Received (incremented at destination) or Cancelled.
- **Physical Stock Takes & Cycle Counts**: Reconcile physical warehouse stock against system counts with automatic discrepancy calculation and approval.
- **Inventory Adjustments**: Manual stock adjustments for breakages, theft, expired items, or count corrections with audit notes.
- **Batch & Expiry Date Management**: Track product batches, lot numbers, manufacturing dates, and expiration alerts.
- **Reorder Recommendations**: Configurable minimum stock levels and automated reorder alerts for purchasing managers.
- **Spreadsheet Import**: Bulk catalog onboarding from CSV and Excel spreadsheets with header aliasing, unit-of-measure validation, and tax matching.

---

## 4. Purchasing & Supplier Procurement
- **Vendor Management**: Comprehensive vendor database with contact information, payment terms, and purchase histories.
- **Purchase Orders (PO)**: Multi-line procurement order creation, approval workflows, and status tracking (Draft, Sent, Partially Received, Received, Cancelled).
- **Goods Receiving & 3-Way Match**: Record goods received against POs, with automatic warehouse stock updates and unit cost tracking.
- **Supplier Invoices & Accounts Payable**: Track supplier invoices, payment terms, due dates, and record payments with double-entry ledger impact.

---

## 5. Customer Management, Invoicing & Receivables
- **Customer CRM**: Maintain customer database, credit limits, loyalty standing, and purchase history.
- **B2B Invoicing & Accounts Receivable**: Issue formal credit invoices for corporate clients with customizable payment terms.
- **Payment Receipts**: Record partial or full invoice payments with real-time outstanding balance calculation.

---

## 6. Customer Loyalty Program
- **Loyalty Accrual**: Automated calculation of loyalty points earned per transaction based on store reward rules.
- **Redemption at Checkout**: Redeem accrued loyalty points as direct discount amounts during checkout.
- **Membership Tiers**: Configure redemption rates and point thresholds.

---

## 7. Double-Entry Accounting Engine
- **Chart of Accounts**: Standardized accounts structure (Assets, Liabilities, Equity, Revenue, Cost of Goods Sold, Expenses).
- **Automatic Journal Entries**: Balanced debits and credits posted on sales, returns, payments, shrinkage, transfers, and inventory receipts.
- **Financial Integrity**: Verification checks prevent unbalanced journal entries from being committed.
- **General Ledger & Financial Reporting**: Trial balance, P&L, balance sheet, and revenue analytics.

---

## 8. KRA eTIMS Tax Compliance Engine
- **Pluggable Architecture**: Configurable via `ETIMS_MODE` environment setting:
  - **`off`**: Standard operation for pilots, development, or exempt businesses without tax authority calls.
  - **`mock`**: Realistic local fiscalization simulator producing deterministic test signatures, control codes, and scannable QR verification URLs for offline and sandbox testing.
  - **`live`**: Interface for live KRA eTIMS API or physical Electronic Signature Devices (OSCU/VSCU).
- **Tax Classification**: Standard VAT rates (16% VAT, 8% Fuel/Special, 0% Zero-Rated, Exempt) mapped to KRA tax codes.
- **Credit Note Fiscalization**: Reversal signing linking credit notes to original fiscal invoices.

---

## 9. Offline-First PWA Architecture
- **Installable PWA**: Service worker caching of application shell, assets, and catalog for offline operation.
- **Scoped Offline Queue**: Cashiers who previously signed in can process provisional walk-in cash sales offline into browser IndexedDB.
- **Reconnection Sync & Conflict Detection**: When connectivity is restored, sales sync to the backend with original idempotency keys. Any discrepancies (price changes, deleted products, depleted stock) are flagged in conflict review states for cashier resolution.

---

## 10. Security & Authorization Architecture
- **4-Tier Role-Based Access Control (RBAC)**: Strictly enforced across all backend routes and frontend UI:
  - **Cashier**: POS checkout, search catalogue, register walk-in customer, initiate return, view own shift.
  - **Supervisor**: Tills + shift overrides, approve returns, triage inventory conditions, issue store credit.
  - **Manager**: Supervisor permissions + product/category updates, stock takes, inventory adjustments, purchase orders, customer credit terms.
  - **Admin**: Full system access, company branding, tax settings, user provisioning, role assignments, audit logs, and accounting.
- **Two-Factor Authentication (Email OTP)**: Staff login protected by time-limited, single-use 6-digit OTPs sent via Resend API with brute-force attempt limits.
- **httpOnly Session Cookies**: Session tokens stored in secure, tamper-proof `httpOnly` cookies (`jwt_token`) to safeguard credentials against Cross-Site Scripting (XSS).
- **PII Data Encryption**: Customer and payment phone numbers encrypted at rest using AES-256 (`pgcrypto` / `crypto`).
- **Strict Content Security Policy (CSP)**: Hardened headers with sensitive endpoint rate-limiting and audit logging.
- **Startup Configuration Guard**: Fails fast in production if security keys, encryption secrets, or CORS origins are unconfigured or weak.

---

## 11. Operational Readiness & Reliability
- **Automated Backup & Verification Scripts**: Compressed, credential-free `pg_dump` backups (`scripts/backup.sh`) with automated scratch-database restoration test verification (`scripts/restore-test.sh`).
- **Health & Readiness Probes**: Unauthenticated `/health` liveness probe and database-probing `/ready` readiness probe.
- **Structured Observability**: Request ID propagation (`X-Request-Id`) across logs, sanitized query-string logging, and optional error tracking hook (`SENTRY_DSN`).
- **Graceful Shutdown**: Database pool draining and connection cleanup on SIGTERM and SIGINT signals.

---

## Support & Contact
**cfi-POS Techiez Limited Company**  
- System: cfi-POS Production Suite  
- Inquiries & Support: support@cfipos.techiez.co.ke  
- Documentation: [README.md](./README.md) | [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md) | [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)

© 2026 cfi-POS Techiez Limited Company. All rights reserved.
