<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Edit, WarningFilled, DataAnalysis, EditPen } from '@element-plus/icons-vue'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { getMeter, updateMeter } from '../api/meters'
import {
  createReading,
  deleteReading,
  getReadings,
  updateReading,
} from '../api/readings'
import { getTariffFamilies } from '../api/tariffs'
import type { Meter } from '../types/meter'
import type { MeterReading } from '../types/reading'
import type { TariffFamily } from '../types/tariff'

type ZoneCode = 'T1' | 'T2' | 'T3'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const canManage = computed(
  () => authStore.role === 'admin' || authStore.role === 'object_manager',
)
const isSuperAdmin = computed(() => authStore.isSuperAdmin)

const tariffTypeLabels: Record<string, string> = {
  single: 'Однотарифный',
  double: 'Двухтарифный',
  two_zone: 'Двухзонный',
  triple: 'Трёхтарифный',
}

const meterId = computed(() => {
  const value = route.query.meterId
  return typeof value === 'string' && value ? value : null
})

const meter = ref<Meter | null>(null)
const readings = ref<MeterReading[]>([])
const loading = ref(false)
const tariffFamilies = ref<TariffFamily[]>([])

const tariffDialogVisible = ref(false)
const selectedTariffId = ref<string | null>(null)
const savingTariff = ref(false)

const dialogVisible = ref(false)
const editing = ref<MeterReading | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()

const form = reactive<{
  readingDate: string
  valueT1: number | undefined
  valueT2: number | undefined
  valueT3: number | undefined
  comment: string
}>({
  readingDate: '',
  valueT1: undefined,
  valueT2: undefined,
  valueT3: undefined,
  comment: '',
})

const manualRateEnabled = reactive<Record<ZoneCode, boolean>>({
  T1: false,
  T2: false,
  T3: false,
})
const manualRateValue = reactive<Record<ZoneCode, number | undefined>>({
  T1: undefined,
  T2: undefined,
  T3: undefined,
})
/** Явный сброс override → PATCH null */
const clearRateOverride = reactive<Record<ZoneCode, boolean>>({
  T1: false,
  T2: false,
  T3: false,
})

const tableRef = ref()
const expandRowKeys = ref<string[]>([])

/** Колонки таблицы: для single — T1; иначе все зоны (полный учёт / двухтариф). */
const showT1 = computed(() => true)
const showT2 = computed(
  () =>
    meter.value?.tariffType === 'double' ||
    meter.value?.tariffType === 'two_zone' ||
    meter.value?.tariffType === 'triple',
)
const showT3 = computed(
  () =>
    meter.value?.tariffType === 'double' ||
    meter.value?.tariffType === 'two_zone' ||
    meter.value?.tariffType === 'triple',
)

/** Остаток/разбивка: явные дети ИЛИ (для главного) неприкреплённые счётчики объекта. */
const showResidual = computed(
  () =>
    readings.value.some(
      (row) =>
        row.hasChildren === true || (row.childrenBreakdown?.length ?? 0) > 0,
    ) || (meter.value?._count?.children ?? 0) > 0,
)

/** Колонки остатка по зонам — если backend отдал хотя бы одну (тарифицируемых зон ≥ 2). */
const showResidualT1 = computed(() =>
  readings.value.some((row) => row.residualT1 != null),
)
const showResidualT2 = computed(() =>
  readings.value.some((row) => row.residualT2 != null),
)
const showResidualT3 = computed(() =>
  readings.value.some((row) => row.residualT3 != null),
)

/** Стабильный список колонок детей (только тот же resourceType, что у текущего счётчика). */
const childColumns = computed(() => {
  if (!showResidual.value) return []
  const parentTypeId = meter.value?.resourceTypeId ?? null
  for (const row of readings.value) {
    if (row.childrenBreakdown?.length) {
      return row.childrenBreakdown
        .filter((item) => {
          // Defensive: чужой resourceTypeId отсекаем; без поля — доверяем backend
          if (item.resourceTypeId === undefined) return true
          return (item.resourceTypeId ?? null) === parentTypeId
        })
        .map((item) => ({
          meterId: item.meterId,
          label: item.label,
        }))
    }
  }
  return []
})

const unitSuffix = computed(() =>
  meterUnit.value ? ` (${meterUnit.value})` : '',
)

const transformerRatio = computed(() => {
  const raw = meter.value?.transformerRatio
  if (raw == null || raw === '') return 1
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 1
})

const meterUnit = computed(
  () => meter.value?.resourceType?.unit || meter.value?.unit || '',
)

/** Тариф на странице показаний: только для счётчиков без потребителя. */
const showMeterTariffInfo = computed(
  () => Boolean(meter.value && !meter.value.consumerId),
)

const canChangeMeterTariff = computed(
  () => showMeterTariffInfo.value && authStore.isSuperAdmin,
)

const meterTariffLabel = computed(() => {
  const m = meter.value
  if (!m) return '—'
  const family = tariffFamilies.value.find((item) => item.familyId === m.tariffId)
  if (family) return family.name
  return tariffTypeLabels[m.tariffType] || m.tariffType || '—'
})

const tariffOptionsForMeter = computed(() => {
  const typeId = meter.value?.resourceTypeId
  if (!typeId) return []
  return tariffFamilies.value.filter(
    (item) => item.status === 'active' && item.resourceTypeId === typeId,
  )
})

const rules = computed<FormRules>(() => ({
  readingDate: [{ required: true, message: 'Укажите дату', trigger: 'change' }],
  valueT1: [{ required: true, message: 'Укажите T1 (можно 0)', trigger: 'blur' }],
}))

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}

function formatNum(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 4 })
}

function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatRate(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

/** Итоговый расход: T1 если > 0, иначе T2+T3 (без задвоения). */
function totalConsumption(row: MeterReading): number | null {
  if (row.totalConsumption != null) return row.totalConsumption
  const t1 = row.consumptionT1 ?? 0
  if (t1 > 0) return t1
  const sum = (row.consumptionT2 ?? 0) + (row.consumptionT3 ?? 0)
  return sum
}

function currentValue(row: MeterReading, zone: 'T1' | 'T2' | 'T3') {
  if (zone === 'T1') return row.valueT1Display ?? row.valueT1
  if (zone === 'T2') return row.valueT2Display ?? row.valueT2
  return row.valueT3Display ?? row.valueT3
}

function childBreakdown(
  row: MeterReading,
  meterId: string,
): { consumption: number; hasData: boolean } | null {
  const item = row.childrenBreakdown?.find((entry) => entry.meterId === meterId)
  return item ?? null
}

const compareRowId = ref<string | null>(null)
const compareInclude = reactive<Record<ZoneCode, boolean>>({
  T1: true,
  T2: true,
  T3: true,
})

function zoneConsumption(
  row: MeterReading,
  zone: ZoneCode,
): number | null {
  const raw =
    zone === 'T1'
      ? row.consumptionT1
      : zone === 'T2'
        ? row.consumptionT2
        : row.consumptionT3
  if (raw == null || Number.isNaN(Number(raw)) || Number(raw) === 0) {
    return null
  }
  return Number(raw)
}

function zoneRate(row: MeterReading, zone: ZoneCode): number | null {
  const raw =
    zone === 'T1'
      ? row.tariffRateT1
      : zone === 'T2'
        ? row.tariffRateT2
        : row.tariffRateT3
  if (raw == null || Number.isNaN(Number(raw))) return null
  return Number(raw)
}

function availableZones(row: MeterReading): ZoneCode[] {
  return (['T1', 'T2', 'T3'] as ZoneCode[]).filter(
    (zone) => zoneConsumption(row, zone) != null,
  )
}

function canCompareZones(row: MeterReading) {
  return availableZones(row).length > 0
}

function resetCompareZonesOnly(row: MeterReading) {
  const available = new Set(availableZones(row))
  compareInclude.T1 = available.has('T1')
  compareInclude.T2 = available.has('T2')
  compareInclude.T3 = available.has('T3')
}

function clearComparePreview() {
  compareRowId.value = null
  compareInclude.T1 = true
  compareInclude.T2 = true
  compareInclude.T3 = true
  expandRowKeys.value = []
}

function toggleZoneCompare(row: MeterReading) {
  if (compareRowId.value === row.id) {
    clearComparePreview()
    return
  }
  compareRowId.value = row.id
  resetCompareZonesOnly(row)
  expandRowKeys.value = [row.id]
}

function collapseZoneCompare() {
  clearComparePreview()
}

function onExpandChange(row: MeterReading, expandedRows: MeterReading[]) {
  const open = expandedRows.some((item) => item.id === row.id)
  if (!open && compareRowId.value === row.id) {
    clearComparePreview()
  }
}

function isPreviewRow(row: MeterReading) {
  return compareRowId.value === row.id
}

function isZoneExcluded(row: MeterReading, zone: ZoneCode) {
  return isPreviewRow(row) && !compareInclude[zone]
}

function displayTotalAmount(row: MeterReading): number | null {
  if (isPreviewRow(row)) return compareCalculatedSum(row)
  return row.totalAmount
}

function tableRowClassName({ row }: { row: MeterReading }) {
  return isPreviewRow(row) ? 'row-zone-preview' : ''
}

function compareCalculatedSum(row: MeterReading): number {
  let sum = 0
  for (const zone of availableZones(row)) {
    if (!compareInclude[zone]) continue
    const rate = zoneRate(row, zone)
    if (rate == null) continue
    sum += (zoneConsumption(row, zone) ?? 0) * rate
  }
  return Math.round(sum * 100) / 100
}

function compareMissingRateZones(row: MeterReading): ZoneCode[] {
  return availableZones(row).filter(
    (zone) => compareInclude[zone] && zoneRate(row, zone) == null,
  )
}

function zoneCheckboxLabel(row: MeterReading, zone: ZoneCode) {
  const cons = zoneConsumption(row, zone) ?? 0
  const unit = meterUnit.value ? ` ${meterUnit.value}` : ''
  return `Учитывать ${zone} (${formatNum(cons)}${unit})`
}

function isManualRate(row: MeterReading, zone: ZoneCode) {
  if (zone === 'T1') return row.isManualRateT1 === true
  if (zone === 'T2') return row.isManualRateT2 === true
  return row.isManualRateT3 === true
}

function autoRateForZone(row: MeterReading, zone: ZoneCode): number | null {
  const raw =
    zone === 'T1'
      ? row.autoTariffRateT1
      : zone === 'T2'
        ? row.autoTariffRateT2
        : row.autoTariffRateT3
  if (raw == null || Number.isNaN(Number(raw))) return null
  return Number(raw)
}

function zoneHasConsumption(row: MeterReading, zone: ZoneCode) {
  return zoneConsumption(row, zone) != null
}

function showRateOverrideEditor(row: MeterReading, zone: ZoneCode) {
  const columnVisible =
    zone === 'T1' ? showT1.value : zone === 'T2' ? showT2.value : showT3.value
  if (!columnVisible) return false
  return (
    zoneHasConsumption(row, zone) ||
    isManualRate(row, zone) ||
    autoRateForZone(row, zone) != null
  )
}

function resetManualRateForm() {
  for (const zone of ['T1', 'T2', 'T3'] as ZoneCode[]) {
    manualRateEnabled[zone] = false
    manualRateValue[zone] = undefined
    clearRateOverride[zone] = false
  }
}

function onEnableManualRate(zone: ZoneCode, enabled: boolean) {
  manualRateEnabled[zone] = enabled
  if (enabled) {
    clearRateOverride[zone] = false
    if (manualRateValue[zone] == null && editing.value) {
      const auto = autoRateForZone(editing.value, zone)
      manualRateValue[zone] = auto ?? undefined
    }
  }
}

function onManualSwitchChange(
  zone: ZoneCode,
  value: string | number | boolean,
) {
  onEnableManualRate(zone, Boolean(value))
}

function resetZoneToAutoTariff(zone: ZoneCode) {
  manualRateEnabled[zone] = false
  clearRateOverride[zone] = true
  if (editing.value) {
    const auto = autoRateForZone(editing.value, zone)
    manualRateValue[zone] = auto ?? undefined
  }
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string') return message
  }
  return 'Ошибка запроса'
}

async function load() {
  if (!meterId.value) {
    meter.value = null
    readings.value = []
    return
  }

  loading.value = true
  try {
    const [meterData, readingsData, families] = await Promise.all([
      getMeter(meterId.value),
      getReadings(meterId.value),
      getTariffFamilies().catch(() => [] as TariffFamily[]),
    ])
    meter.value = meterData
    readings.value = readingsData
    tariffFamilies.value = families
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
    meter.value = null
    readings.value = []
  } finally {
    loading.value = false
  }
}

function openTariffDialog() {
  selectedTariffId.value = meter.value?.tariffId ?? null
  tariffDialogVisible.value = true
}

async function saveMeterTariff() {
  if (!meter.value || !selectedTariffId.value) {
    ElMessage.warning('Выберите тариф')
    return
  }
  savingTariff.value = true
  try {
    await updateMeter(meter.value.id, { tariffId: selectedTariffId.value })
    ElMessage.success('Тариф счётчика обновлён')
    tariffDialogVisible.value = false
    await load()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    savingTariff.value = false
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.push({
    path: '/meters',
    query: meterId.value ? { highlightId: meterId.value } : undefined,
  })
}

function openCreate() {
  editing.value = null
  form.readingDate = new Date().toISOString().slice(0, 10)
  form.valueT1 = undefined
  form.valueT2 = undefined
  form.valueT3 = undefined
  form.comment = ''
  resetManualRateForm()
  dialogVisible.value = true
}

function openEdit(row: MeterReading) {
  editing.value = row
  form.readingDate = row.readingDate.slice(0, 10)
  form.valueT1 = row.valueT1
  form.valueT2 = row.valueT2 ?? undefined
  form.valueT3 = row.valueT3 ?? undefined
  form.comment = row.comment ?? ''
  resetManualRateForm()
  for (const zone of ['T1', 'T2', 'T3'] as ZoneCode[]) {
    if (isManualRate(row, zone)) {
      manualRateEnabled[zone] = true
      manualRateValue[zone] =
        zone === 'T1'
          ? (row.rateT1Override ?? undefined)
          : zone === 'T2'
            ? (row.rateT2Override ?? undefined)
            : (row.rateT3Override ?? undefined)
    } else {
      manualRateValue[zone] = autoRateForZone(row, zone) ?? undefined
    }
  }
  dialogVisible.value = true
}

async function onSave() {
  if (!meterId.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload: Record<string, unknown> = {
      readingDate: form.readingDate,
      valueT1: Number(form.valueT1 ?? 0),
      valueT2:
        form.valueT2 === undefined || form.valueT2 === null
          ? undefined
          : Number(form.valueT2),
      valueT3:
        form.valueT3 === undefined || form.valueT3 === null
          ? undefined
          : Number(form.valueT3),
      comment: form.comment.trim() || undefined,
    }

    if (editing.value && isSuperAdmin.value) {
      for (const zone of ['T1', 'T2', 'T3'] as ZoneCode[]) {
        const key =
          zone === 'T1'
            ? 'rateT1Override'
            : zone === 'T2'
              ? 'rateT2Override'
              : 'rateT3Override'
        if (clearRateOverride[zone]) {
          payload[key] = null
        } else if (manualRateEnabled[zone]) {
          payload[key] = Number(manualRateValue[zone] ?? 0)
        }
      }
    }

    if (editing.value) {
      await updateReading(editing.value.id, payload)
      ElMessage.success('Показание обновлено')
    } else {
      await createReading({ meterId: meterId.value, ...payload } as {
        meterId: string
        readingDate: string
        valueT1: number
        valueT2?: number
        valueT3?: number
        comment?: string
      })
      ElMessage.success('Показание добавлено')
    }
    dialogVisible.value = false
    await load()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

async function onDelete(row: MeterReading) {
  try {
    await deleteReading(row.id)
    ElMessage.success('Показание удалено')
    await load()
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const data = error.response.data as {
        message?: string | string[]
        charges?: Array<{ id: string; periodStart: string; periodEnd: string }>
      }
      const confirmText =
        typeof data.message === 'string'
          ? data.message
          : Array.isArray(data.message)
            ? data.message.join(', ')
            : 'Показание используется в начислении. Удалить вместе с начислением?'

      try {
        await ElMessageBox.confirm(confirmText, 'Связанные начисления', {
          type: 'warning',
          confirmButtonText: 'Да, удалить',
          cancelButtonText: 'Отмена',
        })
        await deleteReading(row.id, true)
        ElMessage.success('Показание и связанные начисления удалены')
        await load()
      } catch (confirmError) {
        if (confirmError === 'cancel' || confirmError === 'close') return
        ElMessage.error(getErrorMessage(confirmError))
      }
      return
    }

    ElMessage.error(getErrorMessage(error))
  }
}

watch(meterId, () => {
  void load()
})

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page" v-loading="loading">
    <template v-if="!meterId">
      <el-empty description="Выберите счётчик из раздела Счётчики">
        <el-button type="primary" @click="router.push('/meters')">
          Перейти к счётчикам
        </el-button>
      </el-empty>
    </template>

    <template v-else>
      <div class="toolbar">
        <div>
          <el-button text type="primary" @click="goBack">
            ← Назад к счётчику
          </el-button>
          <h2>
            Показания:
            {{ meter?.name || '…' }}
            <span v-if="meter" class="serial">№ {{ meter.serialNumber }}</span>
          </h2>
          <div v-if="showMeterTariffInfo" class="meter-tariff-line">
            <span>Тариф: {{ meterTariffLabel }}</span>
            <el-button
              v-if="canChangeMeterTariff"
              type="primary"
              link
              @click="openTariffDialog"
            >
              Изменить тариф
            </el-button>
          </div>
        </div>
        <el-button
          v-if="canManage"
          type="primary"
          @click="openCreate"
        >
          Добавить показание
        </el-button>
      </div>

      <div class="table-scroll">
      <el-table
        ref="tableRef"
        :data="readings"
        stripe
        empty-text="Нет показаний"
        border
        class="readings-table"
        row-key="id"
        :expand-row-keys="expandRowKeys"
        :row-class-name="tableRowClassName"
        @expand-change="onExpandChange"
      >
        <el-table-column type="expand" width="1" class-name="col-expand-hidden">
          <template #default="{ row }">
            <div v-if="isPreviewRow(row)" class="zone-compare-panel">
              <div class="zone-compare-title">Сравнить тарифные зоны</div>
              <div class="zone-compare-checks">
                <el-checkbox
                  v-for="zone in availableZones(row)"
                  :key="`${row.id}-${zone}`"
                  v-model="compareInclude[zone]"
                  class="zone-compare-check"
                >
                  {{ zoneCheckboxLabel(row, zone) }}
                </el-checkbox>
              </div>
              <div class="zone-compare-sum">
                Расчётная сумма:
                <strong>{{ formatMoney(compareCalculatedSum(row)) }} ₽</strong>
              </div>
              <div
                v-for="zone in compareMissingRateZones(row)"
                :key="`warn-${zone}`"
                class="zone-compare-warn"
              >
                ⚠ у зоны {{ zone }} нет ставки — не влияет на сумму
              </div>
              <div class="zone-compare-actions">
                <el-button size="small" @click="collapseZoneCompare">
                  Свернуть
                </el-button>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Дата" min-width="140" fixed>
          <template #default="{ row }">
            <div class="date-cell">
              <el-tag
                v-if="isPreviewRow(row)"
                size="small"
                type="warning"
                effect="plain"
                class="preview-badge"
              >
                Предпросмотр
              </el-tag>
              <span>{{ formatDate(row.readingDate) }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          v-if="showT1"
          label="T1"
          align="center"
          label-class-name="col-zone-t1"
        >
          <el-table-column
            :label="`Текущее${unitSuffix}`"
            min-width="90"
            align="right"
            class-name="col-zone-t1"
            label-class-name="col-zone-t1"
          >
            <template #default="{ row }">
              {{ formatNum(currentValue(row, 'T1')) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="`Предыдущее${unitSuffix}`"
            min-width="100"
            align="right"
            class-name="col-zone-t1"
            label-class-name="col-zone-t1"
          >
            <template #default="{ row }">
              {{ formatNum(row.previousValueT1) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="`Разница${unitSuffix}`"
            min-width="90"
            align="right"
            class-name="col-zone-t1"
            label-class-name="col-zone-t1"
          >
            <template #default="{ row }">
              {{ formatNum(row.diffT1) }}
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column v-if="showT2" label="T2" align="center" label-class-name="col-zone-t2">
          <el-table-column
            :label="`Текущее${unitSuffix}`"
            min-width="90"
            align="right"
            class-name="col-zone-t2"
            label-class-name="col-zone-t2"
          >
            <template #default="{ row }">
              {{ formatNum(currentValue(row, 'T2')) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="`Предыдущее${unitSuffix}`"
            min-width="100"
            align="right"
            class-name="col-zone-t2"
            label-class-name="col-zone-t2"
          >
            <template #default="{ row }">
              {{ formatNum(row.previousValueT2) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="`Разница${unitSuffix}`"
            min-width="90"
            align="right"
            class-name="col-zone-t2"
            label-class-name="col-zone-t2"
          >
            <template #default="{ row }">
              {{ formatNum(row.diffT2) }}
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column v-if="showT3" label="T3" align="center" label-class-name="col-zone-t3">
          <el-table-column
            :label="`Текущее${unitSuffix}`"
            min-width="90"
            align="right"
            class-name="col-zone-t3"
            label-class-name="col-zone-t3"
          >
            <template #default="{ row }">
              {{ formatNum(currentValue(row, 'T3')) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="`Предыдущее${unitSuffix}`"
            min-width="100"
            align="right"
            class-name="col-zone-t3"
            label-class-name="col-zone-t3"
          >
            <template #default="{ row }">
              {{ formatNum(row.previousValueT3) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="`Разница${unitSuffix}`"
            min-width="90"
            align="right"
            class-name="col-zone-t3"
            label-class-name="col-zone-t3"
          >
            <template #default="{ row }">
              {{ formatNum(row.diffT3) }}
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column label="Коэфф. трансф." min-width="110" align="right">
          <template #default="{ row }">
            {{ formatNum(row.transformerRatio ?? transformerRatio) }}
          </template>
        </el-table-column>

        <!-- Расход по зонам -->
        <el-table-column
          v-if="showT1"
          :label="`Расход T1${unitSuffix}`"
          min-width="110"
          align="right"
          class-name="col-zone-t1"
          label-class-name="col-zone-t1"
        >
          <template #default="{ row }">
            <span :class="{ 'zone-excluded': isZoneExcluded(row, 'T1') }">
              {{ formatNum(row.consumptionT1) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="showT2"
          :label="`Расход T2${unitSuffix}`"
          min-width="110"
          align="right"
          class-name="col-zone-t2"
          label-class-name="col-zone-t2"
        >
          <template #default="{ row }">
            <span :class="{ 'zone-excluded': isZoneExcluded(row, 'T2') }">
              {{ formatNum(row.consumptionT2) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="showT3"
          :label="`Расход T3${unitSuffix}`"
          min-width="110"
          align="right"
          class-name="col-zone-t3"
          label-class-name="col-zone-t3"
        >
          <template #default="{ row }">
            <span :class="{ 'zone-excluded': isZoneExcluded(row, 'T3') }">
              {{ formatNum(row.consumptionT3) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column
          :label="`Общий расход${unitSuffix}`"
          min-width="120"
          align="right"
          class-name="col-total-consumption"
          label-class-name="col-total-consumption"
        >
          <template #default="{ row }">
            {{ formatNum(totalConsumption(row)) }}
          </template>
        </el-table-column>

        <el-table-column
          v-for="child in childColumns"
          :key="child.meterId"
          :label="child.label"
          min-width="130"
          align="right"
          show-overflow-tooltip
          class-name="col-child-breakdown"
          label-class-name="col-child-breakdown"
        >
          <template #default="{ row }">
            <template v-if="childBreakdown(row, child.meterId)?.hasData">
              {{ formatNum(childBreakdown(row, child.meterId)!.consumption) }}
            </template>
            <el-tooltip
              v-else
              content="Нет показаний за этот период"
              placement="top"
            >
              <span class="no-data">—</span>
            </el-tooltip>
          </template>
        </el-table-column>

        <el-table-column
          v-if="showResidual"
          :label="`Остаток (минусовка)${unitSuffix}`"
          min-width="150"
          align="right"
          class-name="col-residual"
          label-class-name="col-residual"
        >
          <template #default="{ row }">
            <div
              class="residual-cell"
              :class="{
                'residual-anomaly':
                  row.residualMinusovka != null && row.residualMinusovka < 0,
              }"
            >
              <span>{{ formatNum(row.residualMinusovka) }}</span>
              <el-tooltip
                v-if="row.residualIncomplete"
                content="Не все подчинённые счётчики имеют показания за этот период — результат может быть неточным"
                placement="top"
              >
                <el-icon class="residual-warn" :size="16">
                  <WarningFilled />
                </el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>

        <el-table-column
          v-if="showResidualT1"
          :label="`Остаток T1${unitSuffix}`"
          min-width="120"
          align="right"
          class-name="col-residual-zone"
          label-class-name="col-residual-zone"
        >
          <template #default="{ row }">
            {{ formatNum(row.residualT1) }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="showResidualT2"
          :label="`Остаток T2${unitSuffix}`"
          min-width="120"
          align="right"
          class-name="col-residual-zone"
          label-class-name="col-residual-zone"
        >
          <template #default="{ row }">
            {{ formatNum(row.residualT2) }}
          </template>
        </el-table-column>
        <el-table-column
          v-if="showResidualT3"
          :label="`Остаток T3${unitSuffix}`"
          min-width="120"
          align="right"
          class-name="col-residual-zone"
          label-class-name="col-residual-zone"
        >
          <template #default="{ row }">
            {{ formatNum(row.residualT3) }}
          </template>
        </el-table-column>

        <!-- Тариф / сумма по зонам -->
        <el-table-column
          v-if="showT1"
          label="T1 · тариф"
          align="center"
          label-class-name="col-zone-t1"
        >
          <el-table-column
            label="Тариф"
            min-width="90"
            align="right"
            class-name="col-zone-t1"
            label-class-name="col-zone-t1"
          >
            <template #default="{ row }">
              <span
                class="rate-cell"
                :class="{ 'zone-excluded': isZoneExcluded(row, 'T1') }"
              >
                {{ formatRate(row.tariffRateT1) }}
                <el-tooltip
                  v-if="isManualRate(row, 'T1')"
                  content="Тариф изменён вручную"
                  placement="top"
                >
                  <span class="manual-rate-badge">
                    <el-icon :size="14"><EditPen /></el-icon>
                  </span>
                </el-tooltip>
              </span>
            </template>
          </el-table-column>
          <el-table-column
            label="Сумма"
            min-width="100"
            align="right"
            class-name="col-zone-t1"
            label-class-name="col-zone-t1"
          >
            <template #default="{ row }">
              <span :class="{ 'zone-excluded': isZoneExcluded(row, 'T1') }">
                {{ formatMoney(row.amountT1) }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column v-if="showT2" label="T2 · тариф" align="center" label-class-name="col-zone-t2">
          <el-table-column
            label="Тариф"
            min-width="100"
            align="right"
            class-name="col-zone-t2"
            label-class-name="col-zone-t2"
          >
            <template #default="{ row }">
              <span
                class="rate-cell"
                :class="{ 'zone-excluded': isZoneExcluded(row, 'T2') }"
              >
                {{ formatRate(row.tariffRateT2) }}
                <el-tooltip
                  v-if="isManualRate(row, 'T2')"
                  content="Тариф изменён вручную"
                  placement="top"
                >
                  <span class="manual-rate-badge">
                    <el-icon :size="14"><EditPen /></el-icon>
                  </span>
                </el-tooltip>
              </span>
            </template>
          </el-table-column>
          <el-table-column
            label="Сумма"
            min-width="100"
            align="right"
            class-name="col-zone-t2"
            label-class-name="col-zone-t2"
          >
            <template #default="{ row }">
              <span :class="{ 'zone-excluded': isZoneExcluded(row, 'T2') }">
                {{ formatMoney(row.amountT2) }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column v-if="showT3" label="T3 · тариф" align="center" label-class-name="col-zone-t3">
          <el-table-column
            label="Тариф"
            min-width="100"
            align="right"
            class-name="col-zone-t3"
            label-class-name="col-zone-t3"
          >
            <template #default="{ row }">
              <span
                class="rate-cell"
                :class="{ 'zone-excluded': isZoneExcluded(row, 'T3') }"
              >
                {{ formatRate(row.tariffRateT3) }}
                <el-tooltip
                  v-if="isManualRate(row, 'T3')"
                  content="Тариф изменён вручную"
                  placement="top"
                >
                  <span class="manual-rate-badge">
                    <el-icon :size="14"><EditPen /></el-icon>
                  </span>
                </el-tooltip>
              </span>
            </template>
          </el-table-column>
          <el-table-column
            label="Сумма"
            min-width="100"
            align="right"
            class-name="col-zone-t3"
            label-class-name="col-zone-t3"
          >
            <template #default="{ row }">
              <span :class="{ 'zone-excluded': isZoneExcluded(row, 'T3') }">
                {{ formatMoney(row.amountT3) }}
              </span>
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column
          label="Сумма"
          min-width="110"
          align="right"
          class-name="col-total-amount"
          label-class-name="col-total-amount"
        >
          <template #default="{ row }">
            <span :class="{ 'preview-total': isPreviewRow(row) }">
              {{ formatMoney(displayTotalAmount(row)) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column
          prop="comment"
          label="Комментарий"
          min-width="140"
          show-overflow-tooltip
        />

        <el-table-column
          label="Действия"
          :width="canManage ? 130 : 56"
          fixed="right"
          align="center"
        >
          <template #default="{ row }">
            <div class="row-actions">
              <el-tooltip
                v-if="canCompareZones(row)"
                content="Сравнить тарифные зоны"
                placement="top"
              >
                <el-button
                  type="primary"
                  link
                  :icon="DataAnalysis"
                  title="Сравнить тарифные зоны"
                  @click="toggleZoneCompare(row)"
                />
              </el-tooltip>

              <template v-if="canManage">
                <el-tooltip content="Редактировать" placement="top">
                  <el-button
                    type="primary"
                    link
                    :icon="Edit"
                    title="Редактировать"
                    @click="openEdit(row)"
                  />
                </el-tooltip>
                <el-popconfirm
                  title="Удалить показание?"
                  confirm-button-text="Удалить"
                  cancel-button-text="Отмена"
                  @confirm="onDelete(row)"
                >
                  <template #reference>
                    <span>
                      <el-tooltip content="Удалить" placement="top">
                        <el-button
                          type="danger"
                          link
                          :icon="Delete"
                          title="Удалить"
                        />
                      </el-tooltip>
                    </span>
                  </template>
                </el-popconfirm>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </template>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? 'Редактировать показание' : 'Добавить показание'"
      :width="editing && isSuperAdmin ? '560px' : '480px'"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
      >
        <el-form-item label="Дата" prop="readingDate">
          <el-date-picker
            v-model="form.readingDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="Дата показания"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="T1" prop="valueT1">
          <el-input-number
            v-model="form.valueT1"
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="T2" prop="valueT2">
          <el-input-number
            v-model="form.valueT2"
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="T3" prop="valueT3">
          <el-input-number
            v-model="form.valueT3"
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </el-form-item>

        <template v-if="editing && isSuperAdmin">
          <div
            v-for="zone in (['T1', 'T2', 'T3'] as ZoneCode[])"
            :key="`manual-${zone}`"
            class="manual-rate-block"
          >
            <template v-if="showRateOverrideEditor(editing, zone)">
              <div class="manual-rate-head">
                <span>
                  Тариф {{ zone }} (авто:
                  {{ formatRate(autoRateForZone(editing, zone)) }})
                </span>
                <el-switch
                  :model-value="manualRateEnabled[zone]"
                  inline-prompt
                  active-text="Вручную"
                  inactive-text="Авто"
                  @change="onManualSwitchChange(zone, $event)"
                />
              </div>
              <p class="manual-rate-hint">Задать тариф вручную</p>
              <div v-if="manualRateEnabled[zone]" class="manual-rate-inputs">
                <el-input-number
                  v-model="manualRateValue[zone]"
                  :min="0"
                  :precision="3"
                  :step="0.001"
                  :controls="false"
                  style="width: 180px"
                />
                <el-button
                  v-if="isManualRate(editing, zone)"
                  link
                  type="warning"
                  @click="resetZoneToAutoTariff(zone)"
                >
                  Сбросить к автотарифу
                </el-button>
              </div>
              <div
                v-else-if="clearRateOverride[zone]"
                class="manual-rate-reset-hint"
              >
                При сохранении ставка вернётся к автотарифу
              </div>
            </template>
          </div>
        </template>

        <el-form-item label="Комментарий">
          <el-input
            v-model="form.comment"
            type="textarea"
            :rows="2"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">Отмена</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">
          Сохранить
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="tariffDialogVisible"
      title="Изменить тариф счётчика"
      width="420px"
      destroy-on-close
    >
      <el-form label-width="90px">
        <el-form-item label="Тариф">
          <el-select
            v-model="selectedTariffId"
            placeholder="Выберите тарифную семью"
            style="width: 100%"
            filterable
          >
            <el-option
              v-for="family in tariffOptionsForMeter"
              :key="family.familyId"
              :label="family.name"
              :value="family.familyId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tariffDialogVisible = false">Отмена</el-button>
        <el-button
          type="primary"
          :loading="savingTariff"
          @click="saveMeterTariff"
        >
          Сохранить
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  min-height: 320px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.toolbar h2 {
  margin: 0.25rem 0 0;
}

.serial {
  font-weight: 400;
  color: var(--el-text-color-secondary);
  font-size: 0.95em;
}

.meter-tariff-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.35rem;
  color: var(--el-text-color-regular);
  font-size: 0.95rem;
}

.date-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}

.preview-badge {
  margin-bottom: 0.05rem;
}

.zone-excluded {
  color: var(--el-text-color-placeholder);
  text-decoration: line-through;
}

.preview-total {
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
}

.readings-table :deep(tr.row-zone-preview > td) {
  background-color: var(--el-color-warning-light-9) !important;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.readings-table {
  width: 100%;
  min-width: 960px;
}

.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

.zone-compare-panel {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem 1rem;
  background: var(--el-fill-color-blank);
  border-left: 3px solid var(--el-color-warning);
}

.zone-compare-title {
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.15rem;
}

.zone-compare-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.25rem;
}

.zone-compare-check {
  margin-right: 0;
  height: auto;
  white-space: normal;
  align-items: flex-start;
}

.zone-compare-sum {
  margin-top: 0.2rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--el-border-color-lighter);
  color: #111827;
}

.zone-compare-warn {
  font-size: 0.8rem;
  color: #b45309;
  line-height: 1.35;
}

.zone-compare-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.rate-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.manual-rate-badge {
  display: inline-flex;
  color: var(--el-color-warning);
  cursor: help;
}

.manual-rate-block {
  margin: 0 0 0.85rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
}

.manual-rate-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.manual-rate-hint {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--el-text-color-secondary);
}

.manual-rate-inputs {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.manual-rate-reset-hint {
  margin-top: 0.35rem;
  font-size: 0.85rem;
  color: var(--el-color-warning-dark-2);
}

.readings-table :deep(.col-expand-hidden),
.readings-table :deep(.el-table__expand-column) {
  width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  border: none !important;
}

.readings-table :deep(.el-table__expand-column .cell) {
  display: none;
}

.no-data {
  color: var(--el-text-color-placeholder);
  cursor: help;
}

/* Лёгкая заливка групп колонок (ячейки + заголовки) */
.readings-table :deep(th.col-zone-t1),
.readings-table :deep(td.col-zone-t1) {
  background-color: #f0f9ff !important;
}

.readings-table :deep(th.col-zone-t2),
.readings-table :deep(td.col-zone-t2) {
  background-color: #fffbeb !important;
}

.readings-table :deep(th.col-zone-t3),
.readings-table :deep(td.col-zone-t3) {
  background-color: #f5f3ff !important;
}

.readings-table :deep(th.col-total-consumption),
.readings-table :deep(td.col-total-consumption) {
  background-color: #f5f7fa !important;
  font-weight: 600;
}

.readings-table :deep(th.col-child-breakdown),
.readings-table :deep(td.col-child-breakdown) {
  background-color: #fafafa !important;
}

.readings-table :deep(th.col-total-amount),
.readings-table :deep(td.col-total-amount) {
  background-color: #f0f9eb !important;
  font-weight: 600;
}

.readings-table :deep(th.col-residual),
.readings-table :deep(td.col-residual) {
  background-color: #f3f4f6 !important;
}

.readings-table :deep(th.col-residual-zone),
.readings-table :deep(td.col-residual-zone) {
  background-color: #f9fafb !important;
}

.residual-cell {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
  width: 100%;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
}

.residual-cell.residual-anomaly {
  background-color: #fef0f0;
  color: var(--el-color-danger);
  font-weight: 600;
}

.residual-warn {
  color: var(--el-color-warning);
  cursor: help;
  flex-shrink: 0;
}

</style>
