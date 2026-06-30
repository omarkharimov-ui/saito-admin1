export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--theme-bg)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Yüklənir...</p>
      </div>
    </div>
  );
}
