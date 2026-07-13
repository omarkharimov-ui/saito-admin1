import { motion } from 'framer-motion';

export default function POSLoading() {
  return (
    <div className="flex-1 min-h-0 w-full flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] overflow-hidden">
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <div className="h-full flex flex-col p-6">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-24 h-8 bg-white/10 rounded-lg animate-pulse" />
                <div className="w-32 h-8 bg-white/10 rounded-full animate-pulse" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-8 bg-white/10 rounded-full animate-pulse" />
                <div className="w-24 h-8 bg-white/10 rounded-full animate-pulse" />
                <div className="w-24 h-8 bg-white/10 rounded-full animate-pulse" />
                <div className="w-10 h-10 bg-white/10 rounded-full animate-pulse" />
              </div>
            </div>
          </motion.div>

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03, type: "spring", stiffness: 350, damping: 30 }}
                  className="col-span-1"
                >
                  <div className="w-full aspect-[4/5] rounded-[2rem] bg-white/5 border border-white/5 animate-pulse" />
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
