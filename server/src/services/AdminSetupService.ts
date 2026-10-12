import { EntityManager } from "typeorm";
import { User, AppRole } from "../entity/User";
import { Profile } from "../entity/Profile";
import * as bcrypt from "bcryptjs";

export const KNOWN_DEFAULT_PASSWORDS = new Set([
    "fr@nk123!!__",
    "admin123",
    "password",
    "password123",
    "changeme",
    "admin",
    "administrator",
    "root",
    "posadmin123",
    "12345678",
    "123456789",
]);

export class AdminSetupService {
    static validateAdminPassword(password: string, isProduction: boolean = process.env.NODE_ENV === "production"): void {
        const trimmed = (password || "").trim();
        if (!trimmed) {
            throw new Error("DEFAULT_ADMIN_PASSWORD must not be empty if configured.");
        }

        const normalized = trimmed.toLowerCase();
        if (KNOWN_DEFAULT_PASSWORDS.has(normalized)) {
            if (isProduction) {
                throw new Error(
                    "FATAL SECURITY GUARDRAIL: DEFAULT_ADMIN_PASSWORD matches a known default password. " +
                    "Set a strong, unique administrator password (minimum 12 characters) via a secure secret manager in production."
                );
            }
        }

        if (isProduction && trimmed.length < 12) {
            throw new Error(
                "FATAL SECURITY GUARDRAIL: DEFAULT_ADMIN_PASSWORD must be at least 12 characters long in production."
            );
        }
    }

    static async initDefaultAdmin(manager: EntityManager) {
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.log("No default admin credentials provided in environment variables.");
            return;
        }

        AdminSetupService.validateAdminPassword(adminPassword);

        if (KNOWN_DEFAULT_PASSWORDS.has(adminPassword.trim().toLowerCase())) {
            console.warn(
                "[SECURITY NOTICE] Default administrator account seeded using environment variables with a development password. " +
                "Change this password immediately via /api/auth/change-password before deploying to production."
            );
        }

        try {
            const existingAdmin = await manager.findOne(User, { where: { email: adminEmail } });
            
            if (!existingAdmin) {
                console.log(`Creating default admin user: ${adminEmail}`);
                
                const salt = await bcrypt.genSalt(10);
                const password_hash = await bcrypt.hash(adminPassword, salt);

                const adminUser = new User();
                adminUser.email = adminEmail;
                adminUser.password_hash = password_hash;
                adminUser.role = AppRole.ADMIN;
                adminUser.is_active = true;
                
                await manager.save(adminUser);

                const profile = new Profile();
                profile.user = adminUser;
                profile.full_name = "System Admin";
                
                await manager.save(profile);
                console.log("Default admin user created successfully.");
            } else {
                if (existingAdmin.role !== AppRole.ADMIN) {
                    existingAdmin.role = AppRole.ADMIN;
                    await manager.save(existingAdmin);
                    console.log(`Updated existing user ${adminEmail} to admin role.`);
                } else {
                    console.log(`Default admin user ${adminEmail} already exists and has admin privileges.`);
                }
            }
        } catch (error) {
            console.error("Error setting up default admin:", error);
        }
    }
}
