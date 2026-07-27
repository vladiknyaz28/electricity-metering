const API_BASE = 'http://localhost:4000';

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

function toISODateUTC(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDaysUTC(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // login
  const login = await api('/auth/login', {
    method: 'POST',
    body: {
      email: 'admin@electricity-metering.local',
      password: 'ChangeMe123!',
    },
  });
  const token = login.access_token || login.accessToken;
  if (!token) throw new Error('No token returned');

  const resourceTypes = await api('/resource-types', { token });
  const electricityRt = resourceTypes.find((r) => r.name === 'Электроэнергия');
  if (!electricityRt) throw new Error('Электроэнергия ResourceType not found');

  const consumers = await api('/consumers', { token });
  const consumer = consumers.find((c) => c.name === 'Офис 1');
  if (!consumer) throw new Error('Consumer Офис 1 not found');

  // a) create tariff family (validFrom = today, active immediately)
  const todayStr = toISODateUTC(new Date());
  const created = await api('/tariffs', {
    method: 'POST',
    token,
    body: {
      name: 'Тариф МКД',
      resourceTypeId: electricityRt.id,
      validFrom: todayStr,
      zones: [{ zoneCode: 'T1', rate: 5.5 }],
    },
  });
  const familyId = created.familyId || created.id;
  const t1RateCreated = created.zones?.find((z) => z.zoneCode === 'T1')?.rate;
  console.log(
    `a) familyId=${familyId} validFrom=${created.validFrom} T1=${t1RateCreated}`,
  );

  // b) assign to consumer
  const updatedConsumer = await api(`/consumers/${consumer.id}`, {
    method: 'PATCH',
    token,
    body: { tariffId: familyId },
  });
  console.log(
    `b) consumer.tariffId=${updatedConsumer.tariffId} tariff.name=${updatedConsumer.tariff?.name}`,
  );

  // create dedicated meter for controlled reading diff
  const meterCreate = await api('/meters', {
    method: 'POST',
    token,
    body: {
      objectId: consumer.objectId,
      ownerType: 'consumer',
      consumerId: consumer.id,
      name: `TestMeter ${Date.now()}`,
      serialNumber: `TM-${Date.now()}`,
      resourceTypeId: electricityRt.id,
      meterCategoryCode: 'residential',
      tariffType: 'single',
      accuracyClass: '1.0',
      installationLocation: 'test',
      hasCurrentTransformer: false,
      isMain: false,
      status: 'active',
    },
  });
  const meterId = meterCreate.id;
  console.log(`   created meter id=${meterId}`);

  // baseline readings: prev(day -1), base(day), before(version -2), after(version +2)
  const newValidFromStr = addDaysUTC(todayStr, 7); // d)
  const beforeDateStr = addDaysUTC(newValidFromStr, -2); // f) old rate
  const afterDateStr = addDaysUTC(newValidFromStr, 2); // f) new rate
  const prevDateStr = addDaysUTC(todayStr, -1);

  // monotonic values
  const valPrev = 50;
  const valBase = 100; // base at todayStr
  const valBefore = 200;
  const valAfter = 250;

  // prev
  await api('/readings', {
    method: 'POST',
    token,
    body: {
      meterId,
      readingDate: prevDateStr,
      valueT1: valPrev,
    },
  });
  // base
  await api('/readings', {
    method: 'POST',
    token,
    body: {
      meterId,
      readingDate: todayStr,
      valueT1: valBase,
    },
  });

  // c) verify reading after assignment (todayStr)
  const readings1 = await api(`/readings/meter/${meterId}`, { token });
  const baseReading = readings1.find((r) => String(r.readingDate).startsWith(todayStr));
  console.log(
    `c) base reading date=${baseReading?.readingDate} tariffRateT1=${baseReading?.tariffRateT1} amountT1=${baseReading?.amountT1}`,
  );

  // d) create new version with rate T1=6.0
  const version = await api(`/tariffs/${familyId}/new-version`, {
    method: 'POST',
    token,
    body: { validFrom: newValidFromStr, rateT1: 6.0 },
  });
  console.log(`d) new version validFrom=${version.validFrom}`);

  // e) history
  const history = await api(`/tariffs/${familyId}/history`, { token });
  console.log(`e) versions=${history.versions?.length ?? 0}`);
  for (const v of history.versions ?? []) {
    const t1 = v.zones?.find((z) => z.zoneCode === 'T1')?.rate;
    console.log(`   - validFrom=${v.validFrom} validTo=${v.validTo} T1=${t1}`);
  }

  // f) readings around switch
  await api('/readings', {
    method: 'POST',
    token,
    body: { meterId, readingDate: beforeDateStr, valueT1: valBefore },
  });
  await api('/readings', {
    method: 'POST',
    token,
    body: { meterId, readingDate: afterDateStr, valueT1: valAfter },
  });

  const readings2 = await api(`/readings/meter/${meterId}`, { token });
  const rBefore = readings2.find((r) => String(r.readingDate).startsWith(beforeDateStr));
  const rAfter = readings2.find((r) => String(r.readingDate).startsWith(afterDateStr));

  console.log(
    `f) before ${beforeDateStr}: tariffRateT1=${rBefore?.tariffRateT1} amountT1=${rBefore?.amountT1}`,
  );
  console.log(
    `f) after  ${afterDateStr}: tariffRateT1=${rAfter?.tariffRateT1} amountT1=${rAfter?.amountT1}`,
  );

  console.log('Expected: before ~5.5, after ~6.0');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

