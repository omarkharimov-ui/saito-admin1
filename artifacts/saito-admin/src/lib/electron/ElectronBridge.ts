export interface ElectronBridge {
  print(job: { html?: string; escpos?: number[]; paperWidth: string; copies: number; title?: string }): Promise<boolean>;
  drawer(): Promise<boolean>;
  scanner(): Promise<string>;
  display(message: string): Promise<boolean>;
  terminal(action: string, payload: any): Promise<any>;
  scale(): Promise<{ weight: number; stable: boolean }>;
  storage(key: string, value: any): Promise<any>;
  network(): Promise<{ online: boolean; latency: number }>;
  deviceInfo(): Promise<{ platform: string; arch: string; version: string }>;
}

declare global {
  interface Window {
    pos?: ElectronBridge;
  }
}

export function getElectronBridge(): ElectronBridge | null {
  if (typeof window !== 'undefined' && window.pos) {
    return window.pos;
  }
  return null;
}
