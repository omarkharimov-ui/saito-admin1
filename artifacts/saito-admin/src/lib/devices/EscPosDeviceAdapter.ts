import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class EscPosDeviceAdapter implements IDeviceAdapter {
  type: DeviceType = 'printer_escpos';

  supports(type: DeviceType): boolean {
    return type === 'printer_escpos' || type === 'printer_network';
  }

  async print(_job: { html: string; paperWidth: string; copies: number; title?: string }): Promise<boolean> {
    console.warn('[EscPosDeviceAdapter] ESC/POS printing requires native host. Not yet implemented.');
    return false;
  }

  async openCashDrawer(): Promise<boolean> {
    console.warn('[EscPosDeviceAdapter] Cash drawer requires native host. Not yet implemented.');
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'offline';
  }
}
