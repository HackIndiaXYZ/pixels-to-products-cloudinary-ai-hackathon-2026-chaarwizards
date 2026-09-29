/**
 * Asynchronous gen-AI social-variant job (BUILD_ORDER Phase 9 "Async gen-AI
 * job"). Gen-AI transforms return 420 Pending / 423 Locked, so they must NOT run
 * inside the synchronous `POST /v1/reports/generate` path (§3.11). This job runs
 * on the queue, applies each edit to a REPORT COPY derivative — never an
 * original (AGENTS.md §3.1) — and polls, within a bounded attempt budget, until
 * the derivative is ready (AGENTS.md §8: gen-AI must be cost/rate bounded).
 *
 * The report-copy constraint is enforced structurally by `createDerivative`: a
 * generative edit must name a `sourceDerivativeId` that resolves to a report
 * derivative, and it is applied to THAT derivative's `public_id`, so a gen-AI
 * edit can never be filed against a raw evidence `public_id`.
 */
import type { AuditRepo, CloudinaryPort, DbPort } from '../ports.js';
import { createDerivative } from './derivatives.js';

export interface ReportGenAiEdit {
  readonly parentAssetId: string;
  readonly sourceDerivativeId: string;
  readonly transformation: string;
  readonly kind: string;
}

export interface ReportGenAiPayload {
  readonly reportId: string;
  readonly orgId: string;
  readonly edits: readonly ReportGenAiEdit[];
}

export interface RunReportGenAiDeps {
  readonly cloudinary: CloudinaryPort;
  readonly derivatives: DbPort['derivatives'];
  readonly assets: Pick<DbPort['assets'], 'getByIdService'>;
  readonly audit: AuditRepo;
  /**
   * Poll Cloudinary for a still-generating derivative. Returns true once the
   * bytes are ready. Optional: without it the job records the pending derivative
   * and leaves completion to the next reconciliation pass.
   */
  readonly pollReady?: (publicId: string) => Promise<boolean>;
  /** Bound on poll attempts per edit (default 5) so a stuck edit can't spin. */
  readonly maxPollAttempts?: number;
}

export interface ReportGenAiOutcome {
  readonly derivativeId: string;
  readonly publicId: string;
  readonly isGenerative: true;
  readonly ready: boolean;
}

export async function runReportGenAi(
  deps: RunReportGenAiDeps,
  payload: ReportGenAiPayload,
): Promise<ReportGenAiOutcome[]> {
  const maxAttempts = deps.maxPollAttempts ?? 5;
  const outcomes: ReportGenAiOutcome[] = [];

  for (const edit of payload.edits) {
    // createDerivative refuses a generative edit whose source is not a report
    // derivative, and applies it to the report copy's public_id — never the
    // original (§3.1). It also appends the outcome to the audit chain (§3.6).
    const created = await createDerivative(
      { cloudinary: deps.cloudinary, derivatives: deps.derivatives, audit: deps.audit, assets: deps.assets },
      {
        parentAssetId: edit.parentAssetId,
        transformation: edit.transformation,
        kind: edit.kind,
        isGenerative: true,
        sourceDerivativeId: edit.sourceDerivativeId,
      },
    );

    let ready = !created.pending;
    if (created.pending && deps.pollReady !== undefined) {
      for (let attempt = 0; attempt < maxAttempts && !ready; attempt += 1) {
        ready = await deps.pollReady(created.derivative.public_id);
      }
    }

    outcomes.push({
      derivativeId: created.derivative.id,
      publicId: created.derivative.public_id,
      isGenerative: true,
      ready,
    });
  }

  return outcomes;
}
