-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "ack_note" TEXT,
ADD COLUMN     "acked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acked_at" TIMESTAMP(3),
ADD COLUMN     "acked_by" TEXT;
