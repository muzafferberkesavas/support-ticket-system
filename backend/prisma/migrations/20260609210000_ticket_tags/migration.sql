-- AlterTable: ticket tags (Postgres text array)
ALTER TABLE "tickets" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Index for tag filtering (GIN over the array)
CREATE INDEX "tickets_tags_idx" ON "tickets" USING GIN ("tags");
