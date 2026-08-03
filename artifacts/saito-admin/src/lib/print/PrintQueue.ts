import { printerService } from './PrinterService';
import type { ReceiptJob } from './PrinterAdapter';

export interface PrintQueueItem {
  id: string;
  job: ReceiptJob;
  printerType: string;
  createdAt: number;
  retries: number;
  maxRetries: number;
}

class PrintQueue {
  private queue: PrintQueueItem[] = [];
  private processing = false;

  enqueue(item: Omit<PrintQueueItem, 'id' | 'createdAt' | 'retries'>): void {
    const queueItem: PrintQueueItem = {
      ...item,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      retries: 0,
    };
    this.queue.push(queueItem);
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      try {
        const success = await printerService.print(item.job);
        if (success) {
          this.queue.shift();
        } else {
          item.retries++;
          if (item.retries >= item.maxRetries) {
            console.error('[PrintQueue] Max retries exceeded for item:', item.id);
            this.queue.shift();
          } else {
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, item.retries)));
          }
        }
      } catch {
        item.retries++;
        if (item.retries >= item.maxRetries) {
          this.queue.shift();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, item.retries)));
        }
      }
    }

    this.processing = false;
  }

  getPending(): PrintQueueItem[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }
}

export const printQueue = new PrintQueue();
