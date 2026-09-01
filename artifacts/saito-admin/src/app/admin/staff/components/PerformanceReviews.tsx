'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Star, Send, CheckCircle } from 'lucide-react';

interface Review {
  review_id: string;
  reviewer_name: string;
  period_start: string;
  period_end: string;
  overall_rating: number;
  status: string;
}

interface PerformanceReviewsProps {
  staffId: string;
  isManager?: boolean;
}

export function PerformanceReviews({ staffId, isManager }: PerformanceReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?staff=${staffId}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    }
  }, [staffId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={12}
        className={i < Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-zinc-600'}
      />
    ));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-400 bg-emerald-500/10';
      case 'submitted': return 'text-blue-400 bg-blue-500/10';
      case 'draft': return 'text-zinc-400 bg-zinc-500/10';
      default: return 'text-amber-400 bg-amber-500/10';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-sm font-bold text-[var(--theme-text)]">{reviews.length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Total Reviews</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <p className="text-sm font-bold text-emerald-400">{reviews.filter(r => r.status === 'completed').length}</p>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Completed</p>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
          <div className="flex gap-0.5">
            {renderStars(reviews.reduce((acc, r) => acc + (r.overall_rating || 0), 0) / (reviews.length || 1))}
          </div>
          <p className="text-[9px] text-[var(--theme-text-muted)]">Avg Rating</p>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-2">
        {reviews.map((review) => (
          <div key={review.review_id} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--theme-text)]">{review.reviewer_name}</span>
              <span className={`px-2 py-0.5 rounded text-[9px] font-medium ${getStatusColor(review.status)}`}>
                {review.status}
              </span>
            </div>
            <div className="flex gap-0.5 mb-1">
              {renderStars(review.overall_rating || 0)}
            </div>
            <p className="text-[9px] text-[var(--theme-text-muted)]">
              {new Date(review.period_start).toLocaleDateString()} - {new Date(review.period_end).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
