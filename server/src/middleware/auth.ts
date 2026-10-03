import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";
import { AppDataSource } from "../data-source";
import { User } from "../entity/User";

export interface AuthenticatedRequest extends Request {
    user?: any;
}

const getJwtSecret = () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not configured");
    }
    return jwtSecret;
};

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(" ")[1];

        jwt.verify(token, getJwtSecret(), async (err: any, user: any) => {
            if (err) {
                return res.sendStatus(403);
            }

            try {
                const currentUser = await AppDataSource.getRepository(User).findOneBy({ id: user.id });
                if (!currentUser || !currentUser.is_active) {
                    return res.status(401).json({ message: "Account is inactive" });
                }
                req.user = { ...user, id: currentUser.id, email: currentUser.email, role: currentUser.role };
            } catch (error) {
                console.error("Authentication user lookup failed:", error);
                return res.sendStatus(503);
            }
            next();
        });
    } else {
        res.sendStatus(401);
    }
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
