import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import { AppDataSource } from "../data-source";
import { User } from "../entity/User";

export interface AuthenticatedRequest extends Request {
    params: Record<string, string>;
    user?: {
        id: string;
        email: string;
        role: string;
        is_otp_phase?: boolean;
    };
}

export const KNOWN_DEFAULT_JWT_SECRETS = new Set([
    "e2e738d0341c20993ff3a19a8e840efa9dc826dab287b27376e69bb9ef6562d1".toLowerCase(),
    "secret",
    "jwt_secret",
    "changeme",
]);

export const getJwtSecret = () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not configured");
    }
    if (process.env.NODE_ENV === "production") {
        if (jwtSecret.length < 32 || KNOWN_DEFAULT_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
            throw new Error("FATAL: JWT_SECRET in production must be at least 32 characters and cannot match sample/default keys.");
        }
    }
    return jwtSecret;
};

export type CookieSameSite = "strict" | "lax" | "none";

export interface AuthCookieOptions {
    httpOnly: boolean;
    secure: boolean;
    sameSite: CookieSameSite;
    domain?: string;
    path: string;
    maxAge?: number;
}

export const resolveCookieSameSite = (): CookieSameSite => {
    const raw = (process.env.COOKIE_SAMESITE || "").trim().toLowerCase();
    if (!raw) {
        return process.env.NODE_ENV === "production" ? "strict" : "lax";
    }
    if (raw === "strict" || raw === "lax" || raw === "none") {
        return raw;
    }
    throw new Error(`Invalid COOKIE_SAMESITE '${raw}'. Supported values are 'strict', 'lax', or 'none'.`);
};

export const resolveCookieDomain = (): string | undefined => {
    const raw = (process.env.COOKIE_DOMAIN || "").trim();
    if (!raw) return undefined;
    // Strip leading protocol and port if mistakenly provided
    const sanitized = raw.replace(/^https?:\/\//i, "").split(":")[0].replace(/^\/+/, "");
    return sanitized || undefined;
};

export const getAuthCookieOptions = (maxAgeMs?: number): AuthCookieOptions => {
    const sameSite = resolveCookieSameSite();
    const domain = resolveCookieDomain();
    const isProd = process.env.NODE_ENV === "production";
    // In compliance with RFC 6265bis, SameSite=None requires the Secure attribute
    const secure = sameSite === "none" ? true : isProd;

    const options: AuthCookieOptions = {
        httpOnly: true,
        secure,
        sameSite,
        path: "/",
    };

    if (domain) {
        options.domain = domain;
    }

    if (typeof maxAgeMs === "number") {
        options.maxAge = maxAgeMs;
    }

    return options;
};

export const getClearAuthCookieOptions = (): AuthCookieOptions => {
    return getAuthCookieOptions();
};

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let token: string | undefined;

    // 1. Try to read token from secure HttpOnly cookie
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const match = /(?:^|;\s*)jwt_token=([^;]+)/.exec(cookieHeader);
        if (match) {
            token = decodeURIComponent(match[1]);
        }
    }

    // 2. Fallback to Authorization header
    if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
            token = authHeader.slice(7).trim();
        } else {
            token = authHeader.split(" ")[1]?.trim();
        }
    }

    if (!token) {
        return res.sendStatus(401);
    }

    jwt.verify(token, getJwtSecret(), async (err, decoded) => {
        if (err || !decoded || typeof decoded === "string") {
            return res.sendStatus(403);
        }
        if ((decoded as Record<string, unknown>).is_otp_phase === true) {
            return res.status(401).json({ message: "Two-factor authentication must be completed." });
        }
        const userId = typeof decoded.id === "string" ? decoded.id : "";
        const email = typeof decoded.email === "string" ? decoded.email : "";
        const role = typeof decoded.role === "string" ? decoded.role : "";
        if (!userId || !email || !role) return res.sendStatus(403);

        try {
            const currentUser = await AppDataSource.getRepository(User).findOneBy({ id: userId });
            if (!currentUser || !currentUser.is_active) {
                return res.status(401).json({ message: "Account is inactive" });
            }
            req.user = {
                ...decoded,
                id: currentUser.id,
                email: currentUser.email,
                role: currentUser.role,
            };
        } catch (error) {
            console.error("Authentication user lookup failed:", error);
            return res.sendStatus(503);
        }
        next();
    });
};

export const requireRole = (role: string) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).send("Unauthorized");
        }

        if (req.user.role !== role && req.user.role !== "admin") {
            return res.status(403).send("Forbidden");
        }

        next();
    };
};

export const requireRoles = (roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).send("Unauthorized");
        }

        if (!roles.includes(req.user.role) && req.user.role !== "admin") {
            return res.status(403).send("Forbidden: Insufficient privileges");
        }

        next();
    };
};
