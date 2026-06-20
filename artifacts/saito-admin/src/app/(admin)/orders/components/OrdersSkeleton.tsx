'use client';

import React from 'react';
import { motion } from 'framer-motion';

export function OrdersSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="space-y-4"
    >
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-white/[0.05] rounded-lg" />
        <div className="flex items-center gap-2">
          <div className="h-10 w-24 bg-white/[0.05] rounded-xl" />
          <div className="h-10 w-24 bg-white/[0.05] rounded-xl" />
        </div>
      </div>

      {/* Status Bar Skeleton */}
      <div className="h-14 bg-white/[0.03] border border-white/[0.06] rounded-2xl flex items-center px-4 gap-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className="h-4 w-20 bg-white/[0.05] rounded" />
          <div className="h-5 w-6 bg-white/[0.08] rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className="h-4 w-24 bg-white/[0.05] rounded" />
          <div className="h-5 w-6 bg-white/[0.08] rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-white/[0.1]" />
          <div className="h-4 w-16 bg-white/[0.05] rounded" />
          <div className="h-5 w-6 bg-white/[0.08] rounded-full" />
        </div>
      </div>

      {/* Table Status Grid Skeleton */}
      <div className="h-12 bg-white/[0.03] border border-white/[0.06] rounded-2xl" />

      {/* Order Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4 space-y-4"
          >
            {/* Card Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-white/[0.05] rounded-xl" />
                <div className="h-5 w-24 bg-white/[0.05] rounded" />
              </div>
              <div className="h-6 w-20 bg-white/[0.08] rounded-full" />
            </div>

            {/* Card Content */}
            <div className="space-y-2">
              <div className="h-3 w-full bg-white/[0.03] rounded" />
              <div className="h-3 w-2/3 bg-white/[0.03] rounded" />
            </div>

            {/* Card Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-white/[0.05]">
              <div className="h-4 w-16 bg-white/[0.05] rounded" />
              <div className="h-8 w-24 bg-white/[0.08] rounded-xl" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
