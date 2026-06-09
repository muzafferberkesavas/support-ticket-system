-- AlterTable: CSAT (satisfaction) on tickets
ALTER TABLE "tickets" ADD COLUMN "csat_rating" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "csat_comment" TEXT;
ALTER TABLE "tickets" ADD COLUMN "csat_at" TIMESTAMP(3);

-- CreateTable: canned_responses (macros)
CREATE TABLE "canned_responses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" TEXT,
    "department_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "canned_responses_department_id_idx" ON "canned_responses"("department_id");
