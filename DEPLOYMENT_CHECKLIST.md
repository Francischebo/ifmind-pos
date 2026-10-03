# 🚀 Production Deployment Checklist - Secure POS System

## ✅ Pre-Deployment Verification

### 1. Database Migrations Applied
- [ ] Open Supabase Dashboard → SQL Editor
- [ ] Copy and paste `database_migrations.sql` content
- [ ] Execute all migrations in order
- [ ] Verify all tables, functions, and policies created successfully

### 2. Environment Variables Configured
- [ ] Update `.env` with real production values:
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (from Supabase project settings)
  - [ ] `MPESA_CONSUMER_KEY` (production credentials)
  - [ ] `MPESA_CONSUMER_SECRET` (production credentials)
  - [ ] `MPESA_PASSKEY` (production credentials)
  - [ ] `MPESA_C2B_CALLBACK_BASE_URL` (public HTTPS origin for Paybill callbacks)
  - [ ] `MPESA_C2B_CALLBACK_TOKEN` (64–128 hexadecimal characters; store as a secret)
  - [ ] Preserve callback query parameters and redact callback tokens from proxy/access logs
  - [ ] Drain or expire pending M-Pesa STK requests before deploying callback-token migration
  - [ ] `RESEND_API_KEY` (production email service)
  - [ ] `GEMINI_API_KEY` (if using AI features)
  - [ ] `ENCRYPTION_KEY` (64-character hex key, 32 bytes; not a `VITE_` variable)

### 3. Security Configuration
- [ ] Verify CSP headers in `vite.config.ts`
- [ ] Confirm PWA manifest is properly linked
- [ ] Check service worker security features
- [ ] Validate RLS policies are active

## 🚀 Deployment Steps

### Vercel frontend with GitHub auto-deploy
- [ ] Import the GitHub repository into Vercel and set the project root to the folder containing `vercel.json` and the root `package.json`.
- [ ] Set `VITE_API_URL` (HTTPS API URL ending in `/api`), `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production and any Preview environments.
- [ ] Keep the Express API, Socket.IO, scheduled jobs, database, and runtime secrets on the persistent backend host; do not put private backend secrets in Vercel frontend variables.
- [ ] Configure backend `FRONTEND_URL` and `CORS_ORIGINS` for the exact Vercel production origin and custom domains; add only known stable preview origins that need API access.
- [ ] Apply backend TypeORM migrations on the API host before releasing changes requiring new schema.
- [ ] Verify a GitHub push creates the intended Preview or Production deployment and verify login, API requests, and real-time updates against the persistent API.

### Docker deployment
- [ ] Provision PostgreSQL with the application's supported baseline schema; TypeORM migrations are incremental, and `database_migrations.sql` is Supabase-specific.
- [ ] Configure `DATABASE_URL`, `JWT_SECRET`, a fresh 64-character hexadecimal `ENCRYPTION_KEY`, `PUBLIC_ORIGIN`, and the public Supabase URL/publishable key in the untracked `.env` copied from `docker-compose.env.example`.
- [ ] Back up the database and apply pending TypeORM migrations with `docker compose run --rm api npm run migration:run:docker`.
- [ ] Build and start with `docker compose up --build -d`; verify both services are healthy with `docker compose ps`.
- [ ] Terminate public HTTPS at a trusted reverse proxy, set `PUBLIC_ORIGIN` to its exact origin, and configure provider callbacks to preserve query parameters.

### Step 1: Build Production Application
```bash
npm run build
```

### Step 2: Deploy to Production
Choose your deployment platform:
- **Vercel**: Connect GitHub repo, set environment variables
- **Netlify**: Connect repo, configure build settings
- **Railway**: Deploy from GitHub, set environment variables
- **Self-hosted**: Upload build files to your server

### Step 3: Configure Production Environment Variables
In your deployment platform, set these environment variables:
```
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
VITE_SUPABASE_URL=your_supabase_url
VITE_API_URL=your_public_api_url
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
PORT=your_backend_port
CORS_ORIGINS=your_allowed_frontend_origins
MPESA_CONSUMER_KEY=your_mpesa_production_key
MPESA_CONSUMER_SECRET=your_mpesa_production_secret
MPESA_PASSKEY=your_mpesa_production_passkey
MPESA_API_BASE_URL=your_mpesa_api_base_url
MPESA_CALLBACK_URL=your_public_mpesa_callback_url
MPESA_C2B_CALLBACK_BASE_URL=https://your-public-backend-origin
MPESA_C2B_CALLBACK_TOKEN=64_to_128_hex_characters
PESAPAL_IPN_SECRET=your_pesapal_ipn_signing_secret
RESEND_API_KEY=your_resend_production_key
ENCRYPTION_KEY=64_hex_characters
JWT_SECRET=your_256_bit_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
AI_GATEWAY_URL=your_ai_gateway_url
AI_MODEL=your_ai_model_identifier
```

Before deploying encryption migrations, take a verified backup and configure PostgreSQL's `app.encryption_key` session setting to the same `ENCRYPTION_KEY` for both the backend connection and Supabase PostgREST sessions. For Supabase, set the value for the `authenticator` role through an administrator-managed secret/configuration process; do not commit the value or place it in frontend variables. If audit/offline encrypted rows exist, set their original key as the session-only `app.legacy_encryption_key` for the migration connection; the migration aborts rather than silently lose data when legacy decryption fails. Preserve the backup and stop if the prior key cannot be verified.

Apply backend TypeORM migrations from `server` with `npm run migration:run` (do not substitute the Supabase SQL script). Before applying `1791020000000-AddMpesaPaybillReferences`, run the duplicate-receipt query in README and reconcile any results against Safaricom and accounting records. After deploying the API, configure the Paybill shortcode in Settings and use the admin callback-registration action; confirm Safaricom accepted the registration before enabling Paybill at the POS. Till payments use STK Push.

Migration `1791030000001-AddMpesaRefundSettlement` marks previously approved M-Pesa returns as awaiting payout confirmation. Reconcile those legacy returns against Safaricom before entering receipts; the POS does not initiate M-Pesa refunds. For new returns, complete the payout through Safaricom first, then record its successful receipt from the Returns page while the confirming user's shift is open.

Reservations protect stock while payment is pending and do not expire automatically. Monitor unresolved transactions and reconcile with Safaricom before manually releasing reserved stock. All current provider tests are mocked; complete sandbox verification before production.

## 📊 Monitoring & Alerting Setup

### Step 1: Enable Supabase Edge Functions
```bash
# Deploy monitoring functions
supabase functions deploy send-inventory-alerts
supabase functions deploy send-scheduled-reports
```

### Step 2: Configure Cron Jobs (Scheduled Reports)
In Supabase Dashboard → Edge Functions:
- Set up daily/weekly report scheduling
- Configure inventory alert triggers

### Step 3: Set Up Error Monitoring
- Enable error logging in database
- Configure alert thresholds
- Set up email notifications for critical errors

### Step 4: Performance Monitoring
- Enable application performance monitoring
- Set up uptime monitoring
- Configure alerting for downtime

## 🔒 Security Audit Checklist

### Pre-Production Security Audit
- [ ] Run final security test: `node security_test.js`
- [ ] Verify all environment variables are production-ready
- [ ] Confirm no sensitive data in client-side code
- [ ] Test authentication flows
- [ ] Validate authorization policies
- [ ] Check encryption functionality
- [ ] Test input validation
- [ ] Verify rate limiting
- [ ] Confirm CSRF protection
- [ ] Test session management

### Production Security Validation
- [ ] SSL/TLS certificate properly configured
- [ ] Security headers active (CSP, HSTS, etc.)
- [ ] Database backups configured
- [ ] Access logging enabled
- [ ] Intrusion detection systems active
- [ ] Regular security updates scheduled

## 🎯 Post-Deployment Tasks

### 1. User Management Setup
- Create admin user accounts
- Assign appropriate roles
- Configure user permissions
- Set up password policies

### 2. System Configuration
- Configure store settings
- Set up product categories
- Configure payment methods
- Set up inventory alerts

### 3. Testing & Validation
- Test complete sales workflow
- Verify offline functionality
- Test PWA installation
- Validate mobile responsiveness
- Check cross-browser compatibility

### 4. Monitoring Activation
- Enable real-time error monitoring
- Set up performance dashboards
- Configure alerting rules
- Establish incident response procedures

## 📞 Support & Maintenance

### Ongoing Security Maintenance
- Regular security updates
- Dependency vulnerability scanning
- Security patch management
- Access review procedures

### Performance Optimization
- Database query optimization
- Caching strategy implementation
- CDN configuration
- Load balancing setup

---

## 🎉 Deployment Complete!

Once all steps are completed, your **enterprise-grade secure POS system** will be live with:
- ✅ Zero-trust security architecture
- ✅ AES-256 encryption
- ✅ Comprehensive monitoring
- ✅ Automated alerting
- ✅ Production-ready performance
- ✅ PWA offline capabilities

**Your retail business is now protected by enterprise-level security!** 🛡️✨</content>
<parameter name="filePath">DEPLOYMENT_CHECKLIST.md