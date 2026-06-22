import { MeshBridge } from './Transport';
import { TableState } from '../sync/types';
import { localStore } from '../sync/OfflineStore';

/**
 * MESH BROADCASTER
 * Orchestrates the broadcast of state changes to peers.
 */
export class MeshBroadcaster {
  /**
   * Broadcasts a table update to all discovered peers in the mesh.
   */
  static async updateTable(state: TableState) {
    // 1. Save locally first (Offline-First)
    await localStore.saveTableState(state);
    
    // 2. Broadcast to mesh
    const payload = {
      type: 'TABLE_UPDATE',
      data: state,
      timestamp: Date.now(),
      originDeviceId: state.deviceId
    };
    
    await MeshBridge.send(payload);
  }

  /**
   * Broadcasts a new order to the kitchen peers.
   */
  static async sendOrder(order: any) {
    const payload = {
      type: 'ORDER_NEW',
      data: order,
      timestamp: Date.now()
    };
    await MeshBridge.send(payload);
  }

  /**
   * Listens for incoming updates from the mesh and reconciles with local storage.
   */
  static async startListening(onOrderReceived?: (order: any) => void) {
    if (typeof window === 'undefined') return;
    
    const bc = new BroadcastChannel('saito_mesh_sim');
    bc.onmessage = async (event) => {
      const { type, data } = event.data;
      if (type === 'TABLE_UPDATE') {
        // Automatically merges with local state via CRDT logic inside saveTableState
        await localStore.saveTableState(data as TableState);
        console.log(`[Mesh] Reconciled Table ${data.id} from peer`);
      }
      if (type === 'ORDER_NEW' && onOrderReceived) {
        onOrderReceived(data);
      }
    };
  }
}
