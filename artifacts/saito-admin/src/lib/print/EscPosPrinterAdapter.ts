import { IPrinterAdapter, ReceiptJob, PrinterType } from './PrinterAdapter';

export class EscPosPrinterAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'escpos_usb';
  }

  async print(_job: ReceiptJob): Promise<boolean> {
    console.warn('[EscPosPrinterAdapter] ESC/POS printing requires native host. Not yet implemented.');
    return false;
  }
}
