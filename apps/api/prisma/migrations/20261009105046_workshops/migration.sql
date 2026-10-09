-- CreateEnum
CREATE TYPE "WorkshopStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructor" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "capacity" INTEGER NOT NULL,
    "seatsTaken" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkshopStatus" NOT NULL DEFAULT 'SCHEDULED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Workshop_code_key" ON "Workshop"("code");

-- CreateIndex
CREATE INDEX "Workshop_startsAt_idx" ON "Workshop"("startsAt");

-- CreateIndex
CREATE INDEX "Workshop_status_startsAt_idx" ON "Workshop"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Workshop_locationId_startsAt_idx" ON "Workshop"("locationId", "startsAt");

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants (defence in depth for the capacity rule).
ALTER TABLE "Workshop" ADD CONSTRAINT workshop_capacity_positive CHECK (capacity > 0);
ALTER TABLE "Workshop" ADD CONSTRAINT workshop_seats_within_capacity
  CHECK ("seatsTaken" >= 0 AND "seatsTaken" <= capacity);
ALTER TABLE "Workshop" ADD CONSTRAINT workshop_time_order CHECK ("endsAt" > "startsAt");
