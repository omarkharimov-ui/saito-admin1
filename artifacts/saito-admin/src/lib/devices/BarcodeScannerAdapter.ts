import { IDeviceAdapter, DeviceType } from './DeviceAdapter';

export class BarcodeScannerAdapter implements IDeviceAdapter {
  type: DeviceType = 'barcode_scanner';
  private debounceTimer: any = null;
  private lastScan = '';

  supports(type: DeviceType): boolean {
    return type === 'barcode_scanner';
  }

  async print(_job: any): Promise<boolean> {
    return false;
  }

  async getStatus(): Promise<'ready' | 'error' | 'offline'> {
    return 'ready';
  }

  handleScan(code: string, callback: (scanned: string) => void): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.lastScan = code;
    this.debounceTimer = setTimeout(() => {
      if (this.lastScan === code) {
        callback(code);
      }
    }, 100);
  }
}
