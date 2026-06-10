# Frontend — Web Arayüzü

Vue 3 + TypeScript + Vite + PrimeVue. Pinia ile durum yönetimi, Vue Router ile
yönlendirme, vue-i18n ile TR/EN dil desteği, Socket.IO ile gerçek zamanlı
güncellemeler.

## Çalıştırma

```bash
npm install
npm run dev            # Vite geliştirme sunucusu (http://localhost:5173)
npm run build          # üretim derlemesi (dist/)
npm run type-check     # vue-tsc tip kontrolü
```

Docker'da build, nginx ile statik olarak sunulur; tüm trafik `proxy` üzerinden
**https://support.local** adresine düşer. Tarayıcının API'ye eriştiği adres
`VITE_API_URL` ile derleme anında gömülür.

## Klasör haritası

| Yol                              | Sorumluluk                                         |
| -------------------------------- | -------------------------------------------------- |
| `src/views/`                     | Sayfa bileşenleri (route hedefleri)                |
| `src/components/`                | Yeniden kullanılabilir UI bileşenleri              |
| `src/layouts/`                   | Sayfa düzeni (AppLayout)                           |
| `src/services/`                  | API istemcisi (axios) ve kaynak bazlı servisler    |
| `src/stores/`                    | Pinia store'ları (auth, bildirimler, realtime, ui) |
| `src/router/`                    | Rota tanımları ve guard'lar                        |
| `src/i18n/`                      | Diller (tr/en)                                     |
| `src/composables/`, `src/utils/` | Yardımcı kancalar ve fonksiyonlar                  |

Mimari için → [`../docs/MIMARI.md`](../docs/MIMARI.md).
