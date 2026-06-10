'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, BarChart3, ShoppingBag, Flame, ChevronLeft, X } from 'lucide-react';
import { useTheme } from '@/lib/theme/ThemeContext';

export function AIPremiumCard() {
  const { lightMode } = useTheme();
  const [activeSlide, setActiveSlide] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [aggressiveness, setAggressiveness] = useState(5);
  const [customPrompt, setCustomPrompt] = useState('');

  const modules = [
    { id: 'active', label: 'Aktiv', icon: Zap, bgLight: 'bg-gray-100', bgDark: 'bg-[var(--theme-surface-soft)]', isActive: true },
    { id: 'pos', label: 'POS', icon: ShoppingBag, bgLight: 'bg-amber-50', bgDark: 'bg-amber-500/10' },
    { id: 'inventory', label: 'Stok', icon: BarChart3, bgLight: 'bg-red-50', bgDark: 'bg-red-500/10' },
    { id: 'campaigns', label: 'Kampaniyalar', icon: Flame, bgLight: 'bg-cyan-50', bgDark: 'bg-cyan-500/10' },
  ];

  return (
    <>
      {/* Premium Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-[2.5rem] p-7 border transition-all ${
          lightMode
            ? 'bg-[var(--theme-surface-muted)] border-[var(--theme-border)] shadow-lg shadow-black/5'
            : 'bg-[#0f0f0f] border-white/[0.08] shadow-2xl'
        }`}
      >
        {/* Header */}
        <div className="mb-7">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[var(--theme-accent-soft)]">
              <Zap size={18} className="text-[var(--theme-accent)]" />
            </div>
            <span className="text-xs font-bold tracking-widest uppercase text-[var(--theme-accent)]">
              AI Təklifi
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-2 text-[var(--theme-text)]">
            Gündəlik Qazanc
          </h2>
          <p className={`text-lg font-semibold ${lightMode ? 'text-amber-700' : 'text-amber-400'}`}>
            Gözlənilən Artım: +15%
          </p>
        </div>

        {/* Visual Content Area */}
        <div className={`relative w-full aspect-square rounded-3xl mb-6 flex items-center justify-center overflow-hidden ${
          lightMode ? 'bg-gradient-to-br from-gray-50 to-gray-100' : 'bg-gradient-to-br from-white/5 to-white/[0.02]'
        }`}>
          <div className={`text-center ${lightMode ? 'text-gray-400' : 'text-white/30'}`}>
            <BarChart3 size={64} className="mx-auto opacity-50 mb-4" />
            <p className="text-sm font-medium">Satış məlumatları</p>
          </div>
        </div>

        {/* Pagination Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <motion.button
              key={i}
              onClick={() => setActiveSlide(i)}
              className={`h-2 rounded-full transition-all ${
                activeSlide === i
                  ? lightMode ? 'w-8 bg-gray-900' : 'w-8 bg-white'
                  : lightMode ? 'w-2 bg-gray-300' : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Description */}
        <p className={`text-sm leading-relaxed mb-8 ${lightMode ? 'text-gray-600' : 'text-white/60'}`}>
          Saito POS daxili satış datalarını analiz edərək komponentlər arası əlaqələri gücləndirmək və daha mürəkkəb, dinamik strategiyalar qurmaq üçün yaradılıb.
        </p>

        {/* Module Selection Circles */}
        <div className="grid grid-cols-4 gap-3 mb-7">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <motion.button
                key={module.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl transition-all ${
                  lightMode ? module.bgLight : module.bgDark
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                  module.isActive
                    ? lightMode ? 'bg-gray-900 text-white' : 'bg-white/10 text-white'
                    : lightMode ? 'bg-[var(--theme-surface)] text-[var(--theme-text-secondary)]' : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)]'
                }`}>
                  {module.isActive ? (
                    <div className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-white" />
                    </div>
                  ) : (
                    <Icon size={20} />
                  )}
                </div>
                <span className={`text-[10px] font-bold text-center ${lightMode ? 'text-gray-700' : 'text-white/70'}`}>
                  {module.label}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          {/* Favorite Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`flex-1 py-3 rounded-full border-2 font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              lightMode
                ? 'border-gray-900 text-gray-900 hover:bg-gray-50'
                : 'border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)]'
            }`}
          >
            <Heart size={18} />
            <span className="hidden sm:inline">Seçilmişlər</span>
          </motion.button>

          {/* Apply Prompt Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setModalOpen(true)}
            className={`flex-1 py-3 rounded-full font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              lightMode
                ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/20'
                : 'bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:shadow-lg hover:shadow-amber-600/40 shadow-lg shadow-amber-600/30'
            }`}
          >
            <Zap size={18} />
            <span className="hidden sm:inline">Better Prompt</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Modal Dialog */}
      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-50 ${lightMode ? 'bg-black/20' : 'bg-black/50 backdrop-blur-sm'}`}
              onClick={() => setModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className={`fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto rounded-[2.5rem] border p-8 ${
                lightMode
                  ? 'bg-[var(--theme-surface-muted)] border-[var(--theme-border)] shadow-2xl shadow-black/15'
                  : 'bg-[#0f0f0f] border-white/[0.08] shadow-2xl'
              }`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-2xl font-black ${lightMode ? 'text-gray-900' : 'text-white'}`}>
                  AI Prompt
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    lightMode
                      ? 'bg-gray-100 text-gray-400 hover:text-gray-600'
                      : 'bg-[var(--theme-surface-soft)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text)]'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Custom Prompt Input */}
              <div className="mb-6">
                <label className={`text-xs font-bold uppercase tracking-widest mb-2 block ${
                  lightMode ? 'text-gray-500' : 'text-white/40'
                }`}>
                  Xüsusi Prompt
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Məsələn: Sari çəkinləri artır..."
                  className={`w-full h-24 rounded-xl p-3.5 text-sm outline-none resize-none transition-all ${
                    lightMode
                      ? 'bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20'
                      : 'bg-[var(--theme-surface-soft)] border border-[var(--theme-border)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:border-amber-400/50 focus:ring-2 focus:ring-amber-400/10'
                  }`}
                />
              </div>

              {/* Aggressiveness Slider */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label className={`text-xs font-bold uppercase tracking-widest ${
                    lightMode ? 'text-gray-500' : 'text-white/40'
                  }`}>
                    Aqressivlik
                  </label>
                  <span className={`text-sm font-bold ${
                    lightMode ? 'text-amber-700' : 'text-amber-400'
                  }`}>
                    {aggressiveness}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={aggressiveness}
                  onChange={(e) => setAggressiveness(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: lightMode
                      ? `linear-gradient(to right, #b45309 0%, #b45309 ${(aggressiveness / 10) * 100}%, #e5e7eb ${(aggressiveness / 10) * 100}%, #e5e7eb 100%)`
                      : `linear-gradient(to right, #d97706 0%, #d97706 ${(aggressiveness / 10) * 100}%, rgba(255,255,255,0.1) ${(aggressiveness / 10) * 100}%, rgba(255,255,255,0.1) 100%)`
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className={`flex-1 py-3.5 rounded-full font-bold text-sm transition-all border ${
                    lightMode
                      ? 'border-gray-300 text-gray-600 hover:bg-gray-100'
                      : 'border-[var(--theme-border)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-surface-soft)]'
                  }`}
                >
                  Ləğv et
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setModalOpen(false);
                    // AI prompt logic here
                  }}
                  className={`flex-1 py-3.5 rounded-full font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                    lightMode
                      ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/20'
                      : 'bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:shadow-lg hover:shadow-amber-600/40 shadow-lg shadow-amber-600/30'
                  }`}
                >
                  <Zap size={16} />
                  Tətbiq et
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
