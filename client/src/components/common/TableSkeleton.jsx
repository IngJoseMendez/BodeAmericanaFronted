const WIDTHS = ['w-1/4', 'w-1/2', 'w-3/4', 'w-2/3', 'w-1/3', 'w-3/5'];

export function TableSkeleton({ cols = 4, rows = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri} className="border-b border-border/30">
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} className="px-4 py-3">
              <div className={`h-3.5 bg-primary/8 rounded-full animate-pulse ${WIDTHS[(ri * cols + ci) % WIDTHS.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
