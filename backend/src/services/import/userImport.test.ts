import { describe, it, expect, vi } from 'vitest';

// Adapter, queue (Redis) ve prisma'yı import eder; testte yan etkisiz olmaları
// için mock'lanır (parseRow saf bir doğrulama fonksiyonudur).
vi.mock('../../queue', () => ({ enqueueWelcomeEmail: vi.fn() }));
vi.mock('../../prisma', () => ({ prisma: {} }));

import { userImportAdapter } from './userImport';

const ctx = { deptByName: new Map([['satış', 'dept-1']]) } as never;

describe('userImport.parseRow', () => {
  it('geçerli satırı normalize eder (email küçük harf, departman→id)', () => {
    const r = userImportAdapter.parseRow(
      { email: 'A@B.com', fullName: 'Ali Veli', role: 'agent', departments: 'Satış' },
      ctx,
    );
    expect(r.errors).toEqual([]);
    expect(r.data.email).toBe('a@b.com');
    expect(r.data.role).toBe('agent');
    expect(r.data.departmentIds).toEqual(['dept-1']);
  });

  it('rol verilmezse varsayılan user olur', () => {
    const r = userImportAdapter.parseRow({ email: 'x@y.com' }, ctx);
    expect(r.errors).toEqual([]);
    expect(r.data.role).toBe('user');
  });

  it('eksik/geçersiz e-postayı hata olarak işaretler', () => {
    expect(userImportAdapter.parseRow({ email: '' }, ctx).errors.length).toBeGreaterThan(0);
    expect(userImportAdapter.parseRow({ email: 'bad-email' }, ctx).errors[0]).toMatch(/e-posta/i);
  });

  it('geçersiz rolü reddeder', () => {
    const r = userImportAdapter.parseRow({ email: 'x@y.com', role: 'boss' }, ctx);
    expect(r.errors.some((e) => e.includes('rol'))).toBe(true);
  });

  it('bilinmeyen departmanı reddeder', () => {
    const r = userImportAdapter.parseRow({ email: 'x@y.com', departments: 'Yok' }, ctx);
    expect(r.errors.some((e) => e.includes('Departman'))).toBe(true);
  });

  it('dedup anahtarı e-postadır (natural-key)', () => {
    expect(userImportAdapter.dedupStrategy).toBe('natural-key');
    expect(userImportAdapter.keyOf({ email: 'a@b.com' })).toBe('a@b.com');
  });
});
