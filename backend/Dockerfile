# ── Support Ticket System — Backend (Node.js + Express + TypeScript) ──
FROM node:20-alpine

# Prisma needs openssl on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install

# Copy source and build (prisma generate + tsc)
COPY . .
RUN npm run build

EXPOSE 3000

# On startup: apply migrations, seed the admin user, then launch the API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.js && node dist/index.js"]
