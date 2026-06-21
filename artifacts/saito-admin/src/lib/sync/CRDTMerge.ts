import { TableState } from './types';

/**
 * LWW-Element-Set (Last-Write-Wins)
 * Merges two states by comparing the precision timestamp.
 * In decentralized systems, this prevents data corruption during network splits.
 */
export function mergeStates(peerA: TableState, peerB: TableState): TableState {
  if (!peerA) return peerB;
  if (!peerB) return peerA;
  
  // High-precision timestamp comparison
  if (peerA.updatedAt > peerB.updatedAt) {
    return peerA;
  } else if (peerB.updatedAt > peerA.updatedAt) {
    return peerB;
  }
  
  // Deterministic tie-breaking using Device ID string comparison
  return peerA.deviceId > peerB.deviceId ? peerA : peerB;
}

/**
 * Batch merge function for full mesh synchronization
 */
export function reconcileTableSet(localTables: TableState[], incomingTables: TableState[]): TableState[] {
  const mergedMap = new Map<string, TableState>();
  
  localTables.forEach(t => mergedMap.set(t.id, t));
  
  incomingTables.forEach(incoming => {
    const local = mergedMap.get(incoming.id);
    if (local) {
      mergedMap.set(incoming.id, mergeStates(local, incoming));
    } else {
      mergedMap.set(incoming.id, incoming);
    }
  });
  
  return Array.from(mergedMap.values());
}
