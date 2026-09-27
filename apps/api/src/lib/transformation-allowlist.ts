/**
 * Delivery transformation allowlist (AGENTS.md §3.11, api-contracts.md §5).
 *
 * A signed derivative URL with attacker-chosen parameters is a free resize and a
 * gen-AI billing primitive, so a client-supplied `transformation` is accepted
 * only if every component is either one of our named transforms or a member of a
 * small set of safe delivery parameters. Anything else is rejected `422` — the
 * default is deny, never allow.
 *
 * Generative qualifiers (`e_gen_*`, `b_gen_*`) are deliberately absent: those
 * are asynchronous, cost-bearing, and only ever applied to report copies through
 * the pipeline, never through a delivery URL.
 */

/** Named transforms defined in `docs/architecture/CLOUDINARY_TRANSFORMATIONS.md` §5. */
export const NAMED_TRANSFORMS = [
  'report_thumb',
  'report_full',
  'report_social',
  'report_diff',
] as const;

/**
 * Safe delivery parameter prefixes/values. A `c_` crop mode is constrained to a
 * known-safe set; a bare `c_<anything>` is not allowed.
 */
const SAFE_CROP_MODES = new Set(['fill', 'lfill', 'limit', 'scale', 'pad', 'fill_pad']);
const SAFE_EXACT = new Set(['f_auto', 'q_auto', 'q_auto:eco', 'q_auto:good', 'g_auto', 'dpr_auto']);
const SAFE_NUMERIC_PREFIXES = ['w_', 'h_', 'dpr_'] as const;

function isNamedTransform(component: string): boolean {
  return (NAMED_TRANSFORMS as readonly string[]).includes(component);
}

function isSafeComponent(component: string): boolean {
  if (SAFE_EXACT.has(component)) return true;

  if (component.startsWith('c_')) {
    return SAFE_CROP_MODES.has(component.slice(2));
  }
  if (component.startsWith('q_auto:')) {
    return SAFE_EXACT.has(component);
  }
  for (const prefix of SAFE_NUMERIC_PREFIXES) {
    if (component.startsWith(prefix)) {
      const value = component.slice(prefix.length);
      // dpr may be a float ("2.0"), w_/h_ are positive integers.
      return /^\d+(\.\d+)?$/.test(value) && Number(value) > 0;
    }
  }
  return false;
}

/**
 * Validate a client-supplied transformation string.
 *
 * A string is either a single named transform (`report_full`) or a
 * comma-separated chain of safe delivery components
 * (`c_lfill,g_auto,w_400,h_300,f_auto,q_auto:eco`). Mixing a named transform
 * into a chain, an empty string, or any unknown component fails.
 *
 * @returns `null` if valid, or the first offending component for a `422` detail.
 */
export function rejectUnsafeTransformation(transformation: string): string | null {
  const trimmed = transformation.trim();
  if (trimmed.length === 0) return '';

  // A lone named transform is allowed.
  if (isNamedTransform(trimmed)) return null;

  const components = trimmed.split(',').map((c) => c.trim());
  for (const component of components) {
    if (component.length === 0) return '';
    // A named transform may not be smuggled inside a chain.
    if (isNamedTransform(component)) return component;
    if (!isSafeComponent(component)) return component;
  }
  return null;
}
