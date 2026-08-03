import type { PrinterType } from './PrinterAdapter';

export interface DetectedPrinter {
  id: string;
  name: string;
  type: 'escpos' | 'system' | 'network' | 'bluetooth' | 'unknown';
  connectionType: 'usb' | 'lan' | 'wifi' | 'bluetooth' | 'shared' | 'unknown';
  paperWidth: '58mm' | '80mm' | 'a4' | 'unknown';
  isDefault: boolean;
  isOnline: boolean;
  rawName: string;
}

const ESCPOS_PATTERNS = [
  /epson\s+tm[-_]?t20/i,
  /epson\s+tm[-_]?t88/i,
  /epson\s+tm[-_]?m30/i,
  /xp[-_]?80/i,
  /xp[-_]?58/i,
  /pos58/i,
  /pos80/i,
  /tm[-_]?t20/i,
  /tm[-_]?t88/i,
  /xprinter/i,
  /gprinter/i,
  /sunmi/i,
  /rongta/i,
  /printer/i,
  /thermal/i,
];

function detectPrinterType(name: string): DetectedPrinter['type'] {
  const lower = name.toLowerCase();
  if (ESCPOS_PATTERNS.some(p => p.test(lower))) {
    return 'escpos';
  }
  if (/canon|hp|kyocera|ricoh|brother|samsung|lexmark|dell| Xerox/.test(lower)) {
    return 'system';
  }
  if (/network|lan|wifi|wireless/.test(lower)) {
    return 'network';
  }
  if (/bluetooth|bt/.test(lower)) {
    return 'bluetooth';
  }
  return 'unknown';
}

function detectPaperWidth(name: string): DetectedPrinter['paperWidth'] {
  const lower = name.toLowerCase();
  if (/58\s*mm|pos58|58mm/.test(lower)) {
    return '58mm';
  }
  if (/80\s*mm|pos80|80mm|tm[-_]?t20|tm[-_]?t88|xp[-_]?80/.test(lower)) {
    return '80mm';
  }
  if (/a4|laser|jet|toner|kyocera|canon\s+lbp|hp\s+laser/.test(lower)) {
    return 'a4';
  }
  return 'unknown';
}

function detectConnectionType(name: string): DetectedPrinter['connectionType'] {
  const lower = name.toLowerCase();
  if (/usb/.test(lower)) {
    return 'usb';
  }
  if (/lan|network|ethernet|ip /.test(lower)) {
    return 'lan';
  }
  if (/wifi|wireless/.test(lower)) {
    return 'wifi';
  }
  if (/bluetooth|bt /.test(lower)) {
    return 'bluetooth';
  }
  if (/shared|smb|cifs/.test(lower)) {
    return 'shared';
  }
  return 'unknown';
}

export class PrinterDetector {
  private listeners: ((printers: DetectedPrinter[]) => void)[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastPrinters: DetectedPrinter[] = [];

  async detect(): Promise<DetectedPrinter[]> {
    if (typeof window === 'undefined') {
      return [];
    }

    const printers: DetectedPrinter[] = [];

    if (typeof navigator !== 'undefined' && (navigator as any).getPrinters) {
      try {
        const browserPrinters = await (navigator as any).getPrinters();
        for (const p of browserPrinters) {
          const type = detectPrinterType(p.name);
          const paperWidth = detectPaperWidth(p.name);
          const connectionType = detectConnectionType(p.name);
          printers.push({
            id: `browser_${p.name}`,
            name: p.name,
            type,
            connectionType,
            paperWidth,
            isDefault: p.name === (navigator as any).defaultPrinterName,
            isOnline: true,
            rawName: p.name,
          });
        }
      } catch {
        // Browser printer enumeration not supported
      }
    }

    if (printers.length === 0) {
      printers.push({
        id: 'browser_default',
        name: 'Browser Default Printer',
        type: 'unknown',
        connectionType: 'unknown',
        paperWidth: '80mm',
        isDefault: true,
        isOnline: true,
        rawName: 'Browser Default Printer',
      });
    }

    this.lastPrinters = printers;
    this.notifyListeners(printers);
    return printers;
  }

  startPolling(intervalMs = 5000): void {
    if (this.intervalId) return;
    this.detect();
    this.intervalId = setInterval(() => this.detect(), intervalMs);
  }

  stopPolling(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  onChange(callback: (printers: DetectedPrinter[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(printers: DetectedPrinter[]): void {
    for (const listener of this.listeners) {
      listener(printers);
    }
  }

  getLastPrinters(): DetectedPrinter[] {
    return [...this.lastPrinters];
  }

  static getDefaultPrinter(printers: DetectedPrinter[]): DetectedPrinter | undefined {
    const defaultPrinter = printers.find(p => p.isDefault);
    if (defaultPrinter) return defaultPrinter;
    const escpos = printers.find(p => p.type === 'escpos');
    if (escpos) return escpos;
    return printers[0];
  }

  static selectAdapter(printer: DetectedPrinter): PrinterType {
    if (printer.type === 'escpos') {
      if (printer.connectionType === 'lan' || printer.connectionType === 'wifi') {
        return 'escpos_network';
      }
      if (printer.connectionType === 'usb') {
        return 'escpos_usb';
      }
      if (printer.connectionType === 'bluetooth') {
        return 'escpos_serial';
      }
      return 'escpos_usb';
    }
    if (printer.type === 'system' || printer.type === 'unknown') {
      return 'windows';
    }
    if (printer.type === 'network') {
      return 'escpos_network';
    }
    return 'browser';
  }
}

export const printerDetector = new PrinterDetector();
