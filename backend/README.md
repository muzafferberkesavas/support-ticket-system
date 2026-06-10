# Backend — REST API + WebSocket + Worker

Express + TypeScript + Prisma (PostgreSQL). Hem HTTP API'sini hem de gerçek
zamanlı (Socket.IO) katmanı sunar; ayrı bir **Bull worker** süreci arka plan
işlerini (e-posta, SLA taraması, dışa aktarım) yürütür.

## Çalıştırma

```bash
npm install
npm run dev            # API (tsx watch)
npm run build          # prisma generate + tsc
npm start              # derlenmiş API
npm run worker         # arka plan worker'ı (dist/worker.js)
```

Docker Compose içinde `backend` (API) ve `worker` (aynı imaj, farklı entrypoint)
servisleri olarak çalışır.

## Klasör haritası

| Yol                             | Sorumluluk                                                              |
| ------------------------------- | ----------------------------------------------------------------------- |
| `src/app.ts`, `src/index.ts`    | Express uygulaması ve sunucu girişi                                     |
| `src/routes/`                   | HTTP route tanımları (her kaynak için ayrı dosya)                       |
| `src/controllers/`              | İstek işleyicileri (route → iş mantığı köprüsü)                         |
| `src/services/`                 | İş mantığı (erişim, SLA, mailer, dışa aktarım, dosya servisi istemcisi) |
| `src/middleware/`               | Kimlik doğrulama, hata yönetimi                                         |
| `src/realtime/`                 | Socket.IO kurulumu ve olay yayını                                       |
| `src/queue.ts`, `src/worker.ts` | Bull kuyruğu (üretici) ve worker (tüketici)                             |
| `src/prisma.ts`, `prisma/`      | Prisma istemcisi ve şema/migration'lar                                  |
| `src/schemas.ts`                | Zod doğrulama şemaları                                                  |

Mimari ve istek yaşam döngüsü için → [`../docs/MIMARI.md`](../docs/MIMARI.md).
