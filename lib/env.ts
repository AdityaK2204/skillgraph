import { z } from 'zod';

// All configuration comes from environment variables (never hard-coded).
// Validated once, with a readable error if something is missing.
const schema = z.object({
  DATABASE_URL: z.string().startsWith('postgres'),
  MONGODB_URI: z.string().startsWith('mongodb'),
  MONGODB_DB: z.string().default('skillgraph'),
  NEO4J_URI: z.string().default('bolt://localhost:7687'),
  NEO4J_USER: z.string().default('neo4j'),
  NEO4J_PASSWORD: z.string().default(''),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  EMBEDDING_PROVIDER: z.enum(['minilm', 'hash']).default('minilm'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration (check .env): ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
