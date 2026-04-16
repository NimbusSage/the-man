import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  
  database: {
    url: process.env.DATABASE_URL
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: '7d'
  },
  
  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173']
  }
};
