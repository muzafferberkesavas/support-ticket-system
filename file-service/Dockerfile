# ── Dosya Üretim Mikroservisi (Node.js + Express + TypeScript) ──
# Veritabanı bağlantısı yoktur; sadece Excel/PDF üretir.
FROM node:20-alpine

WORKDIR /app

# Bağımlılıkları önce kur (katman önbelleği).
COPY package*.json ./
RUN npm install

# Kaynağı kopyala ve derle.
COPY . .
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/index.js"]
