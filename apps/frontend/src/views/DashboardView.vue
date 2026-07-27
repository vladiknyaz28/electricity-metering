<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
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
import { getDashboardSummary } from '../api/dashboard'
import { getObjects } from '../api/objects'
import { getResourceTypes } from '../api/resourceTypes'
import type { DashboardSummary } from '../types/dashboard'
import type { EnergyObject } from '../types/object'
import type { ResourceType } from '../types/resourceType'

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
])

const ACCENT = '#5b6fd8'

const loading = ref(false)
const summary = ref<DashboardSummary | null>(null)
const objects = ref<EnergyObject[]>([])
const resourceTypes = ref<ResourceType[]>([])

const filters = ref({
  period: defaultPeriod() as [string, string],
  objectId: '' as string,
  resourceTypeId: '' as string,
})

function defaultPeriod(): [string, string] {
  const end = new Date()
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1))
  return [toIsoDate(start), toIsoDate(end)]
}

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU')
}

const kpiCards = computed(() => {
  const kpi = summary.value?.kpi
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

const hasTrend = computed(
  () => (summary.value?.consumptionTrend ?? []).some((p) => p.consumption !== 0),
)
const hasByResource = computed(
  () => (summary.value?.byResourceType ?? []).length > 0,
)
const hasByObject = computed(() => (summary.value?.byObject ?? []).length > 0)
const anomalies = computed(() => summary.value?.anomalies ?? [])
const recent = computed(() => summary.value?.recentReadings ?? [])

const trendOption = computed(() => {
  const points = summary.value?.consumptionTrend ?? []
  return {
    color: [ACCENT],
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: 24, bottom: 32 },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.period),
      axisLine: { lineStyle: { color: '#c5cad6' } },
      axisLabel: { color: '#6b7280' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#eef0f4' } },
    },
    series: [
      {
        name: 'Расход',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: points.map((p) => p.consumption),
        areaStyle: { color: 'rgba(91, 111, 216, 0.12)' },
      },
    ],
  }
})

const pieOption = computed(() => {
  const rows = summary.value?.byResourceType ?? []
  return {
    color: ['#5b6fd8', '#7c8fe0', '#9aa8e8', '#6bc4a6', '#e8a87c', '#c47c9a'],
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      bottom: 0,
      textStyle: { color: '#6b7280' },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        label: { color: '#4b5563', formatter: '{b}' },
        data: rows.map((r) => ({
          name: r.resourceType,
          value: r.consumption,
        })),
      },
    ],
  }
})

const barOption = computed(() => {
  const rows = summary.value?.byObject ?? []
  return {
    color: [ACCENT],
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 24, top: 24, bottom: 48 },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.objectName),
      axisLabel: { color: '#6b7280', interval: 0, rotate: rows.length > 4 ? 20 : 0 },
      axisLine: { lineStyle: { color: '#c5cad6' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#6b7280' },
      splitLine: { lineStyle: { color: '#eef0f4' } },
    },
    series: [
      {
        name: 'Расход',
        type: 'bar',
        barMaxWidth: 48,
        data: rows.map((r) => r.consumption),
        itemStyle: { borderRadius: [6, 6, 0, 0] },
      },
    ],
  }
})

async function loadFilters() {
  const [objectsData, typesData] = await Promise.all([
    getObjects().catch(() => [] as EnergyObject[]),
    getResourceTypes().catch(() => [] as ResourceType[]),
  ])
  objects.value = objectsData
  resourceTypes.value = typesData.filter((t) => t.status === 'active')
}

async function loadSummary() {
  loading.value = true
  try {
    const [periodStart, periodEnd] = filters.value.period
    summary.value = await getDashboardSummary({
      periodStart,
      periodEnd,
      objectId: filters.value.objectId || undefined,
      resourceTypeId: filters.value.resourceTypeId || undefined,
    })
  } catch {
    summary.value = {
      kpi: {
        objectsCount: 0,
        consumersCount: 0,
        metersCount: 0,
        totalConsumption: 0,
        totalAmount: 0,
      },
      consumptionTrend: [],
      byObject: [],
      byResourceType: [],
      anomalies: [],
      recentReadings: [],
    }
  } finally {
    loading.value = false
  }
}

watch(
  filters,
  () => {
    void loadSummary()
  },
  { deep: true },
)

onMounted(async () => {
  await loadFilters()
  await loadSummary()
})
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <div class="page-head">
      <h1>Дашборд</h1>
      <p class="subtitle">Сводка по объектам, потреблению и показаниям</p>
    </div>

    <section class="card filters">
      <el-date-picker
        v-model="filters.period"
        type="daterange"
        value-format="YYYY-MM-DD"
        range-separator="—"
        start-placeholder="Начало"
        end-placeholder="Конец"
        :clearable="false"
      />
      <el-select
        v-model="filters.objectId"
        clearable
        placeholder="Все объекты"
        style="width: 220px"
      >
        <el-option label="Все объекты" value="" />
        <el-option
          v-for="item in objects"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <el-select
        v-model="filters.resourceTypeId"
        clearable
        placeholder="Все ресурсы"
        style="width: 220px"
      >
        <el-option label="Все ресурсы" value="" />
        <el-option
          v-for="item in resourceTypes"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
    </section>

    <section class="kpi-row">
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

    <section class="charts-row">
      <div class="card chart-card">
        <h2>Динамика потребления</h2>
        <VChart
          v-if="hasTrend"
          class="chart"
          :option="trendOption"
          autoresize
        />
        <el-empty v-else description="Нет данных за период" :image-size="72" />
      </div>
      <div class="card chart-card">
        <h2>По типам ресурса</h2>
        <VChart
          v-if="hasByResource"
          class="chart"
          :option="pieOption"
          autoresize
        />
        <el-empty v-else description="Нет данных за период" :image-size="72" />
      </div>
    </section>

    <section class="card chart-card wide">
      <h2>Потребление по объектам</h2>
      <VChart
        v-if="hasByObject"
        class="chart chart-tall"
        :option="barOption"
        autoresize
      />
      <el-empty v-else description="Нет данных за период" :image-size="72" />
    </section>

    <section class="card">
      <h2>Аномалии (отрицательная минусовка)</h2>
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

    <section class="card">
      <h2>Последние показания</h2>
      <el-table
        v-if="recent.length"
        :data="recent"
        stripe
        empty-text="Пока нет показаний"
      >
        <el-table-column prop="objectName" label="Объект" min-width="140" />
        <el-table-column prop="meterName" label="Счётчик" min-width="140" />
        <el-table-column prop="date" label="Дата показания" width="140">
          <template #default="{ row }">
            {{ formatDate(row.date) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="consumption"
          label="Расход"
          align="right"
          width="120"
        >
          <template #default="{ row }">
            {{ row.consumption == null ? '—' : formatNum(row.consumption, 2) }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="Внесено" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="Пока нет показаний" :image-size="72" />
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 320px;
  background: transparent;
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
  margin: 0 0 0.85rem;
  font-size: 1rem;
  font-weight: 600;
  color: #374151;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
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

.charts-row {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 1rem;
}

.chart {
  width: 100%;
  height: 280px;
}

.chart-tall {
  height: 320px;
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
  .kpi-row,
  .charts-row {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .kpi-row,
  .charts-row {
    grid-template-columns: 1fr;
  }
}
</style>
