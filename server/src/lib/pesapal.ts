import { createHmac, timingSafeEqual } from "crypto";

export const getPesapalIpnSecret = () =>
    process.env.PESAPAL_IPN_SECRET || process.env.PESAPAL_SECRET || process.env.PESAPAL_API_SECRET;

export const verifyPesapalSignature = (
    payload: unknown,
    signature?: string,
    rawBody?: Buffer | string,
): boolean => {
    const secret = getPesapalIpnSecret();
    if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
        return false;
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return false;
    }

    const record = payload as Record<string, unknown>;
    const signatureValue = record.pesapal_ipn_signature ?? record.signature ?? record.Signature;
    const providedSignature = (signature || (typeof signatureValue === "string" ? signatureValue : "")).trim();
    if (!providedSignature) {
        return false;
    }

    // 1. Verify against raw body if available
    if (rawBody && (Buffer.isBuffer(rawBody) || typeof rawBody === "string")) {
        const rawExpectedSignature = createHmac("sha256", secret)
            .update(rawBody)
            .digest("hex");
        const rawExpected = Buffer.from(rawExpectedSignature.toLowerCase());
        const providedBuf = Buffer.from(providedSignature.toLowerCase());
        if (providedBuf.length === rawExpected.length && timingSafeEqual(providedBuf, rawExpected)) {
            return true;
        }
    }

    // 2. Verify against canonical sorted payload
    const canonicalPayload = Object.keys(record)
        .filter((key) => !["pesapal_ipn_signature", "signature", "Signature"].includes(key))
        .sort()
        .map((key) => `${key}=${String(record[key])}`)
        .join("&");

    const expectedSignature = createHmac("sha256", secret)
        .update(canonicalPayload)
        .digest("hex");

    const provided = Buffer.from(providedSignature.toLowerCase());
    const expected = Buffer.from(expectedSignature.toLowerCase());

    if (provided.length !== expected.length) {
        return false;
    }

    return timingSafeEqual(provided, expected);
};

