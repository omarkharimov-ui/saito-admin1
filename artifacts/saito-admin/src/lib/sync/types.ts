export interface TableState {
  id: string;
  status: 'available' | 'occupied' | 'dirty' | 'reserved';
  cartItems: any[];
  lastAction: string;
  updatedAt: number; // High-precision cryptographic timestamp
  deviceId: string;
}

export interface SyncPayload {
  type: 'TABLE_UPDATE' | 'ORDER_FINALIZE' | 'STOCK_ADJUST';
  data: TableState;
  timestamp: number;
  originDeviceId: string;
}
