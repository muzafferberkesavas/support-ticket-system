-- AlterTable: department auto-assignment toggle
ALTER TABLE "departments" ADD COLUMN "auto_assign_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: ticket escalation
ALTER TABLE "tickets" ADD COLUMN "escalated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN "escalated_at" TIMESTAMP(3);

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_ticket_id_created_at_idx" ON "audit_logs"("ticket_id", "created_at");
