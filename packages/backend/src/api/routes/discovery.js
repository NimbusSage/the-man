// packages/backend/src/api/routes/discovery.js

import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { DudeImporter } from '../../services/discovery/importers/DudeImporter.js';

// In-memory job tracking. Good enough for a single-instance deployment and
// for the frontend's existing discovery.getJob(jobId) polling contract -
// there's no queue/worker infrastructure in this backend yet to lean on.
const jobs = new Map();

export async function discoveryRoutes(server) {
  const prisma = server.prisma;
  const importer = new DudeImporter(prisma);

  server.get('/api/v1/discovery/jobs/:jobId', { onRequest: [server.authenticate] }, async (request, reply) => {
    const job = jobs.get(request.params.jobId);
    if (!job) {
      return reply.code(404).send({ error: 'Job not found' });
    }
    return job;
  });

  server.post(
    '/api/v1/discovery/import/dude',
    {
      onRequest: [server.authenticate],
      bodyLimit: 2 * 1024 * 1024 * 1024, // 2GB - Dude databases can be large
    },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const tmpPath = path.join(os.tmpdir(), `dude-upload-${randomUUID()}.db`);
      await pipeline(data.file, createWriteStream(tmpPath));

      const jobId = randomUUID();
      jobs.set(jobId, { jobId, status: 'running', startedAt: new Date().toISOString() });

      importer
        .importFromFile(tmpPath, { userId: request.user?.id })
        .then((result) => {
          jobs.set(jobId, {
            jobId,
            status: 'completed',
            startedAt: jobs.get(jobId).startedAt,
            completedAt: new Date().toISOString(),
            result,
          });
        })
        .catch((err) => {
          request.log.error(err, 'Dude import failed');
          jobs.set(jobId, {
            jobId,
            status: 'failed',
            startedAt: jobs.get(jobId).startedAt,
            completedAt: new Date().toISOString(),
            error: err.message,
          });
        })
        .finally(() => {
          unlink(tmpPath).catch(() => {});
        });

      return reply.code(202).send({ jobId, status: 'running' });
    }
  );
}

export default discoveryRoutes;
