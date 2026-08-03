import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class ScaleAdapter implements IDeviceAdapter {
  type: DeviceType = 'scale';

  supports(type: DeviceType): boolean {
    return type === 'scale';
  }

  async print(_job: any): Promise<boolean> {
    return false;
  }

  async readWeight(): Promise<{ weight: number; stable: boolean } | null> {
    console.warn('[ScaleAdapter] Scale requires native USB/serial driver.');
    return null;
  }

  async tare(): Promise<boolean> {
    console.warn('[ScaleAdapter] Scale requires native USB/serial driver.');
    return false;
  }

  async zero(): Promise<boolean> {
    console.warn('[ScaleAdapter] Scale requires native USB/serial driver.');
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'offline';
  }
}
