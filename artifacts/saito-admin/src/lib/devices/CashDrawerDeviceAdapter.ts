import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class CashDrawerDeviceAdapter implements IDeviceAdapter {
  type: DeviceType = 'cash_drawer';

  supports(type: DeviceType): boolean {
    return type === 'cash_drawer';
  }

  async print(_job: { html: string; paperWidth: string; copies: number; title?: string }): Promise<boolean> {
    return false;
  }

  async openCashDrawer(): Promise<boolean> {
    console.warn('[CashDrawerDeviceAdapter] Cash drawer requires native host. Not yet implemented.');
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'offline';
  }
}
