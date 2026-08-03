export type RuntimeMode = 'browser' | 'electron';

function detectElectron(): boolean {
  if (typeof window === 'undefined') return false;
  if ((window as any).pos) return true;
  const ua = window.navigator?.userAgent ?? '';
  return /electron/i.test(ua);
}

export const runtimeMode: RuntimeMode = detectElectron() ? 'electron' : 'browser';
export const isElectron = runtimeMode === 'electron';
export const isBrowser = runtimeMode === 'browser';
