# Teknik Dokümantasyon ve Mimari Rehberi

Bu belge, projedeki teknolojileri, kod yapısını ve önemli akışları açıklar. Amaç,
kod tabanına hızlıca hâkim olmanı sağlamaktır.

## İçindekiler

- [1. Genel Bakış](#1-genel-bakış)
- [2. Teknoloji Yığını ve Görevleri](#2-teknoloji-yığını-ve-görevleri)
- [3. Servisler ve İletişim](#3-servisler-ve-iletişim)
- [4. Backend Mimarisi](#4-backend-mimarisi)
- [5. Bir İsteğin Yaşam Döngüsü](#5-bir-isteğin-yaşam-döngüsü)
- [6. Kimlik Doğrulama ve Yetkilendirme](#6-kimlik-doğrulama-ve-yetkilendirme)
- [7. Veri Modeli](#7-veri-modeli)
- [8. Frontend Mimarisi](#8-frontend-mimarisi)
- [9. Önemli Akışlar (Adım Adım)](#9-önemli-akışlar-adım-adım)
- [10. Dosya Haritası: Nereye Bakmalı](#10-dosya-haritası-nereye-bakmalı)
- [11. Yerel Geliştirme İpuçları](#11-yerel-geliştirme-ipuçları)

---

## 1. Genel Bakış

- **Proxy** (nginx): HTTPS reverse proxy. Ürünü kendi domain'imiz (`support.local`) üzerinden, self-signed sertifika ile tek HTTPS origin'inden yayınlar; `/` → frontend, `/api` → backend.
- **Frontend** (Vue 3): Tarayıcıda çalışan tek sayfa uygulaması (SPA).
- **Backend** (Express): REST API + WebSocket sunucusu.
- **Worker** (Bull): Backend/frontend'den bağımsız servis; Redis kuyruğundan iş alıp arka planda çalıştırır (e-posta, günlük özet cron'u, SLA taraması, gecikmeli CSAT, dışa aktarım). Backend ile yalnızca Redis üzerinden haberleşir; ayrıca Bull Board (kuyruk paneli) sunar.
- **file-service** (Express): Dosya üretim mikroservisi. Yalnızca Excel/PDF üretir; **veritabanı bağlantısı YOKTUR**. Backend/worker bu servise HTTP isteği atıp dosyayı (binary) alır.
- **PostgreSQL**: Kalıcı veri.
- **Redis**: Socket.IO pub/sub **ve** Bull iş kuyruğu (backend ↔ worker).
- **SMTP (e-posta)**: Gerçek bir SMTP sunucusu (örn. Gmail) üzerinden e-posta gönderilir; kimlik bilgileri `.env.local` ile verilir.

Hepsi `docker-compose.yml` ile tanımlanır ve tek komutla ayağa kalkar. Kurulum ve HTTPS adımları için kök [`README.md`](../README.md) ve [`CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## 2. Teknoloji Yığını ve Görevleri

### Backend

| Teknoloji                              | Görevi                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Express**                            | HTTP sunucusu ve yönlendirme (routing).                                                             |
| **TypeScript**                         | Tip güvenliği; tüm backend TS ile yazılı, `tsc` ile derlenir.                                       |
| **Prisma ORM**                         | Veritabanı erişimi. `schema.prisma` tek doğruluk kaynağı; tip güvenli sorgular ve migration üretir. |
| **Zod**                                | Gelen istek gövdelerinin doğrulanması (validation). Şemalar `src/schemas.ts`.                       |
| **jsonwebtoken (JWT)**                 | Token üretme/doğrulama. `src/utils/jwt.ts`.                                                         |
| **bcryptjs**                           | Parola hash'leme.                                                                                   |
| **Socket.IO**                          | Gerçek zamanlı iki yönlü iletişim (WebSocket).                                                      |
| **@socket.io/redis-adapter + ioredis** | Birden çok backend instance'ı arasında olay yayını.                                                 |
| **Multer**                             | Dosya yükleme (multipart/form-data).                                                                |
| **Nodemailer**                         | E-posta gönderimi (gerçek SMTP; örn. Gmail).                                                        |
| **Bull (+ Redis)**                     | Arka plan iş kuyruğu (worker tüketir): e-posta, cron, dışa aktarım.                                 |

### file-service (dosya üretim mikroservisi)

| Teknoloji                | Görevi                                                               |
| ------------------------ | -------------------------------------------------------------------- |
| **Express + TypeScript** | Durumsuz HTTP servisi; yalnızca dosya üretir, **DB bağlantısı yok**. |
| **ExcelJS**              | `.xlsx` (Excel) üretimi.                                             |
| **PDFKit**               | Tablo PDF üretimi; Türkçe için DejaVu Sans fontu gömülür.            |
| **Zod**                  | Gelen üretim isteğinin (kolon/satır) doğrulanması.                   |

### Frontend

| Teknoloji                     | Görevi                                                         |
| ----------------------------- | -------------------------------------------------------------- |
| **Vue 3** (Composition API)   | Bileşen tabanlı arayüz. `<script setup>` sözdizimi kullanılır. |
| **TypeScript**                | Tip güvenliği.                                                 |
| **Vite**                      | Geliştirme sunucusu ve üretim derleyicisi.                     |
| **Pinia**                     | Durum yönetimi (auth, ui/tema, bildirimler, realtime).         |
| **Vue Router**                | Sayfa yönlendirme ve erişim guard'ları.                        |
| **PrimeVue**                  | Hazır arayüz bileşenleri (tablo, dialog, grafik vb.) ve tema.  |
| **vue-i18n**                  | Çoklu dil (TR/EN).                                             |
| **Chart.js** (PrimeVue Chart) | Analiz grafikleri.                                             |
| **Socket.IO Client**          | Backend ile gerçek zamanlı bağlantı.                           |
| **Axios**                     | HTTP istekleri; interceptor ile token ekleme ve 401 yönetimi.  |

### Altyapı

- **PostgreSQL 16**, **Redis 7**, **Docker / Docker Compose**.
- **nginx** iki yerde kullanılır: (1) frontend imajında statik dosya sunumu, (2) `proxy` servisinde HTTPS reverse proxy (self-signed TLS, `support.local`).

---

## 3. Servisler ve İletişim

```
Tarayıcı
  │ HTTPS (https://support.local)
  ▼
┌─────────── proxy (nginx, :443/:80) ───────────┐
│  /            → frontend                       │   80 → 443 yönlendirme
│  /api/        → backend                        │
│  /api/socket.io/ → backend (WebSocket)         │
└───────┬───────────────────────┬───────────────┘
        │                       │
        ▼                       ▼
  frontend (nginx, :80)   ┌──── Backend (Express + Socket.IO, :3000) ─────┐
   statik SPA             │  routes → controllers → services → Prisma     │
                          │   ├── PostgreSQL (:5432)  kalıcı veri          │
                          │   ├── Redis (:6379)       Socket.IO + Bull     │
                          │   ├── SMTP (Gmail vb.)    e-posta              │
                          │   ├── uploads volume      dosya ekleri         │
                          │   └── file-service (:4000, HTTP)  Excel/PDF    │
                          └───────────────┬───────────────────────────────┘
                                          │ Redis kuyruğu (Bull)
                                          ▼
                          ┌──── worker (:3001 Bull Board) ────────────────┐
                          │  reply-email, daily-digest (cron),            │
                          │  sla-sweep (cron), csat (gecikmeli), export   │
                          │  ── dışa aktarımda → file-service (HTTP) ──    │
                          └───────────────────────────────────────────────┘
```

- Tarayıcı tek HTTPS origin'i (`https://support.local`) görür; `proxy` isteği `/` ve `/api`'ye göre frontend/backend'e yönlendirir. **CORS** `CORS_ORIGIN` ile bu origin'e izin verir.
- Servisler Docker ağında **servis adıyla** haberleşir: backend → `postgres`, `redis`, `file-service`.
- WebSocket ve REST **aynı HTTP sunucusunu** paylaşır (`src/index.ts`); proxy `/api/socket.io/` yolunu websocket upgrade ile geçirir.
- **file-service** durumsuzdur ve DB'ye bağlanmaz; backend (senkron indirme) ve worker (e-posta eki) ona HTTP ile istek atar.

---

## 4. Backend Mimarisi

Katmanlı yapı: **route → controller → service → prisma**. Her katmanın tek sorumluluğu vardır.

```
src/
├── index.ts            HTTP sunucusu kurar ve Socket.IO'yu başlatır (SLA taraması worker'da çalışır).
├── app.ts              Express uygulaması: middleware'ler + route bağlama.
├── env.ts              Ortam değişkenlerini Zod ile doğrular (eksikse uygulama başlamaz).
├── prisma.ts           Tek PrismaClient örneği (singleton).
├── schemas.ts          Tüm istek doğrulama şemaları (Zod).
├── seed.ts             İlk açılışta admin + departman + örnek veri ekler.
│
├── middleware/
│   ├── auth.ts         authenticate (JWT doğrula), requireStaff/requireManager/requireAdmin.
│   └── errorHandler.ts Tüm hataları tek tip JSON'a çevirir (Zod, Prisma, multer, AppError).
│
├── routes/             Her kaynak için URL → controller eşlemesi. Sadece yönlendirme.
│
├── controllers/        İş mantığı giriş noktası: isteği parse et, servisleri çağır, yanıt dön.
│   ├── auth.controller.ts
│   ├── ticket.controller.ts      (en büyük; CRUD + atama + eskalasyon + yanıt + CSAT)
│   ├── department / user / notification / analytics / canned / attachment .controller.ts
│
├── queue.ts            Bull kuyruğu: iş türleri + üreticiler (backend) ve cron tanımları.
├── worker.ts           Bağımsız worker süreci: kuyruktan iş tüketir, Bull Board sunar.
│
├── services/           Yeniden kullanılabilir iş kuralları (controller'lardan bağımsız).
│   ├── access.ts       Görünürlük/yetki: kim hangi talebi görebilir (buildTicketScope, canAccessTicket).
│   ├── sla.ts          SLA hedefleri ve hesap (computeSla, withSla).
│   ├── slaSweep.ts     SLA aşan açık talepleri otomatik eskale eder + bayat talep hatırlatır (worker cron'u çağırır).
│   ├── autoAssign.ts   En az yüklü temsilciyi seçer.
│   ├── estimate.ts     Geçmiş verilerden tahmini süre üretir.
│   ├── audit.ts        Aktivite kaydı (fire-and-forget).
│   ├── notifications.ts Bildirimi DB'ye yazar + ilgili kullanıcılara socket ile gönderir.
│   ├── mailer.ts       Nodemailer ile e-posta (hoşgeldin, yanıt, şifre sıfırlama, dışa aktarım eki).
│   ├── exportData.ts   Talep dışa aktarımının ortak veri katmanı (kolon sözleşmesi + filtre + CSV).
│   ├── fileService.ts  file-service mikroservisi için HTTP istemcisi (Excel/PDF → Buffer).
│   ├── upload.ts       Multer yapılandırması (boyut/tip limitleri).
│   └── textAnalysis.ts Tekrarlayan problem analizi (kelime frekansı + temalar).
│
├── realtime/socket.ts  Socket.IO sunucusu: JWT handshake, odalar, presence/typing, emit yardımcıları.
└── utils/              AppError, asyncHandler, jwt yardımcıları.
```

> **Backend ↔ worker:** İkisi de aynı imajdan çalışır ama farklı entrypoint'lere sahiptir
> (`index.ts` vs `worker.ts`). Aralarında doğrudan HTTP yoktur; haberleşme **yalnızca Redis
> (Bull kuyruğu)** üzerindendir. Üretici tarafı `queue.ts` (backend çağırır), tüketici tarafı
> `worker.ts`.

**Neden bu ayrım?** Controller'lar "ne yapılacağını" (akış), servisler "nasıl yapılacağını" (kural)
bilir. Örneğin bir talebin kimlere görünür olduğu kuralı yalnızca `access.ts` içindedir; hem
`listTickets` hem `getTicket` hem de Socket.IO bunu çağırır. Böylece kural tek yerde tutulur.

---

## 5. Bir İsteğin Yaşam Döngüsü

Örnek: `POST /tickets` (talep oluşturma).

1. **Route** (`routes/ticket.routes.ts`): `router.use(authenticate)` ile önce token doğrulanır,
   sonra `createTicket` controller'ına yönlendirilir. `asyncHandler` sarmalayıcısı, async
   hataları otomatik olarak error middleware'e iletir.
2. **Middleware** (`auth.ts`): `Authorization: Bearer <token>` başlığı doğrulanır, `req.user`
   doldurulur. Token yoksa/geçersizse 401.
3. **Controller** (`ticket.controller.ts → createTicket`): gövde `createTicketSchema` (Zod) ile
   doğrulanır; departman ve atananlar kontrol edilir; Prisma ile talep oluşturulur.
4. **Servisler**: departman varsa `autoAssign.pickLeastLoadedAgent` çağrılır; `audit` kaydı
   yazılır; `notifications.notifyDepartment` ile ilgili personele bildirim gönderilir;
   `emitTicketCreated` ile canlı olay yayınlanır.
5. **Yanıt**: `withSla(ticket)` ile SLA bilgisi eklenip 201 ile döner.
6. **Hata olursa**: herhangi bir katmanda fırlatılan hata `errorHandler`'a düşer ve uygun HTTP
   koduyla (422 doğrulama, 403 yetki, 404 bulunamadı, 409 çakışma, 500 beklenmedik) tek tip
   JSON'a çevrilir.

---

## 6. Kimlik Doğrulama ve Yetkilendirme

- **Kayıt/Giriş**: Parola `bcrypt` ile hash'lenir. Başarılı girişte `signToken` bir **JWT**
  üretir (`sub`, `email`, `role` taşır). Frontend token'ı `localStorage`'da saklar ve Axios
  interceptor'ı her isteğe `Authorization: Bearer` ekler.
- **Doğrulama**: `authenticate` middleware token'ı çözüp `req.user`'a yazar.
- **Roller**: `user` (müşteri), `agent` (temsilci), `team_lead` (takım lideri), `admin`.
  `requireStaff` (agent/team_lead/admin), `requireManager` (team_lead/admin), `requireAdmin`
  middleware'leri rota seviyesinde koruma sağlar.
- **Görünürlük (kayıt seviyesi yetki)**: `services/access.ts`. `buildTicketScope` bir kullanıcının
  görebileceği talepleri Prisma `where` koşuluna çevirir:
  - admin → tümü
  - personel → kendi departman(lar)ı + atandığı + oluşturduğu talepler
  - müşteri → yalnızca kendi oluşturdukları
    `canAccessTicket` ise tekil bir talebe erişimi kontrol eder.
- **Gerçek zamanlı yetki**: Socket.IO bağlantısı da JWT ile doğrulanır (handshake `auth.token`),
  ve odalar buna göre kurulur (aşağıda).
- **Parola akışları**: "şifremi unuttum" e-posta ile token üretir (`password_reset_tokens`),
  "ilk girişte zorunlu değiştirme" `mustChangePassword` bayrağıyla yönlendirir.

---

## 7. Veri Modeli

Prisma şeması: `backend/prisma/schema.prisma`. Başlıca tablolar ve ilişkiler:

```
User ──< Ticket (requester)            Bir kullanıcı çok talep oluşturur
User ──< DepartmentMember >── Department   Çoktan-çoğa üyelik
Department ──< Ticket                   Talep bir departmana yönlendirilebilir
Ticket ──< TicketAssignee >── User       Talebe atanan personel(ler)
Ticket ──< TicketReply >── User (author) Yanıtlar (isInternal: dahili not)
Ticket ──< Attachment                   Dosya ekleri (meta veri; dosya volume'da)
User ──< Notification                   Kalıcı bildirimler
CannedResponse                          Hazır yanıt şablonları (departman/global)
AuditLog                                Aktivite kaydı (FK yok; talep silinse de kalır)
PasswordResetToken                      Şifre sıfırlama
```

Önemli `Ticket` alanları: `subject, message, priority, status, category, departmentId,
createdAt, firstResponseAt, resolvedAt` (SLA hesabı için), `escalated/escalatedAt`,
`csatRating/csatComment/csatAt` (memnuniyet).

Enum'lar: `Role` (user/agent/team_lead/admin), `Priority` (low/medium/high),
`Status` (open/in_progress/closed).

> Not: SLA bilgisi (`sla` alanı) **veritabanında saklanmaz**; her okumada `createdAt`,
> `firstResponseAt`, `resolvedAt` ve önceliğe bakılarak `services/sla.ts` ile hesaplanıp
> yanıta eklenir.

---

## 8. Frontend Mimarisi

```
src/
├── main.ts             Vue uygulamasını, Pinia/Router/PrimeVue/i18n eklentilerini başlatır.
├── App.vue             Kök bileşen; layout seçer ve sayfa geçiş animasyonu uygular.
│
├── router/index.ts     Rotalar + guard'lar (requiresAuth, requiresAdmin/Manager, guestOnly,
│                       mustChangePassword zorunluluğu).
│
├── stores/             Pinia store'ları:
│   ├── auth.ts          token + kullanıcı, login/register/logout, rol getter'ları.
│   ├── ui.ts            tema (dark mode) ve dil; tercih localStorage'da.
│   ├── notifications.ts bildirim listesi + okunmamış sayısı.
│   └── realtime.ts      typing/presence durumu + ticket odasına abone olma.
│
├── services/           Backend ile konuşan ince katman (Axios):
│   ├── api.ts           Axios örneği + token interceptor + 401 yönetimi + hata mesajı çıkarımı.
│   ├── ticket / department / user / notification / canned / analytics .service.ts
│   └── socket.ts        Socket.IO client (autoConnect kapalı; token ile bağlanır).
│
├── composables/        Yeniden kullanılabilir mantık: useDuration (süre formatı),
│                       useNotificationText (bildirim metni).
│
├── components/         Tekrar kullanılan bileşenler: PriorityTag, StatusTag, SlaBadge,
│                       AttachmentList, CannedMenu, RealtimeBridge (global bildirim köprüsü),
│                       TicketFormDialog, BrandLogo ...
│
├── layouts/AppLayout.vue   Kenar çubuğu + üst bar + kullanıcı menüsü + bildirim zili.
│
├── views/              Sayfalar: Login, Register, ForgotPassword, ResetPassword,
│                       ChangePassword, Tickets, TicketDetail, Departments, Users,
│                       Notifications, Analytics, NotFound.
│
└── i18n/               vue-i18n kurulumu + locales/tr.ts, en.ts (tüm arayüz metinleri).
```

**Veri akışı (frontend)**: `view` → ilgili `service` çağrısı → Axios isteği → backend.
Global durum (oturum, tema, bildirim) `store`'larda; anlık olaylar `socket.ts` üzerinden
gelir ve `RealtimeBridge.vue` ile toast/bildirime dönüşür.

---

## 9. Önemli Akışlar (Adım Adım)

### Talep oluşturma + otomatik atama

1. Müşteri formu doldurur (TicketFormDialog) → `ticketService.create`.
2. Backend talebi oluşturur; departman seçiliyse `autoAssign` en az yüklü temsilciyi atar.
3. `audit` kaydı yazılır, departmana **bildirim** gider, **canlı olay** yayınlanır.
4. Departmandaki personelin listesi anında güncellenir, zil rozeti artar.

### SLA ve eskalasyon

1. Her talebin önceliğine göre yanıt/çözüm hedefi vardır (`SLA_TARGETS`, `sla.ts`).
2. Liste ve detayda SLA durumu (yaş, kalan süre, "SLA aşıldı") gösterilir.
3. Worker'daki SLA tarama cron'u (`services/slaSweep.ts`) çözüm süresini aşan açık talepleri
   **otomatik eskale eder** (öncelik yükseltir, bildirir) ve bayat talepleri hatırlatır.
4. Personel ayrıca **manuel** eskale edebilir (`PATCH /tickets/:id/escalate`).

### Gerçek zamanlı (Socket.IO)

1. Giriş yapınca `RealtimeBridge` socket'i token ile bağlar.
2. Sunucu, kullanıcıyı `user:{id}`, personeli `dept:{id}`, talep detayını açanları `ticket:{id}`
   odalarına ekler. Dahili notlar yalnızca `ticket:{id}:staff` odasına gider.
3. Yeni yanıt/güncelleme ilgili odalara yayınlanır; "yazıyor" ve "kim görüntülüyor" (presence)
   olayları detay ekranında gösterilir.
4. Bildirimler hem **toast** olarak çıkar hem de kalıcı listeye eklenir.

### Dosya ekleri

1. Form/detayda dosya seçilir → `POST /tickets/:id/attachments` (multipart, Multer).
2. Dosya **Docker volume**'a yazılır; meta veri `attachments` tablosuna kaydedilir.
3. İndirme `GET /attachments/:id` ile erişim kontrollü yapılır; görseller önizlenir
   (frontend dosyayı yetkili biçimde `blob` olarak çeker).

### Analiz ve tekrarlayan problem

1. `GET /analytics` (yönetici/admin) tüm talepleri tarayıp KPI, grafik verisi, personel
   performansı ve SLA/CSAT metriklerini üretir.
2. `textAnalysis.ts` talep metinlerini tokenize eder, stopword'leri ayıklar, sık geçen
   temaları bulur ve türüne göre (donanım/tekrarlayan) tavsiye üretilmesini sağlar.

### Dosya dışa aktarımı (Excel/PDF — file-service mikroservisi)

Dosya üretimi backend'den ayrılmıştır: **veritabanı bağlantısı olmayan** `file-service`
yalnızca verilen kolon/satırları dosyaya döker. İki yol vardır:

1. **Senkron indirme** (Ayarlar → "Excel indir / PDF indir"):
   `POST /jobs/export/download` → controller `exportData.ts` ile yetkiye göre veriyi toplar →
   `fileService.ts` mikroservise HTTP isteği atar → dönen dosyayı (Buffer) doğrudan tarayıcıya
   stream eder.
2. **E-posta ile (asenkron)**: `POST /jobs/export` worker'a iş bırakır. Worker veriyi toplar,
   CSV'yi yerel üretir; **Excel/PDF için file-service'e gider** ve dosyayı e-posta eki olarak
   gönderir (`format`: `csv` | `excel` | `pdf`).

Böylece ağır/izole dosya üretimi ana servisten ayrılır; mikroservis durumsuz ve DB'siz kalır.

### HTTPS / kendi domain (self-signed)

1. `scripts/gen-certs.sh`, `support.local` için self-signed sertifika üretir (`certs/`, git'e
   konmaz). `/etc/hosts`'a `127.0.0.1 support.local` eklenir.
2. `proxy` (nginx) 443'te TLS sonlandırır; `/` → frontend, `/api/` → backend, `/api/socket.io/`
   → websocket. HTTP (80) kalıcı olarak HTTPS'e (443) yönlendirilir.
3. Frontend `VITE_API_URL=https://support.local/api` ile aynı origin üzerinden konuşur;
   `socket.ts` yol öneki (`/api`) için Socket.IO `path`'ini ayarlar.

---

## 10. Dosya Haritası: Nereye Bakmalı

| İhtiyaç                         | Dosya                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| Yeni bir endpoint eklemek       | `routes/*.routes.ts` + ilgili `controllers/*.controller.ts`                     |
| İstek doğrulama kuralı          | `schemas.ts` (Zod)                                                              |
| "Kim neyi görebilir" kuralı     | `services/access.ts`                                                            |
| SLA hedefleri / hesabı          | `services/sla.ts`                                                               |
| Gerçek zamanlı olaylar / odalar | `realtime/socket.ts`                                                            |
| Bildirim mantığı                | `services/notifications.ts`                                                     |
| Veri modeli değişikliği         | `prisma/schema.prisma` + yeni migration                                         |
| Arka plan işi / cron            | `backend/src/queue.ts` (üretici) + `backend/src/worker.ts` (tüketici)           |
| Talep dışa aktarımı (veri)      | `backend/src/services/exportData.ts`                                            |
| Dosya üretimi (Excel/PDF)       | `file-service/src/{excel,pdf}.ts` + backend `services/fileService.ts` (istemci) |
| HTTPS / domain / proxy          | `proxy/nginx.conf` + `scripts/gen-certs.sh`                                     |
| Arayüz metni (TR/EN)            | `frontend/src/i18n/locales/*.ts`                                                |
| Bir sayfanın mantığı            | `frontend/src/views/*.vue`                                                      |
| Backend ile konuşan kod         | `frontend/src/services/*.ts`                                                    |
| Oturum/tema/bildirim durumu     | `frontend/src/stores/*.ts`                                                      |

---

## 11. Yerel Geliştirme İpuçları

```bash
# İlk kurulum: env + sertifika + hosts
cp .env.example .env
./scripts/gen-certs.sh
echo "127.0.0.1 support.local" | sudo tee -a /etc/hosts

# Tüm servisler ayağa
docker compose up --build        # → https://support.local

# Sadece backend'i yeniden derle/başlat (kod değiştikçe)
docker compose up -d --build backend

# Logları izle
docker compose logs -f backend          # ya da: worker | file-service | proxy

# Veritabanına göz at
docker compose exec backend npx prisma studio

# Kök araçlar (kod kalitesi)
npm run lint        # ESLint (üç paket)
npm run format      # Prettier

# Şemayı sıfırla (tüm veri silinir, yeniden seed'lenir)
docker compose down -v && docker compose up --build
```

- Backend kod değişikliği → ilgili imajı yeniden build et (`--build`).
- Şema değişikliği → `schema.prisma`'yı güncelle, `prisma/migrations/` altına yeni bir
  migration ekle; açılışta `prisma migrate deploy` otomatik uygular.
- Frontend `VITE_API_URL` **build sırasında** gömülür; değişirse frontend'i yeniden build et.
- E-posta gönderimi için gerçek SMTP (Gmail) bilgilerini `.env.local`'e yazın; ayrıntı README'de.

> Daha fazla kullanım/kurulum bilgisi için kök dizindeki `README.md` dosyasına bakın.
