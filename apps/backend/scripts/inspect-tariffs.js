const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const tariffs = await p.tariff.findMany({
    include: {
      zones: true,
      consumers: { select: { id: true, name: true, tariffId: true } },
    },
  });
  console.log(JSON.stringify(tariffs, null, 2));

  const electricity = await p.resourceType.findFirst({
    where: { name: 'Электроэнергия' },
  });
  console.log('ELECTRICITY', electricity?.id, electricity?.name);

  const consumers = await p.consumer.findMany({
    select: { id: true, name: true, tariffId: true },
    take: 20,
  });
  console.log('CONSUMERS', JSON.stringify(consumers, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
