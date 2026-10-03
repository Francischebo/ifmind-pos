import { createHmac, timingSafeEqual } from "crypto";

const getPesapalIpnSecret = () => process.env.PESAPAL_IPN_SECRET || process.env.PESAPAL_SECRET || process.env.PESAPAL_API_SECRET;

export const verifyPesapalSignature = (payload: Record<string, any>, signature?: string) => {
    const secret = getPesapalIpnSecret();
    if (!secret) {
        return false;
    }

    const providedSignature = (signature || payload.pesapal_ipn_signature || payload.signature || payload.Signature || "").trim();
    if (!providedSignature) {
        return false;
    }

    const canonicalPayload = Object.keys(payload)
        .filter((key) => !["pesapal_ipn_signature", "signature", "Signature"].includes(key))
        .sort()
        .map((key) => `${key}=${String(payload[key])}`)
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
