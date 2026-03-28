"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <div className="text-5xl">📵</div>
      <h1 className="text-xl font-bold text-slate-800">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-slate-500">
        No internet connection. Your data is safe — reconnect to sync and use the AI copilot.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Try again
      </button>
    </div>
  );
}
