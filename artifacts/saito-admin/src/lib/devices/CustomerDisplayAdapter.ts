import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class CustomerDisplayAdapter implements IDeviceAdapter {
  type: DeviceType = 'customer_display';

  supports(type: DeviceType): boolean {
    return type === 'customer_display';
  }

  async print(_job: any): Promise<boolean> {
    return false;
  }

  async showWelcome(_restaurantName: string): Promise<boolean> {
    console.warn('[CustomerDisplayAdapter] Customer display requires native/VFD driver.');
    return false;
  }

  async showOrder(_data: { subtotal: number; discount?: number; total: number }): Promise<boolean> {
    console.warn('[CustomerDisplayAdapter] Customer display requires native/VFD driver.');
    return false;
  }

  async showThankYou(): Promise<boolean> {
    console.warn('[CustomerDisplayAdapter] Customer display requires native/VFD driver.');
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'offline';
  }
}
