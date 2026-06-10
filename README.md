# Destek Talep Sistemi (Support Ticket System)

Kullanıcı bazlı çalışan, gerçek zamanlı bir destek talep (helpdesk) uygulaması. Görevde istenen temel gereksinimleri (Vue 3 + TypeScript, Express + TypeScript, PostgreSQL, JWT, Docker Compose) karşılar; bunların üzerine rol/departman bazlı yetkilendirme, SLA takibi, otomatik atama, dosya ekleri, canlı bildirimler ve analiz paneli gibi özellikler ekler.

Klonlayıp tek komutla ayağa kalkar (ortam değişkenleri için ek bir adım gerekmez; `.env` repoya dahildir):

```bash
git clone https://github.com/muzafferberkesavas/support-ticket-system
cd support-ticket-system
docker compose up --build
```

Frontend: http://localhost:5173 — Backend: http://localhost:3000

> Kod yapısını ve mimariyi ayrıntılı anlatan teknik rehber: [docs/MIMARI.md](docs/MIMARI.md)

## İçindekiler

- [Genel Bilgi](#genel-bilgi)
- [Özellikler](#özellikler)
- [Proje Yapısı](#proje-yapısı)
- [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
- [Ortam Değişkenleri](#ortam-değişkenleri)
- [Veritabanı ve Migration](#veritabanı-ve-migration)
- [Demo Hesapları](#demo-hesapları)
- [Roller ve Yetkilendirme](#roller-ve-yetkilendirme)
- [API Dokümantasyonu](#api-dokümantasyonu)
- [Gerçek Zamanlı (WebSocket)](#gerçek-zamanlı-websocket)
- [Test ve Debug](#test-ve-debug)

## Genel Bilgi

### Amaç

Kullanıcıların destek talebi oluşturup takip edebildiği, personelin bu talepleri yönetip yanıtladığı bir sistemdir. Her talep `subject`, `message`, `priority` (low/medium/high), `status` (open/in_progress/closed) ve `createdAt` alanlarını içerir. Kimlik doğrulama JWT ile yapılır; kullanıcılar yalnızca kendi taleplerini, personel ise yetkili oldukları talepleri görür.

### Kullanılan Teknolojiler

| Katman | Teknoloji |
| --- | --- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, PrimeVue, vue-i18n, Chart.js, Socket.IO Client, Axios |
| Backend | Node.js, Express, TypeScript, Prisma ORM, Zod, JWT (jsonwebtoken), bcrypt, Socket.IO, Multer, Nodemailer |
| Worker | Node.js, **Bull** (Redis tabanlı iş kuyruğu), cron (tekrarlayan işler) |
| Veritabanı | PostgreSQL 16 |
| Diğer servisler | Redis 7 (Socket.IO adapter + Bull kuyruğu) |
| E-posta | Nodemailer ile gerçek SMTP (örn. Gmail) |
| Container | Docker, Docker Compose, nginx (frontend statik sunum) |

### Yapı

- **Frontend** — Vue 3 + TypeScript SPA. Vite ile derlenip nginx üzerinden sunulur. Pinia ile durum yönetimi, Vue Router ile yönlendirme ve route guard'lar, vue-i18n ile TR/EN dil desteği, PrimeVue ile arayüz bileşenleri kullanılır. API istekleri Axios, gerçek zamanlı iletişim Socket.IO Client ile yapılır.
- **Backend** — Express + TypeScript REST API. Katmanlı mimari: `routes -> controllers -> services -> prisma`. Kimlik doğrulama JWT, doğrulama Zod ile yapılır. Socket.IO aynı HTTP sunucusuna bağlanır.
- **Worker** — Backend ve frontend'den **bağımsız** bir servis. Bull (Redis) üzerinden iş kuyruğunu dinler; uzun süren / kullanıcıyı bekletmemesi gereken işleri (e-posta gönderimi, günlük özet) arka planda çalıştırır. Backend ile **yalnızca Redis üzerinden** haberleşir (aralarında HTTP yoktur). Cron ile tekrarlayan işleri (günlük özet) zamanlar.
- **Veritabanı** — PostgreSQL. Şema ve migration'lar Prisma ORM ile yönetilir; backend PostgreSQL'e Docker Compose servis adı (`postgres`) üzerinden bağlanır.

## Özellikler

Temel (görev gereksinimleri):

- JWT ile kayıt ve giriş; kullanıcı yalnızca kendi taleplerini görür.
- Talep CRUD: oluşturma, listeleme, detay görüntüleme, güncelleme, silme.
- Duruma ve önceliğe göre filtreleme, serbest metin arama.
- High öncelikli talepler listede görsel olarak ayırt edilir.
- Frontend ve backend tarafında form doğrulama; hatalar kullanıcıya gösterilir.
- `/healthz` healthcheck endpoint'i ve Docker Compose healthcheck tanımları.

Ek olarak geliştirilen özellikler:

- Roller (müşteri, temsilci, takım lideri, yönetici) ve departman bazlı görünürlük/yetkilendirme.
- Talebin bir departmana veya departmandaki belirli kişilere yönlendirilmesi; en az yüklü temsilciye otomatik atama.
- SLA takibi (önceliğe göre yanıt/çözüm hedefi), yaşlanma göstergesi; manuel ve SLA aşımında otomatik eskalasyon.
- Dahili not (yalnızca personel) ile müşteri yanıtı ayrımı, hazır yanıt (makro) şablonları.
- Dosya/fotoğraf ekleri (görsel önizleme ve indirme).
- Gerçek zamanlı güncellemeler: canlı yanıt akışı, "yazıyor" göstergesi, kim görüntülüyor bilgisi, anlık bildirimler.
- Talep kapanışında müşteri memnuniyeti (CSAT) değerlendirmesi.
- Yönetici/admin için analiz paneli: KPI'lar, grafikler, personel performansı, tekrarlayan problem analizi, SLA uyum oranı, CSV/PDF dışa aktarım.
- Aktivite/audit kaydı, kullanıcı yönetimi, şifre sıfırlama (e-posta), ilk girişte zorunlu şifre değiştirme.
- Dark mode, TR/EN dil desteği.

## Proje Yapısı

```
.
├── docker-compose.yml          postgres, redis, backend, worker, frontend
├── .env                        ortam değişkenleri (repoda, dev varsayılanları)
├── README.md
│
├── backend/                    Node.js + Express + TypeScript
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma        veri modeli
│   │   └── migrations/          SQL migration'ları
│   └── src/
│       ├── index.ts             HTTP + Socket.IO sunucusu
│       ├── worker.ts            Bağımsız Bull worker (e-posta + günlük özet cron)
│       ├── queue.ts             Bull kuyruğu (backend producer / worker consumer)
│       ├── app.ts               Express app, route bağlama
│       ├── env.ts               Zod ile env doğrulama
│       ├── seed.ts              admin + departman + örnek veri
│       ├── middleware/          auth (JWT), errorHandler
│       ├── controllers/         auth, ticket, department, user, notification, analytics, canned, attachment, sla, dashboard, jobs
│       ├── services/            access, sla, autoAssign, estimate, audit, notifications, scheduler, mailer, upload, textAnalysis
│       ├── realtime/socket.ts   Socket.IO (oda, JWT handshake, presence/typing)
│       └── routes/
│
└── frontend/                   Vue 3 + TypeScript + Vite
    ├── Dockerfile, nginx.conf
    └── src/
        ├── router/ stores/ services/ composables/ i18n/
        ├── components/          PriorityTag, SlaBadge, AttachmentList, CannedMenu, RealtimeBridge, ...
        ├── layouts/AppLayout.vue
        └── views/               Login, Register, ForgotPassword, ResetPassword, ChangePassword,
                                  Tickets, TicketDetail, Departments, Users, Notifications, Analytics
```

## Kurulum ve Çalıştırma

Önkoşul: Docker ve Docker Compose.

### 1. Ortam değişkenleri

Ortam değişkenleri `.env` dosyası ile yönetilir. Bu dosya, geliştirme için güvenli varsayılan değerlerle birlikte repoya dahildir; dolayısıyla klonladıktan sonra ayrı bir kopyalama adımına gerek yoktur. `JWT_SECRET` gibi değerleri gerçek bir ortamda değiştirin. Kişisel değişiklikleriniz için `.env.local` kullanabilirsiniz (git'e dahil edilmez).

### 2. Docker Compose ile çalıştırma

```bash
docker compose up --build
```

Bu komut postgres, redis, backend, worker ve frontend servislerini ayağa kaldırır.

### 3. Veritabanı tabloları

Backend açılışta migration'ları otomatik uygular (`prisma migrate deploy`) ve örnek veriyi (admin kullanıcı, departmanlar, örnek personel ve demo talepler) ekler. Manuel işlemler:

```bash
# Migration'ları elle uygulamak
docker compose exec backend npx prisma migrate deploy

# Veriye göz atmak (Prisma Studio)
docker compose exec backend npx prisma studio

# Şemayı sıfırdan kurmak (tüm veriyi siler)
docker compose down -v && docker compose up --build
```

### Servisler

| Servis | URL | Not |
| --- | --- | --- |
| **Proxy (HTTPS)** | **https://support.local** | Ürünün asıl adresi — self-signed TLS reverse proxy |
| Frontend | (proxy arkasında) | Vue arayüzü, proxy `/` ile sunar |
| Backend | https://support.local/api · http://localhost:3000 | REST API + WebSocket |
| **file-service** | (iç ağ, port 4000) | Excel/PDF üreten mikroservis — **DB bağlantısı YOK** |
| Worker | http://localhost:3001/admin/queues | Bağımsız Bull worker + Bull Board kuyruk paneli |
| PostgreSQL | localhost:5432 | postgres / postgres |
| Redis | localhost:6379 | Socket.IO adapter + Bull kuyruğu |

E-postalar gerçek bir SMTP sunucusu (örn. Gmail) ile gönderilir; kurulum için aşağıdaki
"Gerçek SMTP" bölümüne bakın. SMTP yapılandırılmazsa uygulama çalışır, yalnızca e-posta
gönderimi devre dışı kalır.

### HTTPS — kendi domain üzerinden (self-signed)

Ürün, `support.local` domaini üzerinden HTTPS ile sunulur (nginx reverse proxy + self-signed
sertifika). Tek seferlik kurulum:

```bash
# 1) Self-signed sertifikayı üret (certs/ altına yazılır, git'e dahil edilmez)
./scripts/gen-certs.sh

# 2) Domaini yerel olarak çözümle — /etc/hosts'a ekle:
#    127.0.0.1 support.local
echo "127.0.0.1 support.local" | sudo tee -a /etc/hosts

# 3) Stack'i ayağa kaldır
docker compose up -d --build
```

Ardından tarayıcıda **https://support.local** açılır (self-signed olduğu için ilk
girişte tarayıcı güvenlik uyarısını kabul edin). Proxy yönlendirmeleri: `/` → frontend,
`/api/` → backend, `/api/socket.io/` → WebSocket. HTTP (80) otomatik olarak HTTPS'e (443)
yönlendirilir.

### Dosya üretim mikroservisi (`file-service`)

Talepler **Excel** ve **PDF** olarak, veritabanı bağlantısı bulunmayan ayrı bir
mikroservis tarafından üretilir. Backend/worker bu servise HTTP isteği atar, cevap
olarak dosyayı (binary) alır:

- **Senkron indirme:** Ayarlar sayfasındaki "Excel indir / PDF indir" butonları
  `POST /api/jobs/export/download` → backend → file-service → dosya anında iner.
- **E-posta ile (async):** `POST /api/jobs/export` worker'a iş bırakır; worker
  file-service'ten dosyayı alıp e-postaya ekler (`format`: `csv` | `excel` | `pdf`).

Mikroservisin kendi dokümantasyonu için `file-service/README.md` dosyasına bakın.

## Ortam Değişkenleri

Tümü `.env` dosyasında açıklamalı olarak yer alır. Başlıcaları:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/support_db
JWT_SECRET=change_me_to_a_long_random_secret
JWT_EXPIRES_IN=7d
PORT=3000
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
ADMIN_EMAIL=admin@support.local
ADMIN_PASSWORD=Admin123!
REDIS_URL=redis://redis:6379
SMTP_HOST=smtp.gmail.com         # gerçek SMTP sunucusu
SMTP_PORT=587
SMTP_USER=                       # .env.local içinde doldurulur (repoya gitmez)
SMTP_PASS=
SMTP_SECURE=false
MAIL_FROM=Destek Merkezi <no-reply@support.local>
APP_URL=http://localhost:5173
DIGEST_CRON=0 8 * * *            # Worker'ın günlük özet cron'u
MAX_UPLOAD_MB=10
VITE_API_URL=http://localhost:3000
```

### Gerçek SMTP (örn. Gmail) kurulumu

E-postalar gerçek bir SMTP sunucusu üzerinden gönderilir. Gizli bilgiler (kullanıcı/şifre)
**repoya konmaz**; bunun yerine git'e dahil edilmeyen `.env.local` dosyasına yazılır ve iki
env-file birlikte yüklenir.

1. **Gmail Uygulama Şifresi oluşturun.** Google hesabınızda 2 Adımlı Doğrulama açıkken
   https://myaccount.google.com/apppasswords adresinden 16 haneli bir şifre üretin.
2. **`.env.local` oluşturun** (proje kökünde; `.gitignore`'da):

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=adresiniz@gmail.com
   SMTP_PASS=xxxx xxxx xxxx xxxx          # Gmail Uygulama Şifresi
   MAIL_FROM=Destek Merkezi <adresiniz@gmail.com>
   ```

3. **İki env-file ile başlatın** (`.env.local` değerleri `.env`'i ezer):

   ```bash
   docker compose --env-file .env --env-file .env.local up -d --build
   ```

> Not: Gmail, gönderen adresini kimliği doğrulanan hesaba sabitler; bu yüzden `MAIL_FROM`'u
> da Gmail adresinizle ayarlamak en sağlıklısıdır. SMTP yapılandırılmazsa uygulama yine
> çalışır, sadece e-posta gönderimi atlanır (hata fırlatmaz).

## Veritabanı ve Migration

Şema Prisma ile yönetilir. Başlıca tablolar:

| Tablo | Açıklama |
| --- | --- |
| `users` | Kullanıcı (email, parola hash, rol) |
| `departments`, `department_members` | Departmanlar ve üyelikleri |
| `tickets` | Talepler (subject, message, priority, status, createdAt, SLA alanları) |
| `ticket_assignees` | Talep-temsilci atamaları |
| `ticket_replies` | Yanıtlar ve dahili notlar |
| `attachments` | Dosya ekleri (meta veri; dosyalar volume'da) |
| `notifications` | Kalıcı bildirimler |
| `canned_responses` | Hazır yanıt şablonları |
| `audit_logs` | Aktivite kaydı |
| `password_reset_tokens` | Şifre sıfırlama token'ları |

Enum değerleri: `priority` = low/medium/high, `status` = open/in_progress/closed, `role` = user/agent/team_lead/admin.

## Demo Hesapları

| Rol | E-posta | Şifre |
| --- | --- | --- |
| Yönetici (Admin) | admin@support.local | Admin123! |
| Takım Lideri (Teknik) | tech.lead@support.local | Agent123! |
| Temsilci (Teknik) | tech.agent@support.local | Agent123! |
| Temsilci (Faturalama) | billing.agent@support.local | Agent123! |
| Müşteri | musteri1@firma.com ... musteri10@firma.com | User123! |

Kayıt ekranından yeni müşteri de oluşturulabilir. Admin'in oluşturduğu kullanıcıların geçici şifresi, SMTP yapılandırılmışsa e-posta ile gönderilir.

## Roller ve Yetkilendirme

| Yetenek | Müşteri | Temsilci | Takım Lideri | Admin |
| --- | :---: | :---: | :---: | :---: |
| Talep oluşturma | Evet | Evet | Evet | Evet |
| Talepleri görme | Kendi | Departmanı + atananları | Departmanı | Tümü |
| Yanıt verme | Kendi talebinde | Evet | Evet | Evet |
| Dahili not | - | Evet | Evet | Evet |
| Atama / durum değiştirme | - | Evet | Evet | Evet |
| Eskalasyon | - | Evet | Evet | Evet |
| CSAT değerlendirme | Evet (kapanışta) | - | - | - |
| Analiz paneli | - | - | Kendi departmanı | Tümü |
| Departman / kullanıcı yönetimi | - | - | - | Evet |

## API Dokümantasyonu

Base URL: `http://localhost:3000`. Kimlik gerektiren uçlarda header: `Authorization: Bearer <token>`.

### Auth endpoint'leri

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| POST | /auth/register | Kullanıcı kaydı |
| POST | /auth/login | Kullanıcı girişi |
| GET | /auth/me | Mevcut kullanıcı |
| POST | /auth/change-password | Şifre değiştirme (oturum gerektirir) |
| POST | /auth/forgot-password | Sıfırlama bağlantısı gönderir |
| POST | /auth/reset-password | Token ile yeni şifre |

### Ticket endpoint'leri

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| GET | /tickets | Talepleri listeleme (filtreler: status, priority, departmentId, search) |
| GET | /tickets/:id | Talep detayını görüntüleme |
| POST | /tickets | Talep oluşturma |
| PUT | /tickets/:id | Talep güncelleme |
| DELETE | /tickets/:id | Talep silme |
| PATCH | /tickets/:id/assign | Atama (personel) |
| PATCH | /tickets/:id/escalate | Eskalasyon (personel) |
| POST | /tickets/:id/replies | Yanıt veya dahili not |
| POST | /tickets/:id/attachments | Dosya yükleme (multipart) |
| POST | /tickets/:id/csat | Memnuniyet değerlendirmesi (müşteri) |
| POST | /tickets/:id/reopen | Kapalı talebi yeniden açma |
| GET | /tickets/:id/activity | Aktivite/audit geçmişi |
| GET | /tickets/tags | Görünür etiketler (filtre için) |
| POST | /tickets/bulk | Toplu işlem (personel) |
| GET/PUT | /sla | SLA hedeflerini görüntüle/güncelle (yönetici/admin) |
| GET | /dashboard | Personel özet paneli |
| POST | /jobs/digest | Günlük özet işini kuyruğa al (admin → worker) |
| GET | /healthz | Healthcheck |

Diğer: `/departments`, `/users`, `/notifications`, `/canned`, `/attachments/:id`, `/analytics`, `/auth/profile`.

### Örnek request/response

Kayıt:

```jsonc
// POST /auth/register
{ "email": "user@firma.com", "password": "secret123" }

// 201
{
  "token": "eyJhbGciOi...",
  "user": { "id": "uuid", "email": "user@firma.com", "role": "user" }
}
```

Giriş:

```jsonc
// POST /auth/login
{ "email": "user@firma.com", "password": "secret123" }

// 200
{ "token": "eyJhbGciOi...", "user": { "id": "uuid", "email": "user@firma.com", "role": "user" } }
```

Talep oluşturma:

```jsonc
// POST /tickets   (Authorization: Bearer <token>)
{ "subject": "Giriş yapamıyorum", "message": "Şifre sıfırlama çalışmıyor", "priority": "high" }

// 201
{
  "ticket": {
    "id": "uuid",
    "subject": "Giriş yapamıyorum",
    "message": "Şifre sıfırlama çalışmıyor",
    "priority": "high",
    "status": "open",
    "userId": "uuid",
    "createdAt": "2026-06-09T08:00:00.000Z",
    "sla": { "breached": false, "ageMinutes": 0, "resolutionRemainingMinutes": 240 }
  }
}
```

Talepleri listeleme:

```jsonc
// GET /tickets?status=open&priority=high
{ "tickets": [ { "id": "uuid", "subject": "...", "priority": "high", "status": "open", ... } ] }
```

Healthcheck:

```jsonc
// GET /healthz
{ "status": "ok" }
```

Hata yanıtı formatı:

```jsonc
// 422 doğrulama hatası
{ "error": "Validation failed", "details": { "email": ["A valid email is required"] } }

// 401 / 403 / 404
{ "error": "Invalid email or password" }
```

## Gerçek Zamanlı (WebSocket)

Socket.IO, backend ile aynı HTTP sunucusu (port 3000) üzerinde çalışır. Kimlik doğrulama, WebSocket handshake'in `auth` payload'ı ile yapılır:

```js
io('http://localhost:3000', { auth: { token } })
```

Odalar: `user:{id}`, `dept:{id}`, `ticket:{id}`, `ticket:{id}:staff` (dahili notlar). Başlıca olaylar: `ticket:created`, `ticket:updated`, `ticket:deleted`, `ticket:reply`, `notification`, `typing`, `presence`. Çok instance'lı ölçekleme Redis adapter ile sağlanır.

## Worker (Bull) ve Arka Plan İşleri

Backend ve frontend'den **bağımsız** bir `worker` servisi vardır (`backend/src/worker.ts`).
Backend ile yalnızca **Redis üzerinden** (Bull iş kuyruğu) haberleşir; aralarında HTTP yoktur.
Amaç, kullanıcıyı bekletmemesi gereken / uzun süren işleri ana isteğin dışına taşımaktır.

```
Backend (producer)  ──>  Redis (Bull "mail" kuyruğu)  ──>  Worker (consumer)  ──>  SMTP (Gmail vb.)
```

İş türleri (`backend/src/queue.ts` + `backend/src/worker.ts`):

- **`reply-email`** — Personel yanıt verince backend kuyruğa atar; worker e-postayı gönderir
  (yanıt isteği e-postayı beklemez).
- **`daily-digest`** — **Cron** (`DIGEST_CRON`, varsayılan her gün 08:00). Her personele
  açık/SLA-riskli/atanmamış talep özetini e-postalar.
- **`sla-sweep`** — **Cron** (`SLA_SWEEP_CRON`, varsayılan her 2 dk). SLA çözüm süresini aşan
  talepleri otomatik eskale eder ve bayatlamış (uzun süredir açık) talepler için hatırlatma
  bildirimi üretir. (Bu mantık eskiden backend'de `setInterval` ile çalışıyordu; worker'a taşındı.)
- **`csat-request`** — **Gecikmeli** iş. Talep kapanınca worker'a `CSAT_DELAY_MS` (varsayılan 1 saat)
  sonra çalışacak iş bırakılır; müşteriye memnuniyet anketi maili gider.
- **`export-tickets`** — Personelin istediği talep dışa aktarımı worker'da CSV olarak üretilip
  e-postayla gönderilir; backend isteği anında döner (ağır iş ana isteği bloklamaz).

Worker'dan istemcilere **canlı bildirim** için Socket.IO Redis **emitter** kullanılır
(`@socket.io/redis-emitter`): worker, backend'in Socket.IO odalarına Redis üzerinden olay yayınlar.

### Bull Board (kuyruk paneli)

Worker, kuyruğu izlemek için bir web paneli sunar: **http://localhost:3001/admin/queues**
(temel kimlik doğrulama: `BULLBOARD_USER` / `BULLBOARD_PASS`, varsayılan `admin` / `Admin123!`).
Bekleyen/çalışan/tamamlanan/başarısız/gecikmeli işleri görüp başarısızları yeniden deneyebilirsiniz.

Test: admin **Ayarlar → "Günlük özeti şimdi gönder"** (veya `POST /jobs/digest`) işi anında kuyruğa
atar; **talep listesi → "E-posta ile dışa aktar"** ise export işini tetikler.

```bash
# Worker loglarını izle
docker compose logs -f worker

# Worker'ı ölçekle (birden çok tüketici)
docker compose up -d --scale worker=3 worker
```

## Test ve Debug

```bash
# Servis durumları
docker compose ps

# Loglar
docker compose logs backend
docker compose logs postgres

# Healthcheck
curl http://localhost:3000/healthz
```

Hızlı API denemesi:

```bash
# Giriş yapıp token al
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@support.local","password":"Admin123!"}' \
  | sed 's/.*"token":"\([^"]*\)".*/\1/')

# Talepleri listele
curl http://localhost:3000/tickets -H "Authorization: Bearer $TOKEN"
```

Sık karşılaşılan durumlar:

| Belirti | Çözüm |
| --- | --- |
| Port çakışması (3000/5173/5432) | Çakışan yerel servisi durdurun veya docker-compose.yml'de portu değiştirin |
| Şemayı sıfırlamak | `docker compose down -v && docker compose up --build` |
| E-posta gönderilmiyor | `.env.local`'de SMTP_USER/SMTP_PASS dolu mu; worker loglarına bakın (`docker compose logs worker`) |
