-- AlterTable: SLA timestamps for response/resolution analytics
ALTER TABLE "tickets" ADD COLUMN "first_response_at" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "resolved_at" TIMESTAMP(3);

-- Backfill first_response_at from the earliest public staff reply
UPDATE "tickets" t
SET "first_response_at" = sub.first_reply
FROM (
  SELECT tr."ticket_id", MIN(tr."created_at") AS first_reply
  FROM "ticket_replies" tr
  JOIN "users" u ON u."id" = tr."author_id"
  WHERE tr."is_internal" = false AND u."role" <> 'user'
  GROUP BY tr."ticket_id"
) sub
WHERE t."id" = sub."ticket_id";

-- Backfill resolved_at for already-closed tickets (approximate with updated_at)
UPDATE "tickets"
SET "resolved_at" = "updated_at"
WHERE "status" = 'closed';
