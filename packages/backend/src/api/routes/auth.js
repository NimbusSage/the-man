// packages/backend/src/api/routes/auth.js

import bcrypt from 'bcrypt';

export async function authRoutes(server) {
  // Login
  server.post('/api/v1/auth/login', async (request, reply) => {
    try {
      const { username, password } = request.body;

      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password required' });
      }

      // Access prisma from server instance
      const prisma = server.prisma;
      
      if (!prisma) {
        request.log.error('Prisma client not available');
        return reply.code(500).send({ 
          error: 'Database error',
          message: 'Database connection not available' 
        });
      }

      // Find user with proper error handling
      let user;
      try {
        user = await prisma.user.findUnique({
          where: { username }
        });
      } catch (dbError) {
        request.log.error('Database error during user lookup:', dbError);
        return reply.code(500).send({ 
          error: 'Database error',
          message: 'Failed to lookup user'
        });
      }

      if (!user) {
        request.log.info(`Login attempt for non-existent user: ${username}`);
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Verify password
      let validPassword = false;
      try {
        validPassword = await bcrypt.compare(password, user.passwordHash);
      } catch (bcryptError) {
        request.log.error('Password comparison error:', bcryptError);
        return reply.code(500).send({ 
          error: 'Authentication error',
          message: 'Password verification failed'
        });
      }

      if (!validPassword) {
        request.log.info(`Invalid password for user: ${username}`);
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      // Generate JWT token
      let token;
      try {
        token = server.jwt.sign({
          id: user.id,
          username: user.username,
          role: user.role
        });
      } catch (jwtError) {
        request.log.error('JWT signing error:', jwtError);
        return reply.code(500).send({ 
          error: 'Token generation failed',
          message: 'Failed to generate authentication token'
        });
      }

      // Update last login
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() }
        });
      } catch (updateError) {
        request.log.warn('Failed to update last login:', updateError);
        // Don't fail the login just because lastLogin update failed
      }

      request.log.info(`Successful login for user: ${username}`);
      
      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });

    } catch (error) {
      request.log.error('Login error:', error);
      return reply.code(500).send({ 
        error: 'Internal Server Error',
        message: error.message 
      });
    }
  });

  // Get current user
  server.get('/api/v1/auth/me', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    try {
      const prisma = server.prisma;
      
      if (!prisma) {
        return reply.code(500).send({ error: 'Database connection not available' });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          lastLogin: true
        }
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send(user);
    } catch (error) {
      request.log.error('Get user error:', error);
      return reply.code(500).send({ error: 'Failed to fetch user' });
    }
  });

  // Logout (client-side token removal, but log it)
  server.post('/api/v1/auth/logout', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    try {
      const prisma = server.prisma;
      
      if (!prisma) {
        return reply.code(500).send({ error: 'Database connection not available' });
      }

      // Log logout event
      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'LOGOUT',
          ipAddress: request.ip
        }
      });

      return reply.send({ success: true });
    } catch (error) {
      request.log.error('Logout error:', error);
      return reply.code(500).send({ error: 'Failed to log logout' });
    }
  });
}
