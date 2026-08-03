export type PrinterType = 'browser' | 'escpos_usb' | 'escpos_network' | 'escpos_serial' | 'windows' | 'pdf' | 'preview';

export interface PrinterConfig {
  id: string;
  type: PrinterType;
  name: string;
  endpoint?: string;
  paperWidth?: '58mm' | '80mm' | 'a4';
  copies?: number;
  autoCut?: boolean;
  autoDrawer?: boolean;
  encoding?: 'utf8' | 'cp1254' | 'cp1251' | 'cp1252';
}

export interface ReceiptJob {
  html?: string;
  escpos?: Uint8Array;
  paperWidth: '58mm' | '80mm' | 'a4';
  copies: number;
  title?: string;
}

export interface IPrinterAdapter {
  print(job: ReceiptJob): Promise<boolean>;
  supports(type: PrinterType): boolean;
}
