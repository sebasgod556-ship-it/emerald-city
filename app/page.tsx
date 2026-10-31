// PROVISIONAL home page. The Designer replaces it at the end (see docs/CONTRACTS.md).
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      {/* Reserved space for the logo (not available yet). */}
      <div
        aria-hidden="true"
        className="size-24 rounded-2xl border border-dashed border-ec-muted/50"
      />
      <h1 className="text-4xl font-bold text-ec-primary">Emerald City</h1>
      <p className="text-ec-muted">Sitio en construcción. Versión provisional.</p>
    </main>
  );
}
