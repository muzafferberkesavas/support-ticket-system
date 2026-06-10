# Proxy — HTTPS Reverse Proxy (nginx)

Ürünü tek bir HTTPS origin'i (**https://support.local**) üzerinden, kendi
ürettiğimiz (self-signed) sertifika ile yayınlar.

## Yönlendirmeler

| İstek             | Hedef                                         |
| ----------------- | --------------------------------------------- |
| `/`               | `frontend:80` (Vue SPA)                       |
| `/api/`           | `backend:3000` (`/api` öneki sıyrılır)        |
| `/api/socket.io/` | `backend:3000/socket.io/` (WebSocket upgrade) |
| `http://` (80)    | `https://` (443) — kalıcı yönlendirme         |

Yapılandırma: [`nginx.conf`](nginx.conf).

## Sertifika

Self-signed sertifika repoya **konmaz**; kök dizindeki script üretir:

```bash
./scripts/gen-certs.sh        # certs/support.local.{crt,key}
```

`proxy` servisi bu dosyaları `/etc/nginx/certs` altına salt-okunur mount eder.
Tarayıcı self-signed sertifikayı tanımadığı için ilk girişte güvenlik uyarısı
çıkar; "devam et" denmelidir.

Detaylı kurulum → kök [`README.md`](../README.md) "HTTPS" bölümü.
