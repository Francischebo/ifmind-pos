#!/bin/sh
set -e

# ==============================================================================
# cfi-POS Techiez - Docker Entrypoint Script
# Automatically verifies database connection, runs bootstrap for empty schemas,
# checks migrations, and starts the API server.
# ==============================================================================

echo "[Docker Entrypoint] Preparing cfi-POS API runtime..."

if [ -n "$DATABASE_URL" ]; then
    node -e "
    const { Client } = require('pg');
    const { spawnSync } = require('child_process');

    async function ensureSchema() {
        const client = new Client({ connectionString: process.env.DATABASE_URL });
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
            try {
                await client.connect();
                break;
            } catch (err) {
                attempts++;
                console.log('[Docker Entrypoint] Waiting for database connection (attempt ' + attempts + '/' + maxAttempts + ')...');
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        try {
            const res = await client.query(\"SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name != 'migrations'\");
            const tableCount = res.rows[0].count;

            if (tableCount === 0) {
                console.log('[Docker Entrypoint] Clean database detected (0 tables). Bootstrapping schema and migrations...');
                const bootstrap = spawnSync(process.execPath, ['dist/bootstrap.js'], {
                    stdio: 'inherit',
                    env: {
                        ...process.env,
                        POS_DB_BOOTSTRAP_CONFIRM: 'CREATE_SCHEMA_IN_EMPTY_DATABASE'
                    }
                });
                if (bootstrap.status !== 0) {
                    console.error('[Docker Entrypoint] Database bootstrap failed with status', bootstrap.status);
                    process.exit(1);
                }
                console.log('[Docker Entrypoint] Schema bootstrap completed successfully.');
            } else {
                console.log('[Docker Entrypoint] Database already provisioned (' + tableCount + ' tables present).');
            }
        } catch (err) {
            console.error('[Docker Entrypoint] Database inspection failed:', err.message);
            process.exit(1);
        } finally {
            await client.end().catch(() => {});
        }
    }

    ensureSchema().catch((err) => {
        console.error('[Docker Entrypoint] Fatal initialization error:', err);
        process.exit(1);
    });
    "
fi

exec "$@"
