import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { PurchaseRequisition } from "./entity/PurchaseRequisition";
import { Shift } from "./entity/Shift";
import { OtpCode } from "./entity/OtpCode";
import { ReturnRequest } from "./entity/ReturnRequest";
import { ReturnItem } from "./entity/ReturnItem";
import { SaleItemBatch } from "./entity/SaleItemBatch";

dotenv.config();

export const AppDataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: true, // Auto-create tables for now; switch to migrations for prod
    logging: ["query", "error"],
    entities: [PurchaseRequisition, Shift, OtpCode, ReturnRequest, ReturnItem, SaleItemBatch, __dirname + "/entity/*.{js,ts}"],
    migrations: [__dirname + "/migration/*.{js,ts}"],
    subscribers: [],
});
