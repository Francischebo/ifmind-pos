# Kenya Revenue Authority (KRA) eTIMS Integration Guide

> [!IMPORTANT]
> **HUMAN DECISION NEEDED: Legal and Technical Architecture for KRA eTIMS Fiscalization**
> Under Kenyan tax law (Tax Procedures Act Section 23A), generating simulated tax signatures (`Math.random()` or mock hashes) in a live commercial production environment constitutes fiscal non-compliance and tax fraud.
> To activate live eTIMS fiscalization (`ETIMS_MODE=live`), an authorized business executive and systems administrator must decide the integration path and provide verified credentials.

---

## 1. Architectural Options (Decision Required)

KRA provides three official avenues for fiscal electronic tax invoice management:

| Architecture | Description | Pros | Cons / Requirements |
|---|---|---|---|
| **Option A: OSCU (Online Sales Control Unit)** | Physical ESD (Electronic Signature Device) hardware connected locally to the till via USB or LAN. | • Autonomous offline fiscal signing.<br>• Certified by KRA hardware labs.<br>• Instant invoice signing without WAN latency. | • Requires physical certified hardware purchase per till.<br>• Local driver / daemon installation on till machine. |
| **Option B: VSCU (Virtual Sales Control Unit)** | Cloud-hosted virtual ESD software module approved by KRA. | • No physical hardware per till.<br>• Centralized fiscal signing for multi-branch retailers. | • Requires formal server audit by KRA inspectors.<br>• Dependent on steady server internet connectivity. |
| **Option C: Accredited KRA Technical Integrator / Direct eTIMS API** | Cloud REST API integration directly with KRA's eTIMS Enterprise API or through a certified fiscal third-party provider (e.g. Total Solutions, Uptech, Simba, Krazytech). | • Cleanest cloud-native deployment for decoupled hosting (Render / Docker VPS).<br>• Fully automated invoice, credit note, and debit note transmission. | • Requires sandbox certification process with KRA.<br>• Commercial contract with certified integrator or direct KRA API clearance. |

---

## 2. Information & Credentials Required From Human

Before switching `ETIMS_MODE` to `live`, the following information must be supplied via production environment variables:

1. **Taxpayer Identification:**
   - `ETIMS_KRA_PIN`: 11-character KRA PIN of the business entity (e.g. `P051234567Z`).
   - `ETIMS_TAXPAYER_NAME`: Legal business name registered on iTax (e.g. `CFI-POS TECHIEZ LIMITED`).
2. **Branch & Location:**
   - `ETIMS_BRANCH_ID`: Branch identifier registered with KRA (typically `00` for headquarters/main store).
3. **Device / Integrator Credentials:**
   - `ETIMS_DEVICE_SERIAL`: Hardware or virtual device serial number allocated by KRA.
   - `ETIMS_CLIENT_CERT`: Path or base64 PEM certificate issued during device onboarding.
   - `ETIMS_API_KEY` / `ETIMS_BEARER_TOKEN`: Production API key provided by KRA eTIMS developer portal or approved integrator.
   - `ETIMS_API_URL`: Certified production endpoint URL.
4. **Verification Portal:**
   - `ETIMS_QR_VERIFY_URL`: Official KRA verification URL (e.g. `https://etims.kra.go.ke/verify`).

---

## 3. Supported Modes in cfi-POS

The system supports three explicit operating modes configured via `ETIMS_MODE`:

1. **`off` (Pilot / Exempt Mode)**:
   - Receipts are issued as ordinary commercial sales receipts.
   - Invoices and receipts display the clear legal notice: `CUSTOMER RECEIPT - NOT A KRA TAX INVOICE`.
   - Sales are never blocked by network latency or KRA downtime.
   - `etims_status` is stored as `not_applicable`.
2. **`mock` (Simulation Mode)**:
   - Simulates KRA latency and generates distinct test identifiers: `TEST-ETIMS-******` and `TEST-CN-ETIMS-******`.
   - Receipts display: `*** TEST RECEIPT - NOT A VALID TAX INVOICE ***`.
   - Allowed in development, testing, and staging environments.
3. **`live` (Production Fiscalization Mode)**:
   - Requires live credentials and physical device or accredited API.
   - Validates required configuration at startup.
   - Asynchronous signing ensures sales commit immediately (`pending` status) and are queued for background submission without holding stock locks.
