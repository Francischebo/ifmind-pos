# CFI-POS Techiez PWA Installation and Rollout Guide

## What is installed

CFI-POS Techiez is installed from its secure HTTPS website as a Progressive Web App (PWA). It is not a Windows/macOS executable and does not install a local API or database. All terminals use the configured central API and database when online; every browser profile has its own login session, cached product catalogue, and offline sales queue.

Offline support is deliberately limited to a previously authenticated cashier using a cached catalogue to capture provisional walk-in cash sales. The application shell and POS catalogue must first be loaded online on each device. Offline receipts are not confirmed sales or official invoices. Other payment types and server-dependent operations require connectivity. On reconnect, the original cashier must sign in and the server must accept the sale; changed prices, tax, stock, or shift requirements can hold it for review.

## Before rollout

Complete these steps with the system administrator before staff install the app:

1. Deploy the frontend on the final public HTTPS domain. Do not distribute localhost, preview, or development URLs.
2. Deploy the persistent Express API and connect it to the intended production PostgreSQL database. Supabase is not required. Configure the public `VITE_API_URL` and server CORS origins for the exact production domain.
3. Configure `RESEND_API_KEY` and a Resend-verified `RESEND_FROM_EMAIL` as API-host secrets before starting production (or redeploy/restart the API after changing them). Registration signs the user in immediately, which triggers OTP email delivery; verify a test account can receive and enter its OTP before rollout.
4. Take and verify a database backup. Apply required TypeORM migrations from the backend before releasing code that depends on them, including `1791090000000-AddOfflineSaleAudit`.
5. Verify the production health endpoint, cashier login/OTP, a normal online cash sale, inventory deduction, shift totals, receipt printing, and API reconnection. Do these checks in a test environment or with approved test records; do not create unapproved live transactions.
6. Confirm each till's browser, printer, barcode scanner, cash drawer, receipt paper, power protection, and network. Hardware access and permissions differ by operating system and browser.
7. Pilot on one non-production or low-risk terminal first. Reconcile its test sales, payments, stock, and shift totals before inviting the rest of the staff.

Do not roll out to all tills until the API, database, migrations, permissions, and backup/restore procedure have been checked by the system administrator.

## Install on a workstation or phone

Use the same production HTTPS URL on each device. A separate app copy or database is not downloaded; installing creates an app shortcut/window for that browser profile.

### Windows: Microsoft Edge or Google Chrome

1. Open the production HTTPS URL in an up-to-date Edge or Chrome browser.
2. Sign in as the staff member assigned to this terminal and complete OTP verification if requested.
3. Open **POS Checkout**, select the correct warehouse, and wait for the product catalogue to finish loading.
4. Use the browser's **Install app** icon in the address bar, or open the browser menu and choose **Install this site as an app**. Confirm the installation.
5. Launch CFI-POS Techiez from the desktop, Start menu, or taskbar. Confirm the address/domain is the approved production domain.

### Android: Chrome

1. Open the production HTTPS URL in Chrome and sign in as the assigned staff member.
2. Open **POS Checkout** and allow the catalogue to finish loading.
3. Open the browser menu and choose **Install app** or **Add to Home screen**, then confirm.
4. Launch the installed app from the home screen and confirm online login and POS access.

### iPhone or iPad: Safari

1. Open the production HTTPS URL in Safari and sign in as the assigned staff member.
2. Open **POS Checkout** and allow the catalogue to finish loading.
3. Tap **Share**, choose **Add to Home Screen**, and confirm.
4. Launch the home-screen icon and confirm online login and POS access.

Browser wording and support can vary by OS version. If the install command is not offered, update the browser and verify that the site is served over HTTPS with a valid certificate, the manifest and icons load, and the service worker has registered. Avoid private/incognito windows for POS use.

## Prepare each terminal for a possible outage

Repeat on every terminal that may need offline cash checkout:

1. Install and launch the PWA while online.
2. Sign in online as the cashier who will use the terminal. Do not rely on another staff member's saved login.
3. Open the correct warehouse in **POS Checkout** and let the product catalogue load successfully.
4. Verify the online status and do not clear browser site data, uninstall the PWA, use private browsing, or switch browser profiles after preparation. These actions can remove the local catalogue or unsynchronized sales.
5. Perform an offline/reconnect rehearsal before go-live using a designated test environment/account. Check the provisional receipt, queue status, reconnect, same-cashier sync, and server reconciliation. Never test by disabling connectivity during a real customer sale.

The cached catalogue is a snapshot, not live stock or price authority. Before the first use of a day or shift, while online, refresh the POS catalogue and verify the active warehouse. Browser/device storage can still be cleared or evicted; a PWA is not a substitute for a written outage and reconciliation procedure.

## Outage and recovery procedure

- **Before capture:** Verify the app shows offline mode and the correct cached catalogue/warehouse. If the catalogue is missing or looks stale, stop offline selling and use the business's approved manual contingency process.
- **During outage:** Accept only walk-in cash sales through the offline POS flow. Tell customers that the printed receipt is provisional. Do not use the normal sale workflow, record sales in another cashier's profile, promise that a queued sale is confirmed, or accept M-Pesa, Paybill, store credit, customer-account, or loyalty transactions offline.
- **If the app/device/browser closes:** Reopen the same installed app in the same browser profile. Check the offline queue before continuing. If a queued sale is missing or the device is lost, follow the business's paper/manual incident and reconciliation procedure; do not recreate it as a confirmed sale without checking the server.
- **After connectivity returns:** Keep the same cashier signed in, wait for the API connection indicator, and allow the queue to synchronize. Resolve any conflict against the provisional reference and the physical cash/stock records. Confirm the sale appears on the server and in the correct shift before treating it as booked.
- **If the original cashier cannot return or a device fails:** Do not change the stored queue owner or copy IndexedDB records between profiles. Escalate to the administrator for a controlled reconciliation against receipts, cash, stock, and server records.

## Updating without disrupting operations

1. Back up the database and verify the recovery point; check queued/conflicted offline sales on tills before maintenance.
2. Test the exact release against a staging database, including PWA install, online sale, offline rehearsal, reconnect, and reconciliation.
3. Apply additive, backward-compatible database migrations before enabling frontend features that require them. Keep old and new API clients compatible during rollout where possible.
4. Deploy the API and frontend in a planned maintenance window, monitor health and error logs, then verify one terminal end-to-end before wider use.
5. If a release fails, stop new offline captures, preserve the affected devices and queues, and use the documented application/database rollback procedure. Do not clear browser data, delete queued sales, or restore a database backup over newer accepted transactions without a reconciliation plan.

No software can guarantee uninterrupted operation through every network, power, device, browser, database, or payment-provider failure. Maintain a staffed manual fallback, power/network resilience, monitoring, tested backups, and a named person responsible for reconciliation.
