import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
let resend: Resend | null = null;

if (RESEND_API_KEY && RESEND_API_KEY !== "your_resend_api_key_production") {
    resend = new Resend(RESEND_API_KEY);
} else {
    console.warn("⚠️ No valid RESEND_API_KEY found. EmailService will default to Console Mocking for OTPs.");
}

export class EmailService {
    static async sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
        try {
            if (resend) {
                const { data, error } = await resend.emails.send({
                    from: "Molabs POS <onboarding@resend.dev>",
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
                    console.error("❌ Resend API Error:", error);
                    console.log(`🔐 FALLBACK OTP CODE: ${otpCode}`);
                    return false;
                }

                console.log(`✅ OTP Email sent successfully to ${toEmail} via Resend.`);
                return true;
            } else {
                console.log("\n=================================");
                console.log(`📧 MOCK EMAIL DISPATCHED TO: ${toEmail}`);
                console.log(`🔐 OTP CODE: ${otpCode}`);
                console.log("=================================\n");
                return true;
            }
        } catch (error) {
            console.error("❌ Error sending OTP Email:", error);
            // Even if Resend fails, dump it to console so the user isn't stuck
            console.log(`🔐 FALLBACK OTP CODE: ${otpCode}`);
            return false;
        }
    }
}
