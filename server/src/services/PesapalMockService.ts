import { randomBytes } from "crypto";

export class PesapalMockService {
    /**
     * Mocks a Pesapal payment request.
     * In production, live Pesapal API credentials must be configured.
     */
    static async requestPayment(saleId: string, amount: number, phone: string): Promise<{
        tracking_id: string;
        redirect_url: string;
        is_mock: boolean;
    }> {
        const isProduction = process.env.NODE_ENV === "production";
        const isExplicitlyDisabled = process.env.ENABLE_PESAPAL_PAYMENTS === "false";
        const isExplicitlyEnabled = process.env.ENABLE_PESAPAL_PAYMENTS === "true";

        if (isExplicitlyDisabled || (isProduction && !isExplicitlyEnabled)) {
            throw new Error(
                "Pesapal card payments are disabled on this instance. Set ENABLE_PESAPAL_PAYMENTS=true to enable."
            );
        }

        if (isProduction && process.env.ALLOW_SIMULATED_PESAPAL !== "true") {
            throw new Error(
                "FATAL: Simulated Pesapal payment is disabled in production. Live Pesapal IPN and API credentials must be configured."
            );
        }

        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, process.env.NODE_ENV === "test" ? 10 : 500));

        const randomSuffix = randomBytes(6).toString("hex").toUpperCase();
        const trackingId = `TEST-PESA-${randomSuffix}`;
        const fallbackUrl = "http://localhost:3000/api/mock-pesapal-iframe";
        const baseRedirectUrl = process.env.PESAPAL_MOCK_IFRAME_URL?.trim() || fallbackUrl;
        const redirectUrl = new URL(baseRedirectUrl);
        redirectUrl.searchParams.set("id", trackingId);
        redirectUrl.searchParams.set("amount", String(amount));
        redirectUrl.searchParams.set("mock", "true");

        return {
            tracking_id: trackingId,
            redirect_url: redirectUrl.toString(),
            is_mock: true,
        };
    }
}
