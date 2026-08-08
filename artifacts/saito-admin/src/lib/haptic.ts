'use client';

export type HapticType = 'pop' | 'on' | 'off' | 'tap' | 'select' | 'error' | 'success';

const soundPresets: Record<HapticType, { freq: [number, number]; gain: [number, number]; duration: number }> = {
  pop:    { freq: [400, 600],   gain: [0.05, 0.01], duration: 0.08 },
  on:     { freq: [880, 1200],  gain: [0.1, 0.01],  duration: 0.1  },
  off:    { freq: [1200, 660],  gain: [0.1, 0.01],  duration: 0.1  },
  tap:    { freq: [523, 784],   gain: [0.03, 0.01], duration: 0.06 },
  select: { freq: [660, 1100],  gain: [0.06, 0.01], duration: 0.08 },
  error:  { freq: [150, 80],    gain: [0.08, 0.01], duration: 0.15 },
  success:{ freq: [523, 784],   gain: [0.05, 0.01], duration: 0.12 },
};

let audioCtx: AudioContext | null = null;
let soundEnabled = false;

export const setHapticSoundEnabled = (enabled: boolean) => {
  soundEnabled = enabled;
};

export const playHapticSound = (type: HapticType = 'pop') => {
  if (typeof window === 'undefined' || !soundEnabled) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const { freq, gain, duration } = soundPresets[type];
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g);
    g.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq[0], audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq[1], audioCtx.currentTime + duration);
    g.gain.setValueAtTime(gain[0], audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(gain[1], audioCtx.currentTime + duration);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
  } catch {
  }
};

export const useHaptic = () => {
  if (typeof window === 'undefined') return playHapticSound;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS && navigator.vibrate) {
    return (type: HapticType = 'pop') => {
      try {
        if (type === 'pop' || type === 'tap') navigator.vibrate(10);
        else if (type === 'select') navigator.vibrate([5, 5, 10]);
        else if (type === 'error') navigator.vibrate([20, 10, 20]);
        else if (type === 'success') navigator.vibrate([5, 5, 15]);
      } catch {
      }
    };
  }
  return () => {};
};
