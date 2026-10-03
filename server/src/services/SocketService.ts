import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import * as jwt from "jsonwebtoken";

const getJwtSecret = () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not configured");
    }
    return jwtSecret;
};

export class SocketService {
    private static io: SocketIOServer;

    static init(server: HttpServer) {
        const origins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean);

        this.io = new SocketIOServer(server, {
            cors: {
                origin: origins,
                methods: ["GET", "POST"]
            }
        });

        // Middleware for authentication
        this.io.use((socket, next) => {
            const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1];
            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            try {
                const decoded = jwt.verify(token, getJwtSecret());
                (socket as any).user = decoded;
                next();
            } catch (err) {
                return next(new Error("Authentication error: Invalid token"));
            }
        });

        this.io.on("connection", (socket) => {
            console.log(`Socket connected: ${socket.id} (User: ${(socket as any).user.id})`);

            socket.on("disconnect", () => {
                console.log(`Socket disconnected: ${socket.id}`);
            });
        });
    }

    static emitInventoryUpdated(productId: string, newStockLevel: number, warehouseId?: string) {
        if (this.io) {
            this.io.emit("inventory_updated", {
                product_id: productId,
                stock_on_hand: newStockLevel,
                warehouse_id: warehouseId,
            });
        }
    }

    static emitNewSale(saleId: string) {
        if (this.io) {
            this.io.emit("new_sale", { sale_id: saleId });
        }
    }
}
