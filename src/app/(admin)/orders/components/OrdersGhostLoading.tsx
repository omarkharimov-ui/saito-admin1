'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

export function OrdersGhostLoading() {
  const { lightMode } = useTheme();
  return (
    <div className="space-y-4">
      {/* Table Status Grid - Real Form */}
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        className={`border rounded-2xl p-4 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
      >
        <div className={`h-4 w-32 rounded mb-4 ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`}
            >
              <div className="h-4 w-4 bg-white/[0.1] rounded" />
            </div>
          ))}
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`}>
            <div className="h-4 w-4 bg-white/[0.1] rounded-full" />
          </div>
        </div>
      </motion.div>

      {/* Status Bar - Real Form */}
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        className={`h-14 border rounded-2xl flex items-center px-4 gap-6 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.03] border-white/[0.06]'}`}
      >
        <div className="flex items-center gap-2 flex-1">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className={`h-4 w-20 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
          <div className={`h-5 w-6 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        </div>
        <div className="flex items-center gap-2 flex-1 justify-center">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className={`h-4 w-24 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
          <div className={`h-5 w-6 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        </div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className={`h-4 w-16 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
          <div className={`h-5 w-6 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        </div>
      </motion.div>

      {/* Order Cards Grid */}
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8 }}
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      >
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          className={`border rounded-2xl p-4 space-y-4 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
        >
          {/* Card Header - Ghost */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`}>
                <div className="w-5 h-5 bg-white/[0.1] rounded" />
              </div>
              <div className="space-y-1">
                <div className={`h-4 w-24 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
                <div className={`h-3 w-16 rounded ${lightMode ? 'bg-gray-50/80' : 'bg-white/[0.04]'}`} />
              </div>
            </div>
            <div className={`h-6 w-20 rounded-full ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
          </div>

          {/* Order Items - Ghost */}
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
                  <div className={`h-3 w-32 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                </div>
                <div className={`h-3 w-12 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
              </div>
            ))}
          </div>

          {/* Footer - Ghost */}
          <div className={`flex items-center justify-between pt-3 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
            <div className={`h-5 w-16 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
            <div className="flex items-center gap-2">
              <div className={`h-8 w-20 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
              <div className={`h-8 w-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
            </div>
          </div>
        </motion.div>
      ))}
      </motion.div>
    </div>
  );
}
