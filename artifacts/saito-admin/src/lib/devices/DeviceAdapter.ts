export type DeviceType = 'printer_escpos' | 'printer_network' | 'cash_drawer' | 'customer_display' | 'barcode_scanner' | 'scale' | 'card_terminal' | 'kitchen_display' | 'notification';

export interface DeviceConfig {
  id: string;
  type: DeviceType;
  name: string;
  endpoint?: string;
  paperWidth?: '58mm' | '80mm' | 'a4';
}

export interface IDeviceAdapter {
  type: DeviceType;
  supports(type: DeviceType): boolean;
  print(job: { html: string; paperWidth: string; copies: number; title?: string }): Promise<boolean>;
  openCashDrawer?(): Promise<boolean>;
  getStatus?(): Promise<'ready' | 'error' | 'offline'>;
}
