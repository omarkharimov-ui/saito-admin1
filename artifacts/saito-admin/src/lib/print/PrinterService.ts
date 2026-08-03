import { IPrinterAdapter, PrinterConfig, ReceiptJob, PrinterType } from './PrinterAdapter';
import { BrowserPrinterAdapter } from './BrowserPrinterAdapter';
import { EscPosUsbAdapter, EscPosNetworkAdapter, EscPosSerialAdapter, WindowsPrinterAdapter, PdfPrinterAdapter, PreviewPrinterAdapter } from './EscPosAdapters';
import { printerDetector, PrinterDetector, type DetectedPrinter } from './PrinterDetector';
import { runtimeMode, type RuntimeMode } from './Runtime';

class PrinterService {
  private adapters: IPrinterAdapter[] = [
    new BrowserPrinterAdapter(),
    new PreviewPrinterAdapter(),
    new EscPosUsbAdapter(),
    new EscPosNetworkAdapter(),
    new EscPosSerialAdapter(),
    new WindowsPrinterAdapter(),
    new PdfPrinterAdapter(),
  ];

  private config: PrinterConfig = {
    id: 'default',
    type: 'browser',
    name: 'Default Printer',
    paperWidth: '80mm',
    copies: 1,
  };

  private printerConfigs: PrinterConfig[] = [];
  private detectedPrinters: DetectedPrinter[] = [];
  private autoDetectEnabled = true;

  private readonly runtime: RuntimeMode = runtimeMode;

  getRuntime(): RuntimeMode {
    return this.runtime;
  }

  isBrowserMode(): boolean {
    return this.runtime === 'browser';
  }

  selectAdapter(printer: DetectedPrinter): PrinterType {
    if (this.isBrowserMode()) {
      return 'browser';
    }
    return PrinterDetector.selectAdapter(printer);
  }

  getSelectedAdapterName(): string {
    const effectiveType: PrinterType = this.isBrowserMode() ? 'browser' : this.config.type;
    const adapter = this.adapters.find(a => a.supports(effectiveType));
    return adapter ? adapter.constructor.name : 'No adapter';
  }

  setConfig(config: Partial<PrinterConfig>) {
    this.config = { ...this.config, ...config };
    if (config.type) {
      this.autoDetectEnabled = false;
    }
  }

  getConfig(): PrinterConfig {
    return { ...this.config };
  }

  registerPrinter(config: PrinterConfig) {
    this.printerConfigs.push(config);
  }

  getPrinters(): PrinterConfig[] {
    return [...this.printerConfigs];
  }

  async autoDetect(): Promise<DetectedPrinter[]> {
    if (!this.autoDetectEnabled) {
      return this.detectedPrinters;
    }

    this.detectedPrinters = await printerDetector.detect();

    if (this.isBrowserMode()) {
      this.config.type = 'browser';
      this.config.name = 'Browser Printer';
      this.config.paperWidth = this.config.paperWidth || '80mm';
      return this.detectedPrinters;
    }

    if (this.detectedPrinters.length > 0 && this.config.type === 'browser') {
      const defaultPrinter = this.detectedPrinters.find(p => p.isDefault) || this.detectedPrinters[0];
      const adapterType = PrinterDetector.selectAdapter(defaultPrinter);
      this.config.type = adapterType;
      this.config.name = defaultPrinter.name;
      if (defaultPrinter.paperWidth !== 'unknown') {
        this.config.paperWidth = defaultPrinter.paperWidth;
      }
    }

    return this.detectedPrinters;
  }

  getDetectedPrinters(): DetectedPrinter[] {
    return [...this.detectedPrinters];
  }

  startAutoDetection(intervalMs = 5000): () => void {
    printerDetector.startPolling(intervalMs);
    return () => printerDetector.stopPolling();
  }

  onPrinterChange(callback: (printers: DetectedPrinter[]) => void): () => void {
    return printerDetector.onChange(callback);
  }

  async print(job: ReceiptJob): Promise<boolean> {
    if (this.autoDetectEnabled && this.detectedPrinters.length === 0) {
      await this.autoDetect();
    }

    const effectiveType: PrinterType = this.isBrowserMode() ? 'browser' : this.config.type;
    const adapter = this.adapters.find(a => a.supports(effectiveType));
    if (!adapter) {
      console.error(`No printer adapter found for type: ${effectiveType}`);
      return false;
    }

    const adjustedJob: ReceiptJob = {
      ...job,
      copies: job.copies || this.config.copies || 1,
      paperWidth: job.paperWidth || this.config.paperWidth || '80mm',
    };

    try {
      return await adapter.print(adjustedJob);
    } catch (error) {
      console.error('[PrinterService] Print failed:', error);
      return false;
    }
  }

  async printWithRetry(job: ReceiptJob, maxRetries = 3): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      const success = await this.print(job);
      if (success) return true;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
    return false;
  }
}

export const printerService = new PrinterService();
