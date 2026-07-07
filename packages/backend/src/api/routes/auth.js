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

      const prisma = server.prisma;
      
      if (!prisma) {
        request.log.error('Prisma client not available');
        return reply.code(500).send({ 
          error: 'Database error',
          message: 'Database connection not available' 
        });
      }

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

      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() }
        });
      } catch (updateError) {
        request.log.warn('Failed to update last login:', updateError);
      }

      request.log.info(`Successful login for user: ${username}`);
      
      return reply.send({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword
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
          mustChangePassword: true,
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

  // Change password
  server.patch('/api/v1/auth/password', {
    onRequest: [server.authenticate]
  }, async (request, reply) => {
    try {
      const { currentPassword, newPassword } = request.body;

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: 'Current password and new password are required' });
      }

      if (newPassword.length < 8) {
        return reply.code(400).send({ error: 'New password must be at least 8 characters' });
      }

      if (currentPassword === newPassword) {
        return reply.code(400).send({ error: 'New password must differ from current password' });
      }

      const prisma = server.prisma;
      
      if (!prisma) {
        return reply.code(500).send({ error: 'Database connection not available' });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.id }
      });

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!validPassword) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
          mustChangePassword: false
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'PASSWORD_CHANGE',
          ipAddress: request.ip
        }
      });

      request.log.info(`Password changed for user: ${user.username}`);
      return reply.send({ success: true, message: 'Password changed successfully' });

    } catch (error) {
      request.log.error('Password change error:', error);
      return reply.code(500).send({ error: 'Failed to change password' });
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
