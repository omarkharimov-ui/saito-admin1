import { TableState } from './types';
import { mergeStates } from './CRDTMerge';

/**
 * OFFLINE STORE (IndexedDB Wrapper)
 * Manages local persistence for table states and order logs.
 */
class OfflineStore {
  private dbName = 'saito_pos_offline';
  private version = 1;

  async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tables')) {
          db.createObjectStore('tables', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('logs')) {
          db.createObjectStore('logs', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('orders')) {
          db.createObjectStore('orders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('order_items')) {
          db.createObjectStore('order_items', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          const outbox = db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
          outbox.createIndex('table', 'table', { unique: false });
          outbox.createIndex('synced', 'synced', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveTableState(state: TableState): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('tables', 'readwrite');
    const store = tx.objectStore('tables');

    const existing: TableState | undefined = await new Promise((res) => {
      const req = store.get(state.id);
      req.onsuccess = () => res(req.result);
      req.onerror = () => res(undefined);
    });

    const finalState = existing ? mergeStates(existing, state) : state;
    store.put(finalState);

    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async getAllTables(): Promise<TableState[]> {
    const db = await this.initDB();
    const tx = db.transaction('tables', 'readonly');
    const store = tx.objectStore('tables');
    const request = store.getAll();

    return new Promise((res) => {
      request.onsuccess = () => res(request.result || []);
      request.onerror = () => res([]);
    });
  }

  async pushToLog(action: any): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');
    const entry = {
      ...action,
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: Date.now(),
      synced: false,
    };
    store.put(entry);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async getUnsyncedLogs(): Promise<any[]> {
    const db = await this.initDB();
    const tx = db.transaction('logs', 'readonly');
    const store = tx.objectStore('logs');
    const request = store.getAll();

    return new Promise((res) => {
      request.onsuccess = () => {
        const allLogs = request.result || [];
        res(allLogs.filter((l: any) => !l.synced));
      };
      request.onerror = () => res([]);
    });
  }

  async markAsSynced(id: string): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('logs', 'readwrite');
    const store = tx.objectStore('logs');

    const request = store.get(id);
    request.onsuccess = () => {
      const data = request.result;
      if (data) {
        data.synced = true;
        store.put(data);
      }
    };
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async saveOrder(order: any): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');
    store.put(order);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async getAllOrders(): Promise<any[]> {
    const db = await this.initDB();
    const tx = db.transaction('orders', 'readonly');
    const store = tx.objectStore('orders');
    const request = store.getAll();
    return new Promise((res) => {
      request.onsuccess = () => res(request.result || []);
      request.onerror = () => res([]);
    });
  }

  async saveOrderItem(item: any): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('order_items', 'readwrite');
    const store = tx.objectStore('order_items');
    store.put(item);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async getAllOrderItems(): Promise<any[]> {
    const db = await this.initDB();
    const tx = db.transaction('order_items', 'readonly');
    const store = tx.objectStore('order_items');
    const request = store.getAll();
    return new Promise((res) => {
      request.onsuccess = () => res(request.result || []);
      request.onerror = () => res([]);
    });
  }

  async pushToOutbox(action: any): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const entry = {
      ...action,
      synced: false,
      created_at: Date.now(),
      retry_count: 0,
      last_error: null,
      last_status: null,
    };
    store.put(entry);
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async getOutbox(): Promise<any[]> {
    const db = await this.initDB();
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const request = store.getAll();
    return new Promise((res) => {
      request.onsuccess = () => res(request.result || []);
      request.onerror = () => res([]);
    });
  }

  async markOutboxSynced(id: number): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const request = store.get(id);
    request.onsuccess = () => {
      const data = request.result;
      if (data) {
        data.synced = true;
        store.put(data);
      }
    };
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async updateOutboxError(id: number, lastError: string, lastStatus: number | null): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const request = store.get(id);
    request.onsuccess = () => {
      const data = request.result;
      if (data) {
        data.retry_count = (data.retry_count || 0) + 1;
        data.last_error = lastError;
        data.last_status = lastStatus;
        store.put(data);
      }
    };
    return new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async clearOutbox(): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const index = store.index('synced');

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'next');
      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const localStore = new OfflineStore();
