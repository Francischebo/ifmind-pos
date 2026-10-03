export class PesapalMockService {
    /**
     * Mocks a Pesapal payment request.
     * Returns a fake tracking ID and a mock redirect/iframe URL.
     */
    static async requestPayment(saleId: string, amount: number, phone: string): Promise<{ tracking_id: string; redirect_url: string }> {
        // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, 500));

        const trackingId = `PESA-${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
        const redirectUrl = new URL(process.env.PESAPAL_MOCK_IFRAME_URL as string);
        redirectUrl.searchParams.set("id", trackingId);
        redirectUrl.searchParams.set("amount", String(amount));

        return {
            tracking_id: trackingId,
            redirect_url: redirectUrl.toString()
        };
    }
}
