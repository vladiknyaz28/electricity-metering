<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import {
  OfficeBuilding,
  User,
  Odometer,
  DataLine,
} from '@element-plus/icons-vue'
import {
  getDashboardSummary,
  getTariffZoneBreakdown,
} from '../api/dashboard'
import { getObjects } from '../api/objects'
import { getResourceTypes } from '../api/resourceTypes'
import type {
  DashboardAnomaly,
  DashboardByObject,
  DashboardSummary,
  DashboardTrendPoint,
  TariffZoneBreakdownRow,
} from '../types/dashboard'
import type { EnergyObject } from '../types/object'
import type { ResourceType } from '../types/resourceType'
import { resourceTypeColor } from '../utils/resourceColors'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
])

type ChartMetric = 'units' | 'money'
type ObjectSort = 'consumption' | 'name'

const ZONE_COLORS = {
  T1: '#5b6fd8',
  T2: '#8b9aef',
  T3: '#c5cdf7',
} as const

const loadingKpi = ref(false)
const loadingTrend = ref(false)
const loadingObjects = ref(false)
const loadingZones = ref(false)

const objects = ref<EnergyObject[]>([])
const resourceTypes = ref<ResourceType[]>([])

const kpiSummary = ref<DashboardSummary | null>(null)
const trendPoints = ref<DashboardTrendPoint[]>([])
const byObjectRows = ref<DashboardByObject[]>([])
const zoneRows = ref<TariffZoneBreakdownRow[]>([])
const anomalies = ref<DashboardAnomaly[]>([])

const trendMetric = ref<ChartMetric>('units')
const objectMetric = ref<ChartMetric>('units')
const zoneMetric = ref<ChartMetric>('units')
const objectSort = ref<ObjectSort>('consumption')

function defaultPeriod(): [string, string] {
  const end = new Date()
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1))
  return [toIsoDate(start), toIsoDate(end)]
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const trendFilters = reactive({
  period: defaultPeriod() as [string, string],
  objectId: '' as string,
  resourceTypeIds: [] as string[],
})

const objectFilters = reactive({
  period: defaultPeriod() as [string, string],
  resourceTypeIds: [] as string[],
})

const zoneFilters = reactive({
  period: defaultPeriod() as [string, string],
  objectId: '' as string,
  resourceTypeId: '' as string,
})

function formatNum(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}

const kpiCards = computed(() => {
  const kpi = kpiSummary.value?.kpi
  return [
    {
      key: 'objects',
      label: 'Объекты',
      value: formatNum(kpi?.objectsCount),
      icon: OfficeBuilding,
    },
    {
      key: 'consumers',
      label: 'Потребители',
      value: formatNum(kpi?.consumersCount),
      icon: User,
    },
    {
      key: 'meters',
      label: 'Счётчики',
      value: formatNum(kpi?.metersCount),
      icon: Odometer,
    },
    {
      key: 'consumption',
      label: 'Общий расход за период',
      value: formatNum(kpi?.totalConsumption, 2),
      hint:
        kpi?.totalAmount != null
          ? `Сумма: ${formatMoney(kpi.totalAmount)} ₽`
          : undefined,
      icon: DataLine,
    },
  ]
})

const activeResourceTypes = computed(() =>
  resourceTypes.value.filter((t) => t.status === 'active'),
)

function metricValue(
  slice: { consumption: number; amount: number },
  metric: ChartMetric,
) {
  return metric === 'money' ? slice.amount : slice.consumption
}

const trendResourceNames = computed(() => {
  const names = new Set<string>()
  for (const point of trendPoints.value) {
    for (const row of point.byResource) {
      if (
        trendFilters.resourceTypeIds.length === 0 ||
        (row.resourceTypeId &&
          trendFilters.resourceTypeIds.includes(row.resourceTypeId))
      ) {
        names.add(row.resourceName)
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
})

const trendOption = computed(() => {
  const names = trendResourceNames.value
  const useMoney = trendMetric.value === 'money'
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ seriesName: string; value: number; marker: string; axisValue: string }>) => {
        if (!Array.isArray(params) || !params.length) return ''
        const lines = params.map(
          (p) =>
            `${p.marker}${p.seriesName}: ${
              useMoney ? `${formatMoney(p.value)} ₽` : formatNum(p.value, 2)
            }`,
        )
        return `${params[0].axisValue}<br/>${lines.join('<br/>')}`
      },
    },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    grid: { left: 52, right: 24, top: 24, bottom: 56 },
    xAxis: {
      type: 'category',
      data: trendPoints.value.map((p) => p.period),
      axisLine: { lineStyle: { color: '#c5cad6' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: {
      type: 'value',
      name: useMoney ? '₽' : 'ед.',
      axisLabel: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#eef0f4' } },
    },
    series: names.map((name) => ({
      name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: resourceTypeColor(name) },
      lineStyle: { color: resourceTypeColor(name), width: 2 },
      areaStyle: { color: resourceTypeColor(name), opacity: 0.08 },
      data: trendPoints.value.map((point) => {
        const row = point.byResource.find((r) => r.resourceName === name)
        if (!row) return 0
        if (
          trendFilters.resourceTypeIds.length > 0 &&
          row.resourceTypeId &&
          !trendFilters.resourceTypeIds.includes(row.resourceTypeId)
        ) {
          return 0
        }
        return metricValue(row, trendMetric.value)
      }),
    })),
  }
})

const filteredObjectRows = computed(() => {
  let rows = byObjectRows.value.map((obj) => {
    const byResource = obj.byResource.filter(
      (r) =>
        objectFilters.resourceTypeIds.length === 0 ||
        (r.resourceTypeId != null &&
          objectFilters.resourceTypeIds.includes(r.resourceTypeId)),
    )
    const total = byResource.reduce(
      (s, r) => s + metricValue(r, objectMetric.value),
      0,
    )
    return { ...obj, byResource, total }
  })
  rows = rows.filter((r) => r.byResource.length > 0)
  if (objectSort.value === 'name') {
    rows = [...rows].sort((a, b) =>
      a.objectName.localeCompare(b.objectName, 'ru'),
    )
  } else {
    rows = [...rows].sort((a, b) => b.total - a.total)
  }
  return rows
})

const objectResourceNames = computed(() => {
  const names = new Set<string>()
  for (const row of filteredObjectRows.value) {
    for (const r of row.byResource) names.add(r.resourceName)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
})

const objectBarOption = computed(() => {
  const rows = filteredObjectRows.value
  const names = objectResourceNames.value
  const useMoney = objectMetric.value === 'money'
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string; dataIndex: number }>) => {
        if (!Array.isArray(params) || !params.length) return ''
        const obj = rows[params[0].dataIndex]
        if (!obj) return ''
        const lines = params
          .filter((p) => p.value)
          .map(
            (p) =>
              `${p.marker}${p.seriesName}: ${
                useMoney ? `${formatMoney(p.value)} ₽` : formatNum(p.value, 2)
              }`,
          )
        const total = obj.byResource.reduce(
          (s, r) => s + metricValue(r, objectMetric.value),
          0,
        )
        lines.push(
          `<b>Итого: ${
            useMoney ? `${formatMoney(total)} ₽` : formatNum(total, 2)
          }</b>`,
        )
        return `${obj.objectName}<br/>${lines.join('<br/>')}`
      },
    },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    grid: { left: 52, right: 24, top: 24, bottom: 64 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.objectName),
      axisLabel: {
        color: '#6b7280',
        interval: 0,
        rotate: rows.length > 4 ? 20 : 0,
      },
      axisLine: { lineStyle: { color: '#c5cad6' } },
    },
    yAxis: {
      type: 'value',
      name: useMoney ? '₽' : 'ед.',
      axisLabel: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#eef0f4' } },
    },
    series: names.map((name) => ({
      name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 48,
      itemStyle: {
        color: resourceTypeColor(name),
        borderRadius: [0, 0, 0, 0],
      },
      data: rows.map((obj) => {
        const slice = obj.byResource.find((r) => r.resourceName === name)
        return slice ? metricValue(slice, objectMetric.value) : 0
      }),
    })),
  }
})

const zoneBarOption = computed(() => {
  const rows = zoneRows.value
  const useMoney = zoneMetric.value === 'money'
  const zones = ['T1', 'T2', 'T3'] as const
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string; dataIndex: number }>) => {
        if (!Array.isArray(params) || !params.length) return ''
        const row = rows[params[0].dataIndex]
        if (!row) return ''
        const lines = params
          .filter((p) => p.value)
          .map(
            (p) =>
              `${p.marker}${p.seriesName}: ${
                useMoney ? `${formatMoney(p.value)} ₽` : formatNum(p.value, 2)
              }`,
          )
        return `${row.resourceName}<br/>${lines.join('<br/>')}`
      },
    },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    grid: { left: 52, right: 24, top: 24, bottom: 56 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.resourceName),
      axisLabel: { color: '#6b7280' },
      axisLine: { lineStyle: { color: '#c5cad6' } },
    },
    yAxis: {
      type: 'value',
      name: useMoney ? '₽' : 'ед.',
      axisLabel: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#eef0f4' } },
    },
    series: zones.map((zone) => ({
      name: zone,
      type: 'bar',
      stack: 'zones',
      barMaxWidth: 56,
      itemStyle: { color: ZONE_COLORS[zone] },
      data: rows.map((row) => {
        const z = row.zones.find((item) => item.zone === zone)
        if (!z) return 0
        return useMoney ? z.amount : z.consumption
      }),
    })),
  }
})

const hasTrend = computed(() =>
  trendPoints.value.some((p) =>
    p.byResource.some((r) => r.consumption !== 0 || r.amount !== 0),
  ),
)
const hasObjects = computed(() => filteredObjectRows.value.length > 0)
const hasZones = computed(() => zoneRows.value.length > 0)

async function loadFilterOptions() {
  const [objectsData, typesData] = await Promise.all([
    getObjects().catch(() => [] as EnergyObject[]),
    getResourceTypes().catch(() => [] as ResourceType[]),
  ])
  objects.value = objectsData
  resourceTypes.value = typesData
}

async function loadKpiAndAnomalies() {
  loadingKpi.value = true
  try {
    const [periodStart, periodEnd] = defaultPeriod()
    const data = await getDashboardSummary({ periodStart, periodEnd })
    kpiSummary.value = data
    anomalies.value = data.anomalies ?? []
  } catch {
    kpiSummary.value = null
    anomalies.value = []
  } finally {
    loadingKpi.value = false
  }
}

async function loadTrend() {
  loadingTrend.value = true
  try {
    const [periodStart, periodEnd] = trendFilters.period
    const data = await getDashboardSummary({
      periodStart,
      periodEnd,
      objectId: trendFilters.objectId || undefined,
    })
    trendPoints.value = data.consumptionTrend ?? []
  } catch {
    trendPoints.value = []
  } finally {
    loadingTrend.value = false
  }
}

async function loadObjectsChart() {
  loadingObjects.value = true
  try {
    const [periodStart, periodEnd] = objectFilters.period
    const data = await getDashboardSummary({ periodStart, periodEnd })
    byObjectRows.value = data.byObject ?? []
  } catch {
    byObjectRows.value = []
  } finally {
    loadingObjects.value = false
  }
}

async function loadZones() {
  loadingZones.value = true
  try {
    const [periodStart, periodEnd] = zoneFilters.period
    zoneRows.value = await getTariffZoneBreakdown({
      periodStart,
      periodEnd,
      objectId: zoneFilters.objectId || undefined,
      resourceTypeId: zoneFilters.resourceTypeId || undefined,
    })
  } catch {
    zoneRows.value = []
  } finally {
    loadingZones.value = false
  }
}

watch(
  () => [trendFilters.period, trendFilters.objectId],
  () => {
    void loadTrend()
  },
  { deep: true },
)

watch(
  () => objectFilters.period,
  () => {
    void loadObjectsChart()
  },
  { deep: true },
)

watch(
  zoneFilters,
  () => {
    void loadZones()
  },
  { deep: true },
)

onMounted(async () => {
  await loadFilterOptions()
  await Promise.all([
    loadKpiAndAnomalies(),
    loadTrend(),
    loadObjectsChart(),
    loadZones(),
  ])
})
</script>

<template>
  <div class="dashboard">
    <div class="page-head">
      <h1>Дашборд</h1>
      <p class="subtitle">Сводка по объектам, потреблению и показаниям</p>
    </div>

    <section v-loading="loadingKpi" class="kpi-row">
      <div v-for="card in kpiCards" :key="card.key" class="card kpi-card">
        <div class="kpi-icon">
          <el-icon :size="22"><component :is="card.icon" /></el-icon>
        </div>
        <div>
          <div class="kpi-value">{{ card.value }}</div>
          <div class="kpi-label">{{ card.label }}</div>
          <div v-if="card.hint" class="kpi-hint">{{ card.hint }}</div>
        </div>
      </div>
    </section>

    <section v-loading="loadingTrend" class="card chart-card">
      <div class="chart-head">
        <h2>Динамика потребления</h2>
        <el-radio-group v-model="trendMetric" size="small">
          <el-radio-button label="units">В единицах</el-radio-button>
          <el-radio-button label="money">В рублях</el-radio-button>
        </el-radio-group>
      </div>
      <VChart
        v-if="hasTrend"
        class="chart"
        :option="trendOption"
        autoresize
      />
      <el-empty v-else description="Нет данных за период" :image-size="72" />
      <div class="chart-filters">
        <el-date-picker
          v-model="trendFilters.period"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="—"
          start-placeholder="Начало"
          end-placeholder="Конец"
          :clearable="false"
        />
        <el-select
          v-model="trendFilters.objectId"
          clearable
          placeholder="Все объекты"
          style="width: 200px"
        >
          <el-option
            v-for="item in objects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <el-select
          v-model="trendFilters.resourceTypeIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="Все ресурсы"
          style="min-width: 220px"
        >
          <el-option
            v-for="item in activeResourceTypes"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
    </section>

    <section v-loading="loadingObjects" class="card chart-card">
      <div class="chart-head">
        <h2>Потребление по объектам</h2>
        <el-radio-group v-model="objectMetric" size="small">
          <el-radio-button label="units">В единицах</el-radio-button>
          <el-radio-button label="money">В рублях</el-radio-button>
        </el-radio-group>
      </div>
      <VChart
        v-if="hasObjects"
        class="chart chart-tall"
        :option="objectBarOption"
        autoresize
      />
      <el-empty v-else description="Нет данных за период" :image-size="72" />
      <div class="chart-filters">
        <el-date-picker
          v-model="objectFilters.period"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="—"
          start-placeholder="Начало"
          end-placeholder="Конец"
          :clearable="false"
        />
        <el-select
          v-model="objectFilters.resourceTypeIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="Все ресурсы"
          style="min-width: 220px"
        >
          <el-option
            v-for="item in activeResourceTypes"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <el-select
          v-model="objectSort"
          style="width: 220px"
        >
          <el-option label="По убыванию расхода" value="consumption" />
          <el-option label="По названию" value="name" />
        </el-select>
      </div>
    </section>

    <section v-loading="loadingZones" class="card chart-card">
      <div class="chart-head">
        <h2>Структура расхода по тарифным зонам</h2>
        <el-radio-group v-model="zoneMetric" size="small">
          <el-radio-button label="units">В единицах</el-radio-button>
          <el-radio-button label="money">В рублях</el-radio-button>
        </el-radio-group>
      </div>
      <VChart
        v-if="hasZones"
        class="chart chart-tall"
        :option="zoneBarOption"
        autoresize
      />
      <el-empty v-else description="Нет данных за период" :image-size="72" />
      <div class="chart-filters">
        <el-date-picker
          v-model="zoneFilters.period"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="—"
          start-placeholder="Начало"
          end-placeholder="Конец"
          :clearable="false"
        />
        <el-select
          v-model="zoneFilters.objectId"
          clearable
          placeholder="Все объекты"
          style="width: 200px"
        >
          <el-option
            v-for="item in objects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <el-select
          v-model="zoneFilters.resourceTypeId"
          clearable
          placeholder="Все ресурсы"
          style="width: 200px"
        >
          <el-option
            v-for="item in activeResourceTypes"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Аномалии (отрицательная минусовка)</h2>
      <el-table
        v-if="anomalies.length"
        :data="anomalies"
        stripe
        class="anomaly-table"
        empty-text="Аномалий не найдено"
      >
        <el-table-column prop="objectName" label="Объект" min-width="140" />
        <el-table-column prop="meterName" label="Счётчик" min-width="140" />
        <el-table-column prop="readingDate" label="Дата" width="120">
          <template #default="{ row }">
            {{ formatDate(row.readingDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="period" label="Период" width="100" />
        <el-table-column
          prop="minusovka"
          label="Минусовка"
          align="right"
          width="130"
        >
          <template #default="{ row }">
            <span class="anomaly-value">{{ formatNum(row.minusovka, 2) }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-else
        description="Аномалий не найдено"
        :image-size="72"
      />
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 320px;
}

.page-head h1 {
  margin: 0;
  font-size: 1.45rem;
  color: #1f2937;
}

.subtitle {
  margin: 0.25rem 0 0;
  color: #6b7280;
  font-size: 0.95rem;
}

.card {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(31, 41, 55, 0.06), 0 1px 2px rgba(31, 41, 55, 0.04);
  padding: 1rem 1.15rem;
}

.card h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
}

.section-title {
  margin-bottom: 0.85rem !important;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}

.chart-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid #eef0f4;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;
}

.kpi-card {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
}

.kpi-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: rgba(91, 111, 216, 0.12);
  color: #5b6fd8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.kpi-label {
  margin-top: 0.15rem;
  color: #6b7280;
  font-size: 0.9rem;
}

.kpi-hint {
  margin-top: 0.2rem;
  color: #5b6fd8;
  font-size: 0.82rem;
}

.chart {
  width: 100%;
  height: 300px;
}

.chart-tall {
  height: 340px;
}

.anomaly-table :deep(.el-table__row) {
  --el-table-tr-bg-color: #fff5f5;
}

.anomaly-table :deep(.el-table__row.el-table__row--striped) {
  --el-table-tr-bg-color: #ffecec;
}

.anomaly-value {
  color: #c0392b;
  font-weight: 600;
}

@media (max-width: 1100px) {
  .kpi-row {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .kpi-row {
    grid-template-columns: 1fr;
  }
}
</style>
