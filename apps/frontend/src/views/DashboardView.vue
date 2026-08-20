<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
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
} from '@element-plus/icons-vue'
import {
  getDashboardByConsumer,
  getDashboardSummary,
} from '../api/dashboard'
import { getObjects } from '../api/objects'
import { getConsumers } from '../api/consumers'
import { getResourceTypes } from '../api/resourceTypes'
import type {
  DashboardAnomaly,
  DashboardByConsumer,
  DashboardByObject,
  DashboardByResource,
  DashboardKpiResource,
  DashboardSummary,
} from '../types/dashboard'
import type { EnergyObject } from '../types/object'
import type { Consumer } from '../types/consumer'
import type { ResourceType } from '../types/resourceType'
import {
  defaultUnitForResource,
  resourceTypeColor,
  resourceTypeSoftBg,
  resourceTypeTitle,
} from '../utils/resourceColors'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
])

type ChartMetric = 'units' | 'money'
type ObjectSort = 'consumption' | 'name'

const loadingKpi = ref(false)
const loadingPie = ref(false)
const loadingObjects = ref(false)
const loadingConsumers = ref(false)

const objects = ref<EnergyObject[]>([])
const consumers = ref<Consumer[]>([])
const resourceTypes = ref<ResourceType[]>([])

const kpi = ref<DashboardSummary['kpi'] | null>(null)
const anomalies = ref<DashboardAnomaly[]>([])
const pieRows = ref<DashboardByResource[]>([])
const byObjectRows = ref<DashboardByObject[]>([])
const byConsumerRows = ref<DashboardByConsumer[]>([])

const pieMetric = ref<ChartMetric>('units')
const objectMetric = ref<ChartMetric>('units')
const consumerMetric = ref<ChartMetric>('units')
const objectSort = ref<ObjectSort>('consumption')

function defaultPeriod(): [string, string] {
  const end = new Date()
  const start = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1),
  )
  return [toIsoDate(start), toIsoDate(end)]
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

const pieFilters = reactive({
  period: defaultPeriod() as [string, string],
  objectId: '' as string,
})

const objectFilters = reactive({
  period: defaultPeriod() as [string, string],
  resourceTypeIds: [] as string[],
})

const consumerFilters = reactive({
  period: defaultPeriod() as [string, string],
  objectId: '' as string,
  consumerIds: [] as string[],
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

function metricValue(
  slice: { consumption: number; amount: number },
  metric: ChartMetric,
) {
  return metric === 'money' ? slice.amount : slice.consumption
}

const countCards = computed(() => [
  {
    key: 'objects',
    label: 'Объекты',
    value: formatNum(kpi.value?.objectsCount),
    icon: OfficeBuilding,
  },
  {
    key: 'consumers',
    label: 'Потребители',
    value: formatNum(kpi.value?.consumersCount),
    icon: User,
  },
  {
    key: 'meters',
    label: 'Счётчики',
    value: formatNum(kpi.value?.metersCount),
    icon: Odometer,
  },
])

const resourceKpiCards = computed(
  (): DashboardKpiResource[] => kpi.value?.totalConsumptionByResource ?? [],
)

const activeResourceTypes = computed(() =>
  resourceTypes.value.filter((t) => t.status === 'active'),
)

const consumerOptions = computed(() => {
  const list = consumerFilters.objectId
    ? consumers.value.filter((c) => c.objectId === consumerFilters.objectId)
    : consumers.value
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
})

const pieOption = computed(() => {
  const rows = pieRows.value.filter(
    (r) => (pieMetric.value === 'money' ? r.amount : r.consumption) > 0,
  )
  const useMoney = pieMetric.value === 'money'
  // Цвета только в series.data[].itemStyle: top-level `color` в vue-echarts v8
  // может попасть в replaceMerge (это не main type компонента ECharts).
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params: {
        name?: string
        dataIndex?: number
        percent?: number
      }) => {
        const row = rows[params.dataIndex ?? 0]
        if (!row) return params.name ?? ''
        const unit = row.unit || defaultUnitForResource(row.resourceType) || 'ед.'
        const pct =
          params.percent != null ? ` (${params.percent.toFixed(1)}%)` : ''
        return `${row.resourceType}: ${formatNum(row.consumption, 2)} ${unit} · ${formatMoney(row.amount)} ₽${pct}`
      },
    },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: {
          color: '#4b5563',
          formatter: '{b}\n{d}%',
        },
        data: rows.map((r) => ({
          name: r.resourceType,
          value: useMoney ? r.amount : r.consumption,
          itemStyle: { color: resourceTypeColor(r.resourceType) },
        })),
      },
    ],
  }
})

const hasPie = computed(() =>
  pieRows.value.some(
    (r) => (pieMetric.value === 'money' ? r.amount : r.consumption) > 0,
  ),
)

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
      formatter: (
        params: Array<{
          seriesName: string
          value: number
          marker: string
          dataIndex: number
        }>,
      ) => {
        if (!Array.isArray(params) || !params.length) return ''
        const obj = rows[params[0].dataIndex]
        if (!obj) return ''
        const lines = params
          .filter((p) => p.value)
          .map(
            (p) =>
              `${p.marker}${p.seriesName}: ${
                useMoney ? `${formatMoney(p.value)} ₽` : `${formatNum(p.value, 2)} ед.`
              }`,
          )
        const total = obj.byResource.reduce(
          (s, r) => s + metricValue(r, objectMetric.value),
          0,
        )
        lines.push(
          `<b>Итого: ${
            useMoney ? `${formatMoney(total)} ₽` : `${formatNum(total, 2)} ед.`
          }</b>`,
        )
        return `${obj.objectName}<br/>${lines.join('<br/>')}`
      },
    },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    grid: { left: 52, right: 24, top: 16, bottom: 56 },
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
    series: names.map((name, index) => ({
      name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 48,
      itemStyle: {
        color: resourceTypeColor(name),
        borderRadius:
          index === names.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0],
      },
      data: rows.map((obj) => {
        const slice = obj.byResource.find((r) => r.resourceName === name)
        return slice ? metricValue(slice, objectMetric.value) : 0
      }),
    })),
  }
})

const consumerResourceNames = computed(() => {
  const names = new Set<string>()
  for (const row of byConsumerRows.value) {
    for (const r of row.byResource) names.add(r.resourceName)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'))
})

const consumerBarOption = computed(() => {
  const rows = [...byConsumerRows.value].reverse()
  const names = consumerResourceNames.value
  const useMoney = consumerMetric.value === 'money'
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (
        params: Array<{
          seriesName: string
          value: number
          marker: string
          dataIndex: number
        }>,
      ) => {
        if (!Array.isArray(params) || !params.length) return ''
        const row = rows[params[0].dataIndex]
        if (!row) return ''
        const lines = params
          .filter((p) => p.value)
          .map(
            (p) =>
              `${p.marker}${p.seriesName}: ${
                useMoney ? `${formatMoney(p.value)} ₽` : `${formatNum(p.value, 2)} ед.`
              }`,
          )
        const total = row.byResource.reduce(
          (s, r) => s + metricValue(r, consumerMetric.value),
          0,
        )
        lines.push(
          `<b>Итого: ${
            useMoney ? `${formatMoney(total)} ₽` : `${formatNum(total, 2)} ед.`
          }</b>`,
        )
        return `${row.consumerName} · ${row.objectName}<br/>${lines.join('<br/>')}`
      },
    },
    legend: { bottom: 0, textStyle: { color: '#6b7280' } },
    grid: {
      left: 140,
      right: 24,
      top: 16,
      bottom: 56,
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => r.consumerName),
      axisLabel: { color: '#6b7280', width: 120, overflow: 'truncate' },
      axisLine: { lineStyle: { color: '#c5cad6' } },
    },
    xAxis: {
      type: 'value',
      name: useMoney ? '₽' : 'ед.',
      axisLabel: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#eef0f4' } },
    },
    series: names.map((name, index) => ({
      name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 22,
      itemStyle: {
        color: resourceTypeColor(name),
        borderRadius:
          index === names.length - 1 ? [0, 6, 6, 0] : [0, 0, 0, 0],
      },
      data: rows.map((row) => {
        const slice = row.byResource.find((r) => r.resourceName === name)
        return slice ? metricValue(slice, consumerMetric.value) : 0
      }),
    })),
  }
})

const hasObjects = computed(() => filteredObjectRows.value.length > 0)
const hasConsumers = computed(() => byConsumerRows.value.length > 0)

async function loadFilterOptions() {
  const [objectsData, consumersData, typesData] = await Promise.all([
    getObjects().catch(() => [] as EnergyObject[]),
    getConsumers().catch(() => [] as Consumer[]),
    getResourceTypes().catch(() => [] as ResourceType[]),
  ])
  objects.value = objectsData
  consumers.value = consumersData
  resourceTypes.value = typesData
}

async function loadKpiAndAnomalies() {
  loadingKpi.value = true
  try {
    const [periodStart, periodEnd] = defaultPeriod()
    const data = await getDashboardSummary({ periodStart, periodEnd })
    kpi.value = data.kpi
    anomalies.value = data.anomalies ?? []
  } catch {
    kpi.value = null
    anomalies.value = []
  } finally {
    loadingKpi.value = false
  }
}

async function loadPie() {
  loadingPie.value = true
  try {
    const [periodStart, periodEnd] = pieFilters.period
    const data = await getDashboardSummary({
      periodStart,
      periodEnd,
      objectId: pieFilters.objectId || undefined,
    })
    pieRows.value = data.byResourceType ?? []
  } catch {
    pieRows.value = []
  } finally {
    loadingPie.value = false
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

async function loadConsumersChart() {
  loadingConsumers.value = true
  try {
    const [periodStart, periodEnd] = consumerFilters.period
    byConsumerRows.value = await getDashboardByConsumer({
      periodStart,
      periodEnd,
      objectId: consumerFilters.objectId || undefined,
      consumerIds: consumerFilters.consumerIds.length
        ? consumerFilters.consumerIds
        : undefined,
    })
  } catch {
    byConsumerRows.value = []
  } finally {
    loadingConsumers.value = false
  }
}

watch(pieFilters, () => void loadPie(), { deep: true })
watch(
  () => objectFilters.period,
  () => void loadObjectsChart(),
  { deep: true },
)
watch(consumerFilters, () => void loadConsumersChart(), { deep: true })

onMounted(async () => {
  await loadFilterOptions()
  await Promise.all([
    loadKpiAndAnomalies(),
    loadPie(),
    loadObjectsChart(),
    loadConsumersChart(),
  ])
})
</script>

<template>
  <div class="dashboard">
    <div class="page-head">
      <h1>Дашборд</h1>
      <p class="subtitle">Сводка по объектам, потреблению и показаниям</p>
    </div>

    <section v-loading="loadingKpi" class="kpi-block">
      <div class="kpi-row counts">
        <div v-for="card in countCards" :key="card.key" class="card kpi-card">
          <div class="kpi-icon">
            <el-icon :size="22"><component :is="card.icon" /></el-icon>
          </div>
          <div>
            <div class="kpi-value">{{ card.value }}</div>
            <div class="kpi-label">{{ card.label }}</div>
          </div>
        </div>
      </div>

      <div v-if="resourceKpiCards.length" class="kpi-row resources">
        <div
          v-for="card in resourceKpiCards"
          :key="card.resourceTypeId || card.resourceName"
          class="card kpi-card resource-kpi"
          :style="{
            borderLeftColor: resourceTypeColor(card.resourceName),
            background: resourceTypeSoftBg(card.resourceName),
          }"
        >
          <div
            class="resource-kpi-icon"
            :style="{ color: resourceTypeColor(card.resourceName) }"
          >
            {{ resourceTypeTitle(card.resourceName).split(' ')[0] }}
          </div>
          <div>
            <div class="kpi-label">Общий расход · {{ card.resourceName }}</div>
            <div
              class="kpi-value resource-value"
              :style="{ color: resourceTypeColor(card.resourceName) }"
            >
              {{ formatNum(card.consumption, 2) }}
              <span class="unit">{{ card.unit || defaultUnitForResource(card.resourceName) }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-loading="loadingPie" class="card chart-card">
      <div class="chart-header">
        <div class="chart-title-row">
          <h2>Расходы по категориям</h2>
          <el-radio-group v-model="pieMetric" size="small">
            <el-radio-button label="units">В единицах</el-radio-button>
            <el-radio-button label="money">В рублях</el-radio-button>
          </el-radio-group>
        </div>
        <div class="chart-filters">
          <el-date-picker
            v-model="pieFilters.period"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="—"
            start-placeholder="Начало"
            end-placeholder="Конец"
            :clearable="false"
          />
          <el-select
            v-model="pieFilters.objectId"
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
        </div>
      </div>
      <div class="chart-body">
        <VChart
          v-if="hasPie"
          class="chart"
          :option="pieOption"
          autoresize
        />
        <el-empty
          v-else
          :description="
            pieRows.length
              ? 'Нет положительного расхода за период (возможна минусовка)'
              : 'Нет данных за период'
          "
          :image-size="72"
        />
      </div>
    </section>

    <section v-loading="loadingObjects" class="card chart-card">
      <div class="chart-header">
        <div class="chart-title-row">
          <h2>Потребление по объектам</h2>
          <el-radio-group v-model="objectMetric" size="small">
            <el-radio-button label="units">В единицах</el-radio-button>
            <el-radio-button label="money">В рублях</el-radio-button>
          </el-radio-group>
        </div>
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
          <el-select v-model="objectSort" style="width: 220px">
            <el-option label="По убыванию расхода" value="consumption" />
            <el-option label="По названию" value="name" />
          </el-select>
        </div>
      </div>
      <div class="chart-body">
        <VChart
          v-if="hasObjects"
          class="chart chart-tall"
          :option="objectBarOption"
          autoresize
        />
        <el-empty v-else description="Нет данных за период" :image-size="72" />
      </div>
    </section>

    <section v-loading="loadingConsumers" class="card chart-card">
      <div class="chart-header">
        <div class="chart-title-row">
          <h2>Расходы по потребителям</h2>
          <el-radio-group v-model="consumerMetric" size="small">
            <el-radio-button label="units">В единицах</el-radio-button>
            <el-radio-button label="money">В рублях</el-radio-button>
          </el-radio-group>
        </div>
        <div class="chart-filters">
          <el-date-picker
            v-model="consumerFilters.period"
            type="daterange"
            value-format="YYYY-MM-DD"
            range-separator="—"
            start-placeholder="Начало"
            end-placeholder="Конец"
            :clearable="false"
          />
          <el-select
            v-model="consumerFilters.objectId"
            clearable
            placeholder="Все объекты"
            style="width: 200px"
            @change="consumerFilters.consumerIds = []"
          >
            <el-option
              v-for="item in objects"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
          <el-select
            v-model="consumerFilters.consumerIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            clearable
            placeholder="Все / топ потребители"
            style="min-width: 260px"
          >
            <el-option
              v-for="item in consumerOptions"
              :key="item.id"
              :label="`${item.name} · ${item.object?.name || ''}`"
              :value="item.id"
            />
          </el-select>
        </div>
      </div>
      <div class="chart-body">
        <VChart
          v-if="hasConsumers"
          class="chart chart-consumers"
          :option="consumerBarOption"
          autoresize
        />
        <el-empty v-else description="Нет данных за период" :image-size="72" />
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
      <el-empty v-else description="Аномалий не найдено" :image-size="72" />
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
  box-shadow:
    0 1px 3px rgba(31, 41, 55, 0.06),
    0 1px 2px rgba(31, 41, 55, 0.04);
  padding: 1rem 1.15rem;
}

.card h2,
.section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
}

.section-title {
  margin-bottom: 0.85rem;
}

.kpi-block {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.kpi-row {
  display: grid;
  gap: 1rem;
}

.kpi-row.counts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.kpi-row.resources {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.kpi-card {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
}

.resource-kpi {
  border-left: 4px solid;
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

.resource-kpi-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.kpi-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.resource-value .unit {
  font-size: 0.85rem;
  font-weight: 600;
  margin-left: 0.25rem;
}

.kpi-label {
  margin-top: 0.15rem;
  color: #6b7280;
  font-size: 0.9rem;
}

.chart-header {
  padding-bottom: 0.85rem;
  margin-bottom: 0.85rem;
  border-bottom: 1px solid #eef0f4;
}

.chart-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.65rem;
}

.chart-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: center;
}

.chart {
  width: 100%;
  height: 300px;
}

.chart-tall {
  height: 340px;
}

.chart-consumers {
  height: 380px;
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

@media (max-width: 900px) {
  .kpi-row.counts {
    grid-template-columns: 1fr;
  }
}
</style>
