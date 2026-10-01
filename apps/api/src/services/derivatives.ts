/**
 * Derivative writer (BUILD_ORDER Phase 5: "Derivative writer").
 *
 * `createDerivative(parentAssetId, transformation, kind, isGenerative)` is the
 * ONLY sanctioned way a transformed copy comes into existence. It enforces the
 * two invariants a transform must never break:
 *
 *  - AGENTS.md §3.1 — a transform never mutates the original; it always creates a
 *    NEW `asset_derivatives` row carrying `parent_asset_id` and the exact
 *    transformation string, and the outcome is appended to the asset's audit
 *    chain. Originals stay pristine.
 *  - AGENTS.md §3.1 — generative edits are permitted ONLY on report copies. A
 *    generative transform whose source is an original (or any non-report
 *    derivative) is rejected, so a gen-AI edit can never be filed against raw
 *    evidence.
 *
 * Generative transforms are asynchronous (420/423). The writer registers them as
 * eager transformations and, when Cloudinary reports the derivative is still
 * generating, records the row as `pending` (sha256/bytes NULL) rather than
 * blocking — the bytes are picked up later, never fetched synchronously (§3.11).
 */
import type { AssetDerivative } from '@panchnama/shared';
import type { AuditRepo, CloudinaryPort, DerivativesRepo, AssetsRepo } from '../ports.js';
import { isGenerativeTransformation, REPORT_KINDS } from '../lib/transformations.js';
import { errors } from '../types.js';

export interface CreateDerivativeDeps {
  readonly cloudinary: CloudinaryPort;
  readonly derivatives: DerivativesRepo;
  readonly audit: AuditRepo;
  /** Service-role original-asset lookup (lineage root; never mutated). */
  readonly assets: Pick<AssetsRepo, 'getByIdService'>;
}

export interface CreateDerivativeInput {
  /** The original evidence asset this derivative descends from (lineage root). */
  readonly parentAssetId: string;
  /** Exact transformation string sent to Cloudinary (§3.1). */
  readonly transformation: string;
  /** Coarse family, e.g. `report_full`, `report_diff`, `clip`. */
  readonly kind: string | null;
  /** True iff the transformation is generative (`e_gen_*` / `b_gen_fill`). */
  readonly isGenerative: boolean;
  /**
   * When generative, the report-copy derivative the edit is applied to. It MUST
   * be a report derivative (§3.1); a generative edit on an original is refused.
   */
  readonly sourceDerivativeId?: string;
  readonly resourceType?: 'image' | 'video';
}

export interface CreateDerivativeResult {
  readonly derivative: AssetDerivative;
  readonly pending: boolean;
  readonly secureUrl: string | null;
}

/** Slug used to give a derivative its own stable, unique public_id. */
export function derivedPublicId(
  basePublicId: string,
  kind: string | null,
  transformation: string,
): string {
  const slug = (kind ?? transformation).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
  return `${basePublicId}/${slug}`;
}

export async function createDerivative(
  deps: CreateDerivativeDeps,
  input: CreateDerivativeInput,
): Promise<CreateDerivativeResult> {
  const declaredGenerative = input.isGenerative;
  const detectedGenerative = isGenerativeTransformation(input.transformation);
  // A transformation that IS generative must be declared as such: a mislabelled
  // gen-AI edit would slip past the report-copy guard and skip the async path.
  if (detectedGenerative && !declaredGenerative) {
    throw errors.unprocessable('generative transformation must be declared is_generative', {
      transformation: input.transformation,
    });
  }

  const parent = await deps.assets.getByIdService(input.parentAssetId);
  if (parent === null) {
    throw errors.notFound('parent asset not found');
  }

  let sourcePublicId = parent.cloudinary_public_id;
  let sourceType: 'authenticated' | 'upload' = 'authenticated';

  if (declaredGenerative) {
    // Generative edits run on a report copy only (§3.1). Resolve the named
    // source derivative and refuse anything that is not a report derivative.
    if (input.sourceDerivativeId === undefined) {
      throw errors.unprocessable('generative transform requires a report-derivative source');
    }
    const source = await deps.derivatives.getById(input.sourceDerivativeId);
    if (source === null) {
      throw errors.notFound('source derivative not found');
    }
    if (source.parent_asset_id !== parent.id) {
      throw errors.unprocessable('source derivative does not belong to parent asset');
    }
    if (source.kind === null || source.kind === undefined || !REPORT_KINDS.has(source.kind)) {
      throw errors.unprocessable('generative transform is only permitted on a report derivative', {
        source_kind: source.kind ?? null,
      });
    }
    sourcePublicId = source.public_id;
    sourceType = 'upload'; // report copies are `type: upload`
  }

  const result = await deps.cloudinary.createEagerDerivative({
    sourcePublicId,
    sourceType,
    resourceType: input.resourceType ?? 'image',
    transformation: input.transformation,
    isGenerative: declaredGenerative,
  });

  const publicId = derivedPublicId(sourcePublicId, input.kind, input.transformation);

  const derivative = await deps.derivatives.insert({
    parent_asset_id: parent.id,
    transformation: input.transformation,
    kind: input.kind,
    public_id: publicId,
    is_generative: declaredGenerative,
    cloudinary_asset_id: result.cloudinaryAssetId,
    cloudinary_version: result.version,
    byte_size: result.bytes,
    // sha256 is only knowable by fetching the bytes; NULL is terminal (§schema).
    sha256_hash: null,
  });

  // Persist the outcome — pass or pending — to the asset's audit chain (§3.6).
  await deps.audit.append({
    assetId: parent.id,
    action: 'derivative_created',
    actorType: 'system',
    actorId: 'cloudinary',
    details: {
      derivative_id: derivative.id,
      transformation: input.transformation,
      kind: input.kind,
      is_generative: declaredGenerative,
      status: result.status,
      public_id: publicId,
    },
  });

  return {
    derivative,
    pending: result.status === 'pending',
    secureUrl: result.secureUrl,
  };
}
