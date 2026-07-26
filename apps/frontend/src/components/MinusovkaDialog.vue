<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { getMinusovka } from '../api/readings'
import type { EnergyObject } from '../types/object'
import type { MinusovkaResult } from '../types/reading'

const props = defineProps<{
  modelValue: boolean
  object: EnergyObject | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const month = ref<string>('')
const loading = ref(false)
const result = ref<MinusovkaResult | null>(null)

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
    if (error.response?.status === 403) return 'Нет доступа к этому объекту'
  }
  return 'Не удалось рассчитать минусовку'
}

async function calculate() {
  if (!props.object || !month.value) {
    ElMessage.warning('Выберите месяц')
    return
  }

  const { start, end } = periodBounds(month.value)
  loading.value = true
  try {
    result.value = await getMinusovka(props.object.id, start, end)
  } catch (error) {
    result.value = null
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
      result.value = null
    }
  },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`Минусовка: ${object?.name ?? ''}`"
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
      v-if="!result && !loading"
      description="Выберите месяц и нажмите «Рассчитать»"
    />

    <div
      v-else-if="result && !result.hasMainMeter"
      class="no-main"
    >
      На объекте не назначен главный счётчик, минусовку посчитать нельзя
    </div>

    <div
      v-else-if="result && result.hasMainMeter"
      class="result"
      :class="{ anomaly: result.isAnomaly }"
    >
      <div v-if="result.isAnomaly" class="anomaly-banner">
        <el-icon :size="22"><WarningFilled /></el-icon>
        <span>
          Аномалия: сумма потребителей превышает показания главного
          счётчика — проверьте показания
        </span>
      </div>

      <div class="stat">
        <span class="label">Главный счётчик</span>
        <span class="value">{{ formatNum(result.mainConsumption) }}</span>
      </div>
      <div class="stat">
        <span class="label">Сумма потребителей</span>
        <span class="value">{{ formatNum(result.subConsumersConsumption) }}</span>
      </div>
      <div class="stat main">
        <span class="label">Минусовка</span>
        <span class="value big">{{ formatNum(result.minusovka) }}</span>
      </div>

      <div v-if="result.breakdown.length" class="breakdown">
        <div class="breakdown-title">По счётчикам потребителей</div>
        <div
          v-for="item in result.breakdown"
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
