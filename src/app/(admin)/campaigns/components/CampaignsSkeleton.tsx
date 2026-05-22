'use client';

import React from 'react';
import { motion } from 'framer-motion';


export function CampaignsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="h-8 w-48 bg-white/[0.05] rounded-lg" />
          <div className="h-4 w-32 bg-white/[0.03] rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-32 bg-white/[0.05] rounded-xl" />
          <div className="h-10 w-36 bg-gold/20 rounded-xl" />
        </div>
      </div>

      {/* Active Campaigns Grid */}
      <div>
        <div className="h-6 w-40 bg-white/[0.05] rounded mb-4" />
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
                    <div className="h-5 w-32 bg-white/[0.08] rounded" />
                    <div className="h-3 w-20 bg-white/[0.05] rounded" />
                  </div>
                </div>
                <div className="h-6 w-16 bg-emerald-500/20 rounded-full" />
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 w-full bg-white/[0.05] rounded-full" />
                <div className="flex justify-between">
                  <div className="h-3 w-24 bg-white/[0.05] rounded" />
                  <div className="h-3 w-16 bg-white/[0.05] rounded" />
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.05]">
                <div className="h-8 bg-white/[0.05] rounded-lg" />
                <div className="h-8 bg-white/[0.05] rounded-lg" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Inactive Campaigns */}
      <div>
        <div className="h-6 w-48 bg-white/[0.05] rounded mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (i + 3) * 0.08 }}
              className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5 space-y-4 opacity-60"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-white/[0.05] rounded-xl" />
                  <div className="space-y-2">
                    <div className="h-5 w-28 bg-white/[0.05] rounded" />
                    <div className="h-3 w-20 bg-white/[0.03] rounded" />
                  </div>
                </div>
                <div className="h-6 w-20 bg-white/[0.08] rounded-full" />
              </div>
              <div className="h-8 bg-white/[0.05] rounded-lg" />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
