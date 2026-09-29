import type { VerificationState } from '@impact/shared/rn';

/**
 * Map an integrity check's tri-state boolean to the canonical verdict.
 *
 * `true → pass`, `false → fail`, `null/undefined → unknown`. A missing signal
 * is `unknown` and must NEVER be rendered as `pass` (AGENTS.md §3.7): only a
 * genuine `true` passes, so an absent NTP offset or an unverifiable signature
 * shows honestly as unknown rather than being laundered into a green check.
 */
export function toVerdict(value: boolean | null | undefined): VerificationState {
  if (value === true) {
    return 'pass';
  }
  if (value === false) {
    return 'fail';
  }
  return 'unknown';
}
