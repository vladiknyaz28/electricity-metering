<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { getMeterMinusovka, getMinusovka } from '../api/readings'
import type { EnergyObject } from '../types/object'
import type { Meter } from '../types/meter'
import type {
  MeterMinusovkaResult,
  ObjectMinusovkaResult,
} from '../types/reading'

const props = defineProps<{
  modelValue: boolean
  object?: EnergyObject | null
  meter?: Meter | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const title = computed(() => {
  if (props.meter) return `Минусовка: ${props.meter.name}`
  if (props.object) return `Минусовка: ${props.object.name}`
  return 'Минусовка'
})

const month = ref<string>('')
const loading = ref(false)
const objectResult = ref<ObjectMinusovkaResult | null>(null)
const meterResult = ref<MeterMinusovkaResult | null>(null)

const display = computed(() => {
  if (meterResult.value) {
    return {
      mode: 'meter' as const,
      parentLabel: 'Родительский счётчик',
      childrenLabel: 'Сумма подчинённых',
      parentConsumption: meterResult.value.parentConsumption,
      childrenConsumption: meterResult.value.childrenConsumption,
      minusovka: meterResult.value.minusovka,
      isAnomaly: meterResult.value.isAnomaly,
      breakdown: meterResult.value.breakdown,
      anomalyText:
        'Аномалия: сумма подчинённых превышает показания родительского счётчика — проверьте показания',
    }
  }
  if (objectResult.value && objectResult.value.hasMainMeter) {
    return {
      mode: 'object' as const,
      parentLabel: 'Главный счётчик',
      childrenLabel: 'Сумма подчинённых',
      parentConsumption: objectResult.value.mainConsumption,
      childrenConsumption: objectResult.value.subConsumersConsumption,
      minusovka: objectResult.value.minusovka,
      isAnomaly: objectResult.value.isAnomaly,
      breakdown: objectResult.value.breakdown,
      anomalyText:
        'Аномалия: сумма подчинённых превышает показания главного счётчика — проверьте показания',
    }
  }
  return null
})

function periodBounds(monthValue: string): { start: string; end: string } {
  const [year, mon] = monthValue.split('-').map(Number)
  const start = `${year}-${String(mon).padStart(2, '0')}-01`
  const lastDay = new Date(year, mon, 0).getDate()
  const end = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function formatNum(value: number) {
  return value.toLocaleString('ru-RU', { maximumFractionDigits: 3 })
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string') return message
    if (error.response?.status === 403) return 'Нет доступа'
  }
  return 'Не удалось рассчитать минусовку'
}

async function calculate() {
  if (!month.value) {
    ElMessage.warning('Выберите месяц')
    return
  }
  if (!props.meter && !props.object) {
    ElMessage.warning('Не выбран счётчик или объект')
    return
  }

  const { start, end } = periodBounds(month.value)
  loading.value = true
  objectResult.value = null
  meterResult.value = null
  try {
    if (props.meter) {
      meterResult.value = await getMeterMinusovka(props.meter.id, start, end)
    } else if (props.object) {
      objectResult.value = await getMinusovka(props.object.id, start, end)
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      const now = new Date()
      month.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      objectResult.value = null
      meterResult.value = null
    }
  },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="560px"
    destroy-on-close
  >
    <div class="controls">
      <el-date-picker
        v-model="month"
        type="month"
        value-format="YYYY-MM"
        placeholder="Месяц"
      />
      <el-button type="primary" :loading="loading" @click="calculate">
        Рассчитать
      </el-button>
    </div>

    <el-empty
      v-if="!display && !loading && !(objectResult && !objectResult.hasMainMeter)"
      description="Выберите месяц и нажмите «Рассчитать»"
    />

    <div
      v-else-if="objectResult && !objectResult.hasMainMeter"
      class="no-main"
    >
      На объекте не назначен главный счётчик, минусовку посчитать нельзя
    </div>

    <div
      v-else-if="display"
      class="result"
      :class="{ anomaly: display.isAnomaly }"
    >
      <div v-if="display.isAnomaly" class="anomaly-banner">
        <el-icon :size="22"><WarningFilled /></el-icon>
        <span>{{ display.anomalyText }}</span>
      </div>

      <div class="stat">
        <span class="label">{{ display.parentLabel }}</span>
        <span class="value">{{ formatNum(display.parentConsumption) }}</span>
      </div>
      <div class="stat">
        <span class="label">{{ display.childrenLabel }}</span>
        <span class="value">{{ formatNum(display.childrenConsumption) }}</span>
      </div>
      <div class="stat main">
        <span class="label">Минусовка</span>
        <span class="value big">{{ formatNum(display.minusovka) }}</span>
      </div>

      <div v-if="display.breakdown.length" class="breakdown">
        <div class="breakdown-title">По подчинённым счётчикам</div>
        <div
          v-for="item in display.breakdown"
          :key="item.meterId"
          class="breakdown-row"
        >
          <span>
            {{ item.meterName }}
            <template v-if="item.consumerName">
              ({{ item.consumerName }})
            </template>
          </span>
          <span>{{ formatNum(item.consumption) }}</span>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.no-main {
  padding: 1rem;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  color: var(--el-text-color-regular);
}

.result {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  padding: 1rem 1.1rem;
  background: var(--el-bg-color);
}

.result.anomaly {
  border-color: var(--el-color-danger);
  background: color-mix(in srgb, var(--el-color-danger) 8%, white);
}

.anomaly-banner {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  color: var(--el-color-danger);
  margin-bottom: 1rem;
  font-weight: 500;
}

.stat {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.35rem 0;
}

.stat.main {
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--el-border-color);
}

.label {
  color: var(--el-text-color-secondary);
}

.value {
  font-variant-numeric: tabular-nums;
}

.big {
  font-size: 1.75rem;
  font-weight: 700;
}

.breakdown {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--el-border-color);
}

.breakdown-title {
  font-size: 0.85rem;
  color: var(--el-text-color-secondary);
  margin-bottom: 0.4rem;
}

.breakdown-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.2rem 0;
  font-size: 0.92rem;
}
</style>
