'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '@/lib/theme/ThemeContext';


export function CampaignsSkeleton() {
  const { lightMode } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-6"
    >
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className={`h-8 w-48 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className={`h-4 w-32 rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
        </div>
        <div className="flex items-center gap-3">
          <div className={`h-10 w-32 rounded-xl ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
          <div className="h-10 w-36 bg-gold/20 rounded-xl" />
        </div>
      </div>

      {/* Active Campaigns Grid */}
      <div>
        <div className={`h-6 w-40 rounded mb-4 ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-gradient-to-br from-white/[0.04] to-white/[0.02] border border-gold/20 rounded-2xl p-5 space-y-4"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-gold/10 rounded-xl" />
                  <div className="space-y-2">
                    <div className={`h-5 w-32 rounded ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
                    <div className={`h-3 w-20 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                  </div>
                </div>
                <div className="h-6 w-16 bg-emerald-500/20 rounded-full" />
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className={`h-2 w-full rounded-full ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                <div className="flex justify-between">
                  <div className={`h-3 w-24 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                  <div className={`h-3 w-16 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                </div>
              </div>

              {/* Stats */}
              <div className={`grid grid-cols-2 gap-3 pt-3 border-t ${lightMode ? 'border-gray-200' : 'border-white/[0.05]'}`}>
                <div className={`h-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                <div className={`h-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Inactive Campaigns */}
      <div>
        <div className={`h-6 w-48 rounded mb-4 ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 3) * 0.08 }}
              className={`border rounded-2xl p-5 space-y-4 opacity-60 ${lightMode ? 'bg-gray-50 border-gray-200' : 'bg-white/[0.02] border-white/[0.06]'}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-12 w-12 rounded-xl ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                  <div className="space-y-2">
                    <div className={`h-5 w-28 rounded ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
                    <div className={`h-3 w-20 rounded ${lightMode ? 'bg-gray-50' : 'bg-white/[0.03]'}`} />
                  </div>
                </div>
                <div className={`h-6 w-20 rounded-full ${lightMode ? 'bg-gray-200' : 'bg-white/[0.08]'}`} />
              </div>
              <div className={`h-8 rounded-lg ${lightMode ? 'bg-gray-100' : 'bg-white/[0.05]'}`} />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
