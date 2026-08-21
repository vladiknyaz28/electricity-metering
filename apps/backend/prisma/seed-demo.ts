/**
 * Идемпотентный seed демо-контура.
 * Пишет ТОЛЬКО в БД electricity_metering_demo при DEMO_SEED_CONFIRM=YES.
 * Не очищает таблицы и не трогает рабочую БД.
 *
 * tariffType: в коде UI/зон используются single | double | triple
 * (не multi_zone/single_zone из черновика ТЗ).
 */
import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const DEMO_DB_NAME = 'electricity_metering_demo';
const DEMO_PASSWORD = 'DemoPass123!';
const BCRYPT_ROUNDS = 10;

const ELECTRICITY_TARIFF_NAME = 'Электроэнергия — трёхзонный (демо)';
const GAS_TARIFF_NAME = 'Газ — единый (демо)';

type ZoneRates = { T1: number; T2?: number; T3?: number };

type PeriodSpec = {
  code: string;
  start: Date;
  end: Date;
};

type ZoneReading = { T1: number; T2: number | null; T3: number | null };

function fail(message: string): never {
  console.error(`Ошибка demo-seed: ${message}`);
  process.exit(1);
}

function assertDemoTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.trim()) {
    fail(
      'DATABASE_URL не задан. Скопируйте .env.demo.example → .env.demo и передайте переменные окружения перед запуском.',
    );
  }

  let dbName: string;
  try {
    const parsed = new URL(databaseUrl);
    dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    fail('DATABASE_URL имеет некорректный формат URL.');
  }

  if (dbName !== DEMO_DB_NAME) {
    fail(
      `Запрещённый target: база "${dbName}". Разрешена только "${DEMO_DB_NAME}".`,
    );
  }

  if (process.env.DEMO_SEED_CONFIRM !== 'YES') {
    fail(
      'DEMO_SEED_CONFIRM должен быть строго "YES". Без подтверждения запись в БД запрещена.',
    );
  }

  console.log(`Цель подтверждена: БД "${dbName}", DEMO_SEED_CONFIRM=YES`);
}

function utcDate(
  year: number,
  monthIndex: number,
  day: number,
  endOfDay = false,
) {
  if (endOfDay) {
    return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59, 999));
  }
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildPeriods2026JanAug(): PeriodSpec[] {
  const periods: PeriodSpec[] = [];
  for (let month = 0; month < 8; month++) {
    const year = 2026;
    const code = `${year}-${String(month + 1).padStart(2, '0')}`;
    const last = lastDayOfMonth(year, month);
    periods.push({
      code,
      start: utcDate(year, month, 1),
      end: utcDate(year, month, last, true),
    });
  }
  return periods;
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function zoneSum(z: ZoneReading) {
  return Number(z.T1 ?? 0) + Number(z.T2 ?? 0) + Number(z.T3 ?? 0);
}

async function ensureResourceType(
  prisma: PrismaClient,
  name: string,
  unit: string,
) {
  const existing = await prisma.resourceType.findFirst({
    where: { name, isSystem: true },
  });
  if (existing) {
    return prisma.resourceType.update({
      where: { id: existing.id },
      data: { unit, status: 'active', isSystem: true },
    });
  }
  return prisma.resourceType.create({
    data: { name, unit, isSystem: true, status: 'active' },
  });
}

async function upsertUser(
  prisma: PrismaClient,
  data: {
    email: string;
    fullName: string;
    role: string;
    isSuperAdmin: boolean;
    passwordHash: string;
    consumerId?: string | null;
  },
) {
  return prisma.user.upsert({
    where: { email: data.email },
    create: {
      email: data.email,
      fullName: data.fullName,
      role: data.role,
      status: 'active',
      isSuperAdmin: data.isSuperAdmin,
      passwordHash: data.passwordHash,
      consumerId: data.consumerId ?? null,
    },
    update: {
      fullName: data.fullName,
      role: data.role,
      status: 'active',
      isSuperAdmin: data.isSuperAdmin,
      passwordHash: data.passwordHash,
      ...(data.consumerId !== undefined ? { consumerId: data.consumerId } : {}),
    },
  });
}

async function ensureObject(
  prisma: PrismaClient,
  data: {
    name: string;
    address: string;
    typeCode: string;
    categoryCode: string;
    managerId: string;
  },
) {
  const existing = await prisma.object.findFirst({
    where: { name: data.name, address: data.address },
  });
  if (existing) {
    return prisma.object.update({
      where: { id: existing.id },
      data: {
        typeCode: data.typeCode,
        categoryCode: data.categoryCode,
        status: 'active',
        managerId: data.managerId,
      },
    });
  }
  return prisma.object.create({
    data: {
      name: data.name,
      address: data.address,
      typeCode: data.typeCode,
      categoryCode: data.categoryCode,
      status: 'active',
      managerId: data.managerId,
    },
  });
}

async function ensureConsumer(
  prisma: PrismaClient,
  data: {
    objectId: string;
    name: string;
    type: string;
    taxId: string;
    contactPerson: string;
    phone: string;
    email: string;
    area: number;
    sharePercent: number;
    tariffId?: string | null;
  },
) {
  const existing = await prisma.consumer.findFirst({
    where: { name: data.name, objectId: data.objectId },
  });
  const payload = {
    type: data.type,
    taxId: data.taxId,
    contactPerson: data.contactPerson,
    phone: data.phone,
    email: data.email,
    area: data.area,
    sharePercent: data.sharePercent,
    status: 'active',
    ...(data.tariffId !== undefined ? { tariffId: data.tariffId } : {}),
  };
  if (existing) {
    return prisma.consumer.update({
      where: { id: existing.id },
      data: payload,
    });
  }
  return prisma.consumer.create({
    data: {
      objectId: data.objectId,
      name: data.name,
      ...payload,
    },
  });
}

async function ensureTariffVersion(
  prisma: PrismaClient,
  opts: {
    name: string;
    resourceTypeId: string;
    resourceTypeCode: string;
    validFrom: Date;
    validTo: Date | null;
    familyId?: string | null;
    zones: ZoneRates;
  },
) {
  const existing = await prisma.tariff.findFirst({
    where: { name: opts.name, validFrom: opts.validFrom },
    include: { zones: true },
  });

  // Уже есть — не меняем исторические даты и ставки
  if (existing) {
    if (!existing.familyId) {
      return prisma.tariff.update({
        where: { id: existing.id },
        data: { familyId: existing.id },
        include: { zones: true },
      });
    }
    return existing;
  }

  const created = await prisma.tariff.create({
    data: {
      name: opts.name,
      resourceTypeId: opts.resourceTypeId,
      resourceTypeCode: opts.resourceTypeCode,
      status: 'active',
      validFrom: opts.validFrom,
      validTo: opts.validTo,
      familyId: opts.familyId ?? undefined,
      zones: {
        create: Object.entries(opts.zones)
          .filter(([, rate]) => rate != null)
          .map(([zoneCode, rate]) => ({
            zoneCode,
            rate: new Prisma.Decimal(Number(rate)),
          })),
      },
    },
    include: { zones: true },
  });

  if (!created.familyId) {
    return prisma.tariff.update({
      where: { id: created.id },
      data: { familyId: created.id },
      include: { zones: true },
    });
  }
  return created;
}

async function upsertMeter(
  prisma: PrismaClient,
  data: {
    serialNumber: string;
    name: string;
    objectId: string;
    consumerId: string;
    resourceTypeId: string;
    resourceTypeCode: string;
    tariffType: string;
    unit: string;
    isMain: boolean;
    hasCurrentTransformer: boolean;
    primaryCurrent: number | null;
    secondaryCurrent: number | null;
    transformerRatio: number | null;
    parentMeterId: string | null;
    tariffId: string;
    installationLocation: string;
  },
) {
  const ratio =
    data.transformerRatio == null
      ? null
      : new Prisma.Decimal(data.transformerRatio);

  return prisma.meter.upsert({
    where: { serialNumber: data.serialNumber },
    create: {
      serialNumber: data.serialNumber,
      name: data.name,
      objectId: data.objectId,
      consumerId: data.consumerId,
      ownerType: 'consumer',
      resourceTypeCode: data.resourceTypeCode,
      resourceTypeId: data.resourceTypeId,
      meterCategoryCode: 'commercial',
      tariffType: data.tariffType,
      unit: data.unit,
      accuracyClass: '1.0',
      status: 'active',
      isMain: data.isMain,
      installationLocation: data.installationLocation,
      hasCurrentTransformer: data.hasCurrentTransformer,
      primaryCurrent: data.primaryCurrent,
      secondaryCurrent: data.secondaryCurrent,
      transformerRatio: ratio,
      parentMeterId: data.parentMeterId,
      tariffId: data.tariffId,
    },
    update: {
      name: data.name,
      objectId: data.objectId,
      consumerId: data.consumerId,
      ownerType: 'consumer',
      resourceTypeCode: data.resourceTypeCode,
      resourceTypeId: data.resourceTypeId,
      meterCategoryCode: 'commercial',
      tariffType: data.tariffType,
      unit: data.unit,
      accuracyClass: '1.0',
      status: 'active',
      isMain: data.isMain,
      installationLocation: data.installationLocation,
      hasCurrentTransformer: data.hasCurrentTransformer,
      primaryCurrent: data.primaryCurrent,
      secondaryCurrent: data.secondaryCurrent,
      transformerRatio: ratio,
      parentMeterId: data.parentMeterId,
      tariffId: data.tariffId,
    },
  });
}

/** Кумулятивные показания по периоду для сценариев demo. */
function readingForMeter(
  serial: string,
  periodIndex: number,
  periodCode: string,
): { zones: ZoneReading; anomalyType: string; anomalyNote: string | null } {
  // periodIndex 0..7 = 2026-01..2026-08
  const isGas = serial.startsWith('DEMO-GAS-');

  if (isGas) {
    const base =
      {
        'DEMO-GAS-10001': 1200,
        'DEMO-GAS-20001': 800,
        'DEMO-GAS-30001': 2500,
        'DEMO-GAS-40001': 3100,
      }[serial] ?? 1000;
    const monthly =
      {
        'DEMO-GAS-10001': 45,
        'DEMO-GAS-20001': 30,
        'DEMO-GAS-30001': 80,
        'DEMO-GAS-40001': 95,
      }[serial] ?? 40;
    return {
      zones: { T1: base + monthly * (periodIndex + 1), T2: null, T3: null },
      anomalyType: 'none',
      anomalyNote: null,
    };
  }

  // Электросчётчики: отдельные кумулятивные регистры T1/T2/T3 (вторичная сторона)
  const profiles: Record<
    string,
    { base: [number, number, number]; step: [number, number, number] }
  > = {
    'DEMO-EL-10001': { base: [1000, 2000, 1500], step: [12, 22, 16] }, // штатный БЦ
    'DEMO-EL-10002': { base: [400, 700, 500], step: [5, 9, 7] },
    'DEMO-EL-20001': { base: [800, 1400, 1000], step: [8, 14, 10] }, // склад + негатив в 08
    'DEMO-EL-30001': { base: [2000, 3500, 2800], step: [20, 35, 25] },
    'DEMO-EL-40001': { base: [3000, 5000, 4000], step: [15, 25, 18] }, // скачок в 07
    'DEMO-EL-40002': { base: [900, 1500, 1200], step: [7, 12, 9] },
  };

  const profile = profiles[serial] ?? {
    base: [500, 800, 600],
    step: [5, 8, 6],
  };

  let t1 = profile.base[0];
  let t2 = profile.base[1];
  let t3 = profile.base[2];
  for (let i = 0; i <= periodIndex; i++) {
    let s1 = profile.step[0];
    let s2 = profile.step[1];
    let s3 = profile.step[2];

    // b) Скачок на главном вводе производства в 2026-07 (index 6)
    if (serial === 'DEMO-EL-40001' && i === 6) {
      s1 *= 6;
      s2 *= 6;
      s3 *= 6;
    }

    // c) Отрицательный расход на вводе склада в 2026-08 (index 7):
    // уменьшаем кумулятив относительно июля
    if (serial === 'DEMO-EL-20001' && i === 7) {
      s1 = -25;
      s2 = -40;
      s3 = -30;
    }

    t1 += s1;
    t2 += s2;
    t3 += s3;
  }

  let anomalyType = 'none';
  let anomalyNote: string | null = null;
  if (serial === 'DEMO-EL-40001' && periodCode === '2026-07') {
    anomalyType = 'high_consumption';
    anomalyNote =
      'Нетипично высокий расход: требуется проверка технологической нагрузки и корректности ввода показаний.';
  }
  if (serial === 'DEMO-EL-20001' && periodCode === '2026-08') {
    anomalyType = 'negative_consumption';
    anomalyNote =
      'Текущее показание ниже предыдущего: требуется сверка данных прибора и ввода.';
  }

  return {
    zones: { T1: t1, T2: t2, T3: t3 },
    anomalyType,
    anomalyNote,
  };
}

async function upsertReading(
  prisma: PrismaClient,
  opts: {
    meterId: string;
    serial: string;
    period: PeriodSpec;
    periodIndex: number;
    prevZones: ZoneReading | null;
    coef: number;
    submittedById: string;
    verifiedById: string;
  },
) {
  const { zones, anomalyType, anomalyNote } = readingForMeter(
    opts.serial,
    opts.periodIndex,
    opts.period.code,
  );
  const currentValue = zoneSum(zones);
  const previousValue = opts.prevZones ? zoneSum(opts.prevZones) : null;
  const rawDelta =
    previousValue == null ? null : round4(currentValue - previousValue);
  const transformedDelta =
    rawDelta == null ? null : round4(rawDelta * opts.coef);

  await prisma.meterReading.upsert({
    where: {
      meterId_periodCode: {
        meterId: opts.meterId,
        periodCode: opts.period.code,
      },
    },
    create: {
      meterId: opts.meterId,
      periodCode: opts.period.code,
      periodStartDate: opts.period.start,
      periodEndDate: opts.period.end,
      readingDate: opts.period.end,
      valueT1: zones.T1,
      valueT2: zones.T2,
      valueT3: zones.T3,
      previousValue,
      currentValue,
      rawDelta,
      transformedDelta,
      transformationCoefficient: opts.coef,
      source: 'manual',
      status: 'verified',
      submittedById: opts.submittedById,
      verifiedById: opts.verifiedById,
      verifiedAt: opts.period.end,
      isClosedPeriod: true,
      anomalyType,
      anomalyNote,
    },
    update: {
      periodStartDate: opts.period.start,
      periodEndDate: opts.period.end,
      readingDate: opts.period.end,
      valueT1: zones.T1,
      valueT2: zones.T2,
      valueT3: zones.T3,
      previousValue,
      currentValue,
      rawDelta,
      transformedDelta,
      transformationCoefficient: opts.coef,
      source: 'manual',
      status: 'verified',
      submittedById: opts.submittedById,
      verifiedById: opts.verifiedById,
      verifiedAt: opts.period.end,
      isClosedPeriod: true,
      anomalyType,
      anomalyNote,
    },
  });

  return zones;
}

function getZoneRate(
  zones: Array<{ zoneCode: string; rate: Prisma.Decimal }>,
  code: string,
): number | null {
  const z = zones.find((item) => item.zoneCode === code);
  if (!z) return null;
  const n = Number(z.rate);
  return Number.isFinite(n) ? n : null;
}

async function ensureCharge(
  prisma: PrismaClient,
  opts: {
    consumerId: string;
    meterId: string;
    tariffId: string;
    periodStart: Date;
    periodEnd: Date;
    startReadingId: string;
    endReadingId: string;
    start: {
      valueT1: number;
      valueT2: number | null;
      valueT3: number | null;
    };
    end: {
      valueT1: number;
      valueT2: number | null;
      valueT3: number | null;
      transformationCoefficient: number;
    };
    zones: Array<{ zoneCode: string; rate: Prisma.Decimal }>;
    isGas: boolean;
  },
) {
  const coef = opts.end.transformationCoefficient || 1;
  const consT1 = round4((opts.end.valueT1 - opts.start.valueT1) * coef);
  const consT2 =
    opts.isGas || opts.end.valueT2 == null || opts.start.valueT2 == null
      ? null
      : round4((opts.end.valueT2 - opts.start.valueT2) * coef);
  const consT3 =
    opts.isGas || opts.end.valueT3 == null || opts.start.valueT3 == null
      ? null
      : round4((opts.end.valueT3 - opts.start.valueT3) * coef);

  const rateT1 = getZoneRate(opts.zones, 'T1') ?? 0;
  const rateT2 = getZoneRate(opts.zones, 'T2');
  const rateT3 = getZoneRate(opts.zones, 'T3');

  const amountT1 = round2(consT1 * rateT1);
  const amountT2 =
    consT2 != null && rateT2 != null ? round2(consT2 * rateT2) : null;
  const amountT3 =
    consT3 != null && rateT3 != null ? round2(consT3 * rateT3) : null;
  const totalAmount = round2(amountT1 + (amountT2 ?? 0) + (amountT3 ?? 0));

  const existing = await prisma.charge.findFirst({
    where: {
      consumerId: opts.consumerId,
      meterId: opts.meterId,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
    },
  });

  const data = {
    tariffId: opts.tariffId,
    startReadingId: opts.startReadingId,
    endReadingId: opts.endReadingId,
    consumptionT1: consT1,
    consumptionT2: consT2,
    consumptionT3: consT3,
    amountT1,
    amountT2,
    amountT3,
    totalAmount,
    status: 'confirmed',
  };

  if (existing) {
    return prisma.charge.update({ where: { id: existing.id }, data });
  }
  return prisma.charge.create({
    data: {
      consumerId: opts.consumerId,
      meterId: opts.meterId,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      ...data,
    },
  });
}

async function main() {
  assertDemoTarget();

  const prisma = new PrismaClient();

  try {
    console.log('Старт demo-seed…');
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);
    const periods = buildPeriods2026JanAug();

    // A. ResourceType
    const electricity = await ensureResourceType(
      prisma,
      'Электроэнергия',
      'кВт·ч',
    );
    const gas = await ensureResourceType(prisma, 'Газ', 'м³');
    console.log(`ResourceType: ${electricity.name}, ${gas.name}`);

    // B. Users (consumer — после Consumer)
    const demoAdmin = await upsertUser(prisma, {
      email: 'demo-admin@energokontur.local',
      fullName: 'Демо Администратор',
      role: 'admin',
      isSuperAdmin: true,
      passwordHash,
    });
    const demoManager = await upsertUser(prisma, {
      email: 'demo-manager@energokontur.local',
      fullName: 'Алексей Орлов',
      role: 'object_manager',
      isSuperAdmin: false,
      passwordHash,
    });
    const demoAuditor = await upsertUser(prisma, {
      email: 'demo-auditor@energokontur.local',
      fullName: 'Ирина Белова',
      role: 'auditor',
      isSuperAdmin: false,
      passwordHash,
    });
    console.log('Пользователи admin/manager/auditor готовы');

    // C. Objects
    const objSever = await ensureObject(prisma, {
      name: 'БЦ «Север»',
      address: 'г. Москва, ул. Северная, д. 12',
      typeCode: 'commercial',
      categoryCode: 'business_center',
      managerId: demoManager.id,
    });
    const objSklad = await ensureObject(prisma, {
      name: 'Склад «Логистический»',
      address: 'г. Москва, Логистический проезд, д. 8',
      typeCode: 'commercial',
      categoryCode: 'warehouse',
      managerId: demoManager.id,
    });
    const objZhk = await ensureObject(prisma, {
      name: 'ЖК «Центральный»',
      address: 'г. Москва, Центральный проспект, д. 25',
      typeCode: 'residential',
      categoryCode: 'apartment_building',
      managerId: demoManager.id,
    });
    const objTechno = await ensureObject(prisma, {
      name: 'Производственный участок «Техно»',
      address: 'г. Москва, Технопромышленная ул., д. 4',
      typeCode: 'industrial',
      categoryCode: 'production',
      managerId: demoManager.id,
    });
    console.log('Объекты готовы');

    // D. Consumers
    const consSever = await ensureConsumer(prisma, {
      objectId: objSever.id,
      name: 'ООО «Север Бизнес»',
      type: 'legal',
      taxId: '7701001001',
      contactPerson: 'Мария Иванова',
      phone: '+7 495 000-10-10',
      email: 'office@sever-demo.local',
      area: 8500,
      sharePercent: 100,
    });
    const consSklad = await ensureConsumer(prisma, {
      objectId: objSklad.id,
      name: 'ООО «Логистика Демо»',
      type: 'legal',
      taxId: '7701001002',
      contactPerson: 'Павел Смирнов',
      phone: '+7 495 000-20-20',
      email: 'logistics@demo.local',
      area: 4200,
      sharePercent: 100,
    });
    const consTechno = await ensureConsumer(prisma, {
      objectId: objTechno.id,
      name: 'ООО «Техно Производство»',
      type: 'legal',
      taxId: '7701001003',
      contactPerson: 'Олег Петров',
      phone: '+7 495 000-30-30',
      email: 'techno@demo.local',
      area: 6000,
      sharePercent: 100,
    });
    const consZhk = await ensureConsumer(prisma, {
      objectId: objZhk.id,
      name: 'УК «Центральная»',
      type: 'legal',
      taxId: '7701001004',
      contactPerson: 'Елена Соколова',
      phone: '+7 495 000-40-40',
      email: 'central@demo.local',
      area: 12000,
      sharePercent: 100,
    });

    const demoConsumer = await upsertUser(prisma, {
      email: 'demo-consumer@energokontur.local',
      fullName: 'Представитель потребителя',
      role: 'consumer',
      isSuperAdmin: false,
      passwordHash,
      consumerId: consSever.id,
    });
    console.log(`Потребители готовы; demo-consumer → ${consSever.name}`);

    // E. Tariffs
    const elV1 = await ensureTariffVersion(prisma, {
      name: ELECTRICITY_TARIFF_NAME,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      validFrom: utcDate(2026, 0, 1),
      validTo: utcDate(2026, 5, 30, true),
      zones: { T1: 7.1, T2: 4.2, T3: 3.1 },
    });
    const elFamilyId = elV1.familyId ?? elV1.id;
    const elV2 = await ensureTariffVersion(prisma, {
      name: ELECTRICITY_TARIFF_NAME,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      validFrom: utcDate(2026, 6, 1),
      validTo: null,
      familyId: elFamilyId,
      zones: { T1: 7.45, T2: 4.45, T3: 3.25 },
    });

    const gasV1 = await ensureTariffVersion(prisma, {
      name: GAS_TARIFF_NAME,
      resourceTypeId: gas.id,
      resourceTypeCode: 'gas',
      validFrom: utcDate(2026, 0, 1),
      validTo: utcDate(2026, 5, 30, true),
      zones: { T1: 8.25 },
    });
    const gasFamilyId = gasV1.familyId ?? gasV1.id;
    const gasV2 = await ensureTariffVersion(prisma, {
      name: GAS_TARIFF_NAME,
      resourceTypeId: gas.id,
      resourceTypeCode: 'gas',
      validFrom: utcDate(2026, 6, 1),
      validTo: null,
      familyId: gasFamilyId,
      zones: { T1: 8.65 },
    });

    // consumer.tariffId = family электроэнергии; газ — на meter.tariffId
    for (const c of [consSever, consSklad, consTechno, consZhk]) {
      await prisma.consumer.update({
        where: { id: c.id },
        data: { tariffId: elFamilyId },
      });
    }
    console.log(
      `Тарифы: электро family=${elFamilyId}, газ family=${gasFamilyId}; v2 электро=${elV2.id}`,
    );

    // F. Meters
    const mElSeverMain = await upsertMeter(prisma, {
      serialNumber: 'DEMO-EL-10001',
      name: 'Ввод ГРЩ БЦ Север',
      objectId: objSever.id,
      consumerId: consSever.id,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      tariffType: 'triple',
      unit: 'кВт·ч',
      isMain: true,
      hasCurrentTransformer: true,
      primaryCurrent: 400,
      secondaryCurrent: 5,
      transformerRatio: 80,
      parentMeterId: null,
      tariffId: elFamilyId,
      installationLocation: 'ГРЩ, вводной щит БЦ «Север»',
    });
    const mElSeverChild = await upsertMeter(prisma, {
      serialNumber: 'DEMO-EL-10002',
      name: 'Арендный ввод БЦ Север',
      objectId: objSever.id,
      consumerId: consSever.id,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      tariffType: 'triple',
      unit: 'кВт·ч',
      isMain: false,
      hasCurrentTransformer: true,
      primaryCurrent: 200,
      secondaryCurrent: 5,
      transformerRatio: 40,
      parentMeterId: mElSeverMain.id,
      tariffId: elFamilyId,
      installationLocation: 'Этаж 3, арендный щит',
    });
    const mGasSever = await upsertMeter(prisma, {
      serialNumber: 'DEMO-GAS-10001',
      name: 'Газовый ввод БЦ Север',
      objectId: objSever.id,
      consumerId: consSever.id,
      resourceTypeId: gas.id,
      resourceTypeCode: 'gas',
      tariffType: 'single',
      unit: 'м³',
      isMain: true,
      hasCurrentTransformer: false,
      primaryCurrent: null,
      secondaryCurrent: null,
      transformerRatio: null,
      parentMeterId: null,
      tariffId: gasFamilyId,
      installationLocation: 'Газовый узел учёта БЦ',
    });

    const mElSklad = await upsertMeter(prisma, {
      serialNumber: 'DEMO-EL-20001',
      name: 'Ввод склада',
      objectId: objSklad.id,
      consumerId: consSklad.id,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      tariffType: 'triple',
      unit: 'кВт·ч',
      isMain: true,
      hasCurrentTransformer: true,
      primaryCurrent: 100,
      secondaryCurrent: 5,
      transformerRatio: 20,
      parentMeterId: null,
      tariffId: elFamilyId,
      installationLocation: 'ВРУ склада',
    });
    const mGasSklad = await upsertMeter(prisma, {
      serialNumber: 'DEMO-GAS-20001',
      name: 'Газовый ввод склада',
      objectId: objSklad.id,
      consumerId: consSklad.id,
      resourceTypeId: gas.id,
      resourceTypeCode: 'gas',
      tariffType: 'single',
      unit: 'м³',
      isMain: true,
      hasCurrentTransformer: false,
      primaryCurrent: null,
      secondaryCurrent: null,
      transformerRatio: null,
      parentMeterId: null,
      tariffId: gasFamilyId,
      installationLocation: 'Газовый ввод склада',
    });

    const mElZhk = await upsertMeter(prisma, {
      serialNumber: 'DEMO-EL-30001',
      name: 'Общедомовой учёт ЖК',
      objectId: objZhk.id,
      consumerId: consZhk.id,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      tariffType: 'triple',
      unit: 'кВт·ч',
      isMain: true,
      hasCurrentTransformer: true,
      primaryCurrent: 600,
      secondaryCurrent: 5,
      transformerRatio: 120,
      parentMeterId: null,
      tariffId: elFamilyId,
      installationLocation: 'ТП / общедомовой ГРЩ',
    });
    const mGasZhk = await upsertMeter(prisma, {
      serialNumber: 'DEMO-GAS-30001',
      name: 'Газовый ввод ЖК',
      objectId: objZhk.id,
      consumerId: consZhk.id,
      resourceTypeId: gas.id,
      resourceTypeCode: 'gas',
      tariffType: 'single',
      unit: 'м³',
      isMain: true,
      hasCurrentTransformer: false,
      primaryCurrent: null,
      secondaryCurrent: null,
      transformerRatio: null,
      parentMeterId: null,
      tariffId: gasFamilyId,
      installationLocation: 'Газораспределительный пункт ЖК',
    });

    const mElTechnoMain = await upsertMeter(prisma, {
      serialNumber: 'DEMO-EL-40001',
      name: 'Главный ввод производства',
      objectId: objTechno.id,
      consumerId: consTechno.id,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      tariffType: 'triple',
      unit: 'кВт·ч',
      isMain: true,
      hasCurrentTransformer: true,
      primaryCurrent: 800,
      secondaryCurrent: 5,
      transformerRatio: 160,
      parentMeterId: null,
      tariffId: elFamilyId,
      installationLocation: 'ГРЩ производства',
    });
    const mElTechnoChild = await upsertMeter(prisma, {
      serialNumber: 'DEMO-EL-40002',
      name: 'Технологический ввод',
      objectId: objTechno.id,
      consumerId: consTechno.id,
      resourceTypeId: electricity.id,
      resourceTypeCode: 'electricity',
      tariffType: 'triple',
      unit: 'кВт·ч',
      isMain: false,
      hasCurrentTransformer: true,
      primaryCurrent: 400,
      secondaryCurrent: 5,
      transformerRatio: 80,
      parentMeterId: mElTechnoMain.id,
      tariffId: elFamilyId,
      installationLocation: 'Цех №2, технологический щит',
    });
    const mGasTechno = await upsertMeter(prisma, {
      serialNumber: 'DEMO-GAS-40001',
      name: 'Газовый ввод производства',
      objectId: objTechno.id,
      consumerId: consTechno.id,
      resourceTypeId: gas.id,
      resourceTypeCode: 'gas',
      tariffType: 'single',
      unit: 'м³',
      isMain: true,
      hasCurrentTransformer: false,
      primaryCurrent: null,
      secondaryCurrent: null,
      transformerRatio: null,
      parentMeterId: null,
      tariffId: gasFamilyId,
      installationLocation: 'Котельная / газовый ввод',
    });

    const allMeters = [
      mElSeverMain,
      mElSeverChild,
      mGasSever,
      mElSklad,
      mGasSklad,
      mElZhk,
      mGasZhk,
      mElTechnoMain,
      mElTechnoChild,
      mGasTechno,
    ];
    console.log(`Счётчики: ${allMeters.length}`);

    // G. Readings
    for (const meter of allMeters) {
      let prev: ZoneReading | null = null;
      const coef = meter.transformerRatio
        ? Math.round(Number(meter.transformerRatio))
        : 1;
      for (let i = 0; i < periods.length; i++) {
        prev = await upsertReading(prisma, {
          meterId: meter.id,
          serial: meter.serialNumber,
          period: periods[i],
          periodIndex: i,
          prevZones: prev,
          coef,
          submittedById: demoManager.id,
          verifiedById: demoAuditor.id,
        });
      }
    }
    console.log('Показания 2026-01…2026-08 готовы');

    // H. Charges за 2026-07 по главным счётчикам с consumerId
    const julyStart = utcDate(2026, 6, 1);
    const julyEnd = utcDate(2026, 6, 31, true);
    const mainMeters = allMeters.filter((m) => m.isMain && m.consumerId);

    for (const meter of mainMeters) {
      const startReading = await prisma.meterReading.findUnique({
        where: {
          meterId_periodCode: { meterId: meter.id, periodCode: '2026-06' },
        },
      });
      const endReading = await prisma.meterReading.findUnique({
        where: {
          meterId_periodCode: { meterId: meter.id, periodCode: '2026-07' },
        },
      });
      if (!startReading || !endReading || !meter.consumerId) {
        console.warn(
          `Пропуск charge для ${meter.serialNumber}: нет показаний 06/07`,
        );
        continue;
      }

      const isGas = meter.resourceTypeCode === 'gas';
      const version = isGas ? gasV2 : elV2;
      const versionWithZones = await prisma.tariff.findUnique({
        where: { id: version.id },
        include: { zones: true },
      });
      if (!versionWithZones) continue;

      await ensureCharge(prisma, {
        consumerId: meter.consumerId,
        meterId: meter.id,
        tariffId: versionWithZones.id,
        periodStart: julyStart,
        periodEnd: julyEnd,
        startReadingId: startReading.id,
        endReadingId: endReading.id,
        start: startReading,
        end: endReading,
        zones: versionWithZones.zones,
        isGas,
      });
    }
    console.log('Начисления за 2026-07 готовы');

    // I. Самопроверка
    const [
      usersCount,
      objectsCount,
      consumersCount,
      metersCount,
      readingsCount,
      tariffsCount,
      chargesCount,
    ] = await Promise.all([
      prisma.user.count({
        where: { email: { endsWith: '@energokontur.local' } },
      }),
      prisma.object.count({
        where: {
          name: {
            in: [
              'БЦ «Север»',
              'Склад «Логистический»',
              'ЖК «Центральный»',
              'Производственный участок «Техно»',
            ],
          },
        },
      }),
      prisma.consumer.count({
        where: {
          name: {
            in: [
              'ООО «Север Бизнес»',
              'ООО «Логистика Демо»',
              'ООО «Техно Производство»',
              'УК «Центральная»',
            ],
          },
        },
      }),
      prisma.meter.count({
        where: { serialNumber: { startsWith: 'DEMO-' } },
      }),
      prisma.meterReading.count({
        where: { meter: { serialNumber: { startsWith: 'DEMO-' } } },
      }),
      prisma.tariff.count({
        where: {
          name: { in: [ELECTRICITY_TARIFF_NAME, GAS_TARIFF_NAME] },
        },
      }),
      prisma.charge.count({
        where: {
          meter: { serialNumber: { startsWith: 'DEMO-' } },
          periodStart: julyStart,
          periodEnd: julyEnd,
        },
      }),
    ]);

    console.log('--- Итоги demo-seed ---');
    console.log(`users (energokontur): ${usersCount}`);
    console.log(`objects: ${objectsCount}`);
    console.log(`consumers: ${consumersCount}`);
    console.log(`meters (DEMO-): ${metersCount}`);
    console.log(`readings (DEMO-): ${readingsCount}`);
    console.log(`tariffs (демо): ${tariffsCount}`);
    console.log(`charges 2026-07 (DEMO-): ${chargesCount}`);
    console.log(
      `demo-admin id=${demoAdmin.id}; demo-consumer id=${demoConsumer.id}`,
    );

    const neg = await prisma.meterReading.count({
      where: {
        anomalyType: 'negative_consumption',
        meter: { serialNumber: { startsWith: 'DEMO-' } },
      },
    });
    const high = await prisma.meterReading.count({
      where: {
        anomalyType: 'high_consumption',
        meter: { serialNumber: { startsWith: 'DEMO-' } },
      },
    });
    const elAfterJuly = await prisma.tariff.count({
      where: {
        name: ELECTRICITY_TARIFF_NAME,
        validFrom: { gte: utcDate(2026, 6, 1) },
      },
    });

    console.log(`anomaly negative_consumption: ${neg}`);
    console.log(`anomaly high_consumption: ${high}`);
    console.log(`тариф электро с validFrom≥2026-07-01: ${elAfterJuly}`);

    if (neg < 1) fail('Нет показания с anomalyType=negative_consumption');
    if (high < 1) fail('Нет показания с anomalyType=high_consumption');
    if (elAfterJuly < 1) {
      fail('Нет версии тарифа электроэнергии после 2026-07-01');
    }
    if (metersCount < 10)
      fail(`Ожидалось ≥10 счётчиков, сейчас ${metersCount}`);
    if (readingsCount < 80) {
      fail(`Ожидалось ≥80 показаний, сейчас ${readingsCount}`);
    }

    console.log('Самопроверка пройдена.');
    console.log(
      'Логин демо-админа: demo-admin@energokontur.local (пароль задан только для локальной demo-среды и не должен публиковаться).',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Критическая ошибка demo-seed:', error);
  process.exit(1);
});
