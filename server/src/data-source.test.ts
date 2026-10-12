import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

test("production refuses TypeORM schema synchronization", () => {
    const result = spawnSync(
        process.execPath,
        ["--require", "ts-node/register", "-e", "require('./src/data-source')"],
        {
            cwd: path.resolve(__dirname, ".."),
            encoding: "utf8",
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "production",
                DATABASE_URL: "postgresql://localhost:5432/pos_test",
                ENCRYPTION_KEY: "a".repeat(64),
                JWT_SECRET: "c".repeat(64),
                TYPEORM_SYNCHRONIZE: "true",
            },
        },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TYPEORM_SYNCHRONIZE must be disabled in production/);
});

test("PostgreSQL pool sizing is configurable and bounded", () => {
    const result = spawnSync(
        process.execPath,
        [
            "--require",
            "ts-node/register",
            "-e",
            "const { AppDataSource } = require('./src/data-source'); console.log(JSON.stringify(AppDataSource.options.extra));",
        ],
        {
            cwd: path.resolve(__dirname, ".."),
            encoding: "utf8",
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "test",
                DATABASE_URL: "postgresql://localhost:5432/pos_test",
                ENCRYPTION_KEY: "a".repeat(64),
                PG_POOL_MAX: "17",
                PG_CONNECTION_TIMEOUT_MS: "9000",
            },
        },
    );

    assert.equal(result.status, 0, result.stderr);
    const outputLine = result.stdout.trim().split(/\r?\n/).find((line) => line.trim().startsWith("{"));
    assert.ok(outputLine, result.stdout);
    const options = JSON.parse(outputLine) as {
        max: number;
        connectionTimeoutMillis: number;
    };
    assert.equal(options.max, 17);
    assert.equal(options.connectionTimeoutMillis, 9000);
});

test("PostgreSQL pool sizing rejects unsafe or malformed values", () => {
    const result = spawnSync(
        process.execPath,
        ["--require", "ts-node/register", "-e", "require('./src/data-source')"],
        {
            cwd: path.resolve(__dirname, ".."),
            encoding: "utf8",
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "test",
                DATABASE_URL: "postgresql://localhost:5432/pos_test",
                ENCRYPTION_KEY: "a".repeat(64),
                PG_POOL_MAX: "0",
            },
        },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /PG_POOL_MAX must be an integer between 1 and 100/);
});

test("production rejects known default ENCRYPTION_KEY", () => {
    const result = spawnSync(
        process.execPath,
        ["--require", "ts-node/register", "-e", "require('./src/data-source')"],
        {
            cwd: path.resolve(__dirname, ".."),
            encoding: "utf8",
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "production",
                DATABASE_URL: "postgresql://localhost:5432/pos_test",
                ENCRYPTION_KEY: "854b1203f9667e40f1b2f9c98e24b76a296b1f265eaaaf1d6d64954d1bafa9d3",
                TYPEORM_SYNCHRONIZE: "false",
            },
        },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Default static ENCRYPTION_KEY detected in production/);
});

test("production rejects known default or weak JWT_SECRET", () => {
    const result = spawnSync(
        process.execPath,
        ["--require", "ts-node/register", "-e", "require('./src/data-source')"],
        {
            cwd: path.resolve(__dirname, ".."),
            encoding: "utf8",
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "production",
                DATABASE_URL: "postgresql://localhost:5432/pos_test",
                ENCRYPTION_KEY: "b".repeat(64),
                JWT_SECRET: "e2e738d0341c20993ff3a19a8e840efa9dc826dab287b27376e69bb9ef6562d1",
                TYPEORM_SYNCHRONIZE: "false",
            },
        },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /JWT_SECRET in production must be at least 32 characters and cannot match sample\/default keys/);
});

test("AdminSetupService validates admin password strength and blocks default in production", () => {
    const { AdminSetupService } = require("./services/AdminSetupService");

    // Rejects known default in production
    assert.throws(
        () => AdminSetupService.validateAdminPassword("Fr@nk123!!__", true),
        /matches a known default password/i,
    );

    // Rejects short password in production (<12 chars)
    assert.throws(
        () => AdminSetupService.validateAdminPassword("ShortPass1!", true),
        /must be at least 12 characters long in production/i,
    );

    // Allows strong password in production
    assert.doesNotThrow(
        () => AdminSetupService.validateAdminPassword("SuperSecureLongPassword2026!#", true),
    );

    // Rejects empty password
    assert.throws(
        () => AdminSetupService.validateAdminPassword("", false),
        /must not be empty/i,
    );
});

test("sanitizeChangePasswordPayload enforces security rules", () => {
    const { sanitizeChangePasswordPayload } = require("./controllers/AuthController");

    // Requires object
    assert.throws(() => sanitizeChangePasswordPayload(null), /must be an object/i);

    // Requires current password
    assert.throws(() => sanitizeChangePasswordPayload({ current_password: "", new_password: "ValidNewPassword123!" }), /current_password is required/i);

    // Requires strong new password length
    assert.throws(() => sanitizeChangePasswordPayload({ current_password: "OldPassword1!", new_password: "short" }), /between 8 and 128 characters/i);

    // Rejects unchanged password
    assert.throws(() => sanitizeChangePasswordPayload({ current_password: "SamePassword123!", new_password: "SamePassword123!" }), /must be different/i);

    // Rejects known default password
    assert.throws(() => sanitizeChangePasswordPayload({ current_password: "OldPassword1!", new_password: "Fr@nk123!!__" }), /cannot be a known default development password/i);

    // Valid payload
    const result = sanitizeChangePasswordPayload({
        current_password: "OldPassword1!",
        new_password: "SuperSecureNewPassword2026!@",
    });
    assert.equal(result.current_password, "OldPassword1!");
    assert.equal(result.new_password, "SuperSecureNewPassword2026!@");
});
