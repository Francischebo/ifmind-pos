import { PaymentCheckoutSession } from "../entity/PaymentCheckoutSession";

export const getReservedQuantity = (
    sessions: PaymentCheckoutSession[],
    productId: string,
    excludeSessionId?: string,
    warehouseId?: string,
) => sessions
    .filter((session) => session.status === "reserved" && session.id !== excludeSessionId)
    .filter((session) => warehouseId === undefined ||
        session.warehouse_id === warehouseId ||
        session.warehouse_id === null)
    .reduce((total, session) => total + session.items
        .filter((item) => item.product_id === productId)
        .reduce((sum, item) => sum + item.quantity, 0), 0);
