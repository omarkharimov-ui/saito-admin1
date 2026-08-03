'use client';

import { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { printerService } from '@/lib/print/PrinterService';
import { deviceService } from '@/lib/devices/DeviceService';
import { printQueue } from '@/lib/print/PrintQueue';
import type { DeviceType } from '@/lib/devices/DeviceAdapter';

interface DiagnosticResult {
  device: string;
  type: string;
  status: 'ready' | 'error' | 'offline';
  message?: string;
}

export default function DeviceDiagnostics() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [running, setRunning] = useState(false);

  const runDiagnostics = async () => {
    setRunning(true);
    const diagnostics: DiagnosticResult[] = [];

    const devices = [
      { name: 'Receipt Printer', type: 'printer_escpos' as const },
      { name: 'Network Printer', type: 'printer_network' as const },
      { name: 'Cash Drawer', type: 'cash_drawer' as const },
      { name: 'Barcode Scanner', type: 'barcode_scanner' as const },
      { name: 'Customer Display', type: 'customer_display' as const },
      { name: 'Scale', type: 'scale' as const },
      { name: 'Card Terminal', type: 'card_terminal' as const },
      { name: 'Kitchen Display', type: 'kitchen_display' as const },
    ];

    for (const device of devices) {
      try {
        const status = await deviceService.getDeviceStatus(device.type as DeviceType);
        diagnostics.push({
          device: device.name,
          type: device.type,
          status,
        });
      } catch {
        diagnostics.push({
          device: device.name,
          type: device.type,
          status: 'error',
          message: 'Failed to check status',
        });
      }
    }

    setResults(diagnostics);
    setRunning(false);

    const readyCount = diagnostics.filter((d) => d.status === 'ready').length;
    const offlineCount = diagnostics.filter((d) => d.status === 'offline').length;

    if (readyCount > 0) {
      toast.success(`${readyCount} cihaz hazır`);
    }
    if (offlineCount > 0) {
      toast.error(`${offlineCount} cihaz oflayn`);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'text-emerald-400';
      case 'error':
        return 'text-rose-400';
      default:
        return 'text-zinc-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready':
        return 'Hazır';
      case 'error':
        return 'Xəta';
      default:
        return 'Offlayn';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white/80">Cihazlar</h3>
        <button
          onClick={runDiagnostics}
          disabled={running}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 text-[10px] font-black uppercase tracking-widest text-white/70 transition-all"
        >
          {running ? 'Yoxlanılır...' : 'Yenidən yoxla'}
        </button>
      </div>

      <div className="space-y-2">
        {results.map((result, idx) => (
          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
            <div>
              <p className="text-xs font-bold text-white">{result.device}</p>
              <p className="text-[10px] text-white/50">{result.type}</p>
            </div>
            <div className={`text-[10px] font-black uppercase tracking-widest ${getStatusColor(result.status)}`}>
              {getStatusLabel(result.status)}
            </div>
          </div>
        ))}
      </div>

      {results.length > 0 && (
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <p className="text-[10px] text-white/50">
            Hazır: {results.filter((d) => d.status === 'ready').length} / {results.length}
          </p>
        </div>
      )}

      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
        <p className="text-[10px] text-white/50 mb-2">Çap Növbəsi</p>
        <p className="text-xs text-white/80">{printQueue.getPending().length} gözləyir</p>
      </div>
    </div>
  );
}
