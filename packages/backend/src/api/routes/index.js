import { authRoutes } from './auth.js';
import { deviceRoutes } from './devices.js';

export async function setupRoutes(server) {
  // Register all route modules
  await authRoutes(server);
  await deviceRoutes(server);
  
  // Test endpoint
  server.get('/api/v1/test', async () => {
    return { status: 'ok', message: 'The MAN API is running!' };
  });
  
  console.log('✓ API routes registered');
}
