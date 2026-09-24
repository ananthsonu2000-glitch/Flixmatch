"use client";

export default function WaitingRoom({
  title,
  subtitle,
  showSpinner = true,
}: {
  title: string;
  subtitle: string;
  showSpinner?: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
      {showSpinner && (
        <div className="w-12 h-12 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin" />
      )}
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-[var(--text-dim)] mt-2 max-w-xs mx-auto">{subtitle}</p>
      </div>
    </div>
  );
}
