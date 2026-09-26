import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

/**
 * HANDHELD (mobile) card terminal — 2026-09-26 owner clarification:
 * Saito runs a handheld terminal, NOT a counter-connected POS terminal.
 * The device travels with the cashier/waiter, so every physical card step
 * (sale OR refund) happens where the cashier is, and the POS system of
 * record stays authoritative.
 *
 * Until the PSP SDK is wired, the physical step is MANUAL: the cashier
 * performs the refund on the handheld terminal against the ORIGINAL
 * transaction (funds return to the card in 1-3 business days) while the
 * POS records ledger row / status / reports (RefundView shows this hint).
 * Integration point when the SDK arrives:
 *   - PSP SDK with a refund API (local acquirer)
 *   - handheld link (USB/Bluetooth/WiFi)
 *   - terminal transaction id stored in order_payments.reference at
 *     payment time, so refund() references the original transaction
 */
export class CardTerminalAdapter implements IDeviceAdapter {
  type: DeviceType = 'card_terminal';

  supports(type: DeviceType): boolean {
    return type === 'card_terminal';
  }

  async print(_job: any): Promise<boolean> {
    return false;
  }

  async startPayment(_amount: number): Promise<{ success: boolean; transactionId?: string }> {
    console.warn('[CardTerminalAdapter] Card terminal requires payment SDK/hardware.');
    return { success: false };
  }

  async cancelPayment(): Promise<boolean> {
    console.warn('[CardTerminalAdapter] Card terminal requires payment SDK/hardware.');
    return false;
  }

  async refund(_transactionId: string, _amount: number): Promise<boolean> {
    console.warn('[CardTerminalAdapter] Card terminal requires payment SDK/hardware.');
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'offline';
  }
}
