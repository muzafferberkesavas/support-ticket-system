import Queue from 'bull';
import { env } from './env';

// A single Bull queue shared between the backend (producer) and the worker
// (consumer) over Redis. Named jobs keep different work types in one queue.
export interface ReplyEmailJob {
  to: string;
  ticketId: string;
  ticketSubject: string;
  replyMessage: string;
  authorName: string;
}

export const JOB_REPLY_EMAIL = 'reply-email';
export const JOB_DAILY_DIGEST = 'daily-digest';

export const mailQueue = new Queue('mail', env.REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

// ── Producers (called from the backend) ──────────────────────────────
export function enqueueReplyEmail(data: ReplyEmailJob) {
  return mailQueue.add(JOB_REPLY_EMAIL, data);
}

export function enqueueDigestNow() {
  return mailQueue.add(JOB_DAILY_DIGEST, { manual: true });
}

// Registers the repeatable daily-digest cron job (called by the worker on boot).
export async function scheduleDailyDigest(): Promise<void> {
  // Clear any prior repeatables so a changed cron expression takes effect.
  const existing = await mailQueue.getRepeatableJobs();
  await Promise.all(existing.map((r) => mailQueue.removeRepeatableByKey(r.key)));
  await mailQueue.add(JOB_DAILY_DIGEST, {}, { repeat: { cron: env.DIGEST_CRON } });
}
