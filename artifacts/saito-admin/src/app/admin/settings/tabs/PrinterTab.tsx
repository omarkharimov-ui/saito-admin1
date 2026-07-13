'use client';

import React, { useState, useEffect } from 'react';
import { useFormDirtyCompare } from '@/hooks/useFormDirty';
import { supabase } from '@/lib/supabase';
import { Save, Loader2, Printer, Usb, Bluetooth, Wifi, Monitor, Copy, TestTube, Search, Receipt } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { inputCls, labelCls, saveButtonCls } from './_shared';
import TactileSwitch from '../../components/ui/TactileSwitch';

interface PrinterCfg {
  printer_name: string;
  printer_type: string;
  printer_paper_width: string;
  printer_interface: string;
  auto_print_receipt: boolean;
  auto_print_kitchen: boolean;
  print_copies: number;
}

const DEFAULTS: PrinterCfg = {
  printer_name: 'Default Printer',
  printer_type: 'thermal',
  printer_paper_width: '80mm',
  printer_interface: 'browser',
  auto_print_receipt: true,
  auto_print_kitchen: false,
  print_copies: 1,
};

const PrinterTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [cfg, setCfg] = useState<PrinterCfg>(DEFAULTS);
  const [detectedPrinters, setDetectedPrinters] = useState<string[]>([]);

  const { isDirty } = useFormDirtyCompare(cfg, [!loading]);

  useEffect(() => {
    const merge = (data: Record<string, any>) => {
      setCfg({
        printer_name: data.printer_name ?? DEFAULTS.printer_name,
        printer_type: data.printer_type ?? DEFAULTS.printer_type,
        printer_paper_width: data.printer_paper_width ?? DEFAULTS.printer_paper_width,
        printer_interface: data.printer_interface ?? DEFAULTS.printer_interface,
        auto_print_receipt: data.auto_print_receipt ?? DEFAULTS.auto_print_receipt,
        auto_print_kitchen: data.auto_print_kitchen ?? DEFAULTS.auto_print_kitchen,
        print_copies: data.print_copies ?? DEFAULTS.print_copies,
      });
    };

    if (initialData) {
      merge(initialData);
      setLoading(false);
      return;
    }

    supabase.from('settings').select('printer_name, printer_type, printer_paper_width, printer_interface, auto_print_receipt, auto_print_kitchen, print_copies').single().then(({ data }) => {
      if (data) merge(data);
      setLoading(false);
    });
  }, [initialData]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('settings').upsert([{ id: '1', ...cfg }]);
    if (error) {
      toast.error(error.message, { id: 'action-toast' });
    } else {
      toast.success(t('receipt_saved') || 'Printer settings saved', { id: 'action-toast', duration: 3000 });
    }
    setSaving(false);
  };

  const detectPrinters = async () => {
    setDetecting(true);
    setDetectedPrinters([]);

    const printers: string[] = [];

    if (typeof navigator !== 'undefined' && (navigator as any).getPrinters) {
      try {
        const list = await (navigator as any).getPrinters();
        if (list && list.length > 0) {
          printers.push(...list.map((p: any) => p.name));
        }
      } catch {
        // Firefox getPrinters may throw
      }
    }

    if (typeof navigator !== 'undefined' && (navigator as any).bluetooth) {
      try {
        const device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
        });
        if (device && device.name) {
          printers.push(`Bluetooth: ${device.name}`);
        }
      } catch (e) {
        // User cancelled or Bluetooth unavailable
      }
    }

    if (printers.length === 0) {
      printers.push('Browser print dialog (no device enumeration available)');
    }

    setDetectedPrinters(printers);
    setDetecting(false);
  };

  const testPrint = () => {
    const paperWidth = cfg.printer_paper_width === '58mm' ? 220 : 302;
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Test Print</title>
      <style>
        @page { size: ${paperWidth}px auto; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',Courier,monospace; background:#fff; color:#000; font-size:12px; padding:10px; }
        .center { text-align:center; }
        .bold { font-weight:700; }
        .line { border-top:1px dashed #000; margin:6px 0; }
      </style>
    </head><body>
      <div style="width:${paperWidth}px;margin:0 auto;padding:10px">
        <div class="center bold" style="font-size:14px;margin-bottom:4px">${cfg.printer_name}</div>
        <div class="center" style="font-size:10px;margin-bottom:2px">Test Print</div>
        <div class="line"></div>
        <div style="font-size:11px;margin-bottom:2px">Paper: ${cfg.printer_paper_width}</div>
        <div style="font-size:11px;margin-bottom:2px">Type: ${cfg.printer_type}</div>
        <div style="font-size:11px;margin-bottom:2px">Interface: ${cfg.printer_interface}</div>
        <div class="line"></div>
        <div class="center" style="font-size:10px;color:#555;margin-top:8px">If you see this, printing works.</div>
      </div>
    </body></html>`;

    const win = window.open('', '_blank', `width=${paperWidth + 40},height=600`);
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups for test print.');
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 350);
  };

  return (
    <form noValidate onSubmit={save} className="space-y-8 max-w-2xl">
      {/* ── Printer Configuration ── */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Printer Configuration</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}><Printer size={11} /> Printer Name</label>
            <input
              className={inputCls}
              value={cfg.printer_name}
              placeholder="e.g. Kitchen Receipt Printer"
              onChange={e => setCfg({ ...cfg, printer_name: e.target.value })}
            />
          </div>

          <div>
            <label className={labelCls}><Monitor size={11} /> Printer Type</label>
            <select
              className={inputCls}
              value={cfg.printer_type}
              onChange={e => setCfg({ ...cfg, printer_type: e.target.value })}
            >
              <option value="thermal">Thermal</option>
              <option value="inkjet">Inkjet</option>
              <option value="laser">Laser</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className={labelCls}><Copy size={11} /> Paper Width</label>
            <select
              className={inputCls}
              value={cfg.printer_paper_width}
              onChange={e => setCfg({ ...cfg, printer_paper_width: e.target.value })}
            >
              <option value="58mm">58mm</option>
              <option value="80mm">80mm</option>
            </select>
          </div>

          <div>
            <label className={labelCls}><Wifi size={11} /> Interface</label>
            <select
              className={inputCls}
              value={cfg.printer_interface}
              onChange={e => setCfg({ ...cfg, printer_interface: e.target.value })}
            >
              <option value="browser">Browser (Recommended)</option>
              <option value="bluetooth">Bluetooth</option>
              <option value="usb">USB</option>
              <option value="network">Network / IP</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}><Copy size={11} /> Print Copies</label>
          <input
            type="number"
            min={1}
            max={5}
            className={inputCls}
            value={cfg.print_copies}
            onChange={e => setCfg({ ...cfg, print_copies: Math.max(1, Math.min(5, parseInt(e.target.value) || 1)) })}
          />
        </div>
      </div>

      {/* ── Auto-Print Settings ── */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Auto-Print</p>

        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <Receipt size={15} className="text-gold/70" />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">Auto-print receipt on close bill</p>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">Automatically print receipt when bill is closed</p>
            </div>
          </div>
          <TactileSwitch checked={cfg.auto_print_receipt} onChange={(next) => setCfg({ ...cfg, auto_print_receipt: next })} />
        </div>

        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
          <div className="flex items-center gap-3">
            <Printer size={15} className="text-gold/70" />
            <div>
              <p className="text-sm font-semibold text-[var(--theme-text)]">Auto-print kitchen ticket</p>
              <p className="text-[11px] text-[var(--theme-text-secondary)] mt-0.5">Automatically print order to kitchen when placed</p>
            </div>
          </div>
          <TactileSwitch checked={cfg.auto_print_kitchen} onChange={(next) => setCfg({ ...cfg, auto_print_kitchen: next })} />
        </div>
      </div>

      {/* ── Printer Detection ── */}
      <div className="space-y-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Printer Detection</p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={detectPrinters}
            disabled={detecting}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[var(--theme-surface)] border border-[var(--theme-border)] text-sm font-bold transition-all hover:border-[var(--theme-accent-border)] disabled:opacity-50"
          >
            {detecting ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Detect Printers
          </button>

          <button
            type="button"
            onClick={testPrint}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gold/10 border border-gold/20 text-gold text-sm font-bold transition-all hover:bg-gold/20"
          >
            <TestTube size={16} />
            Test Print
          </button>
        </div>

        {detectedPrinters.length > 0 && (
          <div className="p-4 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] space-y-2">
            <p className="text-xs font-bold text-[var(--theme-text-secondary)] uppercase tracking-wider">Detected Devices</p>
            {detectedPrinters.map((name, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-[var(--theme-text)]">
                <Monitor size={14} className="text-gold/60" />
                {name}
              </div>
            ))}
            <p className="text-[10px] text-[var(--theme-text-muted)] mt-2">
              Note: Browser-based printer detection is limited. For production thermal printing, use a dedicated print server or native wrapper.
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !isDirty}
          className={`${saveButtonCls} ${!isDirty && !saving ? 'opacity-40 pointer-events-none' : ''}`}
          style={{ background: 'var(--theme-surface)', color: 'var(--theme-text)', border: '1px solid var(--theme-border)' }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t('gen_save')}
        </button>
      </div>
    </form>
  );
};

export default PrinterTab;
