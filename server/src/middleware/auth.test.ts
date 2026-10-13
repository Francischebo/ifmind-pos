import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
    resolveCookieSameSite,
    resolveCookieDomain,
    getAuthCookieOptions,
    getClearAuthCookieOptions,
} from "./auth";

test("resolveCookieSameSite defaults appropriately and enforces allowed values", () => {
    const originalEnv = {
        COOKIE_SAMESITE: process.env.COOKIE_SAMESITE,
        NODE_ENV: process.env.NODE_ENV,
    };

    try {
        delete process.env.COOKIE_SAMESITE;

        process.env.NODE_ENV = "production";
        assert.equal(resolveCookieSameSite(), "strict");

        process.env.NODE_ENV = "development";
        assert.equal(resolveCookieSameSite(), "lax");

        process.env.NODE_ENV = "test";
        assert.equal(resolveCookieSameSite(), "lax");

        // Explicit valid values
        process.env.COOKIE_SAMESITE = "strict";
        assert.equal(resolveCookieSameSite(), "strict");

        process.env.COOKIE_SAMESITE = "lax";
        assert.equal(resolveCookieSameSite(), "lax");

        process.env.COOKIE_SAMESITE = "none";
        assert.equal(resolveCookieSameSite(), "none");

        // Case-insensitive and trimmed
        process.env.COOKIE_SAMESITE = "  None  ";
        assert.equal(resolveCookieSameSite(), "none");

        process.env.COOKIE_SAMESITE = "  STRICT  ";
        assert.equal(resolveCookieSameSite(), "strict");

        // Invalid values throw descriptive errors
        process.env.COOKIE_SAMESITE = "invalid";
        assert.throws(() => resolveCookieSameSite(), /Invalid COOKIE_SAMESITE 'invalid'/);

        process.env.COOKIE_SAMESITE = "any";
        assert.throws(() => resolveCookieSameSite(), /Supported values are 'strict', 'lax', or 'none'/);
    } finally {
        if (originalEnv.COOKIE_SAMESITE !== undefined) {
            process.env.COOKIE_SAMESITE = originalEnv.COOKIE_SAMESITE;
        } else {
            delete process.env.COOKIE_SAMESITE;
        }
        if (originalEnv.NODE_ENV !== undefined) {
            process.env.NODE_ENV = originalEnv.NODE_ENV;
        } else {
            delete process.env.NODE_ENV;
        }
    }
});

test("resolveCookieDomain extracts clean domain names and handles malformed inputs", () => {
    const originalCookieDomain = process.env.COOKIE_DOMAIN;

    try {
        delete process.env.COOKIE_DOMAIN;
        assert.equal(resolveCookieDomain(), undefined);

        process.env.COOKIE_DOMAIN = "   ";
        assert.equal(resolveCookieDomain(), undefined);

        process.env.COOKIE_DOMAIN = ".example.co.ke";
        assert.equal(resolveCookieDomain(), ".example.co.ke");

        process.env.COOKIE_DOMAIN = "api.example.co.ke";
        assert.equal(resolveCookieDomain(), "api.example.co.ke");

        // Strips accidental protocol and port
        process.env.COOKIE_DOMAIN = "https://app.example.co.ke:8080";
        assert.equal(resolveCookieDomain(), "app.example.co.ke");

        process.env.COOKIE_DOMAIN = "http://localhost:3000";
        assert.equal(resolveCookieDomain(), "localhost");
    } finally {
        if (originalCookieDomain !== undefined) {
            process.env.COOKIE_DOMAIN = originalCookieDomain;
        } else {
            delete process.env.COOKIE_DOMAIN;
        }
    }
});

test("getAuthCookieOptions enforces security requirements for SameSite=None and domain scoping", () => {
    const originalEnv = {
        COOKIE_SAMESITE: process.env.COOKIE_SAMESITE,
        COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
        NODE_ENV: process.env.NODE_ENV,
    };

    try {
        process.env.NODE_ENV = "production";
        delete process.env.COOKIE_SAMESITE;
        delete process.env.COOKIE_DOMAIN;

        // Default production options
        const prodOptions = getAuthCookieOptions(86400000);
        assert.equal(prodOptions.httpOnly, true);
        assert.equal(prodOptions.secure, true);
        assert.equal(prodOptions.sameSite, "strict");
        assert.equal(prodOptions.path, "/");
        assert.equal(prodOptions.domain, undefined);
        assert.equal(prodOptions.maxAge, 86400000);

        // SameSite=None in development MUST still enforce secure=true per browser specifications
        process.env.NODE_ENV = "development";
        process.env.COOKIE_SAMESITE = "none";
        process.env.COOKIE_DOMAIN = ".example.co.ke";

        const crossDomainOptions = getAuthCookieOptions(3600000);
        assert.equal(crossDomainOptions.httpOnly, true);
        assert.equal(crossDomainOptions.secure, true, "SameSite=None must always enforce secure: true");
        assert.equal(crossDomainOptions.sameSite, "none");
        assert.equal(crossDomainOptions.domain, ".example.co.ke");
        assert.equal(crossDomainOptions.maxAge, 3600000);

        // Clear cookie options matches path, domain, secure, sameSite without maxAge
        const clearOptions = getClearAuthCookieOptions();
        assert.equal(clearOptions.httpOnly, true);
        assert.equal(clearOptions.secure, true);
        assert.equal(clearOptions.sameSite, "none");
        assert.equal(clearOptions.domain, ".example.co.ke");
        assert.equal(clearOptions.path, "/");
        assert.equal(clearOptions.maxAge, undefined);
    } finally {
        if (originalEnv.COOKIE_SAMESITE !== undefined) {
            process.env.COOKIE_SAMESITE = originalEnv.COOKIE_SAMESITE;
        } else {
            delete process.env.COOKIE_SAMESITE;
        }
        if (originalEnv.COOKIE_DOMAIN !== undefined) {
            process.env.COOKIE_DOMAIN = originalEnv.COOKIE_DOMAIN;
        } else {
            delete process.env.COOKIE_DOMAIN;
        }
        if (originalEnv.NODE_ENV !== undefined) {
            process.env.NODE_ENV = originalEnv.NODE_ENV;
        } else {
            delete process.env.NODE_ENV;
        }
    }
});
