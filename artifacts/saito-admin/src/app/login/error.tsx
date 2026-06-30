'use client';

export default function LoginError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-lg font-bold text-white">Xəta baş verdi</h2>
        <p className="text-sm text-zinc-400">{error.message}</p>
        <button onClick={reset} className="px-6 py-2 rounded-full bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors">
          Yenidən cəhd et
        </button>
      </div>
    </div>
  );
}
