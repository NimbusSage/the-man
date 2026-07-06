-- Runs once when the postgres container's data volume is first created.
-- Prisma migrations own the actual schema; this just makes sure the
-- TimescaleDB extension the image ships is actually turned on.
CREATE EXTENSION IF NOT EXISTS timescaledb;
