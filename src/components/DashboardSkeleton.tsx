'use client';

import React from 'react';

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Stats Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
            <div className="h-4 bg-white/10 rounded w-3/4 mb-3"></div>
            <div className="h-8 bg-white/5 rounded w-1/2"></div>
          </div>
        ))}
      </div>

      {/* Products Table Skeleton */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <div className="h-6 bg-white/10 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 bg-white/[0.02] rounded-lg">
              <div className="h-12 w-12 bg-white/5 rounded-lg"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-white/10 rounded w-3/4"></div>
                <div className="h-3 bg-white/5 rounded w-1/2"></div>
              </div>
              <div className="h-8 w-20 bg-white/5 rounded"></div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/10 rounded-lg p-4">
            <div className="h-4 bg-white/10 rounded w-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
