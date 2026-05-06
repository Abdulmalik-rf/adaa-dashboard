// Global loading skeleton — Next.js automatically shows this whenever a
// server component is rendering for ANY route under /app. The user sees it
// the instant they click a sidebar link instead of staring at the previous
// page until the full server render completes.
//
// Designed to feel like the dashboard chrome (cards + table strips) so the
// transition is visually continuous, not a jarring blank page.

export default function Loading() {
  return (
    <div className="space-y-6 page-fade-in">
      {/* Header skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-80" />
        </div>
        <div className="skeleton h-10 w-32 rounded-full" />
      </div>

      {/* KPI strip skeleton — 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="premium-card p-5 flex flex-col gap-2"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-8 w-16" />
            <div className="skeleton h-3 w-28" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="premium-card p-0 overflow-hidden">
        <div className="p-5 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-4 w-48" />
        </div>
        <div className="divide-y divide-[hsl(var(--border))]">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="px-5 py-4 flex items-center gap-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="skeleton h-10 w-10 rounded-2xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-1/3" />
                <div className="skeleton h-3 w-1/2" />
              </div>
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
