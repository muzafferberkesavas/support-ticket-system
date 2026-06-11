import crypto from 'crypto';

// Yeni oluşturulan bir hesap için okunabilir geçici parola üretir.
export function generateTempPassword(): string {
  const base = crypto
    .randomBytes(9)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '');
  return `${base.slice(0, 8)}9!`;
}
