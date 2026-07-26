<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
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

const showT2 = computed(
  () =>
    meter.value?.tariffType === 'double' ||
    meter.value?.tariffType === 'triple',
)
const showT3 = computed(() => meter.value?.tariffType === 'triple')

const transformerRatio = computed(() => {
  const raw = meter.value?.transformerRatio
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
})

const rules = computed<FormRules>(() => {
  const base: FormRules = {
    readingDate: [{ required: true, message: 'Укажите дату', trigger: 'change' }],
    valueT1: [{ required: true, message: 'Укажите T1', trigger: 'blur' }],
  }
  if (showT2.value) {
    base.valueT2 = [{ required: true, message: 'Укажите T2', trigger: 'blur' }]
  }
  if (showT3.value) {
    base.valueT3 = [{ required: true, message: 'Укажите T3', trigger: 'blur' }]
  }
  return base
})

type RowView = MeterReading & {
  rawDelta: number | null
  realDelta: number | null
}

const rows = computed<RowView[]>(() => {
  const list = readings.value
  return list.map((item, index) => {
    const older = list[index + 1]
    if (!older) {
      return { ...item, rawDelta: null, realDelta: null }
    }
    const rawDelta = readingTotal(item) - readingTotal(older)
    const ratio = transformerRatio.value
    return {
      ...item,
      rawDelta,
      realDelta: ratio != null ? rawDelta * ratio : null,
    }
  })
})

function readingTotal(r: Pick<MeterReading, 'valueT1' | 'valueT2' | 'valueT3'>) {
  return Number(r.valueT1) + Number(r.valueT2 ?? 0) + Number(r.valueT3 ?? 0)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU')
}

function formatNum(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

function sourceLabel(source: string) {
  if (source === 'manual') return 'Вручную'
  return source
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
      valueT1: Number(form.valueT1),
      valueT2: showT2.value ? Number(form.valueT2) : undefined,
      valueT3: showT3.value ? Number(form.valueT3) : undefined,
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
          <p v-if="transformerRatio != null" class="hint">
            Коэффициент трансформации: {{ transformerRatio }}
          </p>
        </div>
        <el-button
          v-if="canManage"
          type="primary"
          @click="openCreate"
        >
          Добавить показание
        </el-button>
      </div>

      <el-table :data="rows" stripe empty-text="Нет показаний">
        <el-table-column label="Дата" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.readingDate) }}
          </template>
        </el-table-column>
        <el-table-column label="T1" min-width="90">
          <template #default="{ row }">
            {{ formatNum(row.valueT1) }}
          </template>
        </el-table-column>
        <el-table-column v-if="showT2" label="T2" min-width="90">
          <template #default="{ row }">
            {{ formatNum(row.valueT2) }}
          </template>
        </el-table-column>
        <el-table-column v-if="showT3" label="T3" min-width="90">
          <template #default="{ row }">
            {{ formatNum(row.valueT3) }}
          </template>
        </el-table-column>
        <el-table-column label="Потребление за интервал" min-width="200">
          <template #default="{ row }">
            <template v-if="row.rawDelta == null">—</template>
            <template v-else>
              <span>{{ formatNum(row.rawDelta) }}</span>
              <span
                v-if="row.realDelta != null"
                class="real"
              >
                · реальное {{ formatNum(row.realDelta) }}
              </span>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="Источник" min-width="110">
          <template #default="{ row }">
            {{ sourceLabel(row.source) }}
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
          min-width="200"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button type="primary" link @click="openEdit(row)">
              Редактировать
            </el-button>
            <el-popconfirm
              title="Удалить показание?"
              confirm-button-text="Удалить"
              cancel-button-text="Отмена"
              @confirm="onDelete(row)"
            >
              <template #reference>
                <el-button type="danger" link>Удалить</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
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
        <el-form-item v-if="showT2" label="T2" prop="valueT2">
          <el-input-number
            v-model="form.valueT2"
            :min="0"
            :controls="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="showT3" label="T3" prop="valueT3">
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

.hint {
  margin: 0.35rem 0 0;
  color: var(--el-text-color-secondary);
  font-size: 0.9rem;
}

.real {
  color: var(--el-text-color-secondary);
  margin-left: 0.25rem;
}
</style>
