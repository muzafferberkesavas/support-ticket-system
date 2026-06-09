-- CreateTable: attachments
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "uploader_id" TEXT,
    "filename" TEXT NOT NULL,
    "stored_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attachments_ticket_id_idx" ON "attachments"("ticket_id");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
