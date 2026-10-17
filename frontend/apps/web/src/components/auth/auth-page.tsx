// Centered shell of the public pages (sign in, no access): brand on top, one card below. No sidebar.
export function AuthPage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <span className="font-brand text-3xl font-black tracking-[-0.035em] text-primary">SURCO.</span>
      <div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-sm">{children}</div>
    </main>
  );
}
