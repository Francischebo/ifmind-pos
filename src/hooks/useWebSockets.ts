import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";
import { API_BASE_URL } from "../lib/api";

export const useWebSockets = (callbacks: {
    onInventoryUpdated?: (data: { product_id: string; stock_on_hand: number; warehouse_id?: string }) => void;
    onNewSale?: (data: { sale_id: string }) => void;
}) => {
    const socketRef = useRef<Socket | null>(null);
    const callbacksRef = useRef(callbacks);
    callbacksRef.current = callbacks;

    useEffect(() => {
        const token = localStorage.getItem("jwt_token");
        if (!token) return;

        // API_BASE_URL usually ends with /api, we need base host
        const parsedUrl = new URL(API_BASE_URL, window.location.origin);
        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

        socketRef.current = io(baseUrl, {
            auth: { token: token },
        });

        socketRef.current.on("connect", () => {
            console.log("WebSocket connected");
        });

        socketRef.current.on("inventory_updated", (data) => {
            callbacksRef.current.onInventoryUpdated?.(data);
        });
        socketRef.current.on("new_sale", (data) => {
            callbacksRef.current.onNewSale?.(data);
        });

        socketRef.current.on("disconnect", () => {
            console.log("WebSocket disconnected");
        });

        socketRef.current.on("connect_error", (err) => {
            console.error("WebSocket connection error:", err.message);
        });

        return () => {
            socketRef.current?.disconnect();
        };
    }, []); // Only connect once per mount
};
