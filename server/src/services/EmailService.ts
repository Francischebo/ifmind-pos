import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
let resend: Resend | null = null;

export const shouldUseDevOtpFallback = () => {
    return process.env.NODE_ENV !== "production";
};

if (RESEND_API_KEY && RESEND_FROM_EMAIL) {
    resend = new Resend(RESEND_API_KEY);
} else {
    console.warn("RESEND_API_KEY and RESEND_FROM_EMAIL are required. Email delivery is disabled.");
}

export class EmailService {
    static async sendPurchaseOrderEmail(
        toEmail: string,
        vendorName: string,
        poNumber: string,
        totalAmount: number,
        items: { productName: string; quantity: number; unitCost: number }[]
    ): Promise<boolean> {
        if (!resend) {
            return false;
        }

        const itemRows = items.map((item) =>
            `<li>${item.productName}: ${item.quantity} x ${item.unitCost.toFixed(2)}</li>`
        ).join("");

        const { error } = await resend.emails.send({
            from: RESEND_FROM_EMAIL as string,
            to: toEmail,
            subject: `Purchase Order ${poNumber}`,
            html: `<h2>Purchase Order ${poNumber}</h2><p>Hello ${vendorName},</p><p>Total: KSh ${totalAmount.toFixed(2)}</p><ul>${itemRows}</ul>`,
        });

        if (error) {
            console.error("Resend purchase order email error:", error);
            return false;
        }

        return true;
    }

    static async sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
        try {
            if (!resend) {
                if (shouldUseDevOtpFallback()) {
                    console.warn(`Development OTP fallback enabled for ${toEmail}. OTP: ${otpCode}`);
                    return true;
                }
                return false;
            }

            const { error } = await resend.emails.send({
                from: RESEND_FROM_EMAIL as string,
                to: toEmail,
                subject: "Your Login OTP Code - Molabs POS",
                html: `
                    <h2>Login Security Code</h2>
                    <p>Your one-time password (OTP) is:</p>
                    <h1 style="letter-spacing: 5px; color: #4F46E5;">${otpCode}</h1>
                    <p>This code will expire in 10 minutes. Do not share this code with anyone.</p>
                `
            });

            if (error) {
                console.error("OTP email delivery failed:", error.message);
                if (shouldUseDevOtpFallback()) {
                    console.warn(`Development OTP fallback triggered for ${toEmail}. OTP: ${otpCode}`);
                    return true;
                }
                return false;
            }

            return true;
        } catch (error) {
            console.error("OTP email delivery failed:", error instanceof Error ? error.message : "Unknown error");
            if (shouldUseDevOtpFallback()) {
                console.warn(`Development OTP fallback triggered for ${toEmail}. OTP: ${otpCode}`);
                return true;
            }
            return false;
        }
    }
}
