import { Sale } from "../../entity/Sale";
import { CreditNote } from "../../entity/CreditNote";
import { randomBytes } from "crypto";

export type EtimsMode = "off" | "mock" | "live";

export enum EtimsStatus {
    NOT_APPLICABLE = "not_applicable",
    PENDING = "pending",
    SUBMITTED = "submitted",
    FAILED = "failed",
}

export const ETIMS_MOCK_DISCLAIMER = "TEST RECEIPT - NOT A VALID TAX INVOICE";
export const ETIMS_OFF_DISCLAIMER = "CUSTOMER RECEIPT - NOT A KRA TAX INVOICE";

export interface EtimsSignResult {
    receipt_no: string;
    qr_code: string;
    signature: string;
    is_mock: boolean;
    disclaimer: string;
}

export interface EtimsCreditNoteSignResult {
    note_no: string;
    qr_code: string;
    signature: string;
    is_mock: boolean;
    disclaimer: string;
}

export interface EtimsProvider {
    readonly mode: EtimsMode;
    signInvoice(sale: Sale): Promise<EtimsSignResult | null>;
    signCreditNote(creditNote: CreditNote): Promise<EtimsCreditNoteSignResult | null>;
}

/**
 * Off Provider: No tax submission.
 * Issued as ordinary commercial receipt with clear non-eTIMS notice.
 */
export class OffEtimsProvider implements EtimsProvider {
    readonly mode: EtimsMode = "off";

    async signInvoice(_sale: Sale): Promise<EtimsSignResult | null> {
        return null;
    }

    async signCreditNote(_creditNote: CreditNote): Promise<EtimsCreditNoteSignResult | null> {
        return null;
    }
}

/**
 * Mock Provider: Simulates KRA eTIMS signing with prominent test disclaimers.
 * Allowed in production only if explicitly set via ETIMS_MODE=mock.
 */
export class MockEtimsProvider implements EtimsProvider {
    readonly mode: EtimsMode = "mock";

    async signInvoice(_sale: Sale): Promise<EtimsSignResult | null> {
        await new Promise((resolve) =>
            setTimeout(resolve, process.env.NODE_ENV === "test" ? 10 : 600),
        );

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
            signature,
            is_mock: true,
            disclaimer: ETIMS_MOCK_DISCLAIMER,
        };
    }

    async signCreditNote(_creditNote: CreditNote): Promise<EtimsCreditNoteSignResult | null> {
        await new Promise((resolve) =>
            setTimeout(resolve, process.env.NODE_ENV === "test" ? 10 : 600),
        );

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
            signature,
            is_mock: true,
            disclaimer: ETIMS_MOCK_DISCLAIMER,
        };
    }
}

/**
 * Live Provider Skeleton: Validates configuration only.
 * Throws explicit error because live integration requires physical OSCU device
 * or approved KRA technical integrator credentials.
 */
export class LiveEtimsProvider implements EtimsProvider {
    readonly mode: EtimsMode = "live";

    constructor() {
        this.validateLiveConfiguration();
    }

    validateLiveConfiguration(): void {
        const requiredEnv = [
            "ETIMS_KRA_PIN",
            "ETIMS_BRANCH_ID",
            "ETIMS_DEVICE_SERIAL",
        ];
        const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
        if (missing.length > 0) {
            throw new Error(
                `eTIMS Live configuration is incomplete. Missing environment variables: ${missing.join(", ")}. See docs/ETIMS_INTEGRATION.md.`,
            );
        }
    }

    async signInvoice(_sale: Sale): Promise<EtimsSignResult | null> {
        throw new Error(
            "FATAL: Live KRA eTIMS integration is not yet connected to a physical OSCU device or accredited KRA API integrator. Refer to docs/ETIMS_INTEGRATION.md for required human decisions.",
        );
    }

    async signCreditNote(_creditNote: CreditNote): Promise<EtimsCreditNoteSignResult | null> {
        throw new Error(
            "FATAL: Live KRA eTIMS credit note signing is not yet connected to a physical OSCU device or accredited KRA API integrator. Refer to docs/ETIMS_INTEGRATION.md for required human decisions.",
        );
    }
}
