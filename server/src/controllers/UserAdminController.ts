import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { AppDataSource } from "../data-source";
import { User, AppRole } from "../entity/User";
import { Profile } from "../entity/Profile";
import * as bcrypt from "bcryptjs";

const userRepository = AppDataSource.getRepository(User);
const profileRepository = AppDataSource.getRepository(Profile);

const normalizeEmail = (value: unknown) => {
    if (typeof value !== "string") {
        throw new Error("email must be a valid string");
    }

    const email = value.trim().toLowerCase();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error("email must be a valid email address");
    }

    return email;
};

export const sanitizeUserCreatePayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const email = normalizeEmail(payload.email);
    const password = typeof payload.password === "string" ? payload.password.trim() : "";
    const full_name = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
    const rawRole = typeof payload.role === "string" ? payload.role.trim().toLowerCase() : AppRole.CASHIER;

    if (!full_name || full_name.length > 100) {
        throw new Error("full_name is required and must be under 100 characters");
    }

    if (!password || password.length < 8 || password.length > 128) {
        throw new Error("password is required and must be between 8 and 128 characters");
    }

    if (!Object.values(AppRole).includes(rawRole as AppRole)) {
        throw new Error("role must be one of the valid application roles");
    }

    return {
        email,
        password,
        full_name,
        role: rawRole as AppRole,
    };
};

export const sanitizeUserAdminUpdatePayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const sanitized: Record<string, string> = {};

    const email = payload.email !== undefined ? normalizeEmail(payload.email) : undefined;
    const full_name = typeof payload.full_name === "string" ? payload.full_name.trim() : "";

    if (email !== undefined) sanitized.email = email;
    if (full_name !== "") {
        if (full_name.length > 100) {
            throw new Error("full_name must be under 100 characters");
        }
        sanitized.full_name = full_name;
    }

    if (payload.full_name !== undefined && full_name === "") {
        throw new Error("full_name is required and must be under 100 characters");
    }

    if (payload.email !== undefined && email === undefined) {
        throw new Error("email must be a valid email address");
    }

    if (Object.keys(sanitized).length === 0) {
        throw new Error("At least one valid user field must be provided");
    }

    return sanitized;
};

export const sanitizeUserRolePayload = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("role payload must be an object");
    }

    const payload = input as Record<string, unknown>;
    const role = typeof payload.role === "string" ? payload.role.trim().toLowerCase() : "";

    if (!Object.values(AppRole).includes(role as AppRole)) {
        throw new Error("role must be one of the valid application roles");
    }

    return { role: role as AppRole };
};

export class UserAdminController {
    static async createUser(req: AuthenticatedRequest, res: Response) {
        try {
            const { email, password, full_name, role } = sanitizeUserCreatePayload(req.body);
            const existingUser = await userRepository.findOne({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ message: "A user with this email already exists" });
            }

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            const user = new User();
            user.email = email;
            user.password_hash = password_hash;
            user.role = role;
            user.is_active = true;

            await userRepository.save(user);

            const profile = new Profile();
            profile.user = user;
            profile.id = user.id;
            profile.full_name = full_name;

            await profileRepository.save(profile);

            return res.status(201).json({
                id: user.id,
                email: user.email,
                full_name: profile.full_name,
                role: user.role,
                is_active: user.is_active,
            });
        } catch (error) {
            console.error("Error creating user:", error);
            return res.status(400).json({ message: error instanceof Error ? error.message : "Error creating user" });
        }
    }

    static async listUsers(req: Request, res: Response) {
        try {
            const users = await userRepository.find({
                relations: ["profile"],
                order: { email: "ASC" }
            });

            const payload = users.map((user) => ({
                id: user.id,
                email: user.email,
                full_name: user.profile?.full_name || "",
                role: user.role,
                mfa_enabled: false,
                is_active: user.is_active,
            }));

            return res.json(payload);
        } catch (error) {
            console.error("Error listing users:", error);
            return res.status(500).json({ message: "Error fetching users" });
        }
    }

    static async updateUser(req: Request, res: Response) {
        try {
            const sanitized = sanitizeUserAdminUpdatePayload(req.body);
            const user = await userRepository.findOne({ where: { id: req.params.id as string }, relations: ["profile"] });

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            if (sanitized.email) {
                const existing = await userRepository.findOne({ where: { email: sanitized.email } });
                if (existing && existing.id !== user.id) {
                    return res.status(400).json({ message: "Another user already has this email" });
                }
                user.email = sanitized.email;
            }

            await userRepository.save(user);

            if (sanitized.full_name) {
                if (user.profile) {
                    user.profile.full_name = sanitized.full_name;
                    await profileRepository.save(user.profile);
                } else {
                    const profile = profileRepository.create({
                        id: user.id,
                        full_name: sanitized.full_name,
                    });
                    await profileRepository.save(profile);
                }
            }

            return res.json({
                id: user.id,
                email: user.email,
                full_name: user.profile?.full_name || sanitized.full_name || "",
                role: user.role,
            });
        } catch (error) {
            console.error("Error updating user:", error);
            return res.status(400).json({ message: error instanceof Error ? error.message : "Error updating user" });
        }
    }

    static async deleteUser(req: AuthenticatedRequest, res: Response) {
        try {
            const targetId = req.params.id as string;
            if (targetId === req.user?.id) {
                return res.status(400).json({ message: "You cannot delete your own account" });
            }

            const user = await userRepository.findOne({ where: { id: targetId } });
            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            if (user.role === AppRole.ADMIN) {
                const adminCount = await userRepository.count({ where: { role: AppRole.ADMIN, is_active: true } });
                if (adminCount <= 1) {
                    return res.status(400).json({ message: "The last active administrator cannot be deleted" });
                }
            }

            await userRepository.remove(user);
            return res.json({ message: "User deleted successfully" });
        } catch (error) {
            console.error("Error deleting user:", error);
            return res.status(500).json({ message: "Error deleting user" });
        }
    }

    static async setUserRole(req: AuthenticatedRequest, res: Response) {
        try {
            const { role } = sanitizeUserRolePayload(req.body);
            const user = await userRepository.findOneBy({ id: req.params.id as string });

            if (!user) {
                return res.status(404).json({ message: "User not found" });
            }

            if (!Object.values(AppRole).includes(role)) {
                return res.status(400).json({ message: "Invalid role" });
            }

            if (user.id === req.user?.id && role !== AppRole.ADMIN) {
                return res.status(400).json({ message: "You cannot remove your own administrator role" });
            }
            if (user.role === AppRole.ADMIN && role !== AppRole.ADMIN) {
                const adminCount = await userRepository.count({ where: { role: AppRole.ADMIN, is_active: true } });
                if (adminCount <= 1) {
                    return res.status(400).json({ message: "The last active administrator cannot be demoted" });
                }
            }

            user.role = role;
            await userRepository.save(user);

            return res.json({ id: user.id, role: user.role });
        } catch (error) {
            console.error("Error setting user role:", error);
            return res.status(500).json({ message: "Error updating role" });
        }
    }
}
