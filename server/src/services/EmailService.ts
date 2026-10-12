import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

let resend: Resend | null = null;
let resendApiKey: string | undefined;

const getResendConfiguration = () => ({
    apiKey: process.env.RESEND_API_KEY?.trim(),
    fromEmail: process.env.RESEND_FROM_EMAIL?.trim(),
});

export const getOtpEmailConfigurationIssues = (
    environment: NodeJS.ProcessEnv = process.env,
) => {
    const issues: string[] = [];
    if (!environment.RESEND_API_KEY?.trim()) {
        issues.push("RESEND_API_KEY is missing");
    }
    if (!environment.RESEND_FROM_EMAIL?.trim()) {
        issues.push("RESEND_FROM_EMAIL is missing");
    }
    return issues;
};

const getResendClient = () => {
    const { apiKey } = getResendConfiguration();
    if (!apiKey) {
        resend = null;
        resendApiKey = undefined;
        return null;
    }

    if (!resend || resendApiKey !== apiKey) {
        resend = new Resend(apiKey);
        resendApiKey = apiKey;
    }

    return resend;
};

const maskOtp = (code: string) => {
    if (!code || code.length <= 2) return "***";
    return "*".repeat(code.length - 2) + code.slice(-2);
};

export const shouldUseDevOtpFallback = (environment: NodeJS.ProcessEnv = process.env): boolean => {
    if (environment.NODE_ENV === "production") {
        return false;
    }
    return environment.ALLOW_DEV_OTP_FALLBACK === "true" || environment.NODE_ENV === "test";
};

export const escapeHtml = (str: unknown): string => {
    if (typeof str !== "string") {
        return "";
    }
    return str.replace(/[&<>'"]/g, (tag) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
};

export class EmailService {
    static getOtpEmailConfigurationIssues(environment?: NodeJS.ProcessEnv) {
        return getOtpEmailConfigurationIssues(environment);
    }

    static async sendPurchaseOrderEmail(
        toEmail: string,
        vendorName: string,
        poNumber: string,
        totalAmount: number,
        items: { productName: string; quantity: number; unitCost: number }[]
    ): Promise<boolean> {
        const { fromEmail } = getResendConfiguration();
        const client = getResendClient();
        if (!client || !fromEmail) {
            return false;
        }

        const safeVendorName = escapeHtml(vendorName);
        const safePoNumber = escapeHtml(poNumber);
        const cleanSubjectPoNumber = poNumber.replace(/[\r\n]+/g, "").trim();
        const safeTotal = Number.isFinite(totalAmount) ? totalAmount.toFixed(2) : "0.00";

        const itemRows = items.map((item) => {
            const safeName = escapeHtml(item.productName);
            const safeQty = Number.isFinite(item.quantity) ? item.quantity : 0;
            const safeCost = Number.isFinite(item.unitCost) ? item.unitCost.toFixed(2) : "0.00";
            return `<li>${safeName}: ${safeQty} x ${safeCost}</li>`;
        }).join("");

        const { error } = await client.emails.send({
            from: fromEmail,
            to: toEmail,
            subject: `Purchase Order ${cleanSubjectPoNumber}`,
            html: `<h2>Purchase Order ${safePoNumber}</h2><p>Hello ${safeVendorName},</p><p>Total: KSh ${safeTotal}</p><ul>${itemRows}</ul>`,
        });

        if (error) {
            console.error("Resend purchase order email error:", error);
            return false;
        }

        return true;
    }

    static async sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
        try {
            const { fromEmail } = getResendConfiguration();
            const configurationIssues = getOtpEmailConfigurationIssues();
            const client = getResendClient();
            if (!client || !fromEmail) {
                if (shouldUseDevOtpFallback()) {
                    const otpDisplay = process.env.SHOW_DEV_OTP_CONSOLE === "true" && process.env.NODE_ENV === "development"
                        ? otpCode
                        : maskOtp(otpCode);
                    console.warn(`[DEV ONLY] OTP email fallback simulated for ${toEmail}. OTP: ${otpDisplay}`);
                    return true;
                }
                console.error(`OTP email delivery is not configured: ${configurationIssues.join(", ")}.`);
                return false;
            }

            const safeOtpCode = escapeHtml(otpCode.trim());
            const { data, error } = await client.emails.send({
                from: fromEmail,
                to: toEmail,
                subject: "Your Login OTP Code - CFI-POS-Techiez",
                html: `
                    <h2>Login Security Code</h2>
                    <p>Your one-time password (OTP) is:</p>
                    <h1 style="letter-spacing: 5px; color: #4F46E5;">${safeOtpCode}</h1>
                    <p>This code will expire in 10 minutes. Do not share this code with anyone.</p>
                `
            });

            if (error) {
                console.error("Resend rejected OTP email delivery:", error.message);
                if (shouldUseDevOtpFallback()) {
                    const otpDisplay = process.env.SHOW_DEV_OTP_CONSOLE === "true" && process.env.NODE_ENV === "development"
                        ? otpCode
                        : maskOtp(otpCode);
                    console.warn(`[DEV ONLY] OTP email fallback simulated for ${toEmail}. OTP: ${otpDisplay}`);
                    return true;
                }
                return false;
            }

            if (!data?.id) {
                console.error("Resend returned no message ID for the OTP email.");
                return false;
            }
            console.info(`OTP email accepted by Resend (message ID: ${data.id}).`);
            return true;
        } catch (error) {
            console.error(
                "OTP email delivery failed:",
                error instanceof Error ? error.message : "Unknown provider error",
            );
            if (shouldUseDevOtpFallback()) {
                const otpDisplay = process.env.SHOW_DEV_OTP_CONSOLE === "true" && process.env.NODE_ENV === "development"
                    ? otpCode
                    : maskOtp(otpCode);
                console.warn(`[DEV ONLY] OTP email fallback simulated for ${toEmail}. OTP: ${otpDisplay}`);
                return true;
            }
            return false;
        }
    }
}
