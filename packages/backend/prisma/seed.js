import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const passwordHash = await bcrypt.hash('admin', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@theman.local',
      passwordHash,
      role: 'ADMIN',
      mustChangePassword: true
    }
  });

  console.log('✅ Created admin user:', admin.username);

  // Check if sample device exists, create if not
  const existingDevice = await prisma.device.findFirst({
    where: { ip: '127.0.0.1' }
  });

  if (!existingDevice) {
    const device = await prisma.device.create({
      data: {
        name: 'Localhost',
        ip: '127.0.0.1',
        deviceType: 'server',
        status: 'UP',
        vendor: 'Local',
        metadata: { notes: 'Local test device' }
      }
    });
    console.log('✅ Created sample device:', device.name);
  } else {
    console.log('✅ Sample device already exists:', existingDevice.name);
  }

  // Create a sample map
  const existingMap = await prisma.map.findFirst({
    where: { name: 'Default Map' }
  });

  if (!existingMap) {
    const map = await prisma.map.create({
      data: {
        name: 'Default Map',
        layoutType: 'auto'
      }
    });
    console.log('✅ Created default map:', map.name);
  } else {
    console.log('✅ Default map already exists');
  }

  console.log('✅ Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
