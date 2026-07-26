import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
    user?: any;
}

export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(" ")[1];

        jwt.verify(token, process.env.JWT_SECRET || "pos-secret", (err: any, user: any) => {
            if (err) {
                return res.sendStatus(403);
            }

            req.user = user;
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
