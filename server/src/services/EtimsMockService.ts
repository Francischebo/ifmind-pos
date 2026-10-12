import { Sale } from "../entity/Sale";
import { CreditNote } from "../entity/CreditNote";
import { EtimsService } from "./etims/EtimsService";
import {
    ETIMS_MOCK_DISCLAIMER,
    ETIMS_OFF_DISCLAIMER,
    EtimsSignResult,
    EtimsCreditNoteSignResult,
} from "./etims/EtimsProvider";

export { ETIMS_MOCK_DISCLAIMER, ETIMS_OFF_DISCLAIMER };

export class EtimsMockService {
    /**
     * Delegates to the active EtimsProvider resolved by ETIMS_MODE.
     */
    static async signInvoice(saleData: Sale): Promise<EtimsSignResult> {
        const provider = EtimsService.getProvider();
        const result = await provider.signInvoice(saleData);
        if (!result) {
            return {
                receipt_no: `OFF-${saleData.id.slice(0, 8).toUpperCase()}`,
                qr_code: "",
                signature: "",
                is_mock: false,
                disclaimer: ETIMS_OFF_DISCLAIMER,
            };
        }
        return result;
    }

    static async signCreditNote(creditData: CreditNote): Promise<EtimsCreditNoteSignResult> {
        const provider = EtimsService.getProvider();
        const result = await provider.signCreditNote(creditData);
        if (!result) {
            return {
                note_no: `CN-OFF-${creditData.id.slice(0, 8).toUpperCase()}`,
                qr_code: "",
                signature: "",
                is_mock: false,
                disclaimer: ETIMS_OFF_DISCLAIMER,
            };
        }
        return result;
    }
}
