// Lightweight, dependency-free recurring-problem analysis over ticket text.
// Extracts frequent keywords/bigrams (TR + EN), groups by theme, and classifies
// each theme so the frontend can render a localized recommendation.

const STOPWORDS = new Set<string>([
  // Turkish function/common words
  've', 'veya', 'ile', 'için', 'bu', 'şu', 'bir', 'ben', 'sen', 'biz', 'siz', 'onlar',
  'var', 'yok', 'olarak', 'gibi', 'kadar', 'sonra', 'önce', 'her', 'çok', 'daha', 'ama',
  'fakat', 'çünkü', 'yani', 'ise', 'ki', 'mi', 'mı', 'mu', 'mü', 'de', 'da', 'ne', 'niye',
  'neden', 'nasıl', 'hangi', 'tüm', 'bazı', 'hiç', 'şey', 'şu', 'o', 'en', 'göre',
  'üzerinde', 'ilgili', 'merhaba', 'selam', 'lütfen', 'teşekkür', 'teşekkürler', 'rica',
  'iyi', 'günler', 'acaba', 'tekrar', 'hala', 'hâlâ', 'oldu', 'oluyor', 'olmuyor',
  'yapabilir', 'yardımcı', 'yardim', 'yardım', 'talep', 'talebi', 'talepler', 'talebimi',
  'destek', 'konu', 'konusu', 'hakkında', 'beri', 'dolayı', 'sürekli', 'falan', 'filan',
  // generic verbs/adjectives that add noise (keep the noun behind the problem)
  'yeni', 'eski', 'istiyorum', 'istiyoruz', 'istiyor', 'ediyorum', 'ediyoruz', 'ediyor',
  'rica', 'uzaktan', 'çalışırken', 'acil', 'kontrol', 'eder', 'misiniz', 'edermisiniz',
  'veriyor', 'alamıyorum', 'alamıyoruz', 'gelmiyor', 'ayki', 'fazladan', 'yansımış',
  'kopuyor', 'hatası', 'sorunu', 'sorun', 'çıktı', 'mailler', 'lazım', 'gerekli', 'gerek',
  'kullanıcı', 'kullanıcılı', 'plan', 'için', 'bana', 'bende', 'benim', 'ofis', 'office',
  // stemmed/inflected noise that slips through
  'uzak', 'uzaktan', 'takılıyor', 'takılı', 'senkronize', 'tuşlar', 'tuş', 'tutarı', 'tutar',
  // English
  'the', 'and', 'for', 'with', 'this', 'that', 'have', 'has', 'are', 'was', 'were', 'you',
  'your', 'our', 'their', 'from', 'about', 'please', 'thanks', 'thank', 'hello', 'hi',
  'can', 'could', 'would', 'when', 'what', 'why', 'how', 'not', 'but', 'all', 'any', 'some',
  'issue', 'problem', 'help', 'support', 'request', 'need', 'want',
]);

// Nouns that hint at procurement / stock.
const HARDWARE = new Set<string>([
  'mouse', 'fare', 'klavye', 'keyboard', 'monitör', 'monitor', 'ekran', 'yazıcı', 'printer',
  'toner', 'kartuş', 'kablo', 'cable', 'laptop', 'dizüstü', 'bilgisayar', 'pc', 'kulaklık',
  'headset', 'adaptör', 'adapter', 'şarj', 'charger', 'docking', 'webcam', 'kamera',
  'telefon', 'phone', 'mikrofon', 'microphone', 'pil', 'battery', 'hdd', 'ssd', 'ram',
]);

// Verbs/adjectives signalling a failure (used for classification, excluded as keywords).
const FAILURE = new Set<string>([
  'çalışmıyor', 'açılmıyor', 'gelmiyor', 'bozuk', 'arıza', 'arızalı', 'hata', 'hatalı', 'error',
  'kapanıyor', 'donuyor', 'yavaş', 'bağlanamıyorum', 'bağlanmıyor', 'çöktü', 'crash',
  'broken', 'slow', 'fail', 'failed', 'down', 'stuck', 'frozen',
]);

export type ThemeKind = 'hardware' | 'recurring' | 'failure' | 'general';

export interface ThemeInput {
  subject: string;
  message: string;
  category?: string | null;
  userId: string;
}

export interface Theme {
  term: string;
  count: number;
  distinctRequesters: number;
  sampleSubjects: string[];
  kind: ThemeKind;
}

// Conservative Turkish suffix stripping to merge inflected forms (yazıcısı → yazıcı).
const SUFFIXES = ['larını', 'lerini', 'ları', 'leri', 'sının', 'sinin', 'ndan', 'nden', 'dan', 'den', 'tan', 'ten', 'lar', 'ler', 'sı', 'si', 'su', 'sü', 'yı', 'yi', 'yu', 'yü', 'ını', 'ini', 'unu', 'ünü', 'da', 'de'];
function stem(w: string): string {
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  }
  return w;
}

function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFC')
    .split(/[^a-zçğıöşü0-9]+/i)
    .filter(Boolean)
    .map(stem);
}

export function analyzeThemes(items: ThemeInput[], limit = 8): Theme[] {
  const termTickets = new Map<string, Set<number>>();
  const addTerm = (term: string, idx: number) => {
    let set = termTickets.get(term);
    if (!set) termTickets.set(term, (set = new Set()));
    set.add(idx);
  };

  items.forEach((it, idx) => {
    const toks = tokenize(`${it.subject} ${it.message} ${it.category ?? ''}`);
    // Keep the nouns behind a problem: drop stopwords AND failure verbs.
    const meaningful = toks.filter(
      (tk) => tk.length >= 3 && !STOPWORDS.has(tk) && !FAILURE.has(tk) && !/^\d+$/.test(tk),
    );
    const seen = new Set<string>();
    for (const tk of meaningful) {
      if (!seen.has(tk)) {
        addTerm(tk, idx);
        seen.add(tk);
      }
    }
  });

  const scored = [...termTickets.entries()]
    .map(([term, set]) => ({ term, count: set.size, indices: set }))
    .filter((s) => s.count >= 2)
    .sort((a, b) => b.count - a.count || b.term.length - a.term.length);

  const chosen: Theme[] = [];
  const usedWords = new Set<string>();

  for (const s of scored) {
    if (chosen.length >= limit) break;
    const isBigram = s.term.startsWith('bg:');
    const display = isBigram ? s.term.slice(3) : s.term;
    const words = display.split(' ');

    // Skip a theme if any of its words is already covered by a chosen theme
    // (collapses "mouse" + "mouse talebi" into one).
    if (words.some((w) => usedWords.has(w))) continue;

    const idxs = [...s.indices];
    const requesters = new Set(idxs.map((i) => items[i].userId));
    const sampleSubjects = idxs.slice(0, 3).map((i) => items[i].subject);
    const kind: ThemeKind = words.some((w) => HARDWARE.has(w))
      ? 'hardware'
      : requesters.size >= 3
        ? 'recurring'
        : 'general';

    chosen.push({ term: display, count: s.count, distinctRequesters: requesters.size, sampleSubjects, kind });
    words.forEach((w) => usedWords.add(w));
  }

  return chosen;
}
