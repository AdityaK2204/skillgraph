import { requireUser } from '@/lib/auth';
import { one } from '@/lib/db';
import { handle, HttpError, ok, searchParams } from '@/lib/http';
import { pivotRoles, prerequisiteChain, roleGraph } from '@/lib/graph';

// Skill graph for a role (default: the active goal). Neo4j when available, PostgreSQL recursive CTE otherwise.
export const GET = handle(async (req: Request) => {
  const me = await requireUser();
  const sp = searchParams(req);

  if (sp.get('from') && sp.get('to')) {
    return ok(await prerequisiteChain(Number(sp.get('from')), Number(sp.get('to'))));
  }

  let roleId = Number(sp.get('roleId'));
  if (!roleId) {
    const g = await one<{ role_id: number }>('SELECT role_id FROM v_active_goals WHERE user_id = $1', [me.userId]);
    if (!g) throw new HttpError(409, 'Choose a target role first');
    roleId = g.role_id;
  }
  const [graph, pivots] = await Promise.all([roleGraph(roleId, me.userId), pivotRoles(roleId)]);
  return ok({ roleId, ...graph, pivots: pivots.roles });
});
