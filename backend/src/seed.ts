import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
import { env } from './env';
import type { Priority, Status } from '@prisma/client';

// Idempotent seed: admin + departmanlar + örnek personel + biraz demo verisi.
async function main() {
  // ── Admin ──────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
  const admin = await prisma.user.upsert({
    where: { email: env.ADMIN_EMAIL },
    update: { role: 'admin' },
    create: { email: env.ADMIN_EMAIL, password: adminHash, role: 'admin', fullName: 'System Admin' },
  });
  console.log(`✅ Admin ready: ${admin.email}`);

  // ── Departmanlar ───────────────────────────────────────────────────
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

  // ── Örnek personel ─────────────────────────────────────────────────
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

  // ── Zengin demo veri seti (bir kez çalışır; marker kullanıcıyla korunur) ────────
  await generateDemoData(departments);
  await generateMoreDemoData(departments);
  await seedExtras();
}

// Hazır yanıtlar + demo CSAT puanları (yarı-idempotent).
async function seedExtras() {
  if ((await prisma.cannedResponse.count()) === 0) {
    await prisma.cannedResponse.createMany({
      data: [
        {
          title: 'Talebi aldık',
          body: 'Merhaba, talebinizi aldık ve incelemeye başladık. En kısa sürede dönüş yapacağız.',
        },
        {
          title: 'Daha fazla bilgi',
          body: 'Talebinizi değerlendirebilmemiz için bir ekran görüntüsü ve adım adım ne yaptığınızı paylaşır mısınız?',
        },
        {
          title: 'Çözüldü',
          body: 'Sorununuz çözülmüştür. Başka bir konuda yardımcı olabilirsek çekinmeden yazın. İyi günler dileriz!',
        },
        {
          title: 'Donanım yönlendirme',
          body: 'Donanım talebiniz ilgili birime iletilmiştir, temin süreci başlatılmıştır.',
        },
      ],
    });
    console.log('✅ Canned responses seeded');
  }

  // Demo talepleri anahtar kelimeye göre etiketle (bir kez).
  if ((await prisma.ticket.count({ where: { tags: { isEmpty: false } } })) === 0) {
    const all = await prisma.ticket.findMany({ select: { id: true, subject: true, message: true } });
    let tagged = 0;
    for (const t of all) {
      const text = `${t.subject} ${t.message}`.toLocaleLowerCase('tr-TR');
      const tags: string[] = [];
      if (/mouse|klavye|yazıcı|toner|monitör|donanım/.test(text)) tags.push('donanım');
      if (/vpn|bağlan|uzaktan|ağ/.test(text)) tags.push('ağ');
      if (/outlook|e-posta|mail|senkron/.test(text)) tags.push('e-posta');
      if (/fatura|ücret|ödeme/.test(text)) tags.push('faturalama');
      if (tags.length) {
        await prisma.ticket.update({ where: { id: t.id }, data: { tags } });
        tagged += 1;
      }
    }
    if (tagged) console.log(`✅ Demo tags assigned (${tagged})`);
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

// Gerçekçi, analitiğe uygun bir veri seti oluşturur: birçok talep sahibine yayılan
// tekrar eden temalar, son 28 güne dağıtılmış, yanıt/çözüm zaman damgalarıyla.
async function generateDemoData(departments: Map<string, string>) {
  const MARKER = 'demo.seed.marker@support.local';
  if (await prisma.user.findUnique({ where: { email: MARKER } })) return;
  await prisma.user.create({
    data: { email: MARKER, password: await bcrypt.hash('marker', 10), role: 'user', fullName: 'seed marker' },
  });

  const custHash = await bcrypt.hash('User123!', 10);
  const customerNames = [
    'Ahmet Yıldız',
    'Mehmet Çelik',
    'Ayşe Demir',
    'Fatma Şahin',
    'Can Aydın',
    'Zeynep Koç',
    'Emre Arslan',
    'Elif Yılmaz',
    'Burak Doğan',
    'Selin Aksoy',
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

  const themes: { subject: string; message: string; priority: Priority; dept: string; agents: string[]; n: number }[] =
    [
      {
        subject: 'Yeni mouse talebi',
        message: 'Mouse arızalı, çalışmıyor. Yeni bir mouse rica ediyorum.',
        priority: 'low',
        dept: tech,
        agents: techAgents,
        n: 6,
      },
      {
        subject: 'VPN bağlanmıyor',
        message: 'Uzaktan çalışırken VPN bağlanmıyor, sürekli kopuyor. Acil.',
        priority: 'high',
        dept: tech,
        agents: techAgents,
        n: 5,
      },
      {
        subject: 'Yazıcı çalışmıyor',
        message: 'Ofis yazıcısı toner hatası veriyor, çıktı alamıyorum.',
        priority: 'medium',
        dept: tech,
        agents: techAgents,
        n: 4,
      },
      {
        subject: 'Outlook senkronizasyon sorunu',
        message: 'E-posta senkronize olmuyor, yeni mailler gelmiyor.',
        priority: 'medium',
        dept: tech,
        agents: techAgents,
        n: 3,
      },
      {
        subject: 'Klavye tuşları takılıyor',
        message: 'Klavye bozuk, bazı tuşlar çalışmıyor. Yeni klavye gerekli.',
        priority: 'low',
        dept: tech,
        agents: techAgents,
        n: 3,
      },
      {
        subject: 'Fatura tutarı hatalı',
        message: 'Bu ayki faturada fazladan ücret yansımış, kontrol eder misiniz?',
        priority: 'medium',
        dept: billing,
        agents: billingAgents,
        n: 3,
      },
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

const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

// İkinci, daha büyük demo set (v2 marker) — LLM tekrar-eden-problem analizi için
// VARYASYONLU ifadelerle bol veri. Aynı temayı farklı cümlelerle yazar ki analiz
// (NLP/Claude) gerçekçi biçimde gruplasın. generateDemoData'nın üstüne eklenir.
async function generateMoreDemoData(departments: Map<string, string>) {
  const MARKER = 'demo.seed.v2@support.local';
  if (await prisma.user.findUnique({ where: { email: MARKER } })) return;
  await prisma.user.create({
    data: { email: MARKER, password: await bcrypt.hash('marker', 10), role: 'user', fullName: 'seed marker v2' },
  });

  const custHash = await bcrypt.hash('User123!', 10);
  const moreNames = [
    'Deniz Acar', 'Gül Erdoğan', 'Okan Polat', 'Sibel Aydın', 'Murat Şen',
    'Pınar Korkmaz', 'Tolga Aslan', 'Derya Çetin', 'Kaan Yalçın', 'Ebru Taş',
    'Serkan Bulut', 'Nazlı Güneş', 'Onur Kılıç', 'Yasemin Ak', 'Barış Tunç',
    'Melis Doğan', 'Hakan Eren', 'Ceren Öz', 'Volkan Kaya', 'İrem Sezer',
  ];
  const customers: string[] = [];
  for (let i = 0; i < moreNames.length; i++) {
    const email = `musteri${i + 11}@firma.com`;
    const u = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, password: custHash, role: 'user', fullName: moreNames[i] },
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

  type Theme = { dept: string; agents: string[]; priority: Priority; n: number; subjects: string[]; messages: string[] };
  const themes: Theme[] = [
    { dept: tech, agents: techAgents, priority: 'low', n: 9,
      subjects: ['Mouse arızalı', 'Fare çalışmıyor', 'Yeni mouse talebi', 'Mouse bozuldu'],
      messages: ['Mouse aniden çalışmayı bıraktı, imleç hareket etmiyor.', 'Faremin sol tuşu basmıyor, yeni bir tane rica ediyorum.', 'Mouse tekliyor ve sürekli donuyor, değişim gerekiyor.'] },
    { dept: tech, agents: techAgents, priority: 'high', n: 9,
      subjects: ['VPN bağlanmıyor', 'VPN sürekli kopuyor', 'Uzaktan erişim sorunu', 'VPN hatası alıyorum'],
      messages: ['Evden çalışırken VPN bağlantısı kuramıyorum, hata veriyor.', 'VPN birkaç dakikada bir kopuyor, çalışamıyorum. Acil.', 'Uzaktan bağlantı çok yavaş ve sürekli düşüyor.'] },
    { dept: tech, agents: techAgents, priority: 'medium', n: 8,
      subjects: ['Yazıcı çalışmıyor', 'Toner hatası', 'Çıktı alamıyorum', 'Yazıcı kağıt sıkıştırıyor'],
      messages: ['Ofis yazıcısı toner hatası veriyor, baskı alamıyorum.', 'Yazıcıdan çıktı gelmiyor, kuyrukta takılıyor.', 'Toner bitti uyarısı var ama yeni toner taktım yine çalışmıyor.'] },
    { dept: tech, agents: techAgents, priority: 'medium', n: 7,
      subjects: ['Outlook açılmıyor', 'E-posta gelmiyor', 'Mail senkron sorunu', 'Outlook donuyor'],
      messages: ['Outlook açılışta donuyor, e-postalarıma erişemiyorum.', 'Yeni mailler gelmiyor, senkronizasyon takılı.', 'Gönderilen kutusunda mailler takılıp gitmiyor.'] },
    { dept: tech, agents: techAgents, priority: 'high', n: 8,
      subjects: ['Şifremi unuttum', 'Parola sıfırlama', 'Hesabım kilitlendi', 'Giriş yapamıyorum'],
      messages: ['Sisteme giriş yapamıyorum, şifremi unuttum, sıfırlama rica ederim.', 'Hesabım çok fazla deneme yüzünden kilitlendi.', 'Parolam çalışmıyor, sıfırlama bağlantısı gelmedi.'] },
    { dept: tech, agents: techAgents, priority: 'low', n: 6,
      subjects: ['Klavye tuşları takılıyor', 'Klavye bozuk', 'Bazı tuşlar çalışmıyor'],
      messages: ['Klavyede bazı tuşlar basmıyor, yeni klavye gerekli.', 'Klavye tuşları takılıyor, yazarken harf atlıyor.', 'Klavyem ıslandı, tuşlar çalışmıyor.'] },
    { dept: tech, agents: techAgents, priority: 'medium', n: 6,
      subjects: ['Bilgisayar çok yavaş', 'Sistem donuyor', 'Açılış çok uzun sürüyor'],
      messages: ['Bilgisayar son günlerde aşırı yavaşladı, sürekli donuyor.', 'Açılış 10 dakika sürüyor, çalışamıyorum.', 'Programlar geç açılıyor ve takılıyor.'] },
    { dept: tech, agents: techAgents, priority: 'medium', n: 6,
      subjects: ['Monitör açılmıyor', 'Ekran titriyor', 'İkinci monitör talebi'],
      messages: ['Monitör sinyal almıyor, ekran siyah kalıyor.', 'Ekran sürekli titriyor, gözüm yoruluyor.', 'İkinci bir monitör talep ediyorum, verimlilik için.'] },
    { dept: tech, agents: techAgents, priority: 'medium', n: 6,
      subjects: ['Program kurulumu', 'Office kurulumu', 'Yazılım lisansı', 'Uygulama yüklenmiyor'],
      messages: ['İhtiyacım olan programı kuramıyorum, yetki hatası veriyor.', 'Office lisansı süresi dolmuş, yenilenmesi gerekiyor.', 'Uygulama kurulumu yarıda hata verip duruyor.'] },
    { dept: tech, agents: techAgents, priority: 'low', n: 5,
      subjects: ['WiFi bağlanmıyor', 'İnternet yok', 'Ağ çok yavaş'],
      messages: ['Ofiste WiFi’ye bağlanamıyorum, internet gitti.', 'Kablosuz ağ sürekli kopuyor.', 'İnternet bağlantısı çok yavaş, sayfalar açılmıyor.'] },
    { dept: tech, agents: techAgents, priority: 'medium', n: 5,
      subjects: ['Klasör erişim yetkisi', 'Paylaşıma erişemiyorum', 'Sisteme erişim talebi'],
      messages: ['Ortak klasöre erişim yetkim yok, açılması gerekiyor.', 'Paylaşılan sürücüye bağlanamıyorum, erişim reddedildi.', 'Yeni başladım, sistemlere erişim yetkisi rica ederim.'] },
    { dept: billing, agents: billingAgents, priority: 'medium', n: 7,
      subjects: ['Fatura tutarı hatalı', 'Fazladan ücret', 'Fatura gelmedi', 'Çift fatura kesildi'],
      messages: ['Bu ayki faturada fazladan ücret var, kontrol eder misiniz?', 'Faturam hâlâ gelmedi, ödeme yapamıyorum.', 'Aynı dönem için iki fatura kesilmiş, iade rica ederim.'] },
    { dept: billing, agents: billingAgents, priority: 'low', n: 5,
      subjects: ['Abonelik iptali', 'Plan değişikliği', 'Abonelik yenileme'],
      messages: ['Aboneliğimi iptal etmek istiyorum, süreç nedir?', 'Daha üst bir plana geçmek istiyorum.', 'Aboneliğim yenilenmedi, hizmet durdu.'] },
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
      const escalated = th.priority === 'high' && Math.random() < 0.3;

      let firstResponseAt: Date | null = null;
      let resolvedAt: Date | null = null;
      if (status !== 'open') {
        firstResponseAt = new Date(createdAt.getTime() + randInt(20, 480) * 60_000);
        if (status === 'closed') resolvedAt = new Date(firstResponseAt.getTime() + randInt(60, 2880) * 60_000);
      }

      await prisma.ticket.create({
        data: {
          subject: pick(th.subjects),
          message: pick(th.messages),
          priority: th.priority,
          status,
          escalated,
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
  console.log(`✅ Genişletilmiş demo set: +${created} talep (musteri11..30@firma.com / User123!)`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
