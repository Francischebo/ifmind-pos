import { Request, Response } from "express";
import {
    AuthenticatedRequest,
    getJwtSecret,
    getAuthCookieOptions,
    getClearAuthCookieOptions,
} from "../middleware/auth";
import { AppDataSource } from "../data-source";
import { User, AppRole } from "../entity/User";
import { Profile } from "../entity/Profile";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { OtpCode } from "../entity/OtpCode";
import { EmailService, shouldUseDevOtpFallback } from "../services/EmailService";
import { getErrorMessage } from "../utils/errors";
import { randomInt } from "node:crypto";
import { KNOWN_DEFAULT_PASSWORDS } from "../services/AdminSetupService";

const userRepository = AppDataSource.getRepository(User);
const profileRepository = AppDataSource.getRepository(Profile);
const otpRepository = AppDataSource.getRepository(OtpCode);

const normalizeEmail = (value: unknown) => {
    if (typeof value !== "string") {
        throw new Error("Email must be a valid string");
    }

    const email = value.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("Email must be a valid email address");
    }

    return email;
};

export const sanitizeAuthRegistrationPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Registration payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password.trim() : "";
    const full_name = typeof payload.full_name === "string" ? payload.full_name.trim() : "";

    if (!full_name || full_name.length > 100) {
        throw new Error("full_name is required and must be under 100 characters");
    }

    if (!password || password.length < 8 || password.length > 128) {
        throw new Error("Password must be at least 8 characters long");
    }

    return { email, password, full_name };
};

export const sanitizeAuthLoginPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Login payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password.trim() : "";

    if (!password || password.length > 128) {
        throw new Error("Password is required");
    }

    return { email, password };
};

export const sanitizeChangePasswordPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const current_password = typeof payload.current_password === "string" ? payload.current_password.trim() : "";
    const new_password = typeof payload.new_password === "string" ? payload.new_password.trim() : "";

    if (!current_password) {
        throw new Error("current_password is required");
    }

    if (!new_password || new_password.length < 8 || new_password.length > 128) {
        throw new Error("new_password must be between 8 and 128 characters long");
    }

    if (current_password === new_password) {
        throw new Error("new_password must be different from current_password");
    }

    if (KNOWN_DEFAULT_PASSWORDS.has(new_password.toLowerCase())) {
        throw new Error("new_password cannot be a known default development password");
    }

    return { current_password, new_password };
};

export const sanitizeLogEventPayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Log payload must be a JSON object");
    }

    const payload = input as Record<string, unknown>;

    // Event/Error Type
    let eventTypeRaw = payload.event_type !== undefined ? payload.event_type : payload.error_type;
    if (eventTypeRaw === undefined || eventTypeRaw === null) {
        eventTypeRaw = "generic_event";
    }
    if (typeof eventTypeRaw !== "string") {
        throw new Error("Event or error type must be a string");
    }
    const event_type = eventTypeRaw.trim().slice(0, 100).replace(/[\r\n]+/g, " ");
    if (!event_type) {
        throw new Error("Event or error type cannot be empty");
    }

    // Message / Description
    const messageRaw = payload.error_message || payload.description || payload.message || "";
    if (typeof messageRaw !== "string") {
        throw new Error("Log message must be a string");
    }
    const message = messageRaw.trim().slice(0, 1000).replace(/[\r\n]+/g, " ");

    // Severity / Risk Level
    const severityRaw = String(payload.severity || payload.risk_level || "info").trim().toLowerCase();
    const allowedSeverities = new Set(["debug", "info", "warn", "warning", "error", "critical", "low", "medium", "high"]);
    const severity = allowedSeverities.has(severityRaw) ? severityRaw : "info";

    // Endpoint (optional)
    const endpointRaw = typeof payload.endpoint === "string" ? payload.endpoint.trim().slice(0, 255) : undefined;
    const endpoint = endpointRaw ? endpointRaw.replace(/[\r\n]+/g, "") : undefined;

    // Request Method (optional)
    const methodRaw = typeof payload.request_method === "string" ? payload.request_method.trim().toUpperCase().slice(0, 10) : undefined;
    const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
    const request_method = methodRaw && allowedMethods.has(methodRaw) ? methodRaw : undefined;

    // Stack Trace (optional)
    const stack_trace = typeof payload.stack_trace === "string" ? payload.stack_trace.trim().slice(0, 2000) : undefined;

    // Additional Details / Metadata (strictly capped and sanitized)
    let metadata: Record<string, unknown> | undefined;
    const rawDetails = payload.error_details || payload.metadata;
    if (rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails)) {
        try {
            const serialized = JSON.stringify(rawDetails);
            if (serialized.length <= 4096) {
                metadata = JSON.parse(serialized);
            }
        } catch {
            metadata = { warning: "Non-serializable log details were discarded" };
        }
    }

    return {
        event_type,
        message,
        severity,
        endpoint,
        request_method,
        stack_trace,
        metadata,
    };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

export class AuthController {
    static async register(req: Request, res: Response) {
        return res.status(403).json({
            message: "Public self-registration is disabled. Staff and cashier accounts must be created by a system administrator."
        });
    }

    static async login(req: Request, res: Response) {
        try {
            const { email, password } = sanitizeAuthLoginPayload(req.body);

            const user = await userRepository.findOne({
                where: { email },
                relations: ["profile"]
            });

            if (!user) {
                return res.status(400).json({ message: "Invalid credentials" });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(400).json({ message: "Invalid credentials" });
            }

            if (!user.is_active) {
                return res.status(403).json({ message: "Account disabled" });
            }

            // Invalidate any previously active OTPs for this user
            await otpRepository.update({ user_id: user.id }, { is_used: true });

            // Generate 6-digit OTP
            const rawOtp = randomInt(100000, 1000000).toString();
            const otpHash = await bcrypt.hash(rawOtp, 10);

            // Expiry: 10 minutes from now
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);

            const otpObj = new OtpCode();
            otpObj.user = user;
            otpObj.code_hash = otpHash;
            otpObj.expires_at = expiresAt;
            await otpRepository.save(otpObj);

            const otpSent = await EmailService.sendOtpEmail(user.email, rawOtp);
            if (!otpSent) {
                await otpRepository.update({ id: otpObj.id }, { is_used: true });
                const configurationIssues = EmailService.getOtpEmailConfigurationIssues();
                const message = configurationIssues.length > 0
                    ? "OTP email delivery is not configured. Contact the system administrator, then try signing in again."
                    : "The email provider could not accept the OTP. Contact the system administrator or try signing in again later.";
                return res.status(503).json({ message });
            }

            // Issue temporary OTP token (not fully authorized)
            const otpToken = jwt.sign(
                { id: user.id, email: user.email, is_otp_phase: true },
                getJwtSecret(),
                { expiresIn: "10m" }
            );

            // Clear any preexisting session cookie so it cannot be used during OTP phase
            res.clearCookie("jwt_token", getClearAuthCookieOptions());

            const response: Record<string, unknown> = {
                message: "OTP sent to email",
                requires_otp: true,
                otp_token: otpToken,
            };

            if (process.env.NODE_ENV === "test" && shouldUseDevOtpFallback()) {
                response.debug_otp = rawOtp;
            }

            res.json(response);
        } catch (error) {
            console.error(error);
            res.status(400).json({ message: error instanceof Error ? error.message : "Authentication failed" });
        }
    }

    static async verifyOtp(req: Request, res: Response) {
        const otpToken = typeof req.body?.otp_token === "string" ? req.body.otp_token.trim() : "";
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";

        if (!otpToken || !code || !/^\d{6}$/.test(code)) {
             return res.status(400).json({ message: "Token and a 6-digit OTP code are required" });
        }

        try {
            // Verify temporary token
            const decoded = jwt.verify(otpToken, getJwtSecret());
            
            if (
                typeof decoded === "string" ||
                decoded.is_otp_phase !== true ||
                typeof decoded.id !== "string"
            ) {
                return res.status(401).json({ message: "Invalid token type" });
            }

            // Find valid OTP record
            const otpRecords = await otpRepository.find({
                where: { user_id: decoded.id, is_used: false },
                order: { created_at: "DESC" },
                take: 1
            });

            if (otpRecords.length === 0) {
                 return res.status(400).json({ message: "No active OTP found" });
            }

            const activeOtp = otpRecords[0];

            if (activeOtp.expires_at < new Date()) {
                 activeOtp.is_used = true;
                 await otpRepository.save(activeOtp);
                 return res.status(400).json({ message: "OTP has expired" });
            }

            const isMatch = await bcrypt.compare(code, activeOtp.code_hash);
            if (!isMatch) {
                 return res.status(400).json({ message: "Invalid OTP code" });
            }

            // Mark verified
            activeOtp.is_used = true;
            await otpRepository.save(activeOtp);

            // Retrieve full user
            const user = await userRepository.findOne({
                where: { id: decoded.id },
                relations: ["profile"]
            });

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            // Issue real JWT
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role, name: user.profile?.full_name },
                getJwtSecret(),
                { expiresIn: "1d" }
            );

            res.cookie("jwt_token", token, getAuthCookieOptions(24 * 60 * 60 * 1000));

            res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
        } catch (err) {
             console.error("OTP Verification Error:", err);
             res.status(401).json({ message: "Invalid or expired session" });
        }
    }

    static async logout(_req: Request, res: Response) {
        res.clearCookie("jwt_token", getClearAuthCookieOptions());
        return res.json({ message: "Logged out successfully" });
    }

    static async getProfile(req: AuthenticatedRequest, res: Response) {
        try {
            const user = await userRepository.findOne({
                where: { id: req.user!.id },
                relations: ["profile"]
            });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }
            res.json({
                id: user.id,
                email: user.email,
                role: user.role,
                profile: user.profile
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server Error" });
        }
    }

    static async changePassword(req: AuthenticatedRequest, res: Response) {
        try {
            if (!req.user?.id) {
                return res.status(401).json({ message: "Authentication required" });
            }

            const { current_password, new_password } = sanitizeChangePasswordPayload(req.body);

            const user = await userRepository.findOne({
                where: { id: req.user.id }
            });

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            const isMatch = await bcrypt.compare(current_password, user.password_hash);
            if (!isMatch) {
                return res.status(400).json({ message: "Current password is incorrect" });
            }

            const salt = await bcrypt.genSalt(10);
            user.password_hash = await bcrypt.hash(new_password, salt);
            await userRepository.save(user);

            return res.json({ message: "Password updated successfully" });
        } catch (error) {
            console.error("Change password error:", error);
            return res.status(400).json({ message: error instanceof Error ? error.message : "Failed to change password" });
        }
    }

    static async logEvent(req: Request, res: Response) {
        try {
            const sanitized = sanitizeLogEventPayload(req.body);
            // Safely write to server log output without log injection risk
            console.log(`[CLIENT AUDIT LOG] [${sanitized.severity.toUpperCase()}] ${sanitized.event_type}: ${sanitized.message}`);
            return res.status(200).json({ status: "logged", timestamp: new Date().toISOString() });
        } catch (error) {
            return res.status(400).json({
                status: "error",
                message: error instanceof Error ? error.message : "Invalid log event payload",
            });
        }
    }

    static async validateData(req: Request, res: Response) {
        try {
            const { data, schemaType } = req.body || {};
            if (!data || !schemaType || typeof schemaType !== "string") {
                return res.status(400).json({ valid: false, message: "Validation input is missing or invalid" });
            }

            const schemaChecks: Record<string, (value: unknown) => boolean> = {
                product: (value) => {
                    if (!isRecord(value)) return false;

                    const name = String(value.name ?? "").trim();
                    const sku = String(value.sku ?? "").trim();
                    const nameOk = name.length > 0 && name.length <= 100;
                    const skuOk = sku.length > 0 && sku.length <= 50;
                    const retailPriceOk = typeof value.retail_price === "number" && Number.isFinite(value.retail_price) && value.retail_price > 0 && value.retail_price <= 1000000;
                    const unitCostOk = typeof value.unit_cost === "number" && Number.isFinite(value.unit_cost) && value.unit_cost > 0 && value.unit_cost <= 1000000;

                    return nameOk && skuOk && retailPriceOk && unitCostOk;
                },
                customer: (value) => {
                    if (!isRecord(value)) return false;

                    const name = String(value.name ?? "").trim();
                    const nameOk = name.length > 0 && name.length <= 100;
                    const emailOk = !value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email));
                    const phoneOk = !value.phone || /^254[0-9]{9}$/.test(String(value.phone).replace(/\s+/g, ""));

                    return nameOk && emailOk && phoneOk;
                }
            };

            const validator = schemaChecks[schemaType];
            if (!validator) {
                return res.status(400).json({ valid: false, message: "Unsupported schema type" });
            }
            const isValid = Boolean(validator(data));
            return res.status(isValid ? 200 : 422).json({ valid: isValid });
        } catch (error) {
            console.error("Data validation error:", error);
            return res.status(500).json({ valid: false, message: "Validation failed" });
        }
    }

    static async validateCacheIntegrity(req: Request, res: Response) {
        try {
            const { cache_manifest } = req.body || {};
            if (!cache_manifest || typeof cache_manifest !== "object" || Array.isArray(cache_manifest)) {
                return res.status(400).json({ valid: false, message: "Cache manifest is missing or invalid" });
            }

            for (const [cacheName, urls] of Object.entries(cache_manifest)) {
                if (typeof cacheName !== "string" || cacheName.length > 255 || !Array.isArray(urls)) {
                    return res.status(400).json({ valid: false, message: "Invalid cache entries in manifest" });
                }
                for (const url of urls) {
                    if (typeof url !== "string" || url.length > 2048) {
                        return res.status(400).json({ valid: false, message: "Invalid resource URL in cache manifest" });
                    }
                }
            }

            return res.status(200).json({ valid: true });
        } catch (error) {
            console.error("PWA cache validation error:", error);
            return res.status(500).json({ valid: false, message: "Cache validation failed" });
        }
    }
}
