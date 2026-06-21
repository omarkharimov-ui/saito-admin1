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
          db.createObjectStore('logs', { keyPath: 'timestamp' });
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Write to local storage immediately
   */
  async saveTableState(state: TableState): Promise<void> {
    const db = await this.initDB();
    const tx = db.transaction('tables', 'readwrite');
    const store = tx.objectStore('tables');
    
    // Check for existing state and merge using CRDT logic
    const existing: TableState | undefined = await new Promise((res) => {
      const req = store.get(state.id);
      req.onsuccess = () => res(req.result);
    });

    const finalState = existing ? mergeStates(existing, state) : state;
    store.put(finalState);
    
    return new Promise((res) => {
      tx.oncomplete = () => res();
    });
  }

  async getAllTables(): Promise<TableState[]> {
    const db = await this.initDB();
    const tx = db.transaction('tables', 'readonly');
    const store = tx.objectStore('tables');
    const request = store.getAll();
    
    return new Promise((res) => {
      request.onsuccess = () => res(request.result);
    });
  }
}

export const localStore = new OfflineStore();
