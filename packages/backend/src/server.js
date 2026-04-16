// packages/backend/src/server.js

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { config } from './config/index.js';
import { SocketServer } from './websocket/SocketServer.js';
import { setupRoutes } from './api/routes/index.js';
import { MonitoringService } from './services/monitoring/MonitoringService.js';
import { DiscoveryService } from './services/discovery/DiscoveryService.js';
import { AlertingService } from './services/alerting/AlertingService.js';

// Initialize database
export const prisma = new PrismaClient({
  log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
});

// Initialize Redis
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

// Initialize Fastify
const server = Fastify({
  logger: {
    level: config.isDevelopment ? 'info' : 'warn',
    transport: config.isDevelopment ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
  trustProxy: true,
  bodyLimit: 10485760, // 10MB
});

// Attach prisma to fastify server instance
server.decorate('prisma', prisma);

// Service instances
let monitoringService;
let discoveryService;
let alertingService;
let socketServer;

/**
 * Register Fastify plugins
 */
async function registerPlugins() {
  // CORS
  await server.register(cors, {
    origin: config.cors.origins,
    credentials: true,
  });

  // JWT authentication
  await server.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.expiresIn,
    },
  });

  // WebSocket support
  await server.register(websocket);

  // Health check endpoint
  server.get('/health', async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const dbHealthy = true;
      const redisHealthy = redis.status === 'ready';
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? 'healthy' : 'unhealthy',
          redis: redisHealthy ? 'healthy' : 'unhealthy',
        },
        version: '0.1.0',
        name: 'The MAN'
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  });
}

/**
 * Initialize core services
 */
async function initializeServices() {
  server.log.info('Initializing The MAN services...');

  // Discovery service
  discoveryService = new DiscoveryService();
  
  // Monitoring service
  monitoringService = new MonitoringService(prisma, redis);
  await monitoringService.start();
  
  // Alerting service
  alertingService = new AlertingService(prisma, redis);
  alertingService.on('alert:triggered', (alert) => {
    server.log.warn(`Alert triggered: ${alert.title}`);
    if (socketServer) {
      socketServer.broadcastAlert(alert);
    }
  });
  
  // WebSocket server
  socketServer = new SocketServer(server);
  
  // Connect monitoring to websocket for real-time updates
  monitoringService.on('device:status', (data) => {
    socketServer.broadcastDeviceStatus(data);
  });
  
  monitoringService.on('metric:update', (data) => {
    socketServer.broadcastMetric(data);
  });

  server.log.info('All services initialized successfully');
}

/**
 * Setup API routes
 */
async function setupAPI() {
  // Authentication decorator
  server.decorate('authenticate', async function(request, reply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // Inject services into request context
  server.decorateRequest('services', null);
  server.addHook('onRequest', async (request) => {
    request.services = {
      monitoring: monitoringService,
      discovery: discoveryService,
      alerting: alertingService,
    };
  });

  // Register all routes
  await setupRoutes(server);
  
  server.log.info('API routes registered');
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal) {
  server.log.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    await server.close();
    
    // Stop monitoring service
    if (monitoringService) {
      await monitoringService.stop();
    }
    
    // Close database connections
    await prisma.$disconnect();
    
    // Close Redis connection
    redis.disconnect();
    
    server.log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    server.log.error('Error during shutdown:', err);
    process.exit(1);
  }
}

/**
 * Start The MAN server
 */
async function start() {
  try {
    // Register plugins
    await registerPlugins();
    
    // Initialize services
    await initializeServices();
    
    // Setup API routes
    await setupAPI();
    
    // Start listening
    await server.listen({
      port: config.port,
      host: config.host,
    });
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║  🔥 The MAN - Network Monitoring Started 🔥   ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    server.log.info(`🌐 API Server: http://${config.host}:${config.port}`);
    server.log.info(`📡 WebSocket: ws://${config.host}:${config.port}`);
    server.log.info(`📊 Monitoring: ${await prisma.device.count()} devices`);
    server.log.info(`🔧 Environment: ${config.env}`);
    server.log.info(`✅ Health Check: http://${config.host}:${config.port}/health\n`);
    
    // Setup signal handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (err) {
    server.log.error('Failed to start The MAN server:', err);
    process.exit(1);
  }
}

// Start the server
start();

// Export for testing
export { server, monitoringService, discoveryService, alertingService };
