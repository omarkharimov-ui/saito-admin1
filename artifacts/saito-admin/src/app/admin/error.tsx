'use client';

export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--theme-bg)] p-6">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center">
          <span className="text-2xl">!</span>
        </div>
        <h2 className="text-lg font-bold">Xəta baş verdi</h2>
        <p className="text-sm text-gray-500">{error.message}</p>
        <button onClick={reset} className="px-6 py-2 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors">
          Yenidən cəhd et
        </button>
      </div>
    </div>
  );
}
