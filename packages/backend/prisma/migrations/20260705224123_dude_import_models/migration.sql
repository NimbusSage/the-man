-- CreateEnum
CREATE TYPE "MetricResolution" AS ENUM ('RAW', 'TEN_MIN', 'TWO_HOUR', 'ONE_DAY');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "dude_id" INTEGER;

-- AlterTable
ALTER TABLE "links" ADD COLUMN     "dude_id" INTEGER;

-- AlterTable
ALTER TABLE "maps" ADD COLUMN     "dude_id" INTEGER;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "dude_id" INTEGER;

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "text" TEXT NOT NULL,
    "dude_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outages" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "service_id" TEXT,
    "map_id" TEXT,
    "time" TIMESTAMP(3) NOT NULL,
    "status" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,

    CONSTRAINT "outages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metrics" (
    "id" TEXT NOT NULL,
    "device_id" TEXT,
    "service_id" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "dude_source_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_samples" (
    "id" BIGSERIAL NOT NULL,
    "metric_id" TEXT NOT NULL,
    "time" TIMESTAMP(3) NOT NULL,
    "resolution" "MetricResolution" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "metric_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notes_dude_id_key" ON "notes"("dude_id");

-- CreateIndex
CREATE INDEX "notes_device_id_idx" ON "notes"("device_id");

-- CreateIndex
CREATE INDEX "outages_device_id_time_idx" ON "outages"("device_id", "time");

-- CreateIndex
CREATE INDEX "outages_service_id_time_idx" ON "outages"("service_id", "time");

-- CreateIndex
CREATE UNIQUE INDEX "metrics_dude_source_id_key" ON "metrics"("dude_source_id");

-- CreateIndex
CREATE INDEX "metric_samples_metric_id_time_idx" ON "metric_samples"("metric_id", "time");

-- CreateIndex
CREATE UNIQUE INDEX "devices_dude_id_key" ON "devices"("dude_id");

-- CreateIndex
CREATE UNIQUE INDEX "links_dude_id_key" ON "links"("dude_id");

-- CreateIndex
CREATE UNIQUE INDEX "maps_dude_id_key" ON "maps"("dude_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_dude_id_key" ON "services"("dude_id");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outages" ADD CONSTRAINT "outages_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outages" ADD CONSTRAINT "outages_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outages" ADD CONSTRAINT "outages_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_samples" ADD CONSTRAINT "metric_samples_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

