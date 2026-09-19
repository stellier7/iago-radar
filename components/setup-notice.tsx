import type { SetupProblem } from "@/lib/ui/setup";

export function SetupNotice({ problem }: { problem: SetupProblem }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-base font-semibold">{problem.title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{problem.detail}</p>
      <ol className="mt-3 space-y-2 text-sm">
        {problem.steps.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span className="shrink-0 text-ink-muted tabular-nums">{index + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-muted">See the README for the full deployment checklist.</p>
    </div>
  );
}
