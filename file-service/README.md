# Dosya Üretim Mikroservisi (`file-service`)

Tek sorumluluğu olan, **veritabanı bağlantısı bulunmayan** durumsuz (stateless)
bir mikroservis: gelen JSON veriden **Excel (.xlsx)** ve **PDF** dosyaları üretir.

Backend bu servise HTTP isteği atar, cevap olarak dosyayı (binary) alır ve
kullanıcıya iletir / e-postaya ekler. Servis hiçbir iş mantığı içermez, veriyi
yorumlamaz — yalnızca verilen kolon ve satırları dosyaya döker.

## Çalıştırma

```bash
npm install
npm run dev          # geliştirme (tsx watch)
npm run build && npm start
```

Docker Compose içinde `file-service` servisi olarak ayağa kalkar (port 4000).

## Ortam değişkenleri

| Değişken             | Varsayılan | Açıklama                                            |
| -------------------- | ---------- | --------------------------------------------------- |
| `PORT`               | `4000`     | Dinlenen port                                       |
| `FILE_SERVICE_TOKEN` | _(boş)_    | Ayarlanırsa `Authorization: Bearer <token>` zorunlu |
| `MAX_JSON_MB`        | `20`       | Kabul edilen maksimum JSON gövde boyutu             |

## API

### `GET /healthz`

```json
{ "status": "ok", "service": "file-service", "db": false }
```

### `POST /generate/excel` → `.xlsx`

### `POST /generate/pdf` → `.pdf`

Ortak istek gövdesi (contract):

```jsonc
{
  "title": "Talepler", // (opsiyonel) PDF başlığı
  "filename": "talepler.xlsx", // (opsiyonel) indirilen dosya adı
  "sheetName": "Talepler", // (opsiyonel) Excel sayfa adı
  "columns": [
    { "header": "Konu", "key": "subject", "width": 30 },
    { "header": "Durum", "key": "status", "width": 12 },
  ],
  "rows": [{ "subject": "Yazıcı çalışmıyor", "status": "open" }],
}
```

Cevap: `Content-Disposition: attachment` ile dosyanın binary içeriği.

### Örnek

```bash
curl -X POST http://localhost:4000/generate/pdf \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","columns":[{"header":"Ad","key":"name"}],"rows":[{"name":"Ali"}]}' \
  --output test.pdf
```
