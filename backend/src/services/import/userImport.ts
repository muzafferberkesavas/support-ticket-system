import bcrypt from 'bcryptjs';
import { prisma } from '../../prisma';
import { generateTempPassword } from '../../utils/password';
import { enqueueWelcomeEmail } from '../../queue';
import type { ImportAdapter, ImportContext } from './types';

const VALID_ROLES = ['user', 'agent', 'team_lead', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Ham satırdaki bir alanı birden çok olası başlık adından (TR/EN) okur.
function pick(raw: Record<string, string>, aliases: string[]): string {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(raw)) lower[k.trim().toLowerCase()] = raw[k];
  for (const a of aliases) {
    const v = lower[a];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface UserCtx extends ImportContext {
  deptByName: Map<string, string>; // küçük harf ad → id
}

export const userImportAdapter: ImportAdapter = {
  entity: 'users',
  dedupStrategy: 'natural-key',
  displayColumns: ['email', 'fullName', 'role', 'departments'],

  async buildContext(): Promise<UserCtx> {
    const depts = await prisma.department.findMany({ select: { id: true, name: true } });
    const deptByName = new Map(depts.map((d) => [d.name.trim().toLowerCase(), d.id]));
    return { deptByName };
  },

  parseRow(raw, ctx) {
    const c = ctx as UserCtx;
    const errors: string[] = [];

    const email = pick(raw, ['email', 'e-posta', 'eposta', 'mail']).toLowerCase();
    const fullName = pick(raw, ['fullname', 'ad soyad', 'adsoyad', 'isim', 'ad']);
    const roleRaw = pick(raw, ['role', 'rol']).toLowerCase();
    const deptRaw = pick(raw, ['departments', 'departmanlar', 'departman', 'department']);

    // Zorunlu alan + tip doğrulaması.
    if (!email) errors.push('E-posta zorunludur.');
    else if (!EMAIL_RE.test(email)) errors.push('Geçersiz e-posta formatı.');

    let role = 'user';
    if (roleRaw) {
      if (!VALID_ROLES.includes(roleRaw)) errors.push(`Geçersiz rol: "${roleRaw}" (user/agent/team_lead/admin).`);
      else role = roleRaw;
    }

    // Departman adlarını id'ye çöz; bilinmeyen ad hata üretir.
    const departmentIds: string[] = [];
    const deptNames = deptRaw
      ? deptRaw
          .split(/[;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    for (const name of deptNames) {
      const id = c.deptByName.get(name.toLowerCase());
      if (!id) errors.push(`Departman bulunamadı: "${name}".`);
      else departmentIds.push(id);
    }

    return {
      data: { email, fullName: fullName || null, role, departmentIds },
      display: { email, fullName, role, departments: deptNames.join('; ') },
      errors,
    };
  },

  keyOf(data) {
    return (data.email as string) || null;
  },

  async findExistingKeys(keys) {
    if (!keys.length) return new Set();
    const rows = await prisma.user.findMany({ where: { email: { in: keys } }, select: { email: true } });
    return new Set(rows.map((r) => r.email));
  },

  async create(data) {
    const email = data.email as string;
    const fullName = (data.fullName as string | null) ?? null;
    const role = data.role as string;
    const departmentIds = (data.departmentIds as string[]) ?? [];

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.create({
      data: {
        email,
        fullName,
        role: role as never,
        password: hash,
        mustChangePassword: true,
        memberships: { create: departmentIds.map((departmentId) => ({ departmentId })) },
      },
    });
    // Hoşgeldin maili ayrı (toplu) kuyruğa — interaktif mailleri boğmaz.
    await enqueueWelcomeEmail({ to: email, fullName, tempPassword });
  },

  async update(data) {
    const email = data.email as string;
    const fullName = (data.fullName as string | null) ?? null;
    const role = data.role as string;
    const departmentIds = (data.departmentIds as string[]) ?? [];

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return;
    await prisma.user.update({
      where: { id: user.id },
      data: { fullName, role: role as never },
    });
    // Departman üyeliklerini dosyadaki değerlerle eşitle (parola değişmez).
    await prisma.departmentMember.deleteMany({ where: { userId: user.id } });
    if (departmentIds.length) {
      await prisma.departmentMember.createMany({
        data: departmentIds.map((departmentId) => ({ userId: user.id, departmentId })),
        skipDuplicates: true,
      });
    }
  },
};
