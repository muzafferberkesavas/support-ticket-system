-- AlterTable: last "stale ticket" reminder timestamp (worker sweep dedup)
ALTER TABLE "tickets" ADD COLUMN "reminder_sent_at" TIMESTAMP(3);
