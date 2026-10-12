import { randomUUID } from "crypto";
import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import * as jwt from "jsonwebtoken";
import { Client } from "pg";
import { AppDataSource } from "../data-source";

type AuthenticatedSocket = Socket & {
    user: {
        id: string;
        email?: string;
        role?: string;
    };
};
type SharedSocketEvent =
    | { event: "inventory_updated"; payload: { product_id: string; stock_on_hand: number; warehouse_id?: string } }
    | { event: "new_sale"; payload: { sale_id: string } };

const NOTIFICATION_CHANNEL = "cfi_pos_socket_events";

const getJwtSecret = () => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        throw new Error("JWT_SECRET is not configured");
    }
    return jwtSecret;
};

export class SocketService {
    private static io: SocketIOServer | undefined;
    private static readonly instanceId = randomUUID();
    private static notificationClient: Client | null = null;
    private static reconnectTimer: NodeJS.Timeout | null = null;
    private static connecting = false;
    private static stopping = false;

    static async init(server: HttpServer) {
        this.stopping = false;
        const origins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "")
            .split(",")
            .map((origin) => origin.trim())
            .filter(Boolean);

        this.io = new SocketIOServer(server, {
            cors: {
                origin: origins.length > 0 ? origins : true,
                credentials: true,
                methods: ["GET", "POST"]
            },
            transports: ["websocket"],
        });

        await this.connectNotificationClient();

        // Middleware for authentication
        this.io.use((socket, next) => {
            const cookieHeader = socket.handshake.headers.cookie;
            let cookieToken: string | undefined;
            if (cookieHeader) {
                const match = cookieHeader.match(/(?:^|;\s*)jwt_token=([^;]+)/);
                if (match) {
                    cookieToken = decodeURIComponent(match[1]);
                }
            }
            const token = socket.handshake.auth.token || cookieToken || socket.handshake.headers.authorization?.split(" ")[1];
            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            try {
                const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
                if (
                    !decoded ||
                    typeof decoded !== "object" ||
                    typeof decoded.id !== "string" ||
                    decoded.is_otp_phase === true ||
                    !decoded.role ||
                    typeof decoded.role !== "string"
                ) {
                    return next(new Error("Authentication error: Full authentication required"));
                }
                (socket as AuthenticatedSocket).user = {
                    id: decoded.id,
                    email: typeof decoded.email === "string" ? decoded.email : undefined,
                    role: decoded.role,
                };
                next();
            } catch (err) {
                return next(new Error("Authentication error: Invalid or expired token"));
            }
        });

        this.io.on("connection", (socket) => {
            const authenticatedSocket = socket as AuthenticatedSocket;
            console.log(`Socket connected: ${socket.id} (User: ${authenticatedSocket.user.id})`);

            socket.on("disconnect", () => {
                console.log(`Socket disconnected: ${socket.id}`);
            });
        });
    }

    private static async connectNotificationClient() {
        if (this.stopping || this.connecting || this.notificationClient) {
            return;
        }
        this.connecting = true;

        const client = new Client({
            connectionString: process.env.DATABASE_URL,
            connectionTimeoutMillis: 5000,
            keepAlive: true,
            application_name: "cfi-pos-socket-events",
            options: `-c app.encryption_key=${process.env.ENCRYPTION_KEY}`,
        });
        client.on("notification", (message) => {
            if (!message.payload) return;
            try {
                const event = JSON.parse(message.payload) as {
                    instanceId?: unknown;
                    event?: unknown;
                    payload?: unknown;
                };
                if (event.instanceId === this.instanceId || !event.payload || typeof event.payload !== "object") {
                    return;
                }
                if (event.event === "inventory_updated" || event.event === "new_sale") {
                    this.io?.emit(event.event, event.payload);
                }
            } catch (error) {
                console.error("Could not decode a PostgreSQL real-time notification.", error);
            }
        });
        client.on("error", (error) => {
            if (this.notificationClient === client) {
                this.notificationClient = null;
            }
            console.error("PostgreSQL real-time listener disconnected; retrying.", error);
            this.scheduleNotificationReconnect();
        });

        try {
            await client.connect();
            await client.query(`LISTEN ${NOTIFICATION_CHANNEL}`);
            if (this.stopping) {
                await client.end();
                return;
            }
            this.notificationClient = client;
            console.log("PostgreSQL cross-instance real-time listener connected.");
        } catch (error) {
            await client.end().catch(() => undefined);
            if (!this.stopping) {
                console.error("PostgreSQL real-time listener unavailable; retrying.", error);
                this.scheduleNotificationReconnect();
            }
        } finally {
            this.connecting = false;
        }
    }

    private static scheduleNotificationReconnect() {
        if (this.stopping || this.reconnectTimer) {
            return;
        }
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connectNotificationClient();
        }, 5000);
        this.reconnectTimer.unref();
    }

    private static publishToOtherInstances(event: SharedSocketEvent) {
        if (!this.io) return;
        const notification = JSON.stringify({
            instanceId: this.instanceId,
            event: event.event,
            payload: event.payload,
        });
        void AppDataSource.query(
            "SELECT pg_notify($1, $2)",
            [NOTIFICATION_CHANNEL, notification],
        ).catch((error: unknown) => {
            console.error("Could not publish a cross-instance real-time event.", error);
        });
    }

    static async close() {
        this.stopping = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const io = this.io;
        this.io = undefined;
        const notificationClient = this.notificationClient;
        this.notificationClient = null;
        const closeSocketServer = io
            ? new Promise<void>((resolve) => io.close(() => resolve()))
            : Promise.resolve();
        const closeNotificationClient = notificationClient
            ? notificationClient.end().catch((error: unknown) => {
                console.error("Could not close the PostgreSQL real-time listener cleanly.", error);
            })
            : Promise.resolve();
        await Promise.all([closeSocketServer, closeNotificationClient]);
    }

    static emitInventoryUpdated(productId: string, newStockLevel: number, warehouseId?: string) {
        const payload = {
            product_id: productId,
            stock_on_hand: newStockLevel,
            warehouse_id: warehouseId,
        };
        if (this.io) {
            this.io.emit("inventory_updated", payload);
            this.publishToOtherInstances({ event: "inventory_updated", payload });
        }
    }

    static emitNewSale(saleId: string) {
        if (this.io) {
            const payload = { sale_id: saleId };
            this.io.emit("new_sale", payload);
            this.publishToOtherInstances({ event: "new_sale", payload });
        }
    }

    static emitEtimsStatusUpdated(saleId: string, status: string, receiptNo?: string | null) {
        if (this.io) {
            this.io.emit("etims_status_updated", {
                sale_id: saleId,
                etims_status: status,
                etims_receipt_no: receiptNo,
            });
        }
    }
}
