/**
 * Одноразовый скрипт: назначить главного администратора по email.
 * Запуск: node scripts/set-super-admin.js <email>
 * Не доступен через API/UI.
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const email = process.argv[2]?.trim();
  if (!email) {
    console.error('Использование: node scripts/set-super-admin.js <email>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Пользователь с email «${email}» не найден`);
      process.exit(1);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isSuperAdmin: true },
    });

    console.log('OK: isSuperAdmin=true');
    console.log(`  id:    ${updated.id}`);
    console.log(`  email: ${updated.email}`);
    console.log(`  role:  ${updated.role}`);
    console.log(`  name:  ${updated.fullName}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
