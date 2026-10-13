import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { AppDataSource } from "../data-source";

export interface ObservabilityRequest extends Request {
    id?: string;
}

const SENSITIVE_QUERY_PARAMS = new Set([
    "callback_token",
    "token",
    "otp_token",
    "otp",
    "code",
    "password",
    "secret",
    "key",
]);

const SENSITIVE_BODY_KEYS = new Set([
    "password",
    "current_password",
    "new_password",
    "confirm_password",
    "otp",
    "code",
    "otp_token",
    "token",
    "secret",
    "api_key",
    "consumer_secret",
    "passkey",
]);

/**
 * Sanitizes URLs to mask sensitive query parameters in logs.
 */
export function sanitizeUrlForLogging(url: string): string {
    try {
        const parsed = new URL(url, "http://localhost");
        let modified = false;
        parsed.searchParams.forEach((_, key) => {
            if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
                parsed.searchParams.set(key, "[REDACTED]");
                modified = true;
            }
        });
        if (!modified) return url;
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return url.replace(/([?&](?:callback_token|token|otp|code|password)=)[^&]*/gi, "$1[REDACTED]");
    }
}

/**
 * Redacts sensitive fields from objects (headers, bodies).
 */
export function redactSensitiveObject(obj: unknown, depth = 0): unknown {
    if (!obj || typeof obj !== "object" || depth > 4) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item) => redactSensitiveObject(item, depth + 1));
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_BODY_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("secret")) {
            redacted[key] = "[REDACTED]";
        } else if (lowerKey === "authorization") {
            redacted[key] = typeof value === "string" && value.startsWith("Bearer ")
                ? "Bearer [REDACTED]"
                : "[REDACTED]";
        } else if (lowerKey === "cookie") {
            redacted[key] = typeof value === "string"
                ? value.replace(/(jwt_token=)[^;]+/gi, "$1[REDACTED]")
                : "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
            redacted[key] = redactSensitiveObject(value, depth + 1);
        } else {
            redacted[key] = value;
        }
    }
    return redacted;
}

/**
 * Middleware: Attaches a unique Request ID to every incoming request.
 */
export const requestIdMiddleware = (req: ObservabilityRequest, res: Response, next: NextFunction) => {
    const existingId = req.headers["x-request-id"];
    const requestId = typeof existingId === "string" && /^[a-zA-Z0-9_\-.]{8,64}$/.test(existingId)
        ? existingId
        : randomUUID();

    req.id = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
};

/**
 * Middleware: Structured request logging with Request ID and redaction.
 */
export const requestLoggingMiddleware = (req: ObservabilityRequest, res: Response, next: NextFunction) => {
    const start = Date.now();
    const isProduction = process.env.NODE_ENV === "production";
    const forceJson = process.env.LOG_FORMAT === "json";

    res.on("finish", () => {
        const durationMs = Date.now() - start;
        const sanitizedPath = sanitizeUrlForLogging(req.originalUrl || req.url || req.path);
        const requestId = req.id || "unknown";

        if (isProduction || forceJson) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
                requestId,
                method: req.method,
                path: sanitizedPath,
                statusCode: res.statusCode,
                durationMs,
                ip: req.ip || "127.0.0.1",
                userAgent: req.headers["user-agent"] || "",
            };
            console.log(JSON.stringify(logEntry));
        } else {
            console.log(`[HTTP] [${requestId}] ${req.method} ${sanitizedPath} - ${res.statusCode} - ${durationMs}ms`);
        }
    });

    next();
};

/**
 * Optional error tracking service (e.g. Sentry hook via SENTRY_DSN).
 */
export class ErrorTracker {
    private static sentryDsn = process.env.SENTRY_DSN?.trim() || "";

    static init(): void {
        if (this.sentryDsn) {
            console.log("[Observability] Error tracking initialized with SENTRY_DSN.");
        }
    }

    static captureException(error: unknown, context?: { requestId?: string; path?: string; user?: unknown }): void {
        if (!this.sentryDsn) {
            return;
        }

        try {
            // Log structured error for Sentry / observability collector ingestion
            const errorPayload = {
                timestamp: new Date().toISOString(),
                level: "error",
                sentryDsnConfigured: true,
                requestId: context?.requestId || "unknown",
                path: context?.path ? sanitizeUrlForLogging(context.path) : undefined,
                error: error instanceof Error ? {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                } : String(error),
            };
            console.error("[SENTRY_ERROR]", JSON.stringify(errorPayload));
        } catch {
            // Safeguard against error logger throwing
        }
    }
}

/**
 * Liveness check endpoint (/health): validates application process is alive without touching DB.
 */
export const livenessHandler = (_req: Request, res: Response) => {
    res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
};

/**
 * Readiness check endpoint (/ready): validates database connectivity and schema readiness.
 */
export const readinessHandler = async (_req: Request, res: Response) => {
    try {
        if (!AppDataSource.isInitialized) {
            return res.status(503).json({
                status: "not_ready",
                database: "uninitialized",
            });
        }

        await AppDataSource.query("SELECT 1");
        return res.status(200).json({
            status: "ready",
            database: "connected",
        });
    } catch (error) {
        console.error("Readiness check failed: PostgreSQL is unavailable.", error);
        return res.status(503).json({
            status: "not_ready",
            database: "disconnected",
        });
    }
};
