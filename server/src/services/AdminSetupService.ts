import { EntityManager } from "typeorm";
import { User, AppRole } from "../entity/User";
import { Profile } from "../entity/Profile";
import * as bcrypt from "bcryptjs";

export class AdminSetupService {
    static async initDefaultAdmin(manager: EntityManager) {
        const adminEmail = process.env.DEFAULT_ADMIN_EMAIL;
        const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD;

        if (!adminEmail || !adminPassword) {
            console.log("No default admin credentials provided in environment variables.");
            return;
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
