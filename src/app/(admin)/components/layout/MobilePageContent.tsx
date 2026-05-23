'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

/** Səhifə dəyişəndə mobil üçün yüngül “yuxarı qalxma” keçidi. */
export default function MobilePageContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <AnimatePresence mode="sync">
      <motion.div
        key={pathname}
        className="mobile-premium-root min-h-0"
        initial={{ opacity: 0.94, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0.96, y: -10 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
