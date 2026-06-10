# Katkı ve Geliştirme Rehberi

Bu repo, **Destek Talep Sistemi**'nin tüm bileşenlerini tek yerde tutar. Amaç:
yeni bir geliştirici klonladığında "ne nerede, neden burada" sorularına hızlıca
cevap verebilmek. Mimari ayrıntılar için [`docs/MIMARI.md`](docs/MIMARI.md).

## Depo yapısı

```
.
├── backend/        # REST API + WebSocket + Bull worker (Express + Prisma + TS)
├── frontend/       # Web arayüzü (Vue 3 + PrimeVue + Vite + TS)
├── file-service/   # Dosya üretim mikroservisi (Excel/PDF) — DB bağlantısı YOK
├── proxy/          # HTTPS reverse proxy (nginx) — support.local
├── scripts/        # Yardımcı scriptler (ör. self-signed sertifika üretimi)
├── docs/           # Mimari ve teknik dokümanlar
├── docker-compose.yml
├── .env.example    # Ortam değişkenleri şablonu → `cp .env.example .env`
├── eslint.config.mjs / .prettierrc.json   # Kök lint & format yapılandırması
```

Her servisin kökünde kısa bir `README.md` ve sorumluluk açıklaması vardır.

## Kurulum (yerel)

```bash
cp .env.example .env          # ortam değişkenlerini hazırla
./scripts/gen-certs.sh        # HTTPS için self-signed sertifika üret
echo "127.0.0.1 support.local" | sudo tee -a /etc/hosts
docker compose up -d --build  # tüm servisleri ayağa kaldır
```

Ardından: **https://support.local** (self-signed uyarısını kabul edin).
Demo giriş: `admin@support.local` / `Admin123!`.

## Geliştirme araçları

Kök dizinde lint ve format araçları toplanmıştır:

```bash
npm install            # kök geliştirme araçları (eslint, prettier)
npm run format         # tüm kodu Prettier ile biçimlendir
npm run format:check   # biçim kontrolü (değişiklik yapmadan)
npm run lint           # ESLint (üç paketi de kapsar)
npm run lint:fix       # otomatik düzeltilebilir uyarıları gider
```

Her paket kendi `package.json`'ında ek scriptlere sahiptir (ör. `backend`:
`npm run dev`, `npm run build`; `file-service`: `npm run dev`).

## Kod standartları

- **Yorum dili: Türkçe.** Kod yorumları ve dokümanlar Türkçe yazılır; değişken /
  fonksiyon adları ve teknik terimler İngilizce kalabilir.
- **Biçim: Prettier** (120 sütun, tek tırnak, noktalı virgül). PR açmadan önce
  `npm run format` çalıştırın.
- **Tipler:** `any` mümkün olduğunca kaçınılır; gerekirse yorumla gerekçelendirilir.
- Fonksiyonlar tek bir işi yapacak kadar küçük tutulur; uzun handler'lar yardımcı
  fonksiyonlara bölünür.

## Dal & commit kuralları

- Çalışma `main` dalı üzerinde yürür (tek kişilik onboarding projesi).
- Commit mesajları **conventional commits** biçimindedir:
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Mesajlar Türkçe açıklamalı yazılır; gövdede "ne / neden" belirtilir.

## Güvenlik notları

- Gerçek `.env` repoya **konmaz** (`.gitignore`'da). Şablon `.env.example`'dır.
- TLS sertifikaları (`certs/`) repoya konmaz; `scripts/gen-certs.sh` ile üretilir.
- Gizli bilgiler (SMTP şifresi vb.) `.env.local` içine yazılır.
