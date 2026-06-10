#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# support.local için self-signed TLS sertifikası üretir.
# Çıktı: certs/support.local.crt + certs/support.local.key
# (proxy konteyneri bu dosyaları /etc/nginx/certs'e mount eder.)
#
# Kullanım:
#   ./scripts/gen-certs.sh
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

DOMAIN="${1:-support.local}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$ROOT/certs"

mkdir -p "$CERT_DIR"

if [[ -f "$CERT_DIR/$DOMAIN.crt" && -f "$CERT_DIR/$DOMAIN.key" ]]; then
  echo "✓ Sertifika zaten mevcut: $CERT_DIR/$DOMAIN.crt (yeniden üretmek için dosyaları silin)"
  exit 0
fi

echo "🔐 $DOMAIN için self-signed sertifika üretiliyor..."
openssl req -x509 -nodes -newkey rsa:2048 \
  -days 825 \
  -keyout "$CERT_DIR/$DOMAIN.key" \
  -out "$CERT_DIR/$DOMAIN.crt" \
  -subj "/C=TR/ST=Istanbul/L=Istanbul/O=Support Ticket System/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:www.$DOMAIN"

echo "✓ Oluşturuldu:"
echo "   $CERT_DIR/$DOMAIN.crt"
echo "   $CERT_DIR/$DOMAIN.key"
echo
echo "Sonraki adımlar:"
echo "  1) /etc/hosts'a ekleyin:   127.0.0.1 $DOMAIN"
echo "  2) docker compose up -d --build"
echo "  3) Tarayıcıda açın:        https://$DOMAIN"
echo "     (self-signed olduğu için tarayıcı uyarısını kabul edin)"
