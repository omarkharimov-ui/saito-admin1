'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { QrCode, Download, Printer, Plus, Minus, X, ExternalLink, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createRealtimeChannel, removeRealtimeChannel } from '@/lib/realtime';
import { toast } from 'react-hot-toast';

const TablesPage = () => {
  const [tableCount, setTableCount] = useState(12);
  const [siteUrl, setSiteUrl] = useState('');
  const [qrDataUrls, setQrDataUrls] = useState<Record<number, string>>({});
  const [previewTable, setPreviewTable] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    setSiteUrl(base);
  }, []);

  // Settings row id (cached after first load)
  const [settingsId, setSettingsId] = useState<string | number | null>(null);

  // Load initial table count from database
  useEffect(() => {
    console.log('[Tables] Loading started...');
    
    const loadTableCount = async () => {
      // Try to get any settings row (id could be string or number)
      const { data: rows, error } = await supabase
        .from('settings')
        .select('id, qr_table_count')
        .limit(1);
      
      console.log('[Tables] DB result:', { rows, error });
      
      if (error) {
        console.error('[Tables] Error loading settings:', error);
        setLoading(false);
        setReady(true);
        return;
      }
      
      if (rows && rows.length > 0) {
        // Use first row found
        setSettingsId(rows[0].id);
        console.log('[Tables] Found settings row:', rows[0]);
        if (typeof rows[0].qr_table_count === 'number') {
          setTableCount(rows[0].qr_table_count);
          console.log('[Tables] Set table count to:', rows[0].qr_table_count);
        }
      } else {
        console.log('[Tables] No settings row found, creating...');
        // No settings row exists - create one
        const { data: newRow, error: insertError } = await supabase
          .from('settings')
          .insert([{ qr_table_count: 12 }])
          .select('id')
          .single();
        
        if (insertError) {
          console.error('[Tables] Error creating settings row:', insertError);
        } else if (newRow) {
          console.log('[Tables] Created new row:', newRow);
          setSettingsId(newRow.id);
        }
      }
      
      setLoading(false);
      setReady(true);
      console.log('[Tables] Ready! settingsId:', settingsId);
    };
    
    loadTableCount();
  }, []);

  // Real-time subscription to settings changes
  useEffect(() => {
    const channel = createRealtimeChannel('tables_settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
        if (payload.new && typeof (payload.new as any).qr_table_count === 'number') {
          setTableCount((payload.new as any).qr_table_count);
          setSettingsId((payload.new as any).id);
        }
      })
      .subscribe();
    return () => { removeRealtimeChannel(channel); };
  }, []);

  // Direct update to Supabase on every change
  const updateTableCount = async (newCount: number) => {
    if (newCount < 1) return;
    setTableCount(newCount);
    console.log('[Tables] Updating qr_table_count to:', newCount);
    const { data, error } = await supabase
      .from('settings')
      .update({ qr_table_count: newCount })
      .eq('id', '1')
      .select();
    if (error) {
      console.error('[Tables] Update FAILED:', error);
      toast.error('Yenilənmədi: ' + error.message);
    } else {
      console.log('[Tables] Update SUCCESS:', data);
      toast.success(`Masa sayı yeniləndi: ${newCount}`);
    }
  };


  // Manual save function
  const handleSave = async () => {
    if (!ready) return;
    setSaving(true);
    
    try {
      if (!settingsId) {
        // Try to find or create settings row
        const { data: rows } = await supabase.from('settings').select('id').limit(1);
        if (rows && rows.length > 0) {
          setSettingsId(rows[0].id);
          await supabase.from('settings').update({ qr_table_count: tableCount }).eq('id', rows[0].id);
          toast.success('Masa sayı yadda saxlanıldı');
        } else {
          const { data: newRow, error } = await supabase.from('settings').insert([{ qr_table_count: tableCount }]).select('id').single();
          if (error) throw error;
          if (newRow) {
            setSettingsId(newRow.id);
            toast.success('Masa sayı yadda saxlanıldı');
          }
        }
      } else {
        console.log('[Tables] Saving table count:', tableCount, 'to settings id:', settingsId);
        const { error } = await supabase
          .from('settings')
          .update({ qr_table_count: tableCount })
          .eq('id', settingsId);
        
        if (error) throw error;
        console.log('[Tables] Saved successfully');
        toast.success('Masa sayı yadda saxlanıldı');
      }
    } catch (err) {
      toast.error('Masa sayı yenilənərkən xəta');
      console.error('[Tables] Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!siteUrl) return;
    const generate = async () => {
      const entries: Record<number, string> = {};
      for (let i = 1; i <= tableCount; i++) {
        entries[i] = await QRCode.toDataURL(`${siteUrl}/menu?table=${i}`, {
          width: 400,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
          errorCorrectionLevel: 'H',
        });
      }
      setQrDataUrls(entries);
    };
    generate();
  }, [siteUrl, tableCount]);

  const downloadQR = (tableNum: number) => {
    const a = document.createElement('a');
    a.href = qrDataUrls[tableNum];
    a.download = `masa-${tableNum}-qr.png`;
    a.click();
  };

  const printAll = () => window.print();

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-white mb-1">QR Kodlar</h1>
          <p className="text-white/40 text-sm">Masalar üçün QR kodları idarə edin.</p>
          <p className="text-gold/60 text-xs mt-1">
            ℹ️ Masa sayı dəyişəndə Orders səhifəsindəki masa şəbəkəsi də avtomatik yenilənir
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
          {/* Table count */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <span className="text-white/40 text-xs">Masa sayı:</span>
            {loading ? (
              <Loader2 size={14} className="animate-spin text-gold" />
            ) : (
              <>
                <button
                  onClick={() => updateTableCount(tableCount - 1)}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all"
                >
                  <Minus size={12} />
                </button>
                <span className="text-white font-medium w-6 text-center text-sm">{tableCount}</span>
                <button
                  onClick={() => updateTableCount(tableCount + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all"
                >
                  <Plus size={12} />
                </button>
              </>
            )}
          </div>
          {/* Save button under table count */}
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white font-bold text-lg rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/20 mt-2"
          >
            {saving ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Dəyişiklikləri Yadda Saxla
              </>
            ) : (
              <>
                <Save size={18} />
                Dəyişiklikləri Yadda Saxla
              </>
            )}
          </button>
          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white font-bold text-sm rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/20"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saxlanılır...
              </>
            ) : (
              <>
                <Save size={16} />
                YADDA SAXLA
              </>
            )}
          </button>
          <button
            onClick={printAll}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-lg text-sm transition-all"
          >
            <Printer size={15} />
            Hamısını endir
          </button>
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 text-white font-bold text-sm rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-500/20"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Dəyişiklikləri Yadda Saxla
              </>
            ) : (
              <>
                <Save size={16} />
                Dəyişiklikləri Yadda Saxla
              </>
            )}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="bg-card border border-white/5 rounded-2xl overflow-hidden overflow-x-auto scrollbar-none">
        <div className="grid grid-cols-[auto_1fr_auto] gap-0 divide-y divide-white/5 min-w-[380px]">
          {/* Header row */}
          <div className="col-span-3 grid grid-cols-[64px_1fr_auto] px-5 py-3 bg-white/[0.02]">
            <span className="text-[10px] uppercase tracking-widest text-white/30">Masa</span>
            <span className="text-[10px] uppercase tracking-widest text-white/30">Link</span>
            <span className="text-[10px] uppercase tracking-widest text-white/30 text-right">Əməliyyat</span>
          </div>

          {Array.from({ length: tableCount }, (_, i) => i + 1).map(tableNum => (
            <motion.div
              key={tableNum}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: tableNum * 0.02 }}
              className="col-span-3 grid grid-cols-[64px_1fr_auto] items-center px-5 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              {/* Table number */}
              <button
                onClick={() => setPreviewTable(tableNum)}
                className="flex items-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center transition-colors">
                  <QrCode size={14} className="text-gold" />
                </div>
                <span className="text-white font-bold text-sm">{tableNum}</span>
              </button>

              {/* Link */}
              <span className="text-white/30 text-xs font-mono truncate px-4">
                {siteUrl}/menu?table={tableNum}
              </span>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewTable(tableNum)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white/50 hover:text-white border border-white/10 hover:border-white/30 rounded-lg transition-all"
                >
                  <QrCode size={12} /> Önizlə
                </button>
                <button
                  onClick={() => downloadQR(tableNum)}
                  disabled={!qrDataUrls[tableNum]}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gold border border-gold/20 rounded-lg transition-all disabled:opacity-30"
                >
                  <Download size={12} /> Yüklə
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* QR Preview Modal */}
      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {previewTable !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50"
              onClick={() => setPreviewTable(null)}
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="pointer-events-auto bg-white rounded-2xl p-8 w-full max-w-[320px] flex flex-col items-center gap-4 shadow-2xl"
            >
              <button
                onClick={() => setPreviewTable(null)}
                className="absolute top-4 right-4 text-black/30 hover:text-black transition-colors"
              >
                <X size={18} />
              </button>
              <p className="text-black font-black text-xl tracking-widest uppercase">MASA {previewTable}</p>
              {qrDataUrls[previewTable] ? (
                <img src={qrDataUrls[previewTable]} alt={`Masa ${previewTable} QR`} loading="lazy" decoding="async" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 bg-gray-100 rounded-xl flex items-center justify-center">
                  <QrCode size={40} className="text-gray-300" />
                </div>
              )}
              <p className="text-[10px] text-gray-400 text-center break-all">{siteUrl}/menu?table={previewTable}</p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => downloadQR(previewTable)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-black text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-colors"
                >
                  <Download size={13} /> Yüklə
                </button>
                <a
                  href={`${siteUrl}/menu?table=${previewTable}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-black/20 text-black/60 text-xs rounded-xl hover:bg-black/5 transition-colors"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>,
      document.body
      )}

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          nav, aside, header, button { display: none !important; }
          .bg-card { background: white !important; }
        }
      `}</style>
    </div>
  );
};

export default TablesPage;
