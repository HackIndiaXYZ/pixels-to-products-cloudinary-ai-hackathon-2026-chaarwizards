import type { SVGProps } from 'react';

export type IconName =
  | 'overview'
  | 'evidence'
  | 'integrity'
  | 'change'
  | 'report'
  | 'close'
  | 'check'
  | 'cross'
  | 'warning'
  | 'unknown'
  | 'clock'
  | 'pin'
  | 'refresh'
  | 'layers'
  | 'chevron-left'
  | 'chevron-right'
  | 'lock'
  | 'satellite'
  | 'street';

const PATHS: Record<IconName, string> = {
  overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  evidence: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  integrity: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z M9 12l2 2 4-4',
  change: 'M4 8h13l-3-3M20 16H7l3 3',
  report: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12.5l5 5L20 6.5',
  cross: 'M6 6l12 12M18 6L6 18',
  warning: 'M12 3l9 17H3zM12 10v5M12 18h.01',
  unknown: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  pin: 'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  'chevron-left': 'M14 6l-6 6 6 6',
  'chevron-right': 'M10 6l6 6-6 6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  satellite: 'M12 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8 8a6 6 0 0 0 0 8M16 16a6 6 0 0 0 0-8M5 5a10 10 0 0 0 0 14M19 19a10 10 0 0 0 0-14',
  street: 'M4 21L8 3M20 21L16 3M12 5v3M12 12v3M12 19v2',
};

/** One outlined icon family for the whole product: 1.5px stroke, 2px joins and caps, no fills,
 *  never mixed with filled icons at the same level, never emoji. */
export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
