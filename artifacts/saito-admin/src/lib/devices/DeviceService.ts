import { IDeviceAdapter, DeviceType, DeviceConfig } from './DeviceAdapter';
import { EscPosDeviceAdapter } from './EscPosDeviceAdapter';
import { CashDrawerDeviceAdapter } from './CashDrawerDeviceAdapter';
import { BarcodeScannerAdapter } from './BarcodeScannerAdapter';
import { CustomerDisplayAdapter } from './CustomerDisplayAdapter';
import { ScaleAdapter } from './ScaleAdapter';
import { CardTerminalAdapter } from './CardTerminalAdapter';
import { NotificationAdapter } from './NotificationAdapter';
import { KitchenDisplayAdapter } from './KitchenDisplayAdapter';

class DeviceService {
  private adapters: IDeviceAdapter[] = [
    new EscPosDeviceAdapter(),
    new CashDrawerDeviceAdapter(),
    new BarcodeScannerAdapter(),
    new CustomerDisplayAdapter(),
    new ScaleAdapter(),
    new CardTerminalAdapter(),
    new NotificationAdapter(),
    new KitchenDisplayAdapter(),
  ];

  private configs: DeviceConfig[] = [];

  registerDevice(config: DeviceConfig) {
    this.configs.push(config);
  }

  getAdapter(type: DeviceType): IDeviceAdapter | undefined {
    return this.adapters.find(a => a.supports(type));
  }

  getDevices(): DeviceConfig[] {
    return [...this.configs];
  }

  async print(type: DeviceType, job: { html: string; paperWidth: string; copies: number; title?: string }): Promise<boolean> {
    const adapter = this.getAdapter(type);
    if (!adapter) {
      console.error(`No device adapter found for type: ${type}`);
      return false;
    }
    return adapter.print(job);
  }

  async openCashDrawer(type: DeviceType = 'cash_drawer'): Promise<boolean> {
    const adapter = this.getAdapter(type);
    if (!adapter || !adapter.openCashDrawer) {
      console.error(`Cash drawer not supported for type: ${type}`);
      return false;
    }
    return adapter.openCashDrawer();
  }

  async getDeviceStatus(type: DeviceType): Promise<'ready' | 'error' | 'offline'> {
    const adapter = this.getAdapter(type);
    if (!adapter || !adapter.getStatus) {
      return 'offline';
    }
    return adapter.getStatus();
  }
}

export const deviceService = new DeviceService();
