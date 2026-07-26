import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { User, AppRole } from "../entity/User";
import { Profile } from "../entity/Profile";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { OtpCode } from "../entity/OtpCode";
import { EmailService } from "../services/EmailService";

const userRepository = AppDataSource.getRepository(User);
const profileRepository = AppDataSource.getRepository(Profile);
const otpRepository = AppDataSource.getRepository(OtpCode);

export class AuthController {
    static async register(req: Request, res: Response) {
        const { email, password, full_name, role } = req.body;

        try {
            const existingUser = await userRepository.findOneBy({ email });
            if (existingUser) {
                return res.status(400).json({ message: "User already exists" });
            }

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const user = new User();
            user.email = email;
            user.password_hash = password_hash;
            user.role = role || AppRole.CASHIER;

            await userRepository.save(user);

            const profile = new Profile();
            profile.user = user;
            profile.full_name = full_name;

            await profileRepository.save(profile);

            res.status(201).json({ message: "User registered successfully" });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server Error" });
        }
    }

    static async login(req: Request, res: Response) {
        const { email, password } = req.body;

        try {
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

            // Send Email or Mock Console
            await EmailService.sendOtpEmail(user.email, rawOtp);

            // Issue temporary OTP token (not fully authorized)
            const otpToken = jwt.sign(
                { id: user.id, email: user.email, is_otp_phase: true },
                process.env.JWT_SECRET || "pos-secret",
                { expiresIn: "10m" }
            );

            res.json({ 
                message: "OTP sent to email", 
                requires_otp: true, 
                otp_token: otpToken 
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Server Error" });
        }
    }

    static async verifyOtp(req: Request, res: Response) {
        const { otp_token, code } = req.body;

        if (!otp_token || !code) {
             return res.status(400).json({ message: "Token and OTP code required" });
        }

        try {
            // Verify temporary token
            const decoded: any = jwt.verify(otp_token, process.env.JWT_SECRET || "pos-secret");
            
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
                process.env.JWT_SECRET || "pos-secret",
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
        // Dummy handler for validation
        res.status(200).json({ valid: true });
    }
}
