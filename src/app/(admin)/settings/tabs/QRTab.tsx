'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { Loader2, QrCode, Download, Plus, Minus, ExternalLink, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import QRCodeLib from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { motion, AnimatePresence } from 'framer-motion';
import { GsLoader, inputCls, labelCls } from './_shared';
import { useTheme } from '@/lib/theme/ThemeContext';

const QRTab = ({ initialData }: { initialData?: Record<string, any> | null }) => {
  const { t } = useLanguage();
  const { lightMode } = useTheme();

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

  /* ─── Render ─── */
  return (
    <div className="max-w-5xl">
      <div className="mb-4 p-3.5 rounded-xl border border-gold/20 bg-gold/5">
        <p className={`text-xs ${lightMode ? 'text-gray-600' : 'text-white/70'}`}>{t('qr_note')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className={`flex items-center gap-3 border rounded-xl px-4 py-3 ${lightMode ? 'bg-gray-100 border-gray-200' : 'bg-white/5 border-white/10'}`}>
          <span className="text-white/75 text-sm font-medium">{t('qr_table_label')}</span>
          <button onClick={() => setDraftCount(c => Math.max(1, c - 1))} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${lightMode ? 'bg-gray-200 hover:bg-gray-300' : 'bg-white/10 hover:bg-white/20'}`}><Minus size={14} /></button>
          <span className={`font-bold text-base w-8 text-center ${lightMode ? 'text-gray-900' : 'text-white'}`}>{draftCount}</span>
          <button onClick={() => setDraftCount(c => Math.min(200, c + 1))} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${lightMode ? 'bg-gray-200 hover:bg-gray-300' : 'bg-white/10 hover:bg-white/20'}`}><Plus size={14} /></button>
        </div>
        {draftCount !== savedCount && (
          <button
            onClick={confirmTableCount}
            disabled={confirming}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border border-gold/40 text-gold font-medium text-sm tracking-[0.08em] uppercase transition-all disabled:opacity-50 ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`}
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

      <div className={`bg-card border rounded-2xl overflow-hidden overflow-x-auto scrollbar-none ${lightMode ? 'border-gray-100' : 'border-white/5'}`}>
        <div className={`px-5 py-3.5 grid grid-cols-[64px_1fr_auto] min-w-[380px] ${lightMode ? 'bg-gray-50' : 'bg-white/[0.02]'}`}>
          <span className={`text-[10px] uppercase tracking-widest ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{t('qr_col_table')}</span>
          <span className={`text-[10px] uppercase tracking-widest ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{t('qr_col_link')}</span>
          <span className={`text-[10px] uppercase tracking-widest text-right ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{t('qr_col_actions')}</span>
        </div>
        <div className={`divide-y ${lightMode ? 'divide-gray-100' : 'divide-white/5'}`}>
          {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => (
            <div key={n} className={`grid grid-cols-[64px_1fr_auto] items-center px-5 py-3.5 transition-colors min-w-[380px] ${lightMode ? 'hover:bg-gray-50' : 'hover:bg-white/[0.02]'}`}>
              <button onClick={() => setPreview(n)} className="flex items-center gap-2 group">
                <div className="w-9 h-9 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center transition-colors"><QrCode size={15} className="text-gold" /></div>
                <span className={`font-bold text-base ${lightMode ? 'text-gray-900' : 'text-white'}`}>{n}</span>
              </button>
              <span className={`text-sm font-mono truncate px-3 ${lightMode ? 'text-gray-500' : 'text-white/50'}`}>{siteUrl}/menu?table={n}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPreview(n)} className={`px-3 py-2 text-xs border hover:border-white/30 rounded-lg transition-all flex items-center gap-1.5 ${lightMode ? 'text-gray-500 hover:text-gray-900 border-gray-200' : 'text-white/60 hover:text-white border-white/10'}`}><QrCode size={12} /> {t('qr_preview')}</button>
                <button onClick={() => download(n)} disabled={!qrDataUrls[n]} className="px-3 py-2 text-xs text-gold border border-gold/20 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-30"><Download size={12} /> {t('qr_download')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {preview !== null && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50" onClick={() => setPreview(null)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="pointer-events-auto relative bg-white rounded-2xl p-8 w-72 flex flex-col items-center gap-4 shadow-2xl">
                  <button onClick={() => setPreview(null)} className="absolute top-4 right-4 text-black/30 hover:text-black"><X size={16} /></button>
                  <p className="text-black font-black text-xl tracking-widest">MASA {preview}</p>
                  {qrDataUrls[preview] ? <img src={qrDataUrls[preview]} alt="" loading="lazy" decoding="async" className="w-48 h-48" /> : <div className="w-48 h-48 bg-gray-100 rounded-xl flex items-center justify-center"><QrCode size={36} className="text-gray-300" /></div>}
                  <p className="text-[9px] text-gray-400 text-center break-all">{siteUrl}/menu?table={preview}</p>
                  <div className="flex gap-2 w-full">
                    <button onClick={() => download(preview)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors ${lightMode ? 'bg-white text-gray-900' : 'bg-black text-white'}`}><Download size={12} /> Yüklə</button>
                    <a href={`${siteUrl}/menu?table=${preview}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-4 py-2.5 border border-black/20 text-black/60 rounded-xl hover:bg-black/5 transition-colors"><ExternalLink size={13} /></a>
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
