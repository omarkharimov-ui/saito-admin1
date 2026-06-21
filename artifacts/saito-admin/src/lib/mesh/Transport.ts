import { TableState } from './types';

/**
 * P2P Transport Interface
 * Defines how data is broadcasted across the local mesh.
 */
export interface MeshTransport {
  broadcast(payload: any): Promise<void>;
  onMessage(callback: (payload: any) => void): void;
}

/**
 * Native P2P Bridge
 * Wraps Capacitor calls for iOS (Multipeer) and Android (WiFi Direct).
 */
export const MeshBridge = {
  async send(data: any) {
    if (typeof window === 'undefined') return;
    
    // Check if running in Capacitor
    const isNative = (window as any).Capacitor?.isNative;
    
    if (isNative) {
      // Direct call to native antenna wrapper
      return (window as any).Capacitor.Plugins.P2PMesh.send({ payload: JSON.stringify(data) });
    } else {
      // Local fallback for dev/sim (e.g. Local BroadcastChannel)
      const bc = new BroadcastChannel('saito_mesh_sim');
      bc.postMessage(data);
    }
  }
};
