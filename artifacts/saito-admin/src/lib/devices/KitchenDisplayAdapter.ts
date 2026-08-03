import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class KitchenDisplayAdapter implements IDeviceAdapter {
  type: DeviceType = 'kitchen_display';

  supports(type: DeviceType): boolean {
    return type === 'kitchen_display';
  }

  async print(_job: any): Promise<boolean> {
    return false;
  }

  async showOrder(_order: any): Promise<boolean> {
    console.warn('[KitchenDisplayAdapter] Kitchen display requires secondary monitor/Electron.');
    return false;
  }

  async showAlert(_message: string): Promise<boolean> {
    console.warn('[KitchenDisplayAdapter] Kitchen display requires secondary monitor/Electron.');
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'offline';
  }
}
