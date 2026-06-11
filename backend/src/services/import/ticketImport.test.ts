import { describe, it, expect, vi } from 'vitest';

vi.mock('../../prisma', () => ({ prisma: {} }));

import { ticketImportAdapter } from './ticketImport';

const ctx = {
  deptByName: new Map([['teknik destek', 'd1']]),
  userByEmail: new Map([['a@b.com', 'u1']]),
} as never;

describe('ticketImport.parseRow', () => {
  it('geçerli satırı normalize eder (requester email→id)', () => {
    const r = ticketImportAdapter.parseRow(
      {
        subject: 'Yazıcı arızası',
        message: 'Yazıcı çalışmıyor',
        requester: 'A@B.com',
        priority: 'high',
        department: 'Teknik Destek',
      },
      ctx,
    );
    expect(r.errors).toEqual([]);
    expect(r.data.requesterId).toBe('u1');
    expect(r.data.priority).toBe('high');
    expect(r.data.departmentId).toBe('d1');
  });

  it('kısa konu/mesajı reddeder', () => {
    const r = ticketImportAdapter.parseRow({ subject: 'ab', message: 'x', requester: 'a@b.com' }, ctx);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('bilinmeyen talep sahibini reddeder', () => {
    const r = ticketImportAdapter.parseRow(
      { subject: 'Geçerli konu', message: 'Geçerli mesaj metni', requester: 'no@one.com' },
      ctx,
    );
    expect(r.errors.some((e) => e.includes('Talep sahibi'))).toBe(true);
  });

  it('geçersiz önceliği reddeder', () => {
    const r = ticketImportAdapter.parseRow(
      { subject: 'Geçerli konu', message: 'Geçerli mesaj metni', requester: 'a@b.com', priority: 'urgent' },
      ctx,
    );
    expect(r.errors.some((e) => e.includes('öncelik'))).toBe(true);
  });

  it('doğal anahtarı yoktur (dedupStrategy none, keyOf null)', () => {
    expect(ticketImportAdapter.dedupStrategy).toBe('none');
    expect(ticketImportAdapter.keyOf({})).toBeNull();
  });
});
