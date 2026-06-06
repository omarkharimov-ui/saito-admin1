'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

export function OrdersSkeleton() {
  const { lightMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-4"
    >
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className={`h-8 w-32 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
        <div className="flex items-center gap-2">
          <div className={`h-10 w-24 rounded-xl ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className={`h-10 w-24 rounded-xl ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
        </div>
      </div>

      {/* Status Bar Skeleton */}
      <div className={`h-14 border rounded-2xl flex items-center px-4 gap-6 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.03] border-white/[0.06]'}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className={`h-4 w-20 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className={`h-5 w-6 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className={`h-4 w-24 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className={`h-5 w-6 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className={`h-4 w-16 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className={`h-5 w-6 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
        </div>
      </div>

      {/* Table Status Grid Skeleton */}
      <div className={`h-12 border rounded-2xl ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.03] border-white/[0.06]'}`} />

      {/* Order Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`border rounded-2xl p-4 space-y-4 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
          >
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                <div className={`h-5 w-24 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
              </div>
              <div className={`h-6 w-20 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
            </div>

            {/* Card Content */}
            <div className="space-y-2">
              <div className={`h-3 w-full rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
              <div className={`h-3 w-2/3 rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
            </div>

            {/* Card Footer */}
            <div className={`flex items-center justify-between pt-3 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
              <div className={`h-4 w-16 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
              <div className={`h-8 w-24 rounded-xl ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
