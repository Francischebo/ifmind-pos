import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, AppRole } from "../entity/User";
import { Profile } from "../entity/Profile";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { OtpCode } from "../entity/OtpCode";
import { EmailService, shouldUseDevOtpFallback } from "../services/EmailService";

const userRepository = AppDataSource.getRepository(User);
const profileRepository = AppDataSource.getRepository(Profile);
const otpRepository = AppDataSource.getRepository(OtpCode);

const getJwtSecret = () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not configured");
    }
    return jwtSecret;
};

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

export class AuthController {
    static async register(req: Request, res: Response) {
        try {
            const { email, password, full_name } = sanitizeAuthRegistrationPayload(req.body);
            const existingUser = await userRepository.findOneBy({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User already exists" });
            }

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const user = new User();
            user.email = email;
            user.password_hash = password_hash;
            user.role = AppRole.CASHIER;

            await userRepository.save(user);

            const profile = new Profile();
            profile.user = user;
            profile.full_name = full_name;

            await profileRepository.save(profile);

            res.status(201).json({ message: "User registered successfully" });
        } catch (error: any) {
            console.error(error);
            return res.status(400).json({ message: error.message || "Validation failed" });
        }
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
            const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
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
                return res.status(503).json({ message: "OTP delivery is unavailable" });
            }

            // Issue temporary OTP token (not fully authorized)
            const otpToken = jwt.sign(
                { id: user.id, email: user.email, is_otp_phase: true },
                getJwtSecret(),
                { expiresIn: "10m" }
            );

            const response = {
                message: "OTP sent to email",
                requires_otp: true,
                otp_token: otpToken,
            } as Record<string, unknown>;

            if (process.env.NODE_ENV !== "production" || shouldUseDevOtpFallback()) {
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
            const decoded: any = jwt.verify(otpToken, getJwtSecret());
            
            if (!decoded.is_otp_phase) {
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

            res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
        } catch (err: any) {
             console.error("OTP Verification Error:", err);
             res.status(401).json({ message: "Invalid or expired session" });
        }
    }

    static async getProfile(req: any, res: Response) {
        try {
            const user = await userRepository.findOne({
                where: { id: req.user.id },
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

    static async logEvent(req: Request, res: Response) {
        // Dummy handler for frontend security logging
        res.status(200).json({ status: "logged" });
    }

    static async validateData(req: Request, res: Response) {
        try {
            const { data, schemaType } = req.body || {};
            if (!data || !schemaType) {
                return res.status(400).json({ valid: false, message: "Validation input is missing" });
            }

            const schemaChecks: Record<string, (value: any) => boolean> = {
                product: (value: any) => {
                    if (!value || typeof value !== "object") return false;

                    const nameOk = Boolean(value.name && String(value.name).trim().length > 0 && String(value.name).trim().length <= 100);
                    const skuOk = Boolean(value.sku && String(value.sku).trim().length > 0 && String(value.sku).trim().length <= 50);
                    const retailPriceOk = Number(value.retail_price) > 0;
                    const unitCostOk = Number(value.unit_cost) > 0;

                    return nameOk && skuOk && retailPriceOk && unitCostOk;
                },
                customer: (value: any) => {
                    if (!value || typeof value !== "object") return false;

                    const nameOk = Boolean(value.name && String(value.name).trim().length > 0 && String(value.name).trim().length <= 100);
                    const emailOk = !value.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value.email));
                    const phoneOk = !value.phone || /^254[0-9]{9}$/.test(String(value.phone).replace(/\s+/g, ""));

                    return nameOk && emailOk && phoneOk;
                }
            };

            const validator = schemaChecks[schemaType];
            if (!validator) {
                return res.status(400).json({ valid: false, message: "Unsupported schema type" });
            }
            return res.status(200).json({ valid: Boolean(validator(data)) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ valid: false, message: "Validation failed" });
        }
    }
}
