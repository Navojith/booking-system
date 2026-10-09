-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'WAITLISTED');

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "workshopId" TEXT NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeeEmail" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL,
    "registeredById" TEXT NOT NULL,
    "registeredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "cancelReason" TEXT,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Registration_workshopId_status_idx" ON "Registration"("workshopId", "status");

-- CreateIndex
CREATE INDEX "Registration_attendeeEmail_idx" ON "Registration"("attendeeEmail");

-- CreateIndex
CREATE INDEX "Registration_registeredAt_idx" ON "Registration"("registeredAt");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An attendee may hold at most one active registration per workshop; cancelled rows are
-- history and may repeat (they can re-register later as a new row).
CREATE UNIQUE INDEX registration_one_active_per_attendee
  ON "Registration" ("workshopId", "attendeeEmail") WHERE status = 'ACTIVE';

-- Cancelled rows must say who/when; active rows must not.
ALTER TABLE "Registration" ADD CONSTRAINT registration_cancel_fields_consistent CHECK (
  (status = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelledById" IS NOT NULL)
);
