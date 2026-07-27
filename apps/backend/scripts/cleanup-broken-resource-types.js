/**
 * One-time cleanup of ResourceType rows with broken encoding in name
 * (e.g. "?????? ??????"). Detaches meters, then deletes the bad rows.
 * Does not touch system types or user-created types with readable names.
 *
 * Usage: node scripts/cleanup-broken-resource-types.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function isBrokenName(name) {
  if (!name || !String(name).trim()) return true;
  // no latin/cyrillic letters at all → garbage / question marks only
  return !/[A-Za-zА-Яа-яЁё]/.test(name);
}

async function main() {
  const all = await prisma.resourceType.findMany({
    where: { isSystem: false },
    include: { _count: { select: { meters: true } } },
  });

  const broken = all.filter((row) => isBrokenName(row.name));

  if (broken.length === 0) {
    console.log('Битых ResourceType не найдено.');
    return;
  }

  console.log(`Найдено битых записей: ${broken.length}`);
  for (const row of broken) {
    console.log(
      `- ${row.id} name=${JSON.stringify(row.name)} unit=${JSON.stringify(row.unit)} meters=${row._count.meters}`,
    );
  }

  const ids = broken.map((row) => row.id);

  const detached = await prisma.meter.updateMany({
    where: { resourceTypeId: { in: ids } },
    data: { resourceTypeId: null },
  });
  console.log(`Сброшено resourceTypeId у счётчиков: ${detached.count}`);

  const deleted = await prisma.resourceType.deleteMany({
    where: { id: { in: ids }, isSystem: false },
  });
  console.log(`Удалено ResourceType: ${deleted.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
