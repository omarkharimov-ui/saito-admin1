'use client';

// 2026-09-26 (owner, Q7): virtual handheld terminal dialog — card payment
// flow without physical hardware. Stages: idle (amount) → tapping (NFC
// pulse, ~2s) → approved (code) / declined (retry).
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import MobileModal from '@/components/ui/MobileModal';
import { terminalPay } from '@/lib/terminal/simulator';

type Stage = 'idle' | 'tapping' | 'approved' | 'declined';

interface Props {
  open: boolean;
  amount: number;
  onDone: (code: string) => void;      // approved → continue payment with reference
  onClose: () => void;                  // cancelled / declined-accepted
}

export default function TerminalTapModal({ open, amount, onDone, onClose }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [code, setCode] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (open && !started.current) {
      started.current = true;
      setStage('idle');
      setCode('');
    }
    if (!open) started.current = false;
  }, [open]);

  const tap = async () => {
    setStage('tapping');
    const r = await terminalPay(amount);
    if (r.ok) {
      setCode(r.code);
      setStage('approved');
      setTimeout(() => onDone(r.code), 1100);
    } else {
      setStage('declined');
    }
  };

  return (
    <MobileModal open={open} onClose={stage === 'tapping' ? () => undefined : onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center">
            <CreditCard size={16} className="text-blue-400" />
          </span>
          <div>
            <h3 className="text-lg font-serif font-bold text-white leading-tight">Kart terminalı</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/35">Simulator · virtual handheld</p>
          </div>
        </div>

        <div className="w-full rounded-2xl bg-white/[0.04] border border-white/10 py-5 flex flex-col items-center gap-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Məbləğ</p>
          <p className="text-4xl font-black text-white tabular-nums">{amount.toFixed(2)} <span className="text-lg text-white/50">₼</span></p>
        </div>

        {stage === 'idle' && (
          <>
            <div className="w-full rounded-2xl border-2 border-dashed border-white/15 py-6 flex flex-col items-center gap-2">
              <CreditCard size={28} className="text-white/30" />
              <p className="text-[12px] text-white/50 font-semibold">Kartı terminalə yaxınlaşdırın (simulyasiya)</p>
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={onClose}
                className="flex-1 py-3.5 rounded-xl border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest">
                Ləğv et
              </button>
              <button onClick={tap}
                className="flex-[2] py-3.5 rounded-xl bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-transform">
                <CreditCard size={15} /> Tap
              </button>
            </div>
          </>
        )}

        {stage === 'tapping' && (
          <div className="w-full py-6 flex flex-col items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
              className="w-14 h-14 rounded-full bg-blue-500/15 border border-blue-400/40 flex items-center justify-center"
            >
              <Loader2 size={22} className="text-blue-400 animate-spin" />
            </motion.div>
            <p className="text-[12px] font-bold text-white/70">İşlənir... kartı çıxarmayın</p>
          </div>
        )}

        {stage === 'approved' && (
          <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 26 }}
            className="w-full py-5 flex flex-col items-center gap-2">
            <CheckCircle2 size={36} className="text-emerald-400" />
            <p className="text-[14px] font-black text-emerald-300 uppercase tracking-widest">Təsdiqləndi</p>
            <p className="text-[11px] font-mono text-white/50">Code: {code}</p>
          </motion.div>
        )}

        {stage === 'declined' && (
          <div className="w-full py-4 flex flex-col items-center gap-3">
            <XCircle size={34} className="text-rose-400" />
            <p className="text-[13px] font-bold text-rose-300">Kart rədd olundu</p>
            <p className="text-[11px] text-white/40">Müşteri kartı dəyişsin və ya digər ödəniş üsulunu seçin</p>
            <div className="flex gap-3 w-full mt-1">
              <button onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-widest">
                Ləğv et
              </button>
              <button onClick={tap}
                className="flex-[2] py-3 rounded-xl bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest">
                Təkrar tap
              </button>
            </div>
          </div>
        )}
      </div>
    </MobileModal>
  );
}
