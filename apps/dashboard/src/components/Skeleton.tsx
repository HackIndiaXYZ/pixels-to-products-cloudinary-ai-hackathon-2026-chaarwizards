export interface SkeletonProps {
  lines?: number;
  label?: string;
  width?: string;
}

/** Reserved space for content that has not arrived, so nothing shifts after it loads. */
export function Skeleton({ lines = 3, label = 'Loading…', width = '100%' }: SkeletonProps) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ width }}>
      <span className="pn-visually-hidden">{label}</span>
      <div className="pn-stack-3" aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className="pn-skeleton"
            style={{ width: index === lines - 1 ? '62%' : '100%' }}
          />
        ))}
      </div>
    </div>
  );
}
