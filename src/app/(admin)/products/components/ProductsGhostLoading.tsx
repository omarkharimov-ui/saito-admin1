'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';

export function ProductsGhostLoading() {
  const { lightMode } = useTheme();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.03 }}
          className={`border rounded-2xl overflow-hidden ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
        >
          {/* Image Placeholder */}
          <div className={`h-40 ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          
          {/* Content */}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className={`h-5 w-3/4 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
              <div className={`h-6 w-16 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
            </div>
            
            <div className={`h-3 w-full rounded ${lightMode ? 'bg-gray-50/80' : 'bg-white/[0.04]'}`} />
            <div className={`h-3 w-2/3 rounded ${lightMode ? 'bg-gray-50/80' : 'bg-white/[0.04]'}`} />
            
            <div className={`flex items-center justify-between pt-3 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
              <div className={`h-6 w-20 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
                <div className={`h-8 w-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.06]'}`} />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
