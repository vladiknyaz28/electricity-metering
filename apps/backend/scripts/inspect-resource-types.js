const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function isBrokenName(name) {
  if (!name || !name.trim()) return true;
  // only question marks / replacement chars / control chars
  if (/^[?\uFFFD\s]+$/.test(name)) return true;
  // has ? or U+FFFD and no real letters
  if ((name.includes('?') || name.includes('\uFFFD')) && !/[A-Za-zА-Яа-яЁё]/.test(name)) {
    return true;
  }
  return false;
}

async function main() {
  const rows = await prisma.resourceType.findMany({ orderBy: { createdAt: 'asc' } });
  for (const r of rows) {
    console.log(
      JSON.stringify({
        id: r.id,
        name: r.name,
        unit: r.unit,
        isSystem: r.isSystem,
        status: r.status,
        codes: [...r.name].map((c) => c.codePointAt(0)),
        bad: isBrokenName(r.name),
      }),
    );
  }

  const objs = await prisma.object.findMany({
    select: { id: true, name: true, typeCode: true, categoryCode: true },
    take: 15,
  });
  console.log('OBJECTS', JSON.stringify(objs, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
