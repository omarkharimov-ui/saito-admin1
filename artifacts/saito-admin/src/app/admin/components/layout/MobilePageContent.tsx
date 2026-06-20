'use client';

/** Layer-based mobile page content renderer */
export default function MobilePageContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="mobile-premium-root min-h-0">
      {children}
    </div>
  );
}