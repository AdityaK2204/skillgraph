import { requireUser } from '@/lib/auth';
import { query, tx } from '@/lib/db';
import { body, handle, HttpError, ok } from '@/lib/http';
import { weightsSchema } from '@/lib/validation';

export const GET = handle(async () => {
  await requireUser('admin');
  return ok(await query('SELECT factor, weight, label FROM scoring_weights ORDER BY factor'));
});

// Weights are normalised by their sum inside compute_skill_priorities(), but must not all be zero.
export const PUT = handle(async (req: Request) => {
  const me = await requireUser('admin');
  const { weights } = await body(req, weightsSchema);
  await tx(me.userId, async (c) => {
    for (const [factor, weight] of Object.entries(weights)) {
      await c.query('UPDATE scoring_weights SET weight = $2 WHERE factor = $1', [factor, weight]);
    }
    const { rows: [s] } = await c.query('SELECT sum(weight)::float AS total FROM scoring_weights');
    if (!s.total || s.total <= 0) throw new HttpError(422, 'At least one weight must be above zero');
  });
  return ok({ saved: true });
});
