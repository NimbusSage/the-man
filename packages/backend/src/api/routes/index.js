import { authRoutes } from './auth.js';
import { deviceRoutes } from './devices.js';
import { discoveryRoutes } from './discovery.js';
import { userRoutes } from './users.js';
import { mapRoutes } from './maps.js';
import { serviceRoutes } from './services.js';

export async function setupRoutes(server) {
  // Register all route modules
  await authRoutes(server);
  await deviceRoutes(server);
  await discoveryRoutes(server);
  await userRoutes(server);
  await mapRoutes(server);
  await serviceRoutes(server);

  // Test endpoint
  server.get('/api/v1/test', async () => {
    return { status: 'ok', message: 'The MAN API is running!' };
  });
  
  console.log('✓ API routes registered');
}
