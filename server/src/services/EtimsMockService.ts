import { randomBytes } from "crypto";
import { Sale } from "../entity/Sale";
import { CreditNote } from "../entity/CreditNote";

export const ETIMS_MOCK_DISCLAIMER = "TEST RECEIPT - NOT A VALID TAX INVOICE";

export class EtimsMockService {
    /**
     * Mocks submission of an invoice to KRA eTIMS.
     * In production, an approved eTIMS OSCU/VSCU device or official KRA API must be integrated.
     */
    static async signInvoice(_saleData: Sale): Promise<{
        receipt_no: string;
        qr_code: string;
        signature: string;
        is_mock: boolean;
        disclaimer: string;
    }> {
        if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATED_ETIMS !== "true") {
            throw new Error(
                "FATAL: Simulated KRA eTIMS is disabled in production. An approved eTIMS Electronic Signature Device (OSCU/VSCU) or official KRA eTIMS Online API must be integrated."
            );
        }

        // Simulate network latency for KRA ETIMS Server
        await new Promise(resolve => setTimeout(resolve, process.env.NODE_ENV === "test" ? 10 : 800));

        const suffix = randomBytes(4).toString("hex").toUpperCase();
        const receiptNo = `TEST-ETIMS-${Date.now().toString().slice(-6)}-${suffix}`;
        const signature = `TEST-SIG-${randomBytes(8).toString("hex").toUpperCase()}`;
        
        const fallbackUrl = "https://etims-sbx.kra.go.ke/verify";
        const baseVerifyUrl = process.env.ETIMS_QR_VERIFY_URL?.trim() || fallbackUrl;
        const qrCode = new URL(baseVerifyUrl);
        qrCode.searchParams.set("invoice", receiptNo);
        qrCode.searchParams.set("sig", signature);
        qrCode.searchParams.set("mock", "true");

        return {
            receipt_no: receiptNo,
            qr_code: qrCode.toString(),
            signature: signature,
            is_mock: true,
            disclaimer: ETIMS_MOCK_DISCLAIMER,
        };
    }

    static async signCreditNote(_creditData: CreditNote): Promise<{
        note_no: string;
        qr_code: string;
        signature: string;
        is_mock: boolean;
        disclaimer: string;
    }> {
        if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIMULATED_ETIMS !== "true") {
            throw new Error(
                "FATAL: Simulated KRA eTIMS is disabled in production. An approved eTIMS Electronic Signature Device (OSCU/VSCU) or official KRA eTIMS Online API must be integrated."
            );
        }

        // Simulate network latency for KRA ETIMS Server
        await new Promise(resolve => setTimeout(resolve, process.env.NODE_ENV === "test" ? 10 : 800));

        const suffix = randomBytes(4).toString("hex").toUpperCase();
        const noteNo = `TEST-CN-ETIMS-${Date.now().toString().slice(-6)}-${suffix}`;
        const signature = `TEST-CNSIG-${randomBytes(8).toString("hex").toUpperCase()}`;
        
        const fallbackUrl = "https://etims-sbx.kra.go.ke/verify-cn";
        const baseVerifyUrl = process.env.ETIMS_CREDIT_NOTE_QR_VERIFY_URL?.trim() || fallbackUrl;
        const qrCode = new URL(baseVerifyUrl);
        qrCode.searchParams.set("invoice", noteNo);
        qrCode.searchParams.set("sig", signature);
        qrCode.searchParams.set("mock", "true");

        return {
            note_no: noteNo,
            qr_code: qrCode.toString(),
            signature: signature,
            is_mock: true,
            disclaimer: ETIMS_MOCK_DISCLAIMER,
        };
    }
}
