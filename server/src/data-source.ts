import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PurchaseRequisition } from "./entity/PurchaseRequisition";
import { Shift } from "./entity/Shift";
import { OtpCode } from "./entity/OtpCode";
import { ReturnRequest } from "./entity/ReturnRequest";
import { ReturnItem } from "./entity/ReturnItem";
import { SaleItemBatch } from "./entity/SaleItemBatch";

const serverEnvironmentPath = path.resolve(__dirname, "../.env");
const rootEnvironmentPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: serverEnvironmentPath });

if (existsSync(rootEnvironmentPath)) {
    const rootEnvironment = dotenv.parse(readFileSync(rootEnvironmentPath));
    const backendIntegrationKeys = [
        "RESEND_API_KEY",
        "RESEND_FROM_EMAIL",
        "MPESA_CONSUMER_KEY",
        "MPESA_CONSUMER_SECRET",
        "MPESA_PASSKEY",
        "MPESA_API_BASE_URL",
        "MPESA_CALLBACK_URL",
        "MPESA_C2B_CALLBACK_BASE_URL",
        "MPESA_C2B_CALLBACK_TOKEN",
        "ENCRYPTION_KEY",
        "PESAPAL_IPN_SECRET",
        "PESAPAL_SECRET",
        "PESAPAL_API_SECRET",
        "PESAPAL_MOCK_IFRAME_URL",
        "ETIMS_QR_VERIFY_URL",
        "ETIMS_CREDIT_NOTE_QR_VERIFY_URL",
        "GEMINI_API_KEY",
        "AI_GATEWAY_URL",
        "AI_MODEL",
        "CORS_ORIGINS",
    ];

    for (const key of backendIntegrationKeys) {
        if (!process.env[key] && rootEnvironment[key]) {
            process.env[key] = rootEnvironment[key];
        }
    }
}

if (!process.env.ENCRYPTION_KEY || !/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
    throw new Error("ENCRYPTION_KEY must be configured as 64 hexadecimal characters (32 bytes).");
}

export const AppDataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: process.env.TYPEORM_SYNCHRONIZE === "true",
    logging: ["error"],
    extra: {
        options: `-c app.encryption_key=${process.env.ENCRYPTION_KEY}`,
    },
    entities: [PurchaseRequisition, Shift, OtpCode, ReturnRequest, ReturnItem, SaleItemBatch, __dirname + "/entity/*.{js,ts}"],
    migrations: [__dirname + "/migration/*.{js,ts}"],
    subscribers: [],
});
