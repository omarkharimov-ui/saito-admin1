'use client';

// pr v1 — Print Devices registry (settings.admin; D-5: the operator's
// server-derived location). Flat ledger + modal (house DNA v8.5).
//
// Browser devices = claimed by POS/KDS terminals (this loop prints via the
// browser dialog). Network (ESC/POS) devices = claimed by the LAN print
// agent (tools/print-agent) with the one-time agent key.

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import { toast } from '@/lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Monitor, Wifi, Loader2, Trash2, RefreshCw, TestTube, Copy, X, Printer,
} from 'lucide-react';
import { inputCls, labelCls } from './_shared';
import TactileSwitch from '../../components/ui/TactileSwitch';

interface Dev {
  id: string;
  name: string;
  doc_types: string[];
  iface: 'browser' | 'escpos_network';
  host: string | null;
  port: number | null;
  paper_width: string;
  copies: number;
  enabled: boolean;
  online: boolean;
  last_seen_at: string | null;
  last_error: string | null;
  created_at: string;
}

const DOC_LABELS: Record<string, string> = { receipt: 'Çek', kitchen: 'Aşxana', label: 'Etiket' };
const DOC_TYPES = ['receipt', 'kitchen', 'label'];

interface FormState {
  id: string | null;
  name: string;
  doc_types: string[];
  iface: 'browser' | 'escpos_network';
  host: string;
  port: string;
  paper_width: string;
  copies: number;
  enabled: boolean;
}

const emptyForm: FormState = {
  id: null, name: '', doc_types: ['receipt'], iface: 'browser',
  host: '', port: '', paper_width: '80mm', copies: 1, enabled: true,
};

function fmtSeen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'indi';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dəq əvvəl`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} saat əvvəl`;
  return d.toLocaleDateString('az-AZ');
}

const DevicesTab = () => {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<Dev[]>([]);
  const [modal, setModal] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [oneTimeKey, setOneTimeKey] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/print/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(Array.isArray(data?.devices) ? data.devices : []);
      }
    } catch { /* toast on hard errors only via actions */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (f: FormState) => {
    setSaving(true);
    try {
      if (f.iface === 'escpos_network' && f.port) {
        const portNum = parseInt(f.port, 10);
        if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
          toast.error('Port 1–65535 arasında olmalıdır');
          return;
        }
      }
      const body: any = {
        name: f.name,
        doc_types: f.doc_types.length ? f.doc_types : ['receipt'],
        iface: f.iface,
        host: f.iface === 'escpos_network' && f.host.trim() ? f.host.trim() : null,
        port: f.iface === 'escpos_network' && f.port ? parseInt(f.port, 10) : null,
        paper_width: f.paper_width,
        copies: f.copies,
        enabled: f.enabled,
      };
      let res: Response;
      if (f.id) {
        const { id, ...patch } = body;
        res = await apiFetch(`/api/print/devices/${f.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
        });
      } else {
        res = await apiFetch('/api/print/devices', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Xəta'); return; }
      toast.success(f.id ? 'Cihaz yeniləndi' : 'Cihaz yaradıldı');
      if (!f.id && data.agent_key) setOneTimeKey({ name: f.name, key: data.agent_key });
      setModal(null);
      load();
    } finally { setSaving(false); }
  };

  const patchEnabled = async (d: Dev, enabled: boolean) => {
    setBusyId(d.id);
    try {
      const res = await apiFetch(`/api/print/devices/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error || 'Xəta');
      else { setDevices(ds => ds.map(x => x.id === d.id ? { ...x, enabled } : x)); }
    } finally { setBusyId(null); }
  };

  const testPrint = async (d: Dev) => {
    setBusyId(d.id);
    try {
      const doc = d.doc_types[0] || 'receipt';
      const res = await apiFetch('/api/print/enqueue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type: doc,
          trigger_key: `test:${Date.now()}`,
          payload: { test: true, device: d.name, note: 'Test çapı — bu sətiri görürsənsə, çap işləyir.' },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Xəta'); return; }
      if (data.routed === false) toast.error('Çap cihazı yoxdur — routing mümkün olmadı');
      else if (d.iface === 'escpos_network') toast.success('Test göndərildi — print agent gözləyin');
      else toast.success('Test göndərildi — terminal çap diloxunu açacaq');
    } finally { setBusyId(null); }
  };

  const rotateKey = async (d: Dev) => {
    setBusyId(d.id);
    try {
      const res = await apiFetch(`/api/print/devices/${d.id}/rotate-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Xəta'); return; }
      if (data.agent_key) setOneTimeKey({ name: d.name, key: data.agent_key });
      else toast.success('Agent key yeniləndi');
    } finally { setBusyId(null); }
  };

  const remove = async (d: Dev) => {
    if (!confirm(`"${d.name}" cihazı silinsin?`)) return;
    setBusyId(d.id);
    try {
      const res = await apiFetch(`/api/print/devices/${d.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error || 'Xəta');
      else { toast.success('Cihaz silindi'); load(); }
    } finally { setBusyId(null); }
  };

  const copyKey = async () => {
    if (!oneTimeKey) return;
    try { await navigator.clipboard.writeText(oneTimeKey.key); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">Çap Cihazları</p>
          <p className="text-[11px] text-[var(--theme-text-secondary)] mt-1">
            Cihazlar yeriniz üçün qeydə alınır. Çəklər/kitchen biletləri sifariş hadisəsində cihazlara yönləndirilir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ ...emptyForm })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gold/10 border border-gold/20 text-gold text-sm font-bold transition-all hover:bg-gold/20"
        >
          <Plus size={15} /> Cihaz əlavə et
        </button>
      </div>

      {/* flat ledger */}
      <div className="overflow-hidden rounded-2xl border border-[var(--theme-border)]">
        {loading ? (
          <div className="p-8 flex items-center justify-center"><Loader2 size={22} className="animate-spin text-[var(--theme-text-muted)]" /></div>
        ) : devices.length === 0 ? (
          <div className="p-10 text-center">
            <Printer size={26} className="mx-auto text-[var(--theme-text-muted)] mb-3" />
            <p className="text-sm font-semibold text-[var(--theme-text)]">Hələ çap cihazı qeydə alınmayıb</p>
            <p className="text-[11px] text-[var(--theme-text-muted)] mt-1">
              Browser cihazı: POS/KDS terminalında çap diloxu. Network (ESC/POS): LAN print agent.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--theme-border)]">
            {devices.map((d) => (
              <div key={d.id} className="flex items-center gap-4 px-4 py-3.5 bg-[var(--theme-surface)] hover:bg-[var(--theme-surface-soft)] transition-colors">
                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border ${d.iface === 'escpos_network' ? 'bg-sky-500/10 border-sky-500/20 text-sky-400' : 'bg-gold/10 border-gold/20 text-gold'}`}>
                  {d.iface === 'escpos_network' ? <Wifi size={16} /> : <Monitor size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[var(--theme-text)] truncate">{d.name}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.online ? 'bg-emerald-400' : d.enabled ? 'bg-[var(--theme-text-muted)]' : 'bg-red-400/50'}`}
                      title={d.online ? 'onlayn' : d.last_seen_at ? `son aktiv: ${fmtSeen(d.last_seen_at)}` : 'heç vaxt bağlılmayıb'} />
                    {d.last_error && <span className="text-[10px] text-red-400 truncate max-w-[160px]" title={d.last_error}>{d.last_error}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {d.doc_types.map(dt => (
                      <span key={dt} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)]">
                        {DOC_LABELS[dt] || dt}
                      </span>
                    ))}
                    <span className="text-[10px] text-[var(--theme-text-muted)]">
                      {d.iface === 'escpos_network' ? `${d.host}:${d.port}` : 'Browser'} · {d.paper_width} · {d.copies}x
                    </span>
                    <span className="text-[10px] text-[var(--theme-text-muted)] hidden sm:inline">son: {fmtSeen(d.last_seen_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => testPrint(d)} disabled={busyId === d.id || !d.enabled} title="Test çapı"
                    className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] disabled:opacity-40 transition-colors">
                    <TestTube size={15} />
                  </button>
                  {d.iface === 'escpos_network' && (
                    <button type="button" onClick={() => rotateKey(d)} disabled={busyId === d.id} title="Agent key dəyiş"
                      className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] disabled:opacity-40 transition-colors">
                      <RefreshCw size={15} />
                    </button>
                  )}
                  <button type="button" onClick={() => setModal({
                    id: d.id, name: d.name, doc_types: [...d.doc_types], iface: d.iface,
                    host: d.host || '', port: d.port ? String(d.port) : '',
                    paper_width: d.paper_width, copies: d.copies, enabled: d.enabled,
                  })} title="Redaktə et"
                    className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] hover:bg-[var(--theme-surface-soft)] transition-colors">
                    <span className="text-[13px] font-bold">✎</span>
                  </button>
                  <button type="button" onClick={() => remove(d)} disabled={busyId === d.id} title="Sil"
                    className="p-2 rounded-lg text-[var(--theme-text-muted)] hover:text-red-400 hover:bg-red-400/10 disabled:opacity-40 transition-colors">
                    <Trash2 size={15} />
                  </button>
                  <div className="ml-1"><TactileSwitch checked={d.enabled} onChange={(v) => patchEnabled(d, v)} /></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* one-time agent key */}
      <AnimatePresence>
        {oneTimeKey && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-gold/30 bg-gold/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gold">“{oneTimeKey.name}” agent key (bir dəfə göstərilir!)</p>
              <button type="button" onClick={() => setOneTimeKey(null)} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"><X size={15} /></button>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono break-all px-3 py-2 rounded-lg bg-[var(--theme-surface)] border border-[var(--theme-border)] text-[var(--theme-text-secondary)]">
                {oneTimeKey.key}
              </code>
              <button type="button" onClick={copyKey}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gold/10 border border-gold/20 text-gold text-xs font-bold hover:bg-gold/20 transition-colors">
                <Copy size={13} /> {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
            <p className="text-[10px] text-[var(--theme-text-muted)]">
              Bu key LAN print agent üçün (tools/print-agent) — cihaz silinənə/rotasiya olunana qədər etibarlıdır.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* create/edit modal */}
      <AnimatePresence>
        {modal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
            onClick={() => !saving && setModal(null)}>
            <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-md rounded-3xl bg-[var(--theme-surface)] border border-[var(--theme-border)] p-6 space-y-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-[var(--theme-text)]">{modal.id ? 'Cihazı redaktə et' : 'Yeni çap cihazı'}</h3>
                <button type="button" onClick={() => setModal(null)} disabled={saving} className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"><X size={18} /></button>
              </div>

              <div>
                <label className={labelCls}>Cihaz adı</label>
                <input className={inputCls} value={modal.name} placeholder="məs. POS Terminal / Aşxana 80mm"
                  onChange={(e) => setModal({ ...modal, name: e.target.value })} />
              </div>

              <div>
                <label className={labelCls}>Çap olunacaq sənəd növləri</label>
                <div className="flex gap-2 mt-1.5">
                  {DOC_TYPES.map(dt => {
                    const on = modal.doc_types.includes(dt);
                    return (
                      <button key={dt} type="button"
                        onClick={() => setModal({
                          ...modal,
                          doc_types: on ? (modal.doc_types.length > 1 ? modal.doc_types.filter(x => x !== dt) : modal.doc_types)
                            : [...modal.doc_types, dt],
                        })}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${on ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-muted)]'}`}>
                        {DOC_LABELS[dt]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={labelCls}>Bağlantı növü</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {([['browser', 'Browser (terminal)'], ['escpos_network', 'Network (ESC/POS)']] as const).map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setModal({ ...modal, iface: v })}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors ${modal.iface === v ? 'bg-gold/15 border-gold/40 text-gold' : 'bg-[var(--theme-surface-soft)] border-[var(--theme-border)] text-[var(--theme-text-muted)]'}`}>
                      {v === 'browser' ? <Monitor size={14} /> : <Wifi size={14} />} {l}
                    </button>
                  ))}
                </div>
              </div>

              {modal.iface === 'escpos_network' && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className={labelCls}>Printer IP</label>
                    <input className={inputCls} value={modal.host} placeholder="192.168.1.50"
                      onChange={(e) => setModal({ ...modal, host: e.target.value })} />
                  </div>
                  <div>
                    <label className={labelCls}>Port</label>
                    <input className={inputCls} inputMode="numeric" value={modal.port} placeholder="9100"
                      onChange={(e) => setModal({ ...modal, port: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Kağız</label>
                  <select className={inputCls} value={modal.paper_width}
                    onChange={(e) => setModal({ ...modal, paper_width: e.target.value })}>
                    <option value="80mm">80mm</option>
                    <option value="58mm">58mm</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Nüsxə</label>
                  <select className={inputCls} value={modal.copies}
                    onChange={(e) => setModal({ ...modal, copies: parseInt(e.target.value, 10) })}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-[var(--theme-border)]">
                <div>
                  <p className="text-sm font-semibold text-[var(--theme-text)]">Aktiv</p>
                  <p className="text-[11px] text-[var(--theme-text-secondary)]">Pasiv cihazlara yeni sənəd yönləndirilmir</p>
                </div>
                <TactileSwitch checked={modal.enabled} onChange={(v) => setModal({ ...modal, enabled: v })} />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setModal(null)} disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors">
                  Ləğv et
                </button>
                <button type="button" onClick={() => save(modal)} disabled={saving || !modal.name.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold/15 border border-gold/40 text-gold text-sm font-bold hover:bg-gold/25 disabled:opacity-40 transition-colors">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  {modal.id ? 'Yenilə' : 'Yadda saxla'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DevicesTab;
