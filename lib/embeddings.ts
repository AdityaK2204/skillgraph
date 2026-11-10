/**
 * Text embeddings (384 dimensions, unit length, compared with cosine distance in pgvector).
 *
 *  minilm — sentence-transformers/all-MiniLM-L6-v2 run locally through Transformers.js (ONNX).
 *           No external API and no key: the ~23 MB model is downloaded once and cached.
 *  hash   — deterministic feature-hashing embedding (signed hashing of word unigrams,
 *           bigrams and character trigrams). Needs no download; used offline and in tests.
 *
 * All vectors in one database must come from the same provider; `npm run embed`
 * recomputes every stored vector after a provider change.
 */
export const EMBEDDING_DIM = 384;

type Provider = 'minilm' | 'hash';
type Extractor = (text: string, opts: { pooling: 'mean'; normalize: boolean }) => Promise<{ data: Float32Array }>;

const g = globalThis as unknown as { __sgExtractor?: Promise<Extractor | null>; __sgProvider?: Provider };

function configured(): Provider {
  return process.env.EMBEDDING_PROVIDER === 'hash' ? 'hash' : 'minilm';
}

async function loadMiniLM(): Promise<Extractor | null> {
  try {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.cacheDir = process.env.TRANSFORMERS_CACHE ?? './models';
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
    return extractor as unknown as Extractor;
  } catch (err) {
    console.warn(`[embeddings] MiniLM unavailable (${(err as Error).message}); falling back to hash embeddings`);
    return null;
  }
}

/** The provider actually in use after the first call (minilm may fall back to hash). */
export async function activeProvider(): Promise<Provider> {
  if (configured() === 'hash') return 'hash';
  if (!g.__sgExtractor) g.__sgExtractor = loadMiniLM();
  return (await g.__sgExtractor) ? 'minilm' : 'hash';
}

export function modelName(p: Provider) {
  return p === 'minilm' ? 'all-MiniLM-L6-v2 (384-d, mean pooled, normalised)' : 'feature-hashing-v1 (384-d, normalised)';
}

export async function embed(text: string): Promise<number[]> {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!clean) return new Array(EMBEDDING_DIM).fill(0);
  if ((await activeProvider()) === 'minilm') {
    const extractor = (await g.__sgExtractor)!;
    const out = await extractor(clean, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  }
  return hashEmbed(clean);
}

// ---------------- hashing embedding ----------------
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const STOP = new Set('a an and are as at be by for from has have in is it of on or that the this to with we you your our will can'.split(' '));

export function hashEmbed(text: string): number[] {
  const v = new Float64Array(EMBEDDING_DIM);
  const words = text.toLowerCase().replace(/[^a-z0-9+#./ ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    v[h % EMBEDDING_DIM] += (h & 0x80000000 ? -1 : 1) * weight;
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    add('w:' + w, 1.0);
    if (i + 1 < words.length) add('b:' + w + '_' + words[i + 1], 0.7);
    const padded = `^${w}$`;
    for (let j = 0; j + 3 <= padded.length; j++) add('c:' + padded.slice(j, j + 3), 0.25);
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, (x) => x / norm);
}

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
