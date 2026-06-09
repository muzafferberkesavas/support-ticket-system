# 🎫 Destek Talep Sistemi (Support Ticket System)

Kurumsal seviyede, gerçek zamanlı bir **Destek Talep (Helpdesk / Support Ticket)** uygulaması. JWT kimlik doğrulama, rol & departman bazlı yetkilendirme, otomatik atama, SLA takibi, canlı bildirimler, dosya ekleri, memnuniyet anketi (CSAT) ve analiz panelini içerir. Tüm servisler **tek komutla** Docker Compose üzerinde ayağa kalkar.

```bash
cp .env.example .env && docker compose up --build
```

→ Frontend: http://localhost:5173 • Backend: http://localhost:3000 • Mailpit: http://localhost:8025

---

## 📋 İçindekiler

- [Özellikler](#-özellikler)
- [Teknolojiler](#-teknolojiler)
- [Mimari](#-mimari)
- [Proje Yapısı](#-proje-yapısı)
- [Kurulum & Çalıştırma](#-kurulum--çalıştırma)
- [Demo Hesapları](#-demo-hesapları)
- [Ortam Değişkenleri](#-ortam-değişkenleri)
- [Veritabanı / Migration](#-veritabanı--migration)
- [Roller & Yetkilendirme](#-roller--yetkilendirme)
- [API Dokümantasyonu](#-api-dokümantasyonu)
- [Gerçek Zamanlı (WebSocket)](#-gerçek-zamanlı-websocket)
- [Test & Debug](#-test--debug)

---

## ✨ Özellikler

**Temel**
- 🔐 JWT ile kayıt / giriş, **şifremi unuttum** (e-posta ile sıfırlama), **ilk girişte zorunlu şifre değiştirme**
- 🎟️ Talep CRUD: oluşturma, listeleme, detay, güncelleme, silme
- 🏷️ Alanlar: konu, açıklama, **öncelik** (low/medium/high), **durum** (open/in_progress/closed), kategori
- 🔎 Serbest metin **arama** + duruma / önceliğe / departmana göre **filtreleme**, doğru öncelik sıralaması
- 🔴 `high` öncelikli ve geciken talepler görsel olarak vurgulanır

**Organizasyon & Yetki**
- 👥 Roller: **Müşteri / Temsilci / Takım Lideri / Yönetici (Admin)**
- 🏢 **Departmanlar** ve üyelik; talep bir departmana veya departmandaki **belirli kişilere** yönlendirilebilir
- 👁️ Görünürlük: müşteri → kendi talepleri, personel → departmanı + atananları, admin → tümü
- 🛡️ Admin: **kullanıcı ekleme/silme**, rol & departman yönetimi (yeni kullanıcıya geçici şifre maili)

**İş Akışı & Otomasyon**
- 🤖 **Otomatik atama** (departmandaki en az yüklü temsilciye)
- ⏱️ **SLA takibi** (önceliğe göre yanıt/çözüm hedefi) + **yaşlanma** göstergesi
- 🔼 **Eskalasyon**: manuel + SLA aşımında **otomatik** (arka plan zamanlayıcı)
- 💬 **Dahili not** (sadece personel) vs müşteri yanıtı ayrımı
- ⚡ **Hazır yanıt / makro** (tek tıkla şablon ekleme)
- 📊 **Tahmini yanıt/çözüm süresi** (geçmiş verilere göre, müşteriye bilgilendirme)
- 📝 **Audit log** (talep aktivite zaman çizelgesi)

**Gerçek Zamanlı & Bildirim**
- 🔌 **Socket.IO + Redis** ile anlık güncelleme; canlı yanıt akışı, **"yazıyor…"** ve **kim görüntülüyor** (presence)
- 🔔 **Anlık toast bildirimleri** + kalıcı **Bildirimler** sayfası (zil + okunmamış rozeti)

**İçerik & Memnuniyet**
- 📎 **Dosya / fotoğraf ekleri** (görsel önizleme, indirme; görsel/PDF/doküman)
- ⭐ **CSAT** — talep kapanınca müşteri 1–5 yıldız + yorumla değerlendirir

**Analiz (Yönetici/Admin)**
- 📈 KPI'lar: toplam, ort. ilk yanıt, ort. çözüm, atanmamış, eskale, **SLA uyum %'si**, **CSAT ortalaması**
- 📊 Grafikler (Chart.js): zaman trendi, durum/öncelik/departman dağılımı
- 🏆 **Personel performansı** (çözülen sayısı, ort. yanıt süresi)
- 🧠 **Tekrarlayan problem analizi** (metin analizi + otomatik tavsiye; ör. "mouse 6 talepte → toplu temin")
- 📤 **CSV / PDF dışa aktarım**

**Genel**
- 🌗 **Dark mode** + 🌐 **TR/EN dil desteği** (tercih saklanır)
- 🎨 Modern kurumsal arayüz (PrimeVue), skeleton yüklemeler, mikro-animasyonlar
- 🐳 Tek komutla Docker Compose, `/healthz` healthcheck

---

## 🛠 Teknolojiler

| Katman | Teknoloji |
| ------- | --------- |
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router, **PrimeVue**, vue-i18n, Chart.js, Socket.IO Client, Axios |
| Backend | Node.js, Express, TypeScript, **Prisma ORM**, Zod, JWT, bcrypt, **Socket.IO**, Multer, Nodemailer |
| Veritabanı | PostgreSQL 16 |
| Cache / Pub-Sub | Redis 7 (Socket.IO adapter) |
| E-posta (dev) | Mailpit (SMTP yakalayıcı + web UI) |
| Container | Docker, Docker Compose, nginx (frontend statik sunum) |

---

## 🏗 Mimari

```
┌──────────────┐   HTTP / WebSocket   ┌──────────────┐   Prisma    ┌──────────────┐
│   Frontend   │ ───────────────────► │   Backend    │ ──────────► │  PostgreSQL  │
│  Vue 3 + TS  │   (JWT Bearer)       │ Express + TS │             │    :5432     │
│ :5173 (nginx)│ ◄─────────────────── │    :3000     │ ◄────────── │              │
└──────────────┘   Socket.IO          └──────┬───────┘             └──────────────┘
                                              │  ├── Redis  :6379  (Socket.IO pub/sub)
                                              │  ├── Mailpit :1025/:8025 (e-posta)
                                              └──── uploads volume (dosya ekleri)
```

Backend katmanlı: `routes → controllers → services → prisma`. Yetki/görünürlük (`services/access.ts`), SLA (`services/sla.ts`), otomatik atama, bildirim, audit ve metin analizi ayrı servislerde.

---

## 📁 Proje Yapısı

```
.
├── docker-compose.yml          # postgres, redis, mailpit, backend, frontend
├── .env.example                # ortam değişkenleri şablonu
├── README.md
│
├── backend/                    # Node.js + Express + TypeScript
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma        # User, Department, Ticket, Reply, Attachment, Notification, AuditLog, ...
│   │   └── migrations/          # SQL migration'ları
│   └── src/
│       ├── index.ts             # HTTP + Socket.IO sunucusu
│       ├── app.ts               # Express app & route bağlama
│       ├── env.ts               # Zod ile env doğrulama
│       ├── seed.ts              # admin + departman + örnek personel + demo veri
│       ├── middleware/          # auth (JWT), errorHandler
│       ├── controllers/         # auth, ticket, department, user, notification, analytics, canned, attachment
│       ├── services/            # access, sla, autoAssign, estimate, audit, notifications, scheduler, mailer, upload, textAnalysis
│       ├── realtime/socket.ts   # Socket.IO (odalar, JWT handshake, presence/typing)
│       └── routes/
│
└── frontend/                   # Vue 3 + TypeScript + Vite
    ├── Dockerfile + nginx.conf
    └── src/
        ├── router/ stores/ services/ composables/ i18n/
        ├── components/          # PriorityTag, SlaBadge, AttachmentList, CannedMenu, RealtimeBridge, ...
        ├── layouts/AppLayout.vue
        └── views/               # Login, Register, Forgot/Reset/ChangePassword, Tickets, TicketDetail,
                                  #  Departments, Users, Notifications, Analytics
```

---

## 🚀 Kurulum & Çalıştırma

**Önkoşul:** Docker & Docker Compose.

```bash
# 1) .env dosyasını oluştur
cp .env.example .env

# 2) Tüm servisleri tek komutla ayağa kaldır
docker compose up --build
```

İlk açılışta backend otomatik olarak: **migration'ları uygular**, **seed** (admin, departmanlar, örnek personel, demo talepler) çalıştırır ve API'yi başlatır.

### Servisler

| Servis | URL | Not |
| ------ | --- | --- |
| Frontend | http://localhost:5173 | Vue arayüzü |
| Backend | http://localhost:3000 | REST API + WebSocket |
| PostgreSQL | localhost:5432 | postgres / postgres |
| Redis | localhost:6379 | Socket.IO adapter |
| **Mailpit** | **http://localhost:8025** | Gönderilen tüm e-postalar burada görünür |

---

## 👤 Demo Hesapları

| Rol | E-posta | Şifre |
| --- | ------- | ----- |
| **Yönetici (Admin)** | `admin@support.local` | `Admin123!` |
| Takım Lideri (Teknik) | `tech.lead@support.local` | `Agent123!` |
| Temsilci (Teknik) | `tech.agent@support.local` | `Agent123!` |
| Temsilci (Faturalama) | `billing.agent@support.local` | `Agent123!` |
| Temsilci (Satış) | `sales.agent@support.local` | `Agent123!` |
| Müşteri | `musteri1@firma.com` … `musteri10@firma.com` | `User123!` |

> Yeni müşteri için **Kayıt** ekranını da kullanabilirsiniz. Admin'in oluşturduğu kullanıcıların geçici şifresi **Mailpit**'e (`:8025`) düşer.

---

## 🔐 Ortam Değişkenleri

Tümü `.env.example` içinde belgelidir. Öne çıkanlar:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/support_db
JWT_SECRET=change_me_to_a_long_random_secret
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
ADMIN_EMAIL=admin@support.local
ADMIN_PASSWORD=Admin123!
REDIS_URL=redis://redis:6379
SMTP_HOST=mailpit
SMTP_PORT=1025
APP_URL=http://localhost:5173
MAX_UPLOAD_MB=10
VITE_API_URL=http://localhost:3000
```

---

## 🗄 Veritabanı / Migration

Şema **Prisma** ile yönetilir; migration'lar açılışta **otomatik** uygulanır (`prisma migrate deploy`).

```bash
# Manuel uygulama
docker compose exec backend npx prisma migrate deploy

# Şemayı sıfırdan kurmak (TÜM veriyi siler)
docker compose down -v && docker compose up --build

# Prisma Studio ile veriye göz atmak
docker compose exec backend npx prisma studio
```

Başlıca tablolar: `users`, `departments`, `department_members`, `tickets`, `ticket_assignees`, `ticket_replies`, `attachments`, `notifications`, `canned_responses`, `audit_logs`, `password_reset_tokens`.

---

## 👥 Roller & Yetkilendirme

| Yetenek | Müşteri | Temsilci | Takım Lideri | Admin |
| ------- | :-----: | :------: | :----------: | :---: |
| Talep oluşturma | ✅ | ✅ | ✅ | ✅ |
| Talepleri görme | Kendi | Departmanı + atananları | Departmanı | **Tümü** |
| Yanıt verme | Kendi talebinde | ✅ | ✅ | ✅ |
| Dahili not | — | ✅ | ✅ | ✅ |
| Atama / durum değiştirme | — | ✅ | ✅ | ✅ |
| Eskalasyon | — | ✅ | ✅ | ✅ |
| Hazır yanıt (makro) | — | ✅ | ✅ | ✅ |
| CSAT (değerlendirme) | ✅ (kapanışta) | — | — | — |
| Analiz paneli | — | — | ✅ (kendi departmanı) | ✅ (tümü) |
| Departman / kullanıcı yönetimi | — | — | — | ✅ |

> Admin bir talebe yanıt verdiğinde, talep `open` ise otomatik `in_progress`'e geçer. SLA çözüm süresi aşılan talepler otomatik eskale edilir.

---

## 📡 API Dokümantasyonu

Base URL: `http://localhost:3000` — Kimlik gerektiren uçlarda header: `Authorization: Bearer <token>`

### Auth
| Method | Endpoint | Açıklama |
| ------ | -------- | -------- |
| POST | `/auth/register` | Kayıt → `{ token, user }` |
| POST | `/auth/login` | Giriş → `{ token, user }` |
| GET | `/auth/me` | Mevcut kullanıcı |
| POST | `/auth/change-password` | Şifre değiştir (auth) |
| POST | `/auth/forgot-password` | Sıfırlama maili gönder |
| POST | `/auth/reset-password` | Token ile yeni şifre |

### Tickets
| Method | Endpoint | Açıklama |
| ------ | -------- | -------- |
| GET | `/tickets` | Listele (filtreler: `status, priority, departmentId, scope, search`) |
| GET | `/tickets/:id` | Detay (+ yanıtlar, ekler, SLA) |
| POST | `/tickets` | Oluştur (otomatik atama) |
| PUT | `/tickets/:id` | Güncelle |
| DELETE | `/tickets/:id` | Sil |
| PATCH | `/tickets/:id/assign` | Atama (personel) |
| PATCH | `/tickets/:id/escalate` | Eskale et (personel) |
| POST | `/tickets/:id/replies` | Yanıt / dahili not |
| POST | `/tickets/:id/attachments` | Dosya yükle (multipart) |
| POST | `/tickets/:id/csat` | Memnuniyet değerlendir (müşteri) |
| GET | `/tickets/:id/activity` | Audit / aktivite geçmişi |
| GET | `/tickets/estimate` | Tahmini süre (`priority, departmentId`) |

### Diğer
| Method | Endpoint | Açıklama |
| ------ | -------- | -------- |
| GET/POST/PUT/DELETE | `/departments` | Departman yönetimi (admin) |
| GET/POST/PUT/DELETE | `/users` | Kullanıcı yönetimi (admin) |
| GET | `/notifications`, `/notifications/unread-count` | Bildirimler |
| GET/POST/PUT/DELETE | `/canned` | Hazır yanıtlar (personel) |
| GET | `/attachments/:id` | Dosya indir (yetkili) |
| GET | `/analytics` | İstatistik (yönetici/admin) |
| GET | `/healthz` | Healthcheck → `{ "status": "ok" }` |

#### Örnek: Talep oluşturma
```jsonc
// POST /tickets
{ "subject": "VPN bağlanmıyor", "message": "Uzaktan erişim çalışmıyor", "priority": "high", "departmentId": "<uuid>" }
// → { "ticket": { "id": "...", "status": "open", "assignees": [...], "sla": { "breached": false, ... } } }
```

#### Hata formatı
```jsonc
{ "error": "Validation failed", "details": { "email": ["A valid email is required"] } }
```

---

## 🔌 Gerçek Zamanlı (WebSocket)

Socket.IO `http://localhost:3000` üzerinde çalışır; JWT **handshake `auth` payload** ile doğrulanır:
```js
io('http://localhost:3000', { auth: { token } })
```
Odalar: `user:{id}` · `dept:{id}` · `ticket:{id}` · `ticket:{id}:staff` (dahili notlar). Başlıca olaylar: `ticket:created/updated/deleted`, `ticket:reply`, `notification`, `typing`, `presence`. Çok-instance ölçeklemesi **Redis adapter** ile çözülür.

---

## 🧪 Test & Debug

```bash
docker compose ps                 # servis durumları
docker compose logs -f backend    # backend logları
docker compose logs -f postgres
curl http://localhost:3000/healthz   # → {"status":"ok"}
```

### Hızlı API denemesi
```bash
# Giriş (token al)
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@support.local","password":"Admin123!"}' \
  | sed 's/.*"token":"\([^"]*\)".*/\1/')

# Talepleri listele
curl http://localhost:3000/tickets -H "Authorization: Bearer $TOKEN"
```

### Demo senaryosu
1. **Müşteri** ile bir talep oluştur (Teknik Destek) → otomatik bir temsilciye atanır.
2. **tech.agent** ile gir → anlık bildirim + canlı liste; talebe yanıt ver, dahili not bırak, hazır yanıt kullan.
3. **admin** ile **Analiz** sekmesini aç → SLA uyumu, CSAT, tekrarlayan problemler + tavsiyeler.
4. Müşteri tarafında talep kapanınca **CSAT** ile değerlendir.

### Sık sorunlar
| Belirti | Çözüm |
| ------- | ----- |
| Port çakışması (3000/5173/5432/6379/8025) | Çakışan yerel servisi durdurun ya da compose'da portu değiştirin |
| Şemayı sıfırlamak | `docker compose down -v && docker compose up --build` |
| E-postalar nerede? | **Mailpit**: http://localhost:8025 |

---

## 📦 Tek Komut Özeti

```bash
cp .env.example .env && docker compose up --build
```
