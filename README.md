# Destek Talep Sistemi (Support Ticket System)

Kullanıcı bazlı çalışan, gerçek zamanlı bir destek talep (helpdesk) uygulaması. Görevde istenen temel gereksinimleri (Vue 3 + TypeScript, Express + TypeScript, PostgreSQL, JWT, Docker Compose) karşılar; bunların üzerine rol/departman bazlı yetkilendirme, SLA takibi, otomatik atama, dosya ekleri, canlı bildirimler ve analiz paneli gibi özellikler ekler.

Klonlayıp tek komutla ayağa kalkar (ortam değişkenleri için ek bir adım gerekmez; `.env` repoya dahildir):

```bash
git clone https://github.com/muzafferberkesavas/support-ticket-system
cd support-ticket-system
docker compose up --build
```

Frontend: http://localhost:5173 — Backend: http://localhost:3000

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
| Veritabanı | PostgreSQL 16 |
| Diğer servisler | Redis 7 (Socket.IO adapter), Mailpit (geliştirme SMTP sunucusu) |
| Container | Docker, Docker Compose, nginx (frontend statik sunum) |

### Yapı

- **Frontend** — Vue 3 + TypeScript SPA. Vite ile derlenip nginx üzerinden sunulur. Pinia ile durum yönetimi, Vue Router ile yönlendirme ve route guard'lar, vue-i18n ile TR/EN dil desteği, PrimeVue ile arayüz bileşenleri kullanılır. API istekleri Axios, gerçek zamanlı iletişim Socket.IO Client ile yapılır.
- **Backend** — Express + TypeScript REST API. Katmanlı mimari: `routes -> controllers -> services -> prisma`. Kimlik doğrulama JWT, doğrulama Zod ile yapılır. Socket.IO aynı HTTP sunucusuna bağlanır.
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
├── docker-compose.yml          postgres, redis, mailpit, backend, frontend
├── .env.example                ortam değişkenleri şablonu
├── README.md
│
├── backend/                    Node.js + Express + TypeScript
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma        veri modeli
│   │   └── migrations/          SQL migration'ları
│   └── src/
│       ├── index.ts             HTTP + Socket.IO sunucusu
│       ├── app.ts               Express app, route bağlama
│       ├── env.ts               Zod ile env doğrulama
│       ├── seed.ts              admin + departman + örnek veri
│       ├── middleware/          auth (JWT), errorHandler
│       ├── controllers/         auth, ticket, department, user, notification, analytics, canned, attachment
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

Bu komut postgres, redis, mailpit, backend ve frontend servislerini ayağa kaldırır.

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
| Frontend | http://localhost:5173 | Vue arayüzü |
| Backend | http://localhost:3000 | REST API + WebSocket |
| PostgreSQL | localhost:5432 | postgres / postgres |
| Redis | localhost:6379 | Socket.IO adapter |
| Mailpit | http://localhost:8025 | Gönderilen e-postalar burada görüntülenir |

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
SMTP_HOST=mailpit
SMTP_PORT=1025
MAIL_FROM=Destek Merkezi <no-reply@support.local>
APP_URL=http://localhost:5173
MAX_UPLOAD_MB=10
VITE_API_URL=http://localhost:3000
```

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

Kayıt ekranından yeni müşteri de oluşturulabilir. Admin'in oluşturduğu kullanıcıların geçici şifresi Mailpit'e (http://localhost:8025) düşer.

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
| GET | /tickets/:id/activity | Aktivite/audit geçmişi |
| GET | /healthz | Healthcheck |

Diğer: `/departments`, `/users`, `/notifications`, `/canned`, `/attachments/:id`, `/analytics`.

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
| Gönderilen e-postalar | Mailpit arayüzü: http://localhost:8025 |
