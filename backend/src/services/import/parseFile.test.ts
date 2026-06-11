import { describe, it, expect } from 'vitest';
import { parseFile, MAX_IMPORT_ROWS } from './parseFile';

describe('parseFile (CSV)', () => {
  it('başlıkları ve satırları nesne olarak ayrıştırır', async () => {
    const csv = Buffer.from('email,name\na@b.com,Ali\nc@d.com,Veli\n');
    const r = await parseFile(csv, 'x.csv');
    expect(r.headers).toEqual(['email', 'name']);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ email: 'a@b.com', name: 'Ali' });
  });

  it('boş satırları atlar ve değerleri trimler', async () => {
    const csv = Buffer.from('email, name\n  a@b.com , Ali \n\n');
    const r = await parseFile(csv, 'x.csv');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].name).toBe('Ali');
  });

  it('satır limitini aşan dosyayı reddeder', async () => {
    const header = 'email\n';
    const body = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `u${i}@x.com`).join('\n');
    await expect(parseFile(Buffer.from(header + body), 'big.csv')).rejects.toThrow(/satır/);
  });

  it('desteklenmeyen uzantıyı reddeder', async () => {
    await expect(parseFile(Buffer.from('x'), 'file.docx')).rejects.toThrow(/Desteklenmeyen/);
  });
});
