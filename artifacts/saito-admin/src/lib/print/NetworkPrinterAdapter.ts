import { IPrinterAdapter, ReceiptJob, PrinterType } from './PrinterAdapter';

export class NetworkPrinterAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'escpos_network';
  }

  async print(_job: ReceiptJob): Promise<boolean> {
    console.warn('[NetworkPrinterAdapter] Network printing requires backend endpoint. Not yet implemented.');
    return false;
  }
}
