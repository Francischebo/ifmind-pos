# IFMind-POS - Professional Wholesale Point of Sale System

## Project Overview

**CFI-POS Techiez** is a wholesale point-of-sale system for inventory management, sales tracking, customer management, and reporting. It can be installed from its production HTTPS website as a PWA; its offline workflow is intentionally limited to provisional walk-in cash sales from a previously cached catalogue.

## Key Features

- 📱 **Progressive Web App (PWA)** - Install from the HTTPS website on supported devices
- 🔐 **Role-Based Access Control** - Admin and Cashier roles with specific permissions
- 📊 **Real-Time Dashboard** - Track sales, inventory, and low stock alerts
- 🛒 **Point of Sale** - Fast checkout with barcode scanning support
- 💰 **Multiple Payment Methods** - Cash and M-Pesa integration
- 📦 **Inventory Management** - Track stock levels, costs, and pricing
- 👥 **Customer Management** - Maintain customer records and transaction history
- 🏢 **Vendor Management** - Track suppliers and purchase orders
- 📈 **Reports & Analytics** - Sales reports, inventory reports, and more
- 🔄 **Limited Offline POS** - Queue provisional walk-in cash sales and sync for server verification when reconnected
- 🎨 **Responsive Design** - Works on all devices from mobile to desktop

## Technologies Used

This project is built with modern web technologies:

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **Express + TypeORM + PostgreSQL** - Backend API, database, and application authentication
- **PWA** - Progressive Web App capabilities

## Getting Started

### Prerequisites

- Node.js & npm installed ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- Git for version control

### Installation

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd Retail-store-pos-system-main

# Step 3: Install dependencies
npm install

# Step 4: Start the development server
npm run dev
```

The application will be available at `http://localhost:8080`

## Deployment

To deploy your application:

1. Run `npm run build` to create a production build
2. Deploy the `dist` folder to your hosting provider
3. Configure environment variables for production

### Required environment variables

Frontend:

- `VITE_API_URL`: Public Express API URL, including `/api`

Server:

- `DATABASE_URL`: PostgreSQL connection URL
- `PG_POOL_MAX`: Maximum PostgreSQL connections per API instance (default `10`; set based on the database plan's connection limit and maximum API replica count)
- `PG_CONNECTION_TIMEOUT_MS`: Maximum wait to acquire a PostgreSQL connection (default `5000`)
- `JWT_SECRET`: Long random signing secret
- `PORT`: Backend TCP port
- `FRONTEND_URL`: Allowed frontend origin
- `CORS_ORIGINS`: Optional comma-separated list of allowed browser origins
- `TYPEORM_SYNCHRONIZE=false`: Keep schema changes migration-controlled in production
- `RESEND_API_KEY`: Required for OTP and purchase-order email delivery
- `RESEND_FROM_EMAIL`: Verified sender identity for Resend
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`: Daraja credentials
- `MPESA_API_BASE_URL`: Daraja sandbox or production API base URL
- `MPESA_CALLBACK_URL`: Public HTTPS URL for `/api/webhooks/mpesa/callback`; it must preserve query parameters
- `MPESA_C2B_CALLBACK_BASE_URL`: Public HTTPS origin used to build authenticated Paybill validation/confirmation callback URLs
- `MPESA_C2B_CALLBACK_TOKEN`: 64–128 character hexadecimal secret used to authenticate Paybill callbacks
- `PESAPAL_IPN_SECRET`: Provider-issued secret used to verify Pesapal IPN signatures
- `GEMINI_API_KEY`: Required for AI inventory predictions
- `AI_GATEWAY_URL`, `AI_MODEL`: AI-compatible chat endpoint and model identifier
- `ETIMS_QR_VERIFY_URL`, `ETIMS_CREDIT_NOTE_QR_VERIFY_URL`: eTIMS receipt verification URL bases
- `PESAPAL_MOCK_IFRAME_URL`: redirect base used by the Pesapal mock service

Database encryption requires `ENCRYPTION_KEY` to be a 64-character hexadecimal value (32 bytes). The TypeORM backend supplies it as the PostgreSQL `app.encryption_key` session setting; never expose this value as a `VITE_` variable. The migration fails closed when the setting is absent. This is the only application database path required for the PostgreSQL-only deployment.

Apply backend TypeORM migrations before starting a production server after an update:

```sh
cd server
npm run migration:show
npm run migration:run
npm run migration:show
```

Review pending migrations and take a verified backup before applying changes. Confirm the final `migration:show` output has no pending migrations. The main-warehouse migration keeps the oldest existing main warehouse and demotes any duplicate main locations before adding a unique database index. To revert the most recent backend migration, run `npm run migration:revert` from `server` only after reviewing its `down` migration and the resulting data impact.

For existing installations, take a verified backup before applying the encryption migration. It refreshes customer and M-Pesa phone ciphertext from their retained plaintext columns. If audit-log or offline-queue ciphertext exists, supply its original key only for the migration session using `app.legacy_encryption_key`; the migration re-encrypts those rows under `app.encryption_key` and aborts if the legacy key is absent or incorrect. If that key is unavailable, stop the migration and preserve the backup; the new key cannot recover old ciphertext.

Configure `mpesa_shortcode` through the authenticated admin Settings page. Do not commit `.env` files or provider credentials.

New-account registration creates the cashier account; the OTP is sent when that new user is automatically signed in after registration (or on their next login). Production startup requires both `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; the sender must be verified with Resend. Set them as backend runtime secrets, not Vite/Vercel frontend variables, then redeploy or restart the API to apply them. If OTP delivery fails during registration, the account remains registered; after the administrator fixes delivery, sign in with that account rather than registering again. If Resend rejects a message, the API logs the provider's error without logging the OTP, invalidates the unsent code, and returns an explicit delivery error instead of presenting a successful OTP step. A Resend message ID means the provider accepted the message, not that it reached the inbox; also check Resend delivery events, recipient address, and spam filtering.

M-Pesa callback URLs include a random per-request token; server request logs omit query strings. Configure reverse proxies and provider-side logs to redact callback query parameters. Before deploying the callback-token column migration, allow all existing pending STK requests to complete or expire; older rows have no callback token hash and their callbacks will be rejected.

### Docker deployment

The repository includes production-oriented API, web, and PostgreSQL containers managed by Compose. PostgreSQL stores data in the persistent `postgres-data` named volume, is health-checked before the API starts, and is not published on a host port. The web container serves the built frontend and proxies `/api` and `/socket.io` (including WebSocket upgrades) to the API, so the browser uses one origin. Terminate public HTTPS at a trusted reverse proxy or load balancer in front of the web container.

By default, the API connects to the Compose PostgreSQL service using `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD`. The password must be URL-safe; the recommended 64-character hexadecimal secret is URL-safe. `DATABASE_URL` can optionally override this to connect the API to a separately managed PostgreSQL service. For a new, dedicated empty database, use the guarded Docker bootstrap command below; for an existing database, back it up and apply only reviewed pending TypeORM migrations. The Supabase-specific `database_migrations.sql` is not a generic PostgreSQL initializer.

The application frontend and API use the TypeORM/PostgreSQL backend; Supabase is not required. The repository retains separate Supabase SQL/Edge Function assets for deployments that explicitly choose to use those optional extensions. Do not apply Supabase migrations or `database_migrations.sql` to provision the PostgreSQL-only application database.

For a **new, dedicated PostgreSQL database only**, the backend provides a guarded bootstrap command. It refuses maintenance/template databases, any non-empty `public` schema, and databases with recorded TypeORM migrations. It builds the current baseline from TypeORM entity metadata and applies every TypeORM migration; the regular API startup never synchronizes the schema. This flow does not require a Supabase project or Supabase credentials.

```powershell
cd server
# Set DATABASE_URL, ENCRYPTION_KEY, and the one-time confirmation in the environment.
$env:POS_DB_BOOTSTRAP_CONFIRM = "CREATE_SCHEMA_IN_EMPTY_DATABASE"
npm run db:bootstrap
Remove-Item Env:POS_DB_BOOTSTRAP_CONFIRM
npm run migration:show
```

In POSIX shells, set the confirmation only for the command: `POS_DB_BOOTSTRAP_CONFIRM=CREATE_SCHEMA_IN_EMPTY_DATABASE npm run db:bootstrap`.

Set `POS_DB_BOOTSTRAP_CONFIRM=CREATE_SCHEMA_IN_EMPTY_DATABASE` only after verifying that `DATABASE_URL` points to the intended **new and empty** database. The bootstrap will not provision a database containing existing data or Supabase objects. If it fails partway, do not start the API; inspect the failure and either finish the pending migrations with `npm run migration:run` or create a new empty database and repeat the guarded bootstrap. Never drop an existing database to retry. For existing installations, use the backup/review/`migration:show`/`migration:run` procedure above, not the bootstrap command.

1. Copy `docker-compose.env.example` to `.env` and set `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `PUBLIC_ORIGIN`. Generate independent random secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and use the output for `POSTGRES_PASSWORD`, `JWT_SECRET`, and `ENCRYPTION_KEY`. Never commit `.env`.
2. Start PostgreSQL and wait until it is healthy:

   ```sh
   docker compose up -d postgres
   docker compose ps
   ```

3. Build the API image, then create the application schema in the new empty database:

   ```sh
   docker compose build api
   docker compose run --rm -e POS_DB_BOOTSTRAP_CONFIRM=CREATE_SCHEMA_IN_EMPTY_DATABASE api npm run db:bootstrap:docker
   ```

   Use that one-time guarded command only for a brand-new empty database. For an already initialized database, inspect and apply only pending migrations after taking a backup:

   ```sh
   docker compose run --rm api npm run migration:show:docker
   docker compose run --rm api npm run migration:run:docker
   docker compose run --rm api npm run migration:show:docker
   ```

4. Build and start the application:

   ```sh
   docker compose up --build -d
   ```

5. Open `http://localhost:8080` (or the configured `HTTP_PORT`) and check `docker compose ps` for healthy services. Set `PUBLIC_ORIGIN` to the exact external origin, such as `https://pos.example.com`, when using a TLS-terminating proxy.

The Compose API and PostgreSQL containers are not published directly to the host; PostgreSQL and the API are reachable only on the private Compose network, and the API is reached through the web proxy. `TYPEORM_SYNCHRONIZE` is explicitly disabled. Keep runtime credentials in a protected environment file or deployment secret manager. No Supabase URL, key, project, or account is needed for this deployment. Configure provider callback URLs to use the public HTTPS origin and preserve their query strings.

The named volume preserves PostgreSQL data across container recreation, but it is not a backup, replication, or high-availability system. Back up the database regularly to storage outside the Docker host and rehearse restoring it. This single-host Compose database is intended for standalone/small deployments; use managed PostgreSQL or a separately designed HA PostgreSQL cluster for larger production availability requirements. Do not run the one-time bootstrap against a database/volume containing business data.

### Vercel frontend with GitHub auto-deploy

Vercel serves the Vite frontend. Keep the Express API on a persistent HTTPS host (for example, the Docker deployment above): the API uses Socket.IO and a scheduled job, which require a long-lived Node process and are not supported as persistent services by Vercel Functions.

#### Deploy the API on Render

The repository includes a Render Blueprint at `render.yaml`. It builds the existing API Dockerfile as an always-on paid web service, enables GitHub auto-deploy, checks `/health`, and keeps database/schema synchronization disabled.

1. Push the repository to GitHub. In Render, choose **New → Blueprint** and select the repository containing `render.yaml`.
2. When prompted, provide `DATABASE_URL` for the dedicated PostgreSQL database, the 64-hex-character `ENCRYPTION_KEY`, and the production Vercel frontend origin for both `FRONTEND_URL` and `CORS_ORIGINS`. For a new empty database, run the guarded TypeORM bootstrap procedure above from a secure environment that can reach this database before using the API; for an existing database, back it up and apply reviewed pending migrations. The blueprint generates a separate `JWT_SECRET`; keep it stable after users have logged in. Never put these private values in Vercel or GitHub.
3. Create the service and wait for it to become healthy. Copy its public HTTPS URL, for example `https://cfi-pos-api.onrender.com`. Render sets the listening `PORT`; do not hard-code one.
4. From a secure environment with access to the same database and encryption key, apply pending backend TypeORM migrations before using new backend code. Migrations are not automatically run at service startup.

Use an always-on paid Render instance for production. A sleeping/free service can interrupt active Socket.IO clients and scheduled work. Configure `DATABASE_URL` to any supported, reachable PostgreSQL service (managed PostgreSQL or self-hosted). Supabase is not required; Render hosts the API and does not provision or copy your database.

#### Capacity and horizontal-scaling limits

The API is stateless for ordinary HTTP requests and can use multiple instances behind a load balancer when all instances share the same PostgreSQL database and stable `JWT_SECRET`/`ENCRYPTION_KEY`. Socket.IO inventory/sale broadcasts are relayed between instances through PostgreSQL `LISTEN`/`NOTIFY`; WebSocket upgrades must be supported by the load balancer. HTTP rate-limit counters remain process-local, so the effective limit multiplies with the number of replicas and resets when a process restarts; use an external shared rate-limit store if a globally consistent limit is required. Size the DB pool across all replicas: `PG_POOL_MAX × maximum API instances` plus one dedicated notification connection per instance must stay below the PostgreSQL connection budget after reserving connections for administration, migrations, monitoring, and other services.

The midnight auto-reorder job uses a PostgreSQL advisory lock so multiple API replicas do not all generate the same scheduled requisitions. Graceful SIGTERM/SIGINT handling stops the scheduler, closes Socket.IO/HTTP and the notification connection, and drains TypeORM connections. These measures improve safe scale-out and deploy behavior but do not establish a production concurrency limit; run a representative load test against the chosen hosting plan and database before increasing users or replicas.

#### Connect Vercel to the API

1. Push this repository to GitHub and import it into Vercel using **Add New → Project**. Select the repository and set the **Root Directory** to `Retail-store-pos-system-main` if this folder is nested inside the GitHub repository; otherwise use the repository root.
2. Keep the project framework as **Vite** and use the build settings in `vercel.json` (`npm ci`, `npm run build:vercel`, output `dist`). Do not configure the API's `server` directory as the Vercel project root.
3. Add these values under **Project Settings → Environment Variables** for Production and Preview as appropriate:
   - `VITE_API_URL`: the public HTTPS API base URL, including `/api` (for example, `https://pos-api.example.com/api`).
   Set `VITE_API_URL` to the Render service URL from the preceding section plus `/api` (for example, `https://cfi-pos-api.onrender.com/api`).
4. Set `FRONTEND_URL` and `CORS_ORIGINS` on Render to the exact Vercel production origin and any custom frontend domains, comma-separated. Add only known stable Vercel preview origins that need API access; do not allow arbitrary `*.vercel.app` origins.
5. Deploy from Vercel once. After that, Vercel automatically builds and deploys each push to the connected GitHub repository; pushes to the configured production branch create Production Deployments, and other branches create Preview Deployments. Review Vercel's deployment status/checks on GitHub.

The Vercel build deliberately fails with an actionable error if `VITE_API_URL` is missing, is not HTTPS, or does not end in `/api`. Vite embeds this public API URL at build time, so changing it requires a new deployment. Supabase variables are not required. Database credentials, `JWT_SECRET`, `ENCRYPTION_KEY`, and payment-provider secrets belong only on the API host and must never be added as `VITE_` variables. Deploy backend migrations on the API host using the existing TypeORM migration instructions before releasing backend updates.

#### Optional Supabase extension assets

The main POS application does not call Supabase; its authenticated API and transactional sale route use PostgreSQL through TypeORM. The following SQL migration applies only if separately deploying the repository's optional Supabase extension assets. It is not needed for the PostgreSQL-only setup.

The Supabase migration `20261005204500_restrict_secure_sale_rpc.sql` revokes execution of the unused `public.create_secure_sale` SECURITY DEFINER RPC from all API roles. To verify grants directly in a Supabase project after applying that optional migration, run:

```sql
SELECT
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_secure_sale';
```

Every returned row must have all three values `false`; zero rows means the RPC does not exist. The SQL migration aborts if any API role can execute the function. The database owner and superusers retain their inherent administrative ability; keep those credentials restricted.

### Paybill and checkout-reservation deployment

Paybill automatic confirmation uses Safaricom C2B validation and confirmation URLs. Set both `MPESA_C2B_CALLBACK_BASE_URL` and `MPESA_C2B_CALLBACK_TOKEN` on the backend, apply the backend TypeORM migrations in order, configure the Paybill shortcode in Settings, then have an admin register the callbacks. Use a public HTTPS origin; keep the C2B token secret and redact callback query strings from proxy/access logs. Paybill is offered only when the registered shortcode matches the configured shortcode. Till payments use STK Push, not manual Till C2B.

Before applying migration `1791020000000-AddMpesaPaybillReferences`, inspect existing receipt duplicates and reconcile them before creating the unique index:

```sql
SELECT mpesa_receipt_number, COUNT(*)
FROM mpesa_transactions
WHERE mpesa_receipt_number IS NOT NULL
GROUP BY mpesa_receipt_number
HAVING COUNT(*) > 1;
```

Do not delete duplicate financial records just to make the migration succeed; determine the correct reconciliation with the payment provider and accounting records first. The migration must be applied to the backend database using `cd server && npm run migration:run`; the legacy `database_migrations.sql` is not a substitute for these TypeORM migrations.

Checkout reservations intentionally remain active until a checkout is completed or safely cancelled. Monitor unresolved payments and reconcile them with Safaricom before manually releasing stock; there is no automatic timeout or live provider-query recovery yet. Payment callback and gateway behavior has been mock-tested only and must be verified in the Safaricom test environment before production.

M-Pesa return approval does not send a payout. It records the customer refund as payable; a supervisor, manager, or admin must complete the payout through Safaricom and then record the successful receipt on the Returns page. Only that receipt confirmation settles the payable and adjusts the confirming user's open-shift M-Pesa total. Migration `1791030000001-AddMpesaRefundSettlement` marks legacy approved M-Pesa returns as pending; reconcile those records against Safaricom before recording receipts.

## User Roles

### Admin
- Full access to all features
- Product management (add, edit, delete)
- User management
- Vendor management
- Access to all reports and analytics
- Purchase order management

### Cashier
- Point of sale operations
- View products and inventory
- Customer management
- View own sales history
- Process payments (cash/M-Pesa)

## Offline Functionality

The installed PWA caches the application shell and keeps the POS product catalogue and queued sales in browser IndexedDB. Offline access is available only on a device where the cashier has already signed in online. The queue is scoped to that cashier and each sale is replayed with the same verified identity and idempotency key when connectivity returns.

Offline checkout is deliberately limited to provisional walk-in cash sales using cached product prices and tax rates. M-Pesa, Paybill, store credit, customer accounts, loyalty discounts, and checkout reservations require a live server. A provisional receipt is not a confirmed sale or official invoice.

When reconnecting, the server rechecks current prices, tax, stock, warehouse, and shift requirements. A changed total or other server-side validation failure is held for review rather than silently recorded or discarded; resolve the issue and retry as the original cashier. The online/offline indicator shows queued and conflicted sales.

Before deploying the offline-sale backend support, back up the database and apply pending TypeORM migrations from `server` with `npm run migration:run`. This includes `1791090000000-AddOfflineSaleAudit`, which adds the audit timestamp for when an offline sale was captured.

For workstation and mobile installation, per-device offline preparation, outage recovery, and a controlled rollout checklist, see [INSTALLATION_GUIDE.md](./INSTALLATION_GUIDE.md).

## Security Features

- Role-based access control (RBAC)
- Row Level Security (RLS) policies
- Secure authentication with Supabase
- Input validation on all forms
- Protected API endpoints

## Support & Documentation

For support or questions about IFMind-POS:
- Contact: **IFMind Tech**
- Email: [EMAIL_ADDRESS]

## License

© 2024 IFMind Tech Solutions. All rights reserved.

---

**Built with ❤️ by  IFMIND Tech Solutions**
