'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, QrCode, Download, Plus, Minus, ExternalLink, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import QRCodeLib from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import { GsLoader, inputCls, labelCls } from './_shared';

const QRTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();

  /* ─── State ─── */
  const getInitialCount = () => {
    try {
      const saved = localStorage.getItem('saito_qr_table_count');
      if (saved) { const n = Number(saved); if (!Number.isNaN(n) && n >= 1 && n <= 200) return n; }
    } catch {}
    if (initialData?.qr_table_count) { const n = Number(initialData.qr_table_count); if (!Number.isNaN(n) && n >= 1 && n <= 200) return n; }
    return 12;
  };
  const [tableCount, setTableCount] = useState(getInitialCount);
  const [siteUrl, setSiteUrl] = useState('');
  const [qrDataUrls, setQrDataUrls] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<number | null>(null);
  const [qrCountReady, setQrCountReady] = useState(false);
  const [floors, setFloors] = useState<any[]>([]);
  const [selectedFloor, setSelectedFloor] = useState<string>('all');

  useEffect(() => {
    const initQrCount = async () => {
      setSiteUrl(window.location.origin);

      const saved = localStorage.getItem('saito_qr_table_count');
      if (saved) {
        const n = Number(saved);
        if (!Number.isNaN(n) && n >= 1 && n <= 200) {
          setTableCount(n);
          setQrCountReady(true);
          return;
        }
      }

      if (initialData?.qr_table_count) {
        const n = Number(initialData.qr_table_count);
        if (!Number.isNaN(n) && n >= 1 && n <= 200) setTableCount(n);
        setQrCountReady(true);
        return;
      }

      const { data } = await supabase.from('settings').select('qr_table_count').eq('id', '1').single();
      const n = Number(data?.qr_table_count);
      if (!Number.isNaN(n) && n >= 1 && n <= 200) setTableCount(n);
      setQrCountReady(true);
    };

    initQrCount();
  }, [initialData]);

  // Load floors for grouping
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/pos/floors');
      if (res.ok) {
        const data = await res.json();
        setFloors(data.floors || []);
      }
    })();
  }, []);

  // Draft count – only committed to DB when user presses Təsdiqlə
  const [draftCount, setDraftCount] = useState<number>(getInitialCount);
  const [savedCount, setSavedCount] = useState<number>(getInitialCount);
  const [confirming, setConfirming] = useState(false);

  // Keep draft and saved in sync with loaded tableCount
  useEffect(() => {
    setDraftCount(tableCount);
    setSavedCount(tableCount);
  }, [qrCountReady]);


  /* ─── Handlers ─── */
  const confirmTableCount = async () => {
    if (draftCount < 1 || draftCount > 200) return;
    setConfirming(true);
    const { error } = await supabase
      .from('settings')
      .update({ qr_table_count: draftCount })
      .eq('id', '1');
    if (error) {
      console.error('[QRTab] Update FAILED:', error);
      toast.error(t('error') + ': ' + error.message, { id: 'action-toast' });
    } else {
      setTableCount(draftCount);
      setSavedCount(draftCount);
      localStorage.setItem('saito_qr_table_count', String(draftCount));
      toast.success(t('qr_updated').replace('{n}', String(draftCount)), { id: 'action-toast', duration: 3000 });
    }
    setConfirming(false);
  };

  useEffect(() => {
    if (!siteUrl) return;
    (async () => {
      const entries: Record<number, string> = {};
      for (let i = 1; i <= tableCount; i++) {
        entries[i] = await QRCodeLib.toDataURL(`${siteUrl}/menu?table=${i}`, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: 'H' });
      }
      setQrDataUrls(entries);
    })();
  }, [siteUrl, tableCount]);

  const download = (n: number) => { const a = document.createElement('a'); a.href = qrDataUrls[n]; a.download = `masa-${n}-qr.png`; a.click(); };

  const downloadAll = () => {
    const zip = new JSZip();
    for (let i = 1; i <= tableCount; i++) {
      const qrCodeData = qrDataUrls[i];
      const base64Data = qrCodeData.replace(/^data:image\/png;base64,/, "");
      zip.file(`masa-${i}-qr.png`, base64Data, { base64: true });
    }
    zip.generateAsync({ type: 'blob' }).then(content => {
      saveAs(content, 'qr-codes.zip');
      toast.success(t('qr_downloaded'), { id: 'action-toast', duration: 3000 });
    }).catch(error => {
      toast.error('QR kodları endirmək mümkün olmadı: ' + error.message, { id: 'action-toast' });
    });
  };

  const downloadFloor = async (floorName: string, tables: number[]) => {
    const zip = new JSZip();
    for (const n of tables) {
      if (qrDataUrls[n]) {
        const base64Data = qrDataUrls[n].replace(/^data:image\/png;base64,/, "");
        zip.file(`masa-${n}-qr.png`, base64Data, { base64: true });
      }
    }
    zip.generateAsync({ type: 'blob' }).then(content => {
      saveAs(content, `qr-${floorName.replace(/\s+/g, '-').toLowerCase()}.zip`);
      toast.success(`${floorName} QR paketi endirildi`, { id: 'action-toast', duration: 3000 });
    }).catch(error => {
      toast.error('QR paketi endirmək mümkün olmadı: ' + error.message, { id: 'action-toast' });
    });
  };

  const getTablesForFloor = (floorName: string) => {
    const floor = floors.find(f => f.name === floorName);
    if (!floor) return [];
    const tables: number[] = [];
    for (let i = 1; i <= tableCount; i++) {
      const floorIndex = Math.floor((i - 1) / 10);
      if (floors[floorIndex]?.name === floorName) tables.push(i);
    }
    return tables;
  };

  const allFloors = ['Zal 1', 'Zal 2', 'VIP', 'Balkon'];
  const displayFloors = selectedFloor === 'all' ? allFloors : [selectedFloor];

  /* ─── Render ─── */
  return (
    <div className="max-w-5xl">
      <div className="mb-4 p-3.5 rounded-xl border border-gold/20 bg-gold/5">
        <p className="text-xs text-[var(--theme-text-secondary)]">{t('qr_note')}</p>
      </div>

      {/* Floor selector */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center gap-2 bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-xl px-4 py-3">
          <span className="text-[var(--theme-text-secondary)] text-sm font-medium">Zal:</span>
          <select
            value={selectedFloor}
            onChange={e => setSelectedFloor(e.target.value)}
            className="bg-transparent text-[var(--theme-text)] text-sm font-bold outline-none cursor-pointer"
          >
            <option value="all" className="bg-[#111]">Hamısı</option>
            {allFloors.map(f => (
              <option key={f} value={f} className="bg-[#111]">{f}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-xl px-4 py-3">
          <span className="text-[var(--theme-text-secondary)] text-sm font-medium">{t('qr_table_label')}</span>
          <button onClick={() => setDraftCount(c => Math.max(1, c - 1))} className="w-9 h-9 rounded-full bg-[var(--theme-surface)] flex items-center justify-center hover:bg-[var(--theme-panel)] transition-colors"><Minus size={14} /></button>
          <span className="text-[var(--theme-text)] font-bold text-base w-8 text-center">{draftCount}</span>
          <button onClick={() => setDraftCount(c => Math.min(200, c + 1))} className="w-9 h-9 rounded-full bg-[var(--theme-surface)] flex items-center justify-center hover:bg-[var(--theme-panel)] transition-colors"><Plus size={14} /></button>
        </div>
        {draftCount !== savedCount && (
          <button
            onClick={confirmTableCount}
            disabled={confirming}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[var(--theme-surface-soft)] border border-gold/40 text-gold font-medium text-sm tracking-[0.08em] uppercase transition-all disabled:opacity-50"
          >
            {confirming ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t('qr_saving')}
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                {t('qr_confirm')} · {draftCount}
              </>
            )}
          </button>
        )}
        <button onClick={downloadAll} className="ml-auto flex items-center gap-2 bg-gold text-black px-6 py-3.5 rounded-xl font-bold text-sm tracking-[0.12em] hover:bg-white transition-all"><Download size={16} /> {t('qr_download_all')}</button>
      </div>

      {/* QR Codes by Floor */}
      <div className="space-y-6">
        {displayFloors.map(floorName => {
          const floorTables = getTablesForFloor(floorName);
          if (floorTables.length === 0) return null;

          return (
            <div key={floorName} className="bg-[var(--theme-surface-muted)] border border-[var(--theme-border)] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 bg-[var(--theme-surface-soft)] flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--theme-text)]">{floorName}</span>
                <button
                  onClick={() => downloadFloor(floorName, floorTables)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/20 rounded-lg hover:bg-gold/10 transition-all"
                >
                  <Download size={12} /> {floorName} QR
                </button>
              </div>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {floorTables.map(n => (
                  <div key={n} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[var(--theme-surface)] border border-[var(--theme-border)] hover:border-gold/30 transition-all">
                    <button onClick={() => setPreview(n)} className="group">
                      <div className="w-16 h-16 rounded-xl bg-white border border-[var(--theme-border)] flex items-center justify-center p-1 group-hover:scale-105 transition-transform">
                        {qrDataUrls[n] ? (
                          <img src={qrDataUrls[n]} alt="" loading="lazy" decoding="async" className="w-full h-full" />
                        ) : (
                          <QrCode size={32} className="text-[var(--theme-text-muted)]" />
                        )}
                      </div>
                    </button>
                    <span className="text-xs font-bold text-[var(--theme-text)]">Masa {n}</span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPreview(n)} className="px-2 py-1 text-[10px] text-[var(--theme-text-secondary)] border border-[var(--theme-border)] rounded-md hover:bg-[var(--theme-surface-soft)] transition-all">Bax</button>
                      <button onClick={() => download(n)} disabled={!qrDataUrls[n]} className="px-2 py-1 text-[10px] text-gold border border-gold/20 rounded-md hover:bg-gold/10 transition-all disabled:opacity-30">Yüklə</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {preview !== null && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50" onClick={() => setPreview(null)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="pointer-events-auto relative bg-[var(--theme-surface)] rounded-2xl p-8 w-72 flex flex-col items-center gap-4 shadow-[var(--theme-shadow)]">
                  <button onClick={() => setPreview(null)} className="absolute top-4 right-4 text-[var(--theme-text-muted)] hover:text-[var(--theme-text)]"><X size={16} /></button>
                  <p className="text-[var(--theme-text)] font-black text-xl tracking-widest">MASA {preview}</p>
                  {qrDataUrls[preview] ? <img src={qrDataUrls[preview]} alt="" loading="lazy" decoding="async" className="w-48 h-48" /> : <div className="w-48 h-48 bg-[var(--theme-surface-muted)] rounded-xl flex items-center justify-center"><QrCode size={36} className="text-[var(--theme-text-muted)]" /></div>}
                  <p className="text-[9px] text-[var(--theme-text-muted)] text-center break-all">{siteUrl}/menu?table={preview}</p>
                  <div className="flex gap-2 w-full">
                    <button onClick={() => download(preview)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[var(--theme-surface)] text-[var(--theme-text)] text-xs font-bold rounded-xl hover:bg-[var(--theme-panel)] transition-colors"><Download size={12} /> Yüklə</button>
                    <a href={`${siteUrl}/menu?table=${preview}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-4 py-2.5 border border-[var(--theme-border)] text-[var(--theme-text-secondary)] rounded-xl hover:bg-[var(--theme-surface-soft)] transition-colors"><ExternalLink size={13} /></a>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

/* ─── Staff Tab ─── */
type StaffMember = { id: string; name: string; role: string; shift: string; phone: string };

const ROLES = ['Ofisiant', 'Baş Ofisiant', 'Menecer', 'Barmen', 'Aşpaz', 'Kassa'];

const emptyForm = () => ({ name: '', role: ROLES[0], shift: '', phone: '' });


export default QRTab;
