'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/lib/toast';
import { printerService } from '@/lib/print/PrinterService';
import { deviceService } from '@/lib/devices/DeviceService';
import { printQueue } from '@/lib/print/PrintQueue';
import type { DetectedPrinter } from '@/lib/print/PrinterDetector';

type PrinterTypeOption = {
  value: 'browser' | 'escpos_usb' | 'escpos_network' | 'escpos_serial' | 'windows' | 'pdf' | 'preview';
  label: string;
};

const PRINTER_TYPES: PrinterTypeOption[] = [
  { value: 'browser', label: 'Browser' },
  { value: 'escpos_usb', label: 'ESC/POS USB' },
  { value: 'escpos_network', label: 'ESC/POS Network (LAN)' },
  { value: 'escpos_serial', label: 'ESC/POS Serial (COM)' },
  { value: 'windows', label: 'Windows Printer' },
  { value: 'pdf', label: 'PDF' },
  { value: 'preview', label: 'Preview' },
];

export default function PrinterSettings() {
  const [config, setConfig] = useState<{
    type: 'browser' | 'escpos_usb' | 'escpos_network' | 'escpos_serial' | 'windows' | 'pdf' | 'preview';
    paperWidth: '58mm' | '80mm' | 'a4';
    copies: number;
    autoCut: boolean;
    autoDrawer: boolean;
    encoding: 'utf8' | 'cp1254' | 'cp1251' | 'cp1252';
  }>({
    type: 'browser',
    paperWidth: '80mm',
    copies: 1,
    autoCut: true,
    autoDrawer: false,
    encoding: 'utf8',
  });
  const [saving, setSaving] = useState(false);
  const [detectedPrinters, setDetectedPrinters] = useState<DetectedPrinter[]>([]);
  const [autoDetecting, setAutoDetecting] = useState(false);

  useEffect(() => {
    const saved = printerService.getConfig();
    setConfig({
      type: saved.type || 'browser',
      paperWidth: saved.paperWidth || '80mm',
      copies: saved.copies || 1,
      autoCut: true,
      autoDrawer: false,
      encoding: 'utf8',
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const printers = await printerService.autoDetect();
      if (mounted) setDetectedPrinters(printers);
    };
    init();

    const unsubscribe = printerService.onPrinterChange((printers) => {
      if (mounted) setDetectedPrinters(printers);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      printerService.setConfig(config);
      await fetch('/api/settings/printer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'printer_config', value: config }),
      });
      toast.success('Printer ayarları saxlanıldı');
    } catch {
      toast.error('Saxlanma xətası');
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleTestPrint = useCallback(async () => {
    try {
      const success = await printerService.printWithRetry({
        paperWidth: config.paperWidth,
        copies: 1,
        title: 'Test Print',
      });
      if (success) {
        toast.success('Test çapı göndərildi');
      } else {
        toast.error('Çap xətası');
      }
    } catch {
      toast.error('Çap xətası');
    }
  }, [config.paperWidth]);

  const handleAutoDetect = useCallback(async () => {
    setAutoDetecting(true);
    try {
      const printers = await printerService.autoDetect();
      setDetectedPrinters(printers);
      if (printers.length > 0) {
        const defaultPrinter = printers.find(p => p.isDefault) || printers[0];
        const adapterType = printerService.selectAdapter(defaultPrinter);
        setConfig((prev) => ({
          ...prev,
          type: adapterType,
          paperWidth: defaultPrinter.paperWidth === 'unknown' ? prev.paperWidth : defaultPrinter.paperWidth,
        }));
        toast.success(`${printers.length} printer found`);
      } else {
        toast.error('Printer not found');
      }
    } catch {
      toast.error('Aşkarlama xətası');
    } finally {
      setAutoDetecting(false);
    }
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
    <div className="space-y-6">
      <div className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Debug</p>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/50">Runtime</span>
          <span className="font-bold text-white">{printerService.getRuntime() === 'electron' ? 'Electron' : 'Browser'}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-white/50">Selected Adapter</span>
          <span className="font-bold text-emerald-400">{printerService.getSelectedAdapterName()}</span>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white/80">Avtomatik Printer Aşkarlama</h3>
        <p className="text-[10px] text-white/50">
          Sistem printerlərini avtomatik aşkarlayır. ESC/POS thermal printerlər və sistem printerləri avtomatik tanınır.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAutoDetect}
            disabled={autoDetecting}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold transition-all hover:border-white/10 disabled:opacity-50"
          >
            {autoDetecting ? 'Aşkarlanır...' : 'Printerləri Aşkarla'}
          </button>
          <button
            type="button"
            onClick={handleTestPrint}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/5 border border-white/5 text-sm font-bold transition-all hover:border-white/10"
          >
            Test Çapı
          </button>
        </div>

        {detectedPrinters.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Aşkarlanan Printerlər</p>
            {detectedPrinters.map((printer) => (
              <div
                key={printer.id}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  config.type === printerService.selectAdapter(printer)
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-white/5 border-white/5 hover:border-white/10'
                }`}
                onClick={() => {
                  const adapterType = printerService.selectAdapter(printer);
                  setConfig((prev) => ({
                    ...prev,
                    type: adapterType,
                    paperWidth: printer.paperWidth === 'unknown' ? prev.paperWidth : printer.paperWidth,
                  }));
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">{printer.name}</p>
                    <p className="text-[10px] text-white/50">
                      {printer.type.toUpperCase()} • {printer.paperWidth} • {printer.connectionType.toUpperCase()}
                      {printer.isDefault ? ' • DEFAULT' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {printer.isDefault && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        Default
                      </span>
                    )}
                    <span className={`text-[9px] font-black uppercase tracking-widest ${getStatusColor(printer.isOnline ? 'ready' : 'error')}`}>
                      {printer.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white/80">Printer Ayarları</h3>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Printer Tipi</label>
          <select
            value={config.type}
            onChange={(e) => setConfig({ ...config, type: e.target.value as any })}
            className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-white text-xs font-bold focus:outline-none focus:border-white/10"
          >
            {PRINTER_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value} className="bg-zinc-900">
                {pt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Kağız Eni</label>
          <select
            value={config.paperWidth}
            onChange={(e) => setConfig({ ...config, paperWidth: e.target.value as any })}
            className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-white text-xs font-bold focus:outline-none focus:border-white/10"
          >
            <option value="58mm" className="bg-zinc-900">58mm</option>
            <option value="80mm" className="bg-zinc-900">80mm</option>
            <option value="a4" className="bg-zinc-900">A4</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Kopya Sayı</label>
          <input
            type="number"
            min={1}
            max={10}
            value={config.copies}
            onChange={(e) => setConfig({ ...config, copies: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-white text-xs font-bold focus:outline-none focus:border-white/10"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-white/50">Encoding</label>
          <select
            value={config.encoding}
            onChange={(e) => setConfig({ ...config, encoding: e.target.value as any })}
            className="w-full p-3 rounded-xl bg-white/5 border border-white/5 text-white text-xs font-bold focus:outline-none focus:border-white/10"
          >
            <option value="utf8" className="bg-zinc-900">UTF-8</option>
            <option value="cp1254" className="bg-zinc-900">CP1254 (Turkish)</option>
            <option value="cp1251" className="bg-zinc-900">CP1251 (Cyrillic)</option>
            <option value="cp1252" className="bg-zinc-900">CP1252 (Latin)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 text-[10px] font-black uppercase tracking-widest text-white/70 transition-all"
        >
          {saving ? 'Saxlanılır...' : 'Saxla'}
        </button>
        <button
          onClick={handleTestPrint}
          className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/70 transition-all"
        >
          Test Çapı
        </button>
      </div>

      <div className="p-3 rounded-xl bg-white/5 border border-white/5">
        <p className="text-[10px] text-white/50 mb-2">Çap Növbəsi</p>
        <p className="text-xs text-white/80">{printQueue.getPending().length} gözləyir</p>
      </div>
    </div>
  );
}
