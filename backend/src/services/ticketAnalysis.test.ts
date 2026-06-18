import { describe, it, expect, vi, beforeEach } from 'vitest';

// ticketAnalysis; Anthropic SDK, Redis ve env'i yan etkisiz olması için mock'lar.
// Böylece ağ/anahtar/Redis olmadan, deterministik biçimde uçtan uca davranış test edilir:
// sağlayıcı seçimi · cache · force · fallback · yapısal yanıtın eşlenmesi.
const { mockEnv, createMock, redisGet, redisSet } = vi.hoisted(() => ({
  mockEnv: { ANALYSIS_PROVIDER: 'auto', ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_MODEL: 'claude-haiku-4-5' },
  createMock: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock('../env', () => ({ env: mockEnv }));
vi.mock('../redis', () => ({ redis: { get: redisGet, set: redisSet } }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import { analyzeRecurring, type AnalysisInput } from './ticketAnalysis';

const items: AnalysisInput[] = [
  { subject: 'Yazıcı bozuldu', message: 'ofiste yazıcı çalışmıyor', category: 'Donanım', userId: 'u1' },
  { subject: 'Yazıcı sorunu', message: 'yazıcı kağıt sıkıştırıyor', category: 'Donanım', userId: 'u2' },
  { subject: 'VPN problemi', message: 'vpn uzaktan bağlanmıyor', category: 'Ağ', userId: 'u3' },
];

const toolResponse = (themes: unknown[]) => ({
  content: [{ type: 'tool_use', name: 'report_recurring_problems', input: { themes } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.ANALYSIS_PROVIDER = 'auto';
  mockEnv.ANTHROPIC_API_KEY = 'sk-test';
  mockEnv.ANTHROPIC_MODEL = 'claude-haiku-4-5';
  redisGet.mockResolvedValue(null);
  redisSet.mockResolvedValue('OK');
});

describe('analyzeRecurring — sağlayıcı seçimi', () => {
  it("ANALYSIS_PROVIDER='nlp' iken yerel analiz kullanır, Claude'u çağırmaz", async () => {
    mockEnv.ANALYSIS_PROVIDER = 'nlp';
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-nlp' });
    expect(res.provider).toBe('nlp');
    expect(res.cached).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalledOnce();
  });

  it("'auto' + anahtar yoksa NLP'ye düşer", async () => {
    mockEnv.ANALYSIS_PROVIDER = 'auto';
    mockEnv.ANTHROPIC_API_KEY = '';
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-auto-nokey' });
    expect(res.provider).toBe('nlp');
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('analyzeRecurring — Claude (anthropic) yolu', () => {
  it('yapısal yanıtı Theme şekline doğru eşler (geçersiz/eksik index filtrelenir)', async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    createMock.mockResolvedValue(
      toolResponse([
        // tek geçerli index → < 2, elenir
        { label: 'VPN', kind: 'recurring', ticketIndices: [2], suggestion: 's1' },
        // 99 geçersiz → [0,1]'e iner
        { label: 'Yazıcı arızaları', kind: 'hardware', ticketIndices: [0, 1, 99], suggestion: 'Bakıma alın' },
      ]),
    );
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-map' });

    expect(res.provider).toBe('anthropic');
    expect(createMock).toHaveBeenCalledOnce();
    expect(res.themes).toHaveLength(1);
    const th = res.themes[0];
    expect(th.term).toBe('Yazıcı arızaları');
    expect(th.count).toBe(2);
    expect(th.distinctRequesters).toBe(2);
    expect(th.kind).toBe('hardware');
    expect(th.suggestion).toBe('Bakıma alın');
    expect(th.sampleSubjects).toEqual(['Yazıcı bozuldu', 'Yazıcı sorunu']);
  });

  it('bilinmeyen kind → general; öneri boşsa undefined', async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    createMock.mockResolvedValue(
      toolResponse([{ label: 'Karışık', kind: 'banana', ticketIndices: [0, 1], suggestion: '  ' }]),
    );
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-kind' });
    expect(res.themes[0].kind).toBe('general');
    expect(res.themes[0].suggestion).toBeUndefined();
  });

  it('2 talepten az girdide API çağrılmaz (maliyet koruması)', async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    const res = await analyzeRecurring([items[0]], 6, { scopeKey: 't-min' });
    expect(res.provider).toBe('anthropic');
    expect(res.themes).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('Claude hata verirse NLP fallback (akış kırılmaz)', async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    createMock.mockRejectedValue(new Error('API down'));
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-fallback' });
    expect(res.provider).toBe('nlp');
    expect(createMock).toHaveBeenCalledOnce();
  });
});

describe('analyzeRecurring — cache', () => {
  it('cache doluysa onu döndürür, sağlayıcıyı çağırmaz', async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    redisGet.mockResolvedValue(
      JSON.stringify({
        themes: [{ term: 'cached-tema', count: 3, distinctRequesters: 2, sampleSubjects: [], kind: 'general' }],
        provider: 'anthropic',
        generatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-cache' });
    expect(res.cached).toBe(true);
    expect(res.themes[0].term).toBe('cached-tema');
    expect(createMock).not.toHaveBeenCalled();
    expect(redisSet).not.toHaveBeenCalled();
  });

  it("force=true cache'i atlar ve yeniden hesaplar", async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    redisGet.mockResolvedValue(
      JSON.stringify({ themes: [{ term: 'eski' }], provider: 'anthropic', generatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    createMock.mockResolvedValue(
      toolResponse([{ label: 'Yeni tema', kind: 'general', ticketIndices: [0, 1], suggestion: 'öneri' }]),
    );
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-force', force: true });
    expect(res.cached).toBe(false);
    expect(res.themes[0].term).toBe('Yeni tema');
    expect(createMock).toHaveBeenCalledOnce();
    expect(redisSet).toHaveBeenCalledOnce();
  });

  it("bozuk cache JSON'unda çökmek yerine yeniden hesaplar", async () => {
    mockEnv.ANALYSIS_PROVIDER = 'anthropic';
    redisGet.mockResolvedValue('{bozuk-json');
    createMock.mockResolvedValue(
      toolResponse([{ label: 'Tema', kind: 'general', ticketIndices: [0, 1], suggestion: 'x' }]),
    );
    const res = await analyzeRecurring(items, 6, { scopeKey: 't-badcache' });
    expect(res.cached).toBe(false);
    expect(res.themes[0].term).toBe('Tema');
  });
});
