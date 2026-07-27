<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Edit, WarningFilled } from '@element-plus/icons-vue'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { getMeter } from '../api/meters'
import {
  createReading,
  deleteReading,
  getReadings,
  updateReading,
} from '../api/readings'
import type { Meter } from '../types/meter'
import type { MeterReading } from '../types/reading'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const canManage = computed(
  () => authStore.role === 'admin' || authStore.role === 'object_manager',
)

const meterId = computed(() => {
  const value = route.query.meterId
  return typeof value === 'string' && value ? value : null
})

const meter = ref<Meter | null>(null)
const readings = ref<MeterReading[]>([])
const loading = ref(false)

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

/** Стабильный список колонок детей (из первой строки с breakdown). */
const childColumns = computed(() => {
  if (!showResidual.value) return []
  for (const row of readings.value) {
    if (row.childrenBreakdown?.length) {
      return row.childrenBreakdown.map((item) => ({
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
    const [meterData, readingsData] = await Promise.all([
      getMeter(meterId.value),
      getReadings(meterId.value),
    ])
    meter.value = meterData
    readings.value = readingsData
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
    meter.value = null
    readings.value = []
  } finally {
    loading.value = false
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
  dialogVisible.value = true
}

function openEdit(row: MeterReading) {
  editing.value = row
  form.readingDate = row.readingDate.slice(0, 10)
  form.valueT1 = row.valueT1
  form.valueT2 = row.valueT2 ?? undefined
  form.valueT3 = row.valueT3 ?? undefined
  form.comment = row.comment ?? ''
  dialogVisible.value = true
}

async function onSave() {
  if (!meterId.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload = {
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

    if (editing.value) {
      await updateReading(editing.value.id, payload)
      ElMessage.success('Показание обновлено')
    } else {
      await createReading({ meterId: meterId.value, ...payload })
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
        :data="readings"
        stripe
        empty-text="Нет показаний"
        border
        class="readings-table"
      >
        <el-table-column label="Дата" min-width="110" fixed>
          <template #default="{ row }">
            {{ formatDate(row.readingDate) }}
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
            {{ formatNum(row.consumptionT1) }}
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
            {{ formatNum(row.consumptionT2) }}
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
            {{ formatNum(row.consumptionT3) }}
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
              {{ formatRate(row.tariffRateT1) }}
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
              {{ formatMoney(row.amountT1) }}
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column v-if="showT2" label="T2 · тариф" align="center" label-class-name="col-zone-t2">
          <el-table-column
            label="Тариф"
            min-width="90"
            align="right"
            class-name="col-zone-t2"
            label-class-name="col-zone-t2"
          >
            <template #default="{ row }">
              {{ formatRate(row.tariffRateT2) }}
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
              {{ formatMoney(row.amountT2) }}
            </template>
          </el-table-column>
        </el-table-column>

        <el-table-column v-if="showT3" label="T3 · тариф" align="center" label-class-name="col-zone-t3">
          <el-table-column
            label="Тариф"
            min-width="90"
            align="right"
            class-name="col-zone-t3"
            label-class-name="col-zone-t3"
          >
            <template #default="{ row }">
              {{ formatRate(row.tariffRateT3) }}
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
              {{ formatMoney(row.amountT3) }}
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
            {{ formatMoney(row.totalAmount) }}
          </template>
        </el-table-column>

        <el-table-column
          prop="comment"
          label="Комментарий"
          min-width="140"
          show-overflow-tooltip
        />

        <el-table-column
          v-if="canManage"
          label="Действия"
          width="100"
          fixed="right"
          align="center"
        >
          <template #default="{ row }">
            <div class="row-actions">
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
            </div>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </template>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? 'Редактировать показание' : 'Добавить показание'"
      width="480px"
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
