import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { env } from './env';
import type { Priority, Status } from '@prisma/client';

// Idempotent seed: admin + departments + sample staff + a little demo data.
async function main() {
  // ── Admin ──────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL },
    update: { role: 'admin' },
    create: { email: env.ADMIN_EMAIL, password: adminHash, role: 'admin', fullName: 'System Admin' },
  });
  console.log(`✅ Admin ready: ${admin.email}`);

  // ── Departments ────────────────────────────────────────────────────
  const departmentSeed = [
    { name: 'Teknik Destek', description: 'Ürün ve teknik sorunlar' },
    { name: 'Faturalama', description: 'Ödeme, fatura ve abonelik' },
    { name: 'Satış', description: 'Satış öncesi sorular ve teklifler' },
    { name: 'İnsan Kaynakları', description: 'İK ve çalışan talepleri' },
  ];
  const departments = new Map<string, string>();
  for (const d of departmentSeed) {
    const dept = await prisma.department.upsert({
      where: { name: d.name },
      update: { description: d.description },
      create: d,
    });
    departments.set(d.name, dept.id);
  }
  console.log(`✅ Departments ready: ${departmentSeed.map((d) => d.name).join(', ')}`);

  // ── Sample staff ───────────────────────────────────────────────────
  const staffHash = await bcrypt.hash('Agent123!', 10);
  const staffSeed: {
    email: string;
    fullName: string;
    role: 'agent' | 'team_lead';
    departments: string[];
  }[] = [
    { email: 'tech.lead@support.local', fullName: 'Elif Yılmaz', role: 'team_lead', departments: ['Teknik Destek'] },
    { email: 'tech.agent@support.local', fullName: 'Burak Demir', role: 'agent', departments: ['Teknik Destek'] },
    { email: 'billing.agent@support.local', fullName: 'Ayşe Kaya', role: 'agent', departments: ['Faturalama'] },
    { email: 'sales.agent@support.local', fullName: 'Can Öztürk', role: 'agent', departments: ['Satış'] },
  ];
  for (const s of staffSeed) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: { role: s.role, fullName: s.fullName },
      create: { email: s.email, password: staffHash, role: s.role, fullName: s.fullName },
    });
    for (const deptName of s.departments) {
      const departmentId = departments.get(deptName)!;
      await prisma.departmentMember.upsert({
        where: { userId_departmentId: { userId: user.id, departmentId } },
        update: {},
        create: { userId: user.id, departmentId },
      });
    }
  }
  console.log(`✅ Sample staff ready (password: Agent123!)`);

  // ── Rich demo dataset (runs once; guarded by a marker user) ────────
  await generateDemoData(departments);
  await seedExtras();
}

// Canned responses + demo CSAT ratings (idempotent-ish).
async function seedExtras() {
  if ((await prisma.cannedResponse.count()) === 0) {
    await prisma.cannedResponse.createMany({
      data: [
        { title: 'Talebi aldık', body: 'Merhaba, talebinizi aldık ve incelemeye başladık. En kısa sürede dönüş yapacağız.' },
        { title: 'Daha fazla bilgi', body: 'Talebinizi değerlendirebilmemiz için bir ekran görüntüsü ve adım adım ne yaptığınızı paylaşır mısınız?' },
        { title: 'Çözüldü', body: 'Sorununuz çözülmüştür. Başka bir konuda yardımcı olabilirsek çekinmeden yazın. İyi günler dileriz!' },
        { title: 'Donanım yönlendirme', body: 'Donanım talebiniz ilgili birime iletilmiştir, temin süreci başlatılmıştır.' },
      ],
    });
    console.log('✅ Canned responses seeded');
  }

  if ((await prisma.ticket.count({ where: { csatRating: { not: null } } })) === 0) {
    const closed = await prisma.ticket.findMany({ where: { status: 'closed' }, select: { id: true }, take: 30 });
    let rated = 0;
    for (const c of closed) {
      if (Math.random() < 0.7) {
        await prisma.ticket.update({ where: { id: c.id }, data: { csatRating: randInt(3, 5), csatAt: new Date() } });
        rated += 1;
      }
    }
    if (rated) console.log(`✅ Demo CSAT ratings seeded (${rated})`);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Creates a realistic, analytics-friendly dataset: recurring themes across many
// requesters, spread over the last 28 days, with response/resolution timestamps.
async function generateDemoData(departments: Map<string, string>) {
  const MARKER = 'demo.seed.marker@support.local';
  if (await prisma.user.findUnique({ where: { email: MARKER } })) return;
  await prisma.user.create({
    data: { email: MARKER, password: await bcrypt.hash('marker', 10), role: 'user', fullName: 'seed marker' },
  });

  const custHash = await bcrypt.hash('User123!', 10);
  const customerNames = [
    'Ahmet Yıldız', 'Mehmet Çelik', 'Ayşe Demir', 'Fatma Şahin', 'Can Aydın',
    'Zeynep Koç', 'Emre Arslan', 'Elif Yılmaz', 'Burak Doğan', 'Selin Aksoy',
  ];
  const customers: string[] = [];
  for (let i = 0; i < customerNames.length; i++) {
    const email = `musteri${i + 1}@firma.com`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, password: custHash, role: 'user', fullName: customerNames[i] },
    });
    customers.push(u.id);
  }

  const agents = await prisma.user.findMany({
    where: { email: { in: ['tech.agent@support.local', 'tech.lead@support.local', 'billing.agent@support.local'] } },
    select: { id: true, email: true },
  });
  const techAgents = agents.filter((a) => a.email.startsWith('tech')).map((a) => a.id);
  const billingAgents = agents.filter((a) => a.email.startsWith('billing')).map((a) => a.id);

  const tech = departments.get('Teknik Destek')!;
  const billing = departments.get('Faturalama')!;

  const themes: { subject: string; message: string; priority: Priority; dept: string; agents: string[]; n: number }[] = [
    { subject: 'Yeni mouse talebi', message: 'Mouse arızalı, çalışmıyor. Yeni bir mouse rica ediyorum.', priority: 'low', dept: tech, agents: techAgents, n: 6 },
    { subject: 'VPN bağlanmıyor', message: 'Uzaktan çalışırken VPN bağlanmıyor, sürekli kopuyor. Acil.', priority: 'high', dept: tech, agents: techAgents, n: 5 },
    { subject: 'Yazıcı çalışmıyor', message: 'Ofis yazıcısı toner hatası veriyor, çıktı alamıyorum.', priority: 'medium', dept: tech, agents: techAgents, n: 4 },
    { subject: 'Outlook senkronizasyon sorunu', message: 'E-posta senkronize olmuyor, yeni mailler gelmiyor.', priority: 'medium', dept: tech, agents: techAgents, n: 3 },
    { subject: 'Klavye tuşları takılıyor', message: 'Klavye bozuk, bazı tuşlar çalışmıyor. Yeni klavye gerekli.', priority: 'low', dept: tech, agents: techAgents, n: 3 },
    { subject: 'Fatura tutarı hatalı', message: 'Bu ayki faturada fazladan ücret yansımış, kontrol eder misiniz?', priority: 'medium', dept: billing, agents: billingAgents, n: 3 },
  ];

  let custIdx = 0;
  let created = 0;
  for (const th of themes) {
    for (let i = 0; i < th.n; i++) {
      const requester = customers[custIdx % customers.length];
      custIdx += 1;
      const createdAt = new Date(Date.now() - randInt(0, 27) * DAY_MS - randInt(0, 23) * 3600_000);
      const roll = Math.random();
      const status: Status = roll < 0.4 ? 'closed' : roll < 0.75 ? 'in_progress' : 'open';
      const assignee = th.agents.length ? th.agents[randInt(0, th.agents.length - 1)] : null;

      let firstResponseAt: Date | null = null;
      let resolvedAt: Date | null = null;
      if (status !== 'open') {
        firstResponseAt = new Date(createdAt.getTime() + randInt(20, 480) * 60_000);
        if (status === 'closed') {
          resolvedAt = new Date(firstResponseAt.getTime() + randInt(60, 2880) * 60_000);
        }
      }

      await prisma.ticket.create({
        data: {
          subject: th.subject,
          message: th.message,
          priority: th.priority,
          status,
          departmentId: th.dept,
          userId: requester,
          createdAt,
          firstResponseAt,
          resolvedAt,
          assignees: assignee ? { create: [{ userId: assignee }] } : undefined,
        },
      });
      created += 1;
    }
  }
  console.log(`✅ Demo dataset generated: ${created} tickets (musteri1..10@firma.com / User123!)`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
