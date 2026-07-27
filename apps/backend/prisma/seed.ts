import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SYSTEM_RESOURCE_TYPES = [
  { name: 'Электроэнергия', unit: 'кВт·ч' },
  { name: 'Горячая вода', unit: 'м³' },
  { name: 'Холодная вода', unit: 'м³' },
  { name: 'Отопление', unit: 'Гкал' },
  { name: 'Газ', unit: 'м³' },
] as const;

async function seedResourceTypes() {
  for (const item of SYSTEM_RESOURCE_TYPES) {
    const existing = await prisma.resourceType.findFirst({
      where: { name: item.name, isSystem: true },
    });

    if (existing) {
      await prisma.resourceType.update({
        where: { id: existing.id },
        data: {
          unit: item.unit,
          status: 'active',
          isSystem: true,
        },
      });
      console.log(`ResourceType обновлён: ${item.name}`);
      continue;
    }

    await prisma.resourceType.create({
      data: {
        name: item.name,
        unit: item.unit,
        isSystem: true,
        status: 'active',
      },
    });
    console.log(`ResourceType создан: ${item.name}`);
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@electricity-metering.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Админ уже существует: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      fullName: 'System Admin',
      email,
      passwordHash,
      role: 'admin',
    },
  });

  console.log(`Создан сид-админ: ${admin.email} (id=${admin.id})`);
}

async function main() {
  await seedResourceTypes();
  await seedAdmin();
}

main()
  .catch((error) => {
    console.error('Ошибка seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
