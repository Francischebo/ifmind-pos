export class EtimsMockService {
    /**
     * Mocks submission of an invoice to KRA eTIMS.
     * Generates a fake Control Unit invoice number, QR code, and signature.
     */
    static async signInvoice(saleData: any): Promise<{ receipt_no: string; qr_code: string; signature: string }> {
        // Simulate network latency for KRA ETIMS Server
        await new Promise(resolve => setTimeout(resolve, 800));

        const receiptNo = `KRA-${Date.now().toString().slice(-6)}`;
        const signature = `SIG-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
        const qrCode = `https://itax.kra.go.ke/KRA-Portal/qr/verify?invoice=${receiptNo}&sig=${signature}`;

        return {
            receipt_no: receiptNo,
            qr_code: qrCode,
            signature: signature
        };
    }
    static async signCreditNote(creditData: any): Promise<{ note_no: string; qr_code: string; signature: string }> {
        // Simulate network latency for KRA ETIMS Server
        await new Promise(resolve => setTimeout(resolve, 800));

        const noteNo = `CN-KRA-${Date.now().toString().slice(-6)}`;
        const signature = `CNSIG-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
        const qrCode = `https://itax.kra.go.ke/KRA-Portal/qr/verify-cn?invoice=${noteNo}&sig=${signature}`;

        return {
            note_no: noteNo,
            qr_code: qrCode,
            signature: signature
        };
    }
}
