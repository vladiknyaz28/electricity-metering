<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import {
  createTariff,
  createTariffVersion,
  deleteTariffFamily,
  getTariffFamilies,
  getTariffHistory,
} from '../api/tariffs'
import { getResourceTypes } from '../api/resourceTypes'
import type { TariffFamily, TariffHistory, TariffVersion } from '../types/tariff'
import type { ResourceType } from '../types/resourceType'
import EntityCard from '../components/EntityCard.vue'
import { resourceTypeColor, resourceTypeSoftBg } from '../utils/resourceColors'

const authStore = useAuthStore()
const canManage = computed(() => authStore.role === 'admin')

const families = ref<TariffFamily[]>([])
const resourceTypes = ref<ResourceType[]>([])
const loading = ref(false)

const createVisible = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  name: '',
  resourceTypeId: '',
  validFrom: '',
  rateT1: undefined as number | undefined,
  rateT2: undefined as number | undefined,
  rateT3: undefined as number | undefined,
})

const versionVisible = ref(false)
const versionSaving = ref(false)
const versionFamily = ref<TariffFamily | null>(null)
const versionForm = reactive({
  validFrom: '',
  rateT1: undefined as number | undefined,
  rateT2: undefined as number | undefined,
  rateT3: undefined as number | undefined,
})

const historyVisible = ref(false)
const historyLoading = ref(false)
const history = ref<TariffHistory | null>(null)

const activeResourceTypes = computed(() =>
  resourceTypes.value.filter((item) => item.status === 'active'),
)

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

function formatRate(value: number | string | null | undefined) {
  if (value == null || value === '') return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  return num.toLocaleString('ru-RU', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

function zoneRate(version: TariffVersion | undefined, code: string) {
  if (!version) return null
  const zone = version.zones.find((item) => item.zoneCode === code)
  if (!zone) return null
  const rate = Number(zone.rate)
  return Number.isFinite(rate) ? rate : null
}

/** Заполненная ставка: число > 0 (пустое / null / 0 = «не тарифицируется»). */
function isFilledRate(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0
}

function collectZones(rates: {
  rateT1?: number | null
  rateT2?: number | null
  rateT3?: number | null
}): Array<{ zoneCode: string; rate: number }> {
  const zones: Array<{ zoneCode: string; rate: number }> = []
  if (isFilledRate(rates.rateT1)) {
    zones.push({ zoneCode: 'T1', rate: Number(rates.rateT1) })
  }
  if (isFilledRate(rates.rateT2)) {
    zones.push({ zoneCode: 'T2', rate: Number(rates.rateT2) })
  }
  if (isFilledRate(rates.rateT3)) {
    zones.push({ zoneCode: 'T3', rate: Number(rates.rateT3) })
  }
  return zones
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return 'Операция не выполнена'
}

async function loadData() {
  loading.value = true
  try {
    const [familiesData, typesData] = await Promise.all([
      getTariffFamilies(),
      getResourceTypes().catch(() => [] as ResourceType[]),
    ])
    families.value = familiesData
    resourceTypes.value = typesData
  } catch {
    ElMessage.error('Не удалось загрузить тарифы')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  const today = new Date()
  createForm.name = ''
  createForm.resourceTypeId =
    resourceTypes.value.find((item) => item.name === 'Электроэнергия')?.id ??
    activeResourceTypes.value[0]?.id ??
    ''
  createForm.validFrom = today.toISOString().slice(0, 10)
  createForm.rateT1 = undefined
  createForm.rateT2 = undefined
  createForm.rateT3 = undefined
  createVisible.value = true
}

async function submitCreate() {
  if (!createForm.name.trim() || !createForm.resourceTypeId || !createForm.validFrom) {
    ElMessage.warning('Заполните название, ресурс и дату')
    return
  }
  const zones = collectZones(createForm)
  if (zones.length === 0) {
    ElMessage.warning('Укажите хотя бы одну ставку')
    return
  }

  createSaving.value = true
  try {
    await createTariff({
      name: createForm.name.trim(),
      resourceTypeId: createForm.resourceTypeId,
      validFrom: createForm.validFrom,
      zones,
    })
    ElMessage.success('Тариф создан')
    createVisible.value = false
    await loadData()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    createSaving.value = false
  }
}

function openVersion(family: TariffFamily) {
  versionFamily.value = family
  const next = new Date()
  next.setDate(next.getDate() + 7)
  versionForm.validFrom = next.toISOString().slice(0, 10)
  versionForm.rateT1 = zoneRate(family.currentVersion, 'T1') ?? undefined
  versionForm.rateT2 = zoneRate(family.currentVersion, 'T2') ?? undefined
  versionForm.rateT3 = zoneRate(family.currentVersion, 'T3') ?? undefined
  versionVisible.value = true
}

async function submitVersion() {
  if (!versionFamily.value || !versionForm.validFrom) {
    ElMessage.warning('Укажите дату вступления в силу')
    return
  }
  const zones = collectZones(versionForm)
  if (zones.length === 0) {
    ElMessage.warning('Укажите хотя бы одну ставку')
    return
  }

  const payload: {
    validFrom: string
    rateT1?: number
    rateT2?: number
    rateT3?: number
  } = { validFrom: versionForm.validFrom }
  if (isFilledRate(versionForm.rateT1)) payload.rateT1 = Number(versionForm.rateT1)
  if (isFilledRate(versionForm.rateT2)) payload.rateT2 = Number(versionForm.rateT2)
  if (isFilledRate(versionForm.rateT3)) payload.rateT3 = Number(versionForm.rateT3)

  versionSaving.value = true
  try {
    await createTariffVersion(versionFamily.value.familyId, payload)
    ElMessage.success('Новая версия тарифа создана')
    versionVisible.value = false
    await loadData()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    versionSaving.value = false
  }
}

async function openHistory(family: TariffFamily) {
  historyVisible.value = true
  historyLoading.value = true
  history.value = null
  try {
    history.value = await getTariffHistory(family.familyId)
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
    historyVisible.value = false
  } finally {
    historyLoading.value = false
  }
}

async function removeFamily(family: TariffFamily) {
  try {
    await deleteTariffFamily(family.familyId)
    families.value = families.value.filter(
      (item) => item.familyId !== family.familyId,
    )
    ElMessage.success('Тариф удалён')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

onMounted(loadData)
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="toolbar">
      <h2>Тарифы</h2>
      <el-button v-if="canManage" type="primary" @click="openCreate">
        Создать тариф
      </el-button>
    </div>

    <el-empty
      v-if="!loading && families.length === 0"
      description="Пока нет ни одного тарифа"
    >
      <el-button v-if="canManage" type="primary" @click="openCreate">
        Создать тариф
      </el-button>
    </el-empty>

    <div v-else-if="!loading" class="grid">
      <EntityCard
        v-for="item in families"
        :key="item.familyId"
        :title="item.name"
        :status-label="item.status === 'active' ? 'Активен' : 'Неактивен'"
        :status-type="item.status === 'active' ? 'success' : 'info'"
      >
        <div class="tags">
          <el-tag
            size="small"
            effect="plain"
            :style="{
              color: resourceTypeColor(item.resourceType?.name),
              background: resourceTypeSoftBg(item.resourceType?.name),
              borderColor: resourceTypeColor(item.resourceType?.name),
            }"
          >
            {{ item.resourceType?.name || 'Ресурс' }}
          </el-tag>
        </div>
        <div class="line">
          T1: {{ formatRate(zoneRate(item.currentVersion, 'T1')) }}
        </div>
        <div class="line">
          T2: {{ formatRate(zoneRate(item.currentVersion, 'T2')) }}
        </div>
        <div class="line">
          T3: {{ formatRate(zoneRate(item.currentVersion, 'T3')) }}
        </div>
        <div class="line">
          Действует с {{ formatDate(item.currentVersion?.validFrom) }}
        </div>

        <template #actions>
          <el-button plain @click="openHistory(item)">История</el-button>
          <el-button
            v-if="canManage"
            type="primary"
            plain
            @click="openVersion(item)"
          >
            Изменить ставку
          </el-button>
          <el-popconfirm
            v-if="canManage"
            :title="`Удалить тариф «${item.name}» со всеми версиями?`"
            confirm-button-text="Удалить"
            cancel-button-text="Отмена"
            @confirm="removeFamily(item)"
          >
            <template #reference>
              <el-button type="danger" plain>Удалить</el-button>
            </template>
          </el-popconfirm>
        </template>
      </EntityCard>
    </div>

    <el-dialog
      v-model="createVisible"
      title="Новый тариф"
      width="480px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item label="Название">
          <el-input v-model="createForm.name" />
        </el-form-item>
        <el-form-item label="Категория ресурса">
          <el-select v-model="createForm.resourceTypeId" style="width: 100%">
            <el-option
              v-for="item in activeResourceTypes"
              :key="item.id"
              :label="`${item.name} (${item.unit})`"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Действует с">
          <el-date-picker
            v-model="createForm.validFrom"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Ставка T1">
          <el-input-number
            v-model="createForm.rateT1"
            :min="0"
            :precision="3"
            :step="0.001"
            :value-on-clear="undefined"
            clearable
            controls-position="right"
            placeholder="Не тарифицируется"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Ставка T2">
          <el-input-number
            v-model="createForm.rateT2"
            :min="0"
            :precision="3"
            :step="0.001"
            :value-on-clear="undefined"
            clearable
            controls-position="right"
            placeholder="Не тарифицируется"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Ставка T3">
          <el-input-number
            v-model="createForm.rateT3"
            :min="0"
            :precision="3"
            :step="0.001"
            :value-on-clear="undefined"
            clearable
            controls-position="right"
            placeholder="Не тарифицируется"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">Отмена</el-button>
        <el-button type="primary" :loading="createSaving" @click="submitCreate">
          Создать
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="versionVisible"
      :title="`Изменить ставку: ${versionFamily?.name || ''}`"
      width="480px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item label="Дата вступления в силу">
          <el-date-picker
            v-model="versionForm.validFrom"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Ставка T1">
          <el-input-number
            v-model="versionForm.rateT1"
            :min="0"
            :precision="3"
            :step="0.001"
            :value-on-clear="undefined"
            clearable
            controls-position="right"
            placeholder="Не тарифицируется"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Ставка T2">
          <el-input-number
            v-model="versionForm.rateT2"
            :min="0"
            :precision="3"
            :step="0.001"
            :value-on-clear="undefined"
            clearable
            controls-position="right"
            placeholder="Не тарифицируется"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Ставка T3">
          <el-input-number
            v-model="versionForm.rateT3"
            :min="0"
            :precision="3"
            :step="0.001"
            :value-on-clear="undefined"
            clearable
            controls-position="right"
            placeholder="Не тарифицируется"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="versionVisible = false">Отмена</el-button>
        <el-button
          type="primary"
          :loading="versionSaving"
          @click="submitVersion"
        >
          Сохранить версию
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="historyVisible"
      :title="`История: ${history?.name || ''}`"
      width="560px"
      destroy-on-close
    >
      <div v-loading="historyLoading">
        <div
          v-for="version in history?.versions || []"
          :key="version.id"
          class="history-row"
        >
          <div class="history-dates">
            {{ formatDate(version.validFrom) }}
            —
            {{ version.validTo ? formatDate(version.validTo) : 'н.в.' }}
          </div>
          <div class="history-rates">
            T1={{ formatRate(zoneRate(version, 'T1')) }}
            · T2={{ formatRate(zoneRate(version, 'T2')) }}
            · T3={{ formatRate(zoneRate(version, 'T3')) }}
          </div>
        </div>
        <el-empty
          v-if="!historyLoading && !(history?.versions?.length)"
          description="Нет версий"
        />
      </div>
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
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.toolbar h2 {
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  align-items: stretch;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0 0 0.5rem;
}

.history-row {
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.history-dates {
  font-weight: 600;
  margin-bottom: 0.2rem;
}

.history-rates {
  color: #4b5563;
  font-size: 0.95rem;
}
</style>
