-- CreateTable: configurable SLA targets per priority
CREATE TABLE "sla_policies" (
    "priority" TEXT NOT NULL,
    "response_minutes" INTEGER NOT NULL,
    "resolution_minutes" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("priority")
);

-- Seed defaults
INSERT INTO "sla_policies" ("priority", "response_minutes", "resolution_minutes", "updated_at") VALUES
  ('high', 60, 240, CURRENT_TIMESTAMP),
  ('medium', 240, 1440, CURRENT_TIMESTAMP),
  ('low', 480, 4320, CURRENT_TIMESTAMP);
