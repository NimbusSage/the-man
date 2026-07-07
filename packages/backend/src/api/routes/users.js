import bcrypt from 'bcrypt';

export async function userRoutes(server) {
  const adminOnly = server.requireRole('ADMIN');

  // List all users (admin only)
  server.get('/api/v1/users', {
    onRequest: [adminOnly]
  }, async (request, reply) => {
    try {
      const prisma = server.prisma;
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          mustChangePassword: true,
          lastLogin: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' }
      });
      return reply.send(users);
    } catch (error) {
      request.log.error('List users error:', error);
      return reply.code(500).send({ error: 'Failed to list users' });
    }
  });

  // Create user (admin only)
  server.post('/api/v1/users', {
    onRequest: [adminOnly]
  }, async (request, reply) => {
    try {
      const { username, email, password, role } = request.body;

      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password are required' });
      }

      if (password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      const validRoles = ['ADMIN', 'EDITOR', 'VIEWER'];
      if (role && !validRoles.includes(role)) {
        return reply.code(400).send({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      }

      const prisma = server.prisma;

      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        return reply.code(409).send({ error: 'Username already exists' });
      }

      if (email) {
        const emailExisting = await prisma.user.findUnique({ where: { email } });
        if (emailExisting) {
          return reply.code(409).send({ error: 'Email already in use' });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username,
          email: email || null,
          passwordHash,
          role: role || 'VIEWER',
          mustChangePassword: true
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          mustChangePassword: true,
          createdAt: true
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'USER_CREATE',
          resourceType: 'user',
          resourceId: user.id,
          details: { username, role: role || 'VIEWER' },
          ipAddress: request.ip
        }
      });

      request.log.info(`User created: ${username} by ${request.user.username}`);
      return reply.code(201).send(user);

    } catch (error) {
      request.log.error('Create user error:', error);
      return reply.code(500).send({ error: 'Failed to create user' });
    }
  });

  // Update user (admin only)
  server.patch('/api/v1/users/:id', {
    onRequest: [adminOnly]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { email, role, password } = request.body;

      if (!email && !role && !password) {
        return reply.code(400).send({ error: 'At least one field (email, role, password) must be provided' });
      }

      if (role) {
        const validRoles = ['ADMIN', 'EDITOR', 'VIEWER'];
        if (!validRoles.includes(role)) {
          return reply.code(400).send({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
        }
      }

      if (password && password.length < 8) {
        return reply.code(400).send({ error: 'Password must be at least 8 characters' });
      }

      const prisma = server.prisma;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      if (email && email !== user.email) {
        const emailExisting = await prisma.user.findUnique({ where: { email } });
        if (emailExisting) {
          return reply.code(409).send({ error: 'Email already in use' });
        }
      }

      const data = {};
      if (email !== undefined) data.email = email;
      if (role !== undefined) data.role = role;
      if (password !== undefined) {
        data.passwordHash = await bcrypt.hash(password, 10);
        data.mustChangePassword = true;
      }

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          mustChangePassword: true,
          lastLogin: true,
          createdAt: true
        }
      });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'USER_UPDATE',
          resourceType: 'user',
          resourceId: id,
          details: { ...data, passwordHash: password ? '(redacted)' : undefined },
          ipAddress: request.ip
        }
      });

      request.log.info(`User updated: ${updated.username} by ${request.user.username}`);
      return reply.send(updated);

    } catch (error) {
      request.log.error('Update user error:', error);
      return reply.code(500).send({ error: 'Failed to update user' });
    }
  });

  // Delete user (admin only)
  server.delete('/api/v1/users/:id', {
    onRequest: [adminOnly]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const prisma = server.prisma;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      if (user.id === request.user.id) {
        return reply.code(400).send({ error: 'Cannot delete your own account' });
      }

      await prisma.user.delete({ where: { id } });

      await prisma.auditLog.create({
        data: {
          userId: request.user.id,
          action: 'USER_DELETE',
          resourceType: 'user',
          resourceId: id,
          details: { username: user.username },
          ipAddress: request.ip
        }
      });

      request.log.info(`User deleted: ${user.username} by ${request.user.username}`);
      return reply.send({ success: true });

    } catch (error) {
      request.log.error('Delete user error:', error);
      return reply.code(500).send({ error: 'Failed to delete user' });
    }
  });
}
