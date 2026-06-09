import nodemailer from 'nodemailer';
import { env } from '../env';

// Mailpit (dev) accepts any/no auth on plain SMTP; for real SMTP add auth via env.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  tls: { rejectUnauthorized: false },
});

async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, to, subject, html });
    console.log(`📧 Email sent to ${to}: ${subject}`);
  } catch (err) {
    // Never let an email failure break the request flow.
    console.error(`⚠️  Failed to send email to ${to}:`, err);
  }
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4fb;font-family:Inter,Arial,sans-serif;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(49,46,129,.12)">
      <div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:24px 28px;color:#fff">
        <div style="font-size:20px;font-weight:700">🎫 Destek Merkezi</div>
      </div>
      <div style="padding:28px">
        <h2 style="margin:0 0 12px;color:#1f2433">${title}</h2>
        ${body}
      </div>
      <div style="padding:16px 28px;border-top:1px solid #eee;color:#9ca3af;font-size:12px">
        Bu e-posta Destek Merkezi tarafından otomatik gönderilmiştir.
      </div>
    </div></body></html>`;
}

const btn = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;

export async function sendWelcomeEmail(
  to: string,
  fullName: string | null,
  tempPassword: string,
): Promise<void> {
  const html = layout(
    `Hoş geldiniz${fullName ? ', ' + fullName : ''}!`,
    `<p style="color:#374151;line-height:1.6">Destek Merkezi hesabınız oluşturuldu. Aşağıdaki geçici şifre ile giriş yapın; ilk girişte sizden yeni bir şifre belirlemeniz istenecek.</p>
     <p style="margin:18px 0"><strong>E-posta:</strong> ${to}<br/>
     <strong>Geçici şifre:</strong> <code style="background:#f3f4fb;padding:4px 8px;border-radius:6px">${tempPassword}</code></p>
     <p>${btn(env.APP_URL + '/login', 'Giriş Yap')}</p>`,
  );
  await send(to, 'Destek Merkezi — Hesabınız oluşturuldu', html);
}

export async function sendReplyEmail(
  to: string,
  ticketId: string,
  ticketSubject: string,
  replyMessage: string,
  authorName: string,
): Promise<void> {
  const preview = replyMessage.length > 400 ? `${replyMessage.slice(0, 400)}…` : replyMessage;
  const html = layout(
    `"${ticketSubject}" talebinize yanıt geldi`,
    `<p style="color:#374151;line-height:1.6"><strong>${authorName}</strong> talebinize yanıt verdi:</p>
     <blockquote style="margin:14px 0;padding:12px 16px;background:#f3f4fb;border-left:3px solid #4f46e5;border-radius:8px;color:#374151;white-space:pre-wrap">${preview}</blockquote>
     <p style="margin:18px 0">${btn(env.APP_URL + '/tickets/' + ticketId, 'Talebi Görüntüle')}</p>`,
  );
  await send(to, `Destek Merkezi — "${ticketSubject}" talebinize yanıt`, html);
}

export async function sendResetEmail(to: string, resetLink: string): Promise<void> {
  const html = layout(
    'Şifre sıfırlama',
    `<p style="color:#374151;line-height:1.6">Şifrenizi sıfırlamak için bir talep aldık. Aşağıdaki bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz. Bağlantı <strong>1 saat</strong> geçerlidir.</p>
     <p style="margin:18px 0">${btn(resetLink, 'Şifremi Sıfırla')}</p>
     <p style="color:#9ca3af;font-size:13px">Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
  );
  await send(to, 'Destek Merkezi — Şifre sıfırlama', html);
}
