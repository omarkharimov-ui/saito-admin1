import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

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
