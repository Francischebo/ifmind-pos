# IFMind-POS - Professional Wholesale Point of Sale System

## Project Overview

**IFMind-POS** is a modern, professional wholesale point-of-sale system built by **IFMind Technologies Ltd**. This application provides comprehensive inventory management, sales tracking, customer management, and real-time reporting capabilities with full offline functionality.

## Key Features

- 📱 **Progressive Web App (PWA)** - Install on any device, works offline
- 🔐 **Role-Based Access Control** - Admin and Cashier roles with specific permissions
- 📊 **Real-Time Dashboard** - Track sales, inventory, and low stock alerts
- 🛒 **Point of Sale** - Fast checkout with barcode scanning support
- 💰 **Multiple Payment Methods** - Cash and M-Pesa integration
- 📦 **Inventory Management** - Track stock levels, costs, and pricing
- 👥 **Customer Management** - Maintain customer records and transaction history
- 🏢 **Vendor Management** - Track suppliers and purchase orders
- 📈 **Reports & Analytics** - Sales reports, inventory reports, and more
- 🔄 **Offline Sync** - Queue transactions offline, auto-sync when connected
- 🎨 **Responsive Design** - Works on all devices from mobile to desktop

## Technologies Used

This project is built with modern web technologies:

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **Supabase** - Backend database and authentication
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
cd 

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

Database encryption requires `ENCRYPTION_KEY` to be a 64-character hexadecimal value (32 bytes). The TypeORM backend supplies it as the PostgreSQL `app.encryption_key` session setting. Supabase PostgREST connections must be configured with the same value for the `authenticator` role before applying migrations that encrypt data; never expose this value as a `VITE_` variable. The migration fails closed when the setting is absent.

Apply backend TypeORM migrations before starting a production server after an update:

```sh
cd server
npm run migration:run
```

The main-warehouse migration keeps the oldest existing main warehouse and demotes any duplicate main locations before adding a unique database index. Back up production data before applying migrations. To revert the most recent backend migration, run `npm run migration:revert` from `server`.

For existing installations, take a verified backup before applying the encryption migration. It refreshes customer and M-Pesa phone ciphertext from their retained plaintext columns. If audit-log or offline-queue ciphertext exists, supply its original key only for the migration session using `app.legacy_encryption_key`; the migration re-encrypts those rows under `app.encryption_key` and aborts if the legacy key is absent or incorrect. If that key is unavailable, stop the migration and preserve the backup; the new key cannot recover old ciphertext.

Configure `mpesa_shortcode` through the authenticated admin Settings page. Do not commit `.env` files or provider credentials.

M-Pesa callback URLs include a random per-request token; server request logs omit query strings. Configure reverse proxies and provider-side logs to redact callback query parameters. Before deploying the callback-token column migration, allow all existing pending STK requests to complete or expire; older rows have no callback token hash and their callbacks will be rejected.

### Docker deployment

The repository includes production-oriented API and web images and a Compose deployment. The web container serves the built frontend and proxies `/api` and `/socket.io` (including WebSocket upgrades) to the API, so the browser uses one origin. Terminate public HTTPS at a trusted reverse proxy or load balancer in front of the web container.

Docker Compose expects an existing PostgreSQL database with the application's baseline schema. `DATABASE_URL` must be reachable from the API container. The backend migrations in `server` are incremental and are not a fresh-database bootstrap; do not use the Supabase-specific `database_migrations.sql` as a generic PostgreSQL initializer. Back up the database and provision its baseline schema using the existing supported setup before continuing.

1. Copy `docker-compose.env.example` to `.env` and set the database URL, JWT secret, encryption key, public origin, and Supabase public client settings. Generate two independent random secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and assign one to `JWT_SECRET` and one to `ENCRYPTION_KEY`. Never commit `.env`.
2. Apply pending backend TypeORM migrations before starting or updating the application:

   ```sh
   docker compose run --rm api npm run migration:run:docker
   ```

3. Build and start the services:

   ```sh
   docker compose up --build -d
   ```

4. Open `http://localhost:8080` (or the configured `HTTP_PORT`) and check `docker compose ps` for healthy services. Set `PUBLIC_ORIGIN` to the exact external origin, such as `https://pos.example.com`, when using a TLS-terminating proxy.

The Compose API container is not published directly to the host; it is reachable only by the web proxy on the private Compose network. `TYPEORM_SYNCHRONIZE` is explicitly disabled. Keep runtime credentials in a protected environment file or deployment secret manager; only the Supabase URL and publishable key are build-time public frontend settings. Rebuild the web image when changing those public settings. Configure provider callback URLs to use the public HTTPS origin and preserve their query strings.

### Vercel frontend with GitHub auto-deploy

Vercel serves the Vite frontend. Keep the Express API on a persistent HTTPS host (for example, the Docker deployment above): the API uses Socket.IO and a scheduled job, which require a long-lived Node process and are not supported as persistent services by Vercel Functions.

1. Push this repository to GitHub and import it into Vercel using **Add New → Project**. Select the repository and set the **Root Directory** to `Retail-store-pos-system-main` if this folder is nested inside the GitHub repository; otherwise use the repository root.
2. Keep the project framework as **Vite** and use the build settings in `vercel.json` (`npm ci`, `npm run build:vercel`, output `dist`). Do not configure the API's `server` directory as the Vercel project root.
3. Add these values under **Project Settings → Environment Variables** for Production and Preview as appropriate:
   - `VITE_API_URL`: the public HTTPS API base URL, including `/api` (for example, `https://pos-api.example.com/api`).
   - `VITE_SUPABASE_URL`: the Supabase project HTTPS URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: the Supabase publishable/anon key. This is intentionally public client configuration; never use a service-role key here.
4. On the persistent API host, set `CORS_ORIGINS` to the exact Vercel production origin and any custom frontend domains, comma-separated (for example, `https://your-project.vercel.app,https://pos.example.com`). Add the stable Vercel branch-preview origins that should be allowed; do not allow arbitrary `*.vercel.app` origins. Set `FRONTEND_URL` to the production frontend origin as well.
5. Deploy from Vercel once. After that, Vercel automatically builds and deploys each push to the connected GitHub repository; pushes to the configured production branch create Production Deployments, and other branches create Preview Deployments. Review Vercel's deployment status/checks on GitHub.

The Vercel build deliberately fails with an actionable error if any required frontend variable is missing or if the API/Supabase URL is not HTTPS (the API URL must end in `/api`). Vite embeds these public values at build time, so changing them requires a new deployment. Database credentials, `JWT_SECRET`, `ENCRYPTION_KEY`, and payment-provider secrets belong only on the API host and must never be added as `VITE_` variables. Deploy backend migrations on the API host using the existing TypeORM migration instructions before releasing backend updates.

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

Molabs-POS is designed to work seamlessly offline:

- All critical features available without internet
- Transactions queued automatically when offline
- Auto-sync when connection is restored
- Visual indicator shows online/offline status
- PWA installation for native-like experience

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
