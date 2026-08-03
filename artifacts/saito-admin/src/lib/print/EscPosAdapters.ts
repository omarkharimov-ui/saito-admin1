import { IPrinterAdapter, PrinterType, ReceiptJob } from './PrinterAdapter';
import { buildEscPos } from './EscPosBuilder';

export class EscPosUsbAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'escpos_usb';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    if (!job.escpos) {
      job.escpos = buildEscPos(job as any);
    }
    console.warn('[EscPosUsbAdapter] USB printing requires native host. Not yet implemented.');
    return false;
  }
}

export class EscPosNetworkAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'escpos_network';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    if (!job.escpos) {
      job.escpos = buildEscPos(job as any);
    }
    console.warn('[EscPosNetworkAdapter] Network printing requires backend endpoint. Not yet implemented.');
    return false;
  }
}

export class EscPosSerialAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'escpos_serial';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    if (!job.escpos) {
      job.escpos = buildEscPos(job as any);
    }
    console.warn('[EscPosSerialAdapter] Serial printing requires native host. Not yet implemented.');
    return false;
  }
}

export class WindowsPrinterAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'windows';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    if (!job.escpos) {
      job.escpos = buildEscPos(job as any);
    }
    console.warn('[WindowsPrinterAdapter] Windows printing requires Electron bridge. Not yet implemented.');
    return false;
  }
}

export class PdfPrinterAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'pdf';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    console.warn('[PdfPrinterAdapter] PDF printing not yet implemented.');
    return false;
  }
}

export class PreviewPrinterAdapter implements IPrinterAdapter {
  supports(type: PrinterType): boolean {
    return type === 'preview';
  }

  async print(job: ReceiptJob): Promise<boolean> {
    if (!job.html) return false;
    const blob = new Blob([job.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=400,height=600');
    if (!win) return false;
    await new Promise((resolve) => setTimeout(resolve, 500));
    URL.revokeObjectURL(url);
    return true;
  }
}
