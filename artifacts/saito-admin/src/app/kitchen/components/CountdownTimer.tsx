'use client';

import { useEffect, useState } from 'react';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function CountdownTimer({ createdAt, thresholdMinutes = 15, lightMode = false }: { createdAt: string; thresholdMinutes?: number; lightMode?: boolean }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diffMs = now - new Date(createdAt).getTime();
  const diffMin = diffMs / 60000;
  const thresholdMs = thresholdMinutes * 60_000;
  const overdue = diffMs >= thresholdMs;
  const remainingMs = Math.max(0, thresholdMs - diffMs);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);

  const label = overdue
    ? `+${pad(Math.floor(diffMin))}:${pad(Math.floor((diffMs % 60000) / 1000))}`
    : `${pad(remainingMin)}:${pad(remainingSec)}`;

  return (
    <span className={`tabular-nums font-black ${overdue ? 'text-red-500 animate-pulse' : lightMode ? 'text-black/60' : 'text-white/50'}`}>
      {label}
    </span>
  );
}
