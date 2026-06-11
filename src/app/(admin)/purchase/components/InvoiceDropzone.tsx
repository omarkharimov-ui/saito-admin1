'use client';

import React, { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export interface OCRLine {
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number | null;
  total_cost: number | null;
  waste_percentage: number | null;
}

export interface OCRResult {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  totalAmount?: number | null;
  lines: OCRLine[];
}

export function InvoiceDropzone({
  onParsed,
}: {
  onParsed: (result: OCRResult) => void;
}) {
  const { t } = useLanguage();
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Yalnız şəkil (JPEG/PNG) və ya PDF faylı dəstəklənir');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/invoice-ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: base64, language: 'az' }),
      });

      if (!res.ok) throw new Error('OCR analysis failed');

      const data: OCRResult = await res.json();
      onParsed(data);
    } catch (e: any) {
      setError(e.message || 'OCR xətası');
    } finally {
      setLoading(false);
    }
  }, [onParsed]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, [processFile]);

  const handleSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
    e.target.value = '';
  }, [processFile]);

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer
          ${dragOver ? 'border-gold/50 bg-gold/[0.04]' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'}
          ${loading ? 'pointer-events-none' : ''}`}
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Loader2 size={36} className="animate-spin text-gold" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/70">OCR analiz edilir...</p>
              <p className="text-[10px] text-white/30 mt-1">AI fakturadakı məhsulları oxuyur</p>
            </div>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-gold" />
            </div>
            <p className="text-base font-medium text-white/80 mb-1">
              Fakturanı bura sürüklə
            </p>
            <p className="text-sm text-white/30 mb-4">
              və ya kliklə şəkil/PDF seç — AI avtomatik tanıyacaq
            </p>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleSelect}
              className="hidden"
              id="invoice-file-input"
            />
            <label
              htmlFor="invoice-file-input"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold/10 border border-gold/20 text-gold text-xs font-bold cursor-pointer hover:bg-gold/20 transition-all"
            >
              <FileText size={14} />
              Fayl seç
            </label>
          </>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 mt-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs"
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
