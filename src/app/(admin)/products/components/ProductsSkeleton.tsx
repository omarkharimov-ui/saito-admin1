'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

export function ProductsSkeleton() {
  const { lightMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className={`h-8 w-32 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className={`h-4 w-48 rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
        </div>
        <div className="h-10 w-40 bg-gold/20 rounded-xl" />
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-4">
        <div className={`h-12 flex-1 max-w-md border rounded-2xl ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.03] border-white/[0.06]'}`} />
        <div className={`h-12 w-32 rounded-xl ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
        <div className={`h-12 w-32 rounded-xl ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`border rounded-2xl overflow-hidden ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
          >
            {/* Image */}
            <div className={`h-40 ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
            
            {/* Content */}
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className={`h-5 w-3/4 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
                <div className={`h-6 w-16 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
              </div>
              
              <div className={`h-3 w-full rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
              <div className={`h-3 w-2/3 rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
              
              <div className={`flex items-center justify-between pt-3 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
                <div className={`h-7 w-24 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                  <div className={`h-8 w-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
