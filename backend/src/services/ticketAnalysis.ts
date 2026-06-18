import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import { redis } from '../redis';
import { analyzeThemes } from './textAnalysis';

// Tekrar eden problem analizi için sağlayıcı katmanı.
//  - 'anthropic': Claude (Haiku) ile anlamsal tema çıkarımı + öneri
//  - 'nlp':       mevcut bağımlılıksız anahtar-kelime/TF analizi (analyzeThemes) — fallback
// Sonuç günlük olarak Redis'te cache'lenir (maliyet düşük kalsın). force=true cache'i atlar.
// API anahtarı yoksa veya Claude hata verirse otomatik olarak NLP'ye düşülür; sistem hiç kırılmaz.

export type ThemeKind = 'hardware' | 'recurring' | 'failure' | 'general';

export interface AnalysisInput {
  subject: string;
  message: string;
  category: string | null;
  userId: string;
}

export interface RecurringTheme {
  term: string;
  count: number;
  distinctRequesters: number;
  sampleSubjects: string[];
  kind: ThemeKind;
  suggestion?: string; // yalnızca LLM sağlayıcıda dolu olur
}

export interface RecurringResult {
  themes: RecurringTheme[];
  provider: 'anthropic' | 'nlp';
  generatedAt: string;
  cached: boolean;
}

const KIND_VALUES: ThemeKind[] = ['hardware', 'recurring', 'failure', 'general'];
const MAX_TICKETS = 250; // token/maliyet sınırı — en güncel N talep
const MSG_CHARS = 220; // talep başına gönderilen mesaj uzunluğu
const CACHE_TTL_S = 26 * 60 * 60; // ~1 gün (günlük cache)

function pickProvider(): 'anthropic' | 'nlp' {
  if (env.ANALYSIS_PROVIDER === 'nlp') return 'nlp';
  if (env.ANALYSIS_PROVIDER === 'anthropic') return 'anthropic';
  return env.ANTHROPIC_API_KEY ? 'anthropic' : 'nlp'; // 'auto'
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const SYSTEM = [
  'Sen bir destek (yardım masası) talep analiz asistanısın.',
  'Sana numaralı destek talepleri verilir. Görevin: benzer talepleri gruplayıp TEKRAR EDEN PROBLEM temalarını çıkarmak.',
  'Kurallar:',
  '- Yalnızca en az 2 talebi kapsayan, gerçekten tekrar eden temaları döndür.',
  '- Her tema için kısa Türkçe bir etiket (örn. "VPN bağlantı sorunu"), bir tür ve TEK cümlelik uygulanabilir bir öneri ver.',
  '- Tür: donanım/temin ise "hardware"; aynı sorun çok kişiden tekrar ediyorsa "recurring"; bir arıza/bozulma ise "failure"; diğer "general".',
  '- ticketIndices: temaya ait taleplerin köşeli parantezdeki numaraları.',
  '- En anlamlı temaları say-azalan sırada ver; çöp/anlamsız tema üretme.',
].join('\n');

const TOOL: Anthropic.Tool = {
  name: 'report_recurring_problems',
  description: 'Tekrar eden destek talebi problemlerini yapısal olarak raporla.',
  input_schema: {
    type: 'object',
    properties: {
      themes: {
        type: 'array',
        description: 'Tespit edilen tekrar eden problem temaları',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Kısa Türkçe tema etiketi' },
            kind: { type: 'string', enum: KIND_VALUES },
            ticketIndices: { type: 'array', items: { type: 'integer' } },
            suggestion: { type: 'string', description: 'Tek cümlelik uygulanabilir öneri (Türkçe)' },
          },
          required: ['label', 'kind', 'ticketIndices', 'suggestion'],
          additionalProperties: false,
        },
      },
    },
    required: ['themes'],
    additionalProperties: false,
  },
};

interface RawTheme {
  label: string;
  kind: string;
  ticketIndices: number[];
  suggestion: string;
}

async function anthropicThemes(items: AnalysisInput[], limit: number): Promise<RecurringTheme[]> {
  const scoped = items.slice(0, MAX_TICKETS);
  // En az 2 talep yoksa tekrar eden problem olamaz → API'yi hiç çağırma (maliyet/gürültü yok).
  if (scoped.length < 2) return [];
  const lines = scoped.map((t, i) => {
    const msg = (t.message ?? '').replace(/\s+/g, ' ').trim().slice(0, MSG_CHARS);
    const cat = t.category ? ` (${t.category})` : '';
    return `[${i}]${cat} ${t.subject} :: ${msg}`;
  });
  const userText = `En fazla ${limit} tema döndür. Talepler:\n${lines.join('\n')}`;

  const resp = await client().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: userText }],
  });

  const block = resp.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('Claude yapısal yanıt döndürmedi.');
  const raw = (block.input as { themes?: RawTheme[] }).themes ?? [];

  const themes: RecurringTheme[] = [];
  for (const rt of raw) {
    const idxs = (rt.ticketIndices ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < scoped.length);
    if (idxs.length < 2) continue;
    const requesters = new Set(idxs.map((i) => scoped[i].userId));
    themes.push({
      term: String(rt.label ?? '').trim().slice(0, 80) || 'Tema',
      count: idxs.length,
      distinctRequesters: requesters.size,
      sampleSubjects: idxs.slice(0, 3).map((i) => scoped[i].subject),
      kind: (KIND_VALUES as string[]).includes(rt.kind) ? (rt.kind as ThemeKind) : 'general',
      suggestion: String(rt.suggestion ?? '').trim() || undefined,
    });
  }
  return themes.sort((a, b) => b.count - a.count).slice(0, limit);
}

export async function analyzeRecurring(
  items: AnalysisInput[],
  limit: number,
  opts: { scopeKey: string; force?: boolean },
): Promise<RecurringResult> {
  const date = new Date().toISOString().slice(0, 10);
  const cacheKey = `analysis:recurring:v1:${opts.scopeKey}:${date}`;

  if (!opts.force) {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        const v = JSON.parse(cached) as Omit<RecurringResult, 'cached'>;
        return { ...v, cached: true };
      } catch {
        /* bozuk cache → yeniden hesapla */
      }
    }
  }

  let themes: RecurringTheme[];
  let provider: 'anthropic' | 'nlp';
  if (pickProvider() === 'anthropic') {
    try {
      themes = await anthropicThemes(items, limit);
      provider = 'anthropic';
    } catch (e) {
      console.error('Anthropic analizi başarısız, NLP fallback:', (e as Error).message);
      themes = analyzeThemes(items, limit) as RecurringTheme[];
      provider = 'nlp';
    }
  } else {
    themes = analyzeThemes(items, limit) as RecurringTheme[];
    provider = 'nlp';
  }

  const result: Omit<RecurringResult, 'cached'> = {
    themes,
    provider,
    generatedAt: new Date().toISOString(),
  };
  await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_S).catch(() => {});
  return { ...result, cached: false };
}
