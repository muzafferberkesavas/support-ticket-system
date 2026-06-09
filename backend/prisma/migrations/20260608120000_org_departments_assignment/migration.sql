-- AlterEnum: add agent + team_lead roles (Role type already committed in 0_init)
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'agent';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'team_lead';

-- AlterTable: users gains an optional display name
ALTER TABLE "users" ADD COLUMN "full_name" TEXT;

-- CreateTable: departments
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateTable: department_members (user <-> department)
CREATE TABLE "department_members" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "department_members_user_id_department_id_key" ON "department_members"("user_id", "department_id");
CREATE INDEX "department_members_department_id_idx" ON "department_members"("department_id");

-- CreateTable: ticket_assignees (ticket <-> agent)
CREATE TABLE "ticket_assignees" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_assignees_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ticket_assignees_ticket_id_user_id_key" ON "ticket_assignees"("ticket_id", "user_id");
CREATE INDEX "ticket_assignees_user_id_idx" ON "ticket_assignees"("user_id");

-- AlterTable: tickets gains category + target department
ALTER TABLE "tickets" ADD COLUMN "category" TEXT;
ALTER TABLE "tickets" ADD COLUMN "department_id" TEXT;
CREATE INDEX "tickets_department_id_idx" ON "tickets"("department_id");

-- AlterTable: replies gain internal-note flag
ALTER TABLE "ticket_replies" ADD COLUMN "is_internal" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_members" ADD CONSTRAINT "department_members_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
