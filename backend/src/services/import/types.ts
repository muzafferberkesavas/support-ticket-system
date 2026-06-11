// Toplu içe aktarım (import) çerçevesinin ortak tipleri. Çerçeve varlıktan
// (users | tickets) bağımsızdır; her varlık bir ImportAdapter sağlar.

export type ImportEntity = 'users' | 'tickets';

// Bir satırın önizlemedeki durumu.
//  new       → sistemde yok, oluşturulacak
//  exists    → sistemde mevcut (stratejiye göre atlanır/güncellenir)
//  duplicate → dosya içinde daha önce aynı anahtarla geçti
//  error     → zorunlu alan / tip doğrulaması başarısız
export type RowStatus = 'new' | 'exists' | 'duplicate' | 'error';

// Mevcut kayıt çakışmasında uygulanacak strateji.
export type ImportStrategy = 'skip' | 'update' | 'createOnly';

// Doğal anahtarlı (users/email) vs anahtarsız (tickets) varlık ayrımı.
export type DedupStrategy = 'natural-key' | 'none';

export interface PreviewRow {
  index: number; // 1-tabanlı dosya satır numarası (başlık hariç)
  status: RowStatus;
  key: string | null; // dedup anahtarı (ör. e-posta); none ise null
  errors: string[]; // doğrulama hata mesajları
  // Normalize edilmiş, işlenmeye hazır değerler (adapter'a özgü).
  data: Record<string, unknown>;
  // Ham görüntüleme için (UI'da gösterilen birkaç kolon).
  display: Record<string, string>;
}

export interface PreviewSummary {
  total: number;
  new: number;
  exists: number;
  duplicate: number;
  error: number;
}

export interface ImportContext {
  // Adapter'ın doğrulama sırasında ihtiyaç duyduğu DB referans verisi
  // (ör. departman adı → id eşlemesi). preview/import başında bir kez hazırlanır.
  [key: string]: unknown;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { index: number; message: string }[];
}

// Bir varlık için içe aktarım davranışını tanımlayan sözleşme.
export interface ImportAdapter {
  entity: ImportEntity;
  dedupStrategy: DedupStrategy;
  // UI'da gösterilecek kolon anahtarları (display sırası).
  displayColumns: string[];
  // Doğrulama/işleme için DB referans bağlamını hazırlar.
  buildContext(): Promise<ImportContext>;
  // Ham satırı normalize eder + zorunlu alan/tip doğrulaması yapar.
  parseRow(
    raw: Record<string, string>,
    ctx: ImportContext,
  ): { data: Record<string, unknown>; display: Record<string, string>; errors: string[] };
  // Satırın dedup anahtarı (natural-key için); none ise null.
  keyOf(data: Record<string, unknown>): string | null;
  // Verilen anahtarlardan sistemde MEVCUT olanları döndürür (tek sorgu).
  findExistingKeys(keys: string[]): Promise<Set<string>>;
  // Yeni kayıt oluşturur (yan etki: hoşgeldin maili vb. adapter'da tetiklenir).
  create(data: Record<string, unknown>, ctx: ImportContext): Promise<void>;
  // Mevcut kaydı günceller (strategy = update).
  update(data: Record<string, unknown>, ctx: ImportContext): Promise<void>;
}
