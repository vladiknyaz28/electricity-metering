<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { getObjects } from '../api/objects'
import { getConsumers } from '../api/consumers'
import { createMeter, getMeters, updateMeter } from '../api/meters'
import {
  createResourceType,
  getResourceTypes,
} from '../api/resourceTypes'
import { getTariffFamilies } from '../api/tariffs'
import type { EnergyObject } from '../types/object'
import type { Consumer } from '../types/consumer'
import type { CreateMeterPayload, Meter } from '../types/meter'
import type { ResourceType } from '../types/resourceType'
import type { TariffFamily } from '../types/tariff'

const CREATE_OPTION = '__create__'

const props = defineProps<{
  modelValue: boolean
  meter?: Meter | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [meter: Meter]
}>()

const authStore = useAuthStore()
const canCreateResourceType = computed(() => authStore.role === 'admin')

const formRef = ref<FormInstance>()
const saving = ref(false)
const objects = ref<EnergyObject[]>([])
const consumers = ref<Consumer[]>([])
const meters = ref<Meter[]>([])
const resourceTypes = ref<ResourceType[]>([])
const tariffFamilies = ref<TariffFamily[]>([])

const createTypeVisible = ref(false)
const creatingType = ref(false)
const newType = reactive({
  name: '',
  unit: '',
})

const isEdit = computed(() => Boolean(props.meter?.id))

const form = reactive<{
  objectId: string
  consumerId: string | null
  parentMeterId: string | null
  ownerType: string
  name: string
  serialNumber: string
  resourceTypeId: string
  meterCategoryCode: string
  tariffType: string
  tariffId: string | null
  accuracyClass: string
  installationLocation: string
  status: string
  isMain: boolean
  hasCurrentTransformer: boolean
  primaryCurrent: number | undefined
  secondaryCurrent: number | undefined
}>({
  objectId: '',
  consumerId: null,
  parentMeterId: null,
  ownerType: 'object',
  name: '',
  serialNumber: '',
  resourceTypeId: '',
  meterCategoryCode: 'residential',
  tariffType: 'single',
  tariffId: null,
  accuracyClass: '1.0',
  installationLocation: '',
  status: 'active',
  isMain: false,
  hasCurrentTransformer: false,
  primaryCurrent: undefined,
  secondaryCurrent: 5,
})

/** Тариф берётся от потребителя — поле счётчика не редактируется */
const usesConsumerTariff = computed(
  () => !form.isMain && Boolean(form.consumerId),
)

const consumerTariffId = computed(() => {
  if (!form.consumerId) return null
  return (
    consumers.value.find((item) => item.id === form.consumerId)?.tariffId ??
    null
  )
})

const displayedTariffId = computed(() =>
  usesConsumerTariff.value ? consumerTariffId.value : form.tariffId,
)

const activeTariffs = computed(() =>
  tariffFamilies.value.filter((item) => item.status === 'active'),
)

function tariffLabel(family: TariffFamily) {
  const unit = family.resourceType?.unit
    ? ` · ${family.resourceType.unit}`
    : ''
  return `${family.name}${unit}`
}

const objectConsumers = computed(() =>
  consumers.value.filter((item) => item.objectId === form.objectId),
)

const parentMeterOptions = computed(() =>
  meters.value.filter(
    (item) =>
      item.objectId === form.objectId &&
      item.id !== props.meter?.id &&
      item.status === 'active',
  ),
)

function parentMeterLabel(meter: Meter) {
  const consumerPart = meter.consumer?.name
    ? ` — ${meter.consumer.name}`
    : ''
  return `${meter.serialNumber}${consumerPart}`
}

const meterCategoryOptions = [
  { value: 'residential', label: 'Жилой' },
  { value: 'commercial', label: 'Коммерческий' },
  { value: 'industrial', label: 'Промышленный' },
  { value: 'mixed', label: 'Смешанный' },
] as const

const activeResourceTypes = computed(() =>
  resourceTypes.value.filter((item) => item.status === 'active'),
)

const selectedResourceType = computed(() =>
  resourceTypes.value.find((item) => item.id === form.resourceTypeId) ?? null,
)

const liveTransformerRatio = computed(() => {
  const primary = Number(form.primaryCurrent)
  const secondary = Number(form.secondaryCurrent)
  if (!primary || !secondary || primary <= 0 || secondary <= 0) {
    return null
  }
  return (primary / secondary).toFixed(2)
})

const positiveCurrentRule = {
  validator: (_rule: unknown, value: number | undefined, callback: (error?: Error) => void) => {
    if (!form.hasCurrentTransformer) {
      callback()
      return
    }
    if (value == null || Number(value) <= 0) {
      callback(new Error('Укажите значение больше 0'))
      return
    }
    callback()
  },
  trigger: 'blur',
}

const rules = computed<FormRules>(() => ({
  objectId: [{ required: true, message: 'Выберите объект', trigger: 'change' }],
  name: [{ required: true, message: 'Укажите название', trigger: 'blur' }],
  serialNumber: [
    { required: true, message: 'Укажите серийный номер', trigger: 'blur' },
  ],
  ownerType: [{ required: true, message: 'Укажите владельца', trigger: 'change' }],
  resourceTypeId: [
    { required: true, message: 'Выберите тип ресурса', trigger: 'change' },
  ],
  meterCategoryCode: [
    { required: true, message: 'Укажите категорию', trigger: 'change' },
  ],
  tariffType: [{ required: true, message: 'Укажите тип тарифа', trigger: 'change' }],
  accuracyClass: [
    { required: true, message: 'Укажите класс точности', trigger: 'blur' },
  ],
  installationLocation: [
    { required: true, message: 'Укажите место установки', trigger: 'blur' },
  ],
  primaryCurrent: form.hasCurrentTransformer
    ? [{ required: true, message: 'Укажите первичный ток', trigger: 'blur' }, positiveCurrentRule]
    : [],
  secondaryCurrent: form.hasCurrentTransformer
    ? [
        { required: true, message: 'Укажите вторичный ток', trigger: 'blur' },
        positiveCurrentRule,
      ]
    : [],
}))

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

function resetForm() {
  form.objectId = props.meter?.objectId ?? ''
  form.consumerId = props.meter?.consumerId ?? null
  form.parentMeterId = props.meter?.parentMeterId ?? null
  form.ownerType = props.meter?.ownerType ?? 'object'
  form.name = props.meter?.name ?? ''
  form.serialNumber = props.meter?.serialNumber ?? ''
  form.resourceTypeId =
    props.meter?.resourceTypeId ?? props.meter?.resourceType?.id ?? ''
  form.meterCategoryCode = props.meter?.meterCategoryCode ?? 'residential'
  form.tariffType = props.meter?.tariffType ?? 'single'
  form.tariffId = props.meter?.tariffId ?? null
  form.accuracyClass = props.meter?.accuracyClass ?? '1.0'
  form.installationLocation = props.meter?.installationLocation ?? ''
  form.status = props.meter?.status ?? 'active'
  form.isMain = props.meter?.isMain ?? false
  form.hasCurrentTransformer = props.meter?.hasCurrentTransformer ?? false
  form.primaryCurrent = props.meter?.primaryCurrent ?? undefined
  form.secondaryCurrent = props.meter?.secondaryCurrent ?? 5
}

async function loadOptions() {
  try {
    const [objectsData, consumersData, metersData, typesData, tariffsData] =
      await Promise.all([
        getObjects(),
        getConsumers().catch(() => [] as Consumer[]),
        getMeters().catch(() => [] as Meter[]),
        getResourceTypes(),
        getTariffFamilies().catch(() => [] as TariffFamily[]),
      ])
    objects.value = objectsData
    consumers.value = consumersData
    meters.value = metersData
    resourceTypes.value = typesData
    tariffFamilies.value = tariffsData

    if (!form.resourceTypeId) {
      const electricity = typesData.find(
        (item) => item.name === 'Электроэнергия' && item.status === 'active',
      )
      form.resourceTypeId = electricity?.id ?? typesData[0]?.id ?? ''
    }
  } catch {
    objects.value = []
    consumers.value = []
    meters.value = []
    resourceTypes.value = []
    tariffFamilies.value = []
  }
}

function onResourceTypeChange(value: string) {
  if (value === CREATE_OPTION) {
    form.resourceTypeId = selectedResourceType.value?.id ?? ''
    newType.name = ''
    newType.unit = ''
    createTypeVisible.value = true
  }
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return isEdit.value ? 'Не удалось сохранить счётчик' : 'Не удалось создать счётчик'
}

async function onCreateResourceType() {
  if (!newType.name.trim() || !newType.unit.trim()) {
    ElMessage.warning('Укажите название и единицу измерения')
    return
  }

  creatingType.value = true
  try {
    const created = await createResourceType({
      name: newType.name.trim(),
      unit: newType.unit.trim(),
    })
    resourceTypes.value = [...resourceTypes.value, created]
    form.resourceTypeId = created.id
    createTypeVisible.value = false
    ElMessage.success('Тип ресурса создан')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    creatingType.value = false
  }
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload: CreateMeterPayload = {
      objectId: form.objectId,
      consumerId: form.isMain ? null : form.consumerId || null,
      parentMeterId: form.isMain ? null : form.parentMeterId || null,
      ownerType: form.ownerType,
      name: form.name.trim(),
      serialNumber: form.serialNumber.trim(),
      resourceTypeId: form.resourceTypeId,
      meterCategoryCode: form.meterCategoryCode,
      tariffType: form.tariffType,
      tariffId:
        form.isMain || !form.consumerId ? form.tariffId || null : null,
      accuracyClass: form.accuracyClass.trim(),
      installationLocation: form.installationLocation.trim(),
      status: form.status,
      isMain: form.isMain,
      hasCurrentTransformer: form.hasCurrentTransformer,
      primaryCurrent: form.hasCurrentTransformer
        ? Number(form.primaryCurrent)
        : null,
      secondaryCurrent: form.hasCurrentTransformer
        ? Number(form.secondaryCurrent)
        : null,
    }

    const saved = isEdit.value
      ? await updateMeter(props.meter!.id, payload)
      : await createMeter(payload)

    emit('saved', saved)
    visible.value = false
    if (form.isMain) {
      ElMessage.success(
        'Счётчик сохранён как главный. Предыдущий главный счётчик снят с этого статуса',
      )
    } else {
      ElMessage.success(isEdit.value ? 'Счётчик обновлён' : 'Счётчик создан')
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    resetForm()
    await loadOptions()
  },
)

watch(
  () => form.objectId,
  () => {
    if (
      form.consumerId &&
      !objectConsumers.value.some((item) => item.id === form.consumerId)
    ) {
      form.consumerId = null
    }
    if (
      form.parentMeterId &&
      !parentMeterOptions.value.some((item) => item.id === form.parentMeterId)
    ) {
      form.parentMeterId = null
    }
  },
)

watch(
  () => form.isMain,
  (isMain) => {
    if (isMain) {
      form.consumerId = null
      form.parentMeterId = null
    }
  },
)

watch(
  () => form.hasCurrentTransformer,
  (enabled) => {
    if (!enabled) {
      form.primaryCurrent = undefined
      form.secondaryCurrent = 5
      formRef.value?.clearValidate(['primaryCurrent', 'secondaryCurrent'])
    } else if (form.secondaryCurrent == null) {
      form.secondaryCurrent = 5
    }
  },
)
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? 'Редактировать счётчик' : 'Добавить счётчик'"
    width="640px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="Название" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="Серийный номер" prop="serialNumber">
        <el-input v-model="form.serialNumber" />
      </el-form-item>
      <el-form-item label="Объект" prop="objectId">
        <el-select v-model="form.objectId" filterable style="width: 100%">
          <el-option
            v-for="item in objects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="Потребитель">
        <el-select
          v-model="form.consumerId"
          clearable
          filterable
          style="width: 100%"
          :disabled="!form.objectId || form.isMain"
        >
          <el-option
            v-for="item in objectConsumers"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <template #label>
          <span class="switch-label">
            Главный (вводной) счётчик объекта
            <el-tooltip
              content="На объекте может быть только один главный счётчик, он считает потребление ДО распределения по потребителям"
              placement="top"
            >
              <span class="hint">?</span>
            </el-tooltip>
          </span>
        </template>
        <el-switch v-model="form.isMain" />
      </el-form-item>
      <el-form-item
        v-if="!form.isMain"
        label="Родительский счётчик (если этот счётчик подчинён другому)"
      >
        <el-select
          v-model="form.parentMeterId"
          clearable
          filterable
          style="width: 100%"
          :disabled="!form.objectId"
          placeholder="Нет (корневой счётчик)"
        >
          <el-option label="Нет (корневой счётчик)" :value="null" />
          <el-option
            v-for="item in parentMeterOptions"
            :key="item.id"
            :label="parentMeterLabel(item)"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <div class="row">
        <el-form-item label="Владелец" prop="ownerType" class="half">
          <el-select v-model="form.ownerType" style="width: 100%">
            <el-option label="Объект" value="object" />
            <el-option label="Потребитель" value="consumer" />
          </el-select>
        </el-form-item>
        <el-form-item label="Число тарифных зон" prop="tariffType" class="half">
          <el-select v-model="form.tariffType" style="width: 100%">
            <el-option label="Однотарифный (T1)" value="single" />
            <el-option label="Двухтарифный (T2+T3)" value="double" />
            <el-option label="Трёхтарифный (T1+T2+T3)" value="triple" />
          </el-select>
        </el-form-item>
      </div>
      <el-form-item label="Тариф">
        <el-select
          :model-value="displayedTariffId"
          clearable
          filterable
          placeholder="Выберите тариф"
          style="width: 100%"
          :disabled="usesConsumerTariff"
          @update:model-value="
            (value: string | null) => {
              if (!usesConsumerTariff) form.tariffId = value
            }
          "
        >
          <el-option :value="null" label="Без тарифа" />
          <el-option
            v-for="tariff in activeTariffs"
            :key="tariff.familyId"
            :label="tariffLabel(tariff)"
            :value="tariff.familyId"
          />
        </el-select>
        <div v-if="usesConsumerTariff" class="unit-hint">
          Тариф берётся от потребителя
        </div>
      </el-form-item>
      <el-form-item label="Тип ресурса" prop="resourceTypeId">
        <el-select
          v-model="form.resourceTypeId"
          filterable
          placeholder="Выберите тип ресурса"
          style="width: 100%"
          @change="onResourceTypeChange"
        >
          <el-option
            v-for="item in activeResourceTypes"
            :key="item.id"
            :label="`${item.name} (${item.unit})`"
            :value="item.id"
          />
          <el-option
            v-if="canCreateResourceType"
            :value="CREATE_OPTION"
            label="+ Добавить новый тип"
          />
        </el-select>
        <div v-if="selectedResourceType" class="unit-hint">
          Единица измерения: {{ selectedResourceType.unit }}
        </div>
      </el-form-item>
      <div class="row">
        <el-form-item label="Категория счётчика" prop="meterCategoryCode" class="half">
          <el-select
            v-model="form.meterCategoryCode"
            filterable
            placeholder="Выберите категорию"
            style="width: 100%"
          >
            <el-option
              v-for="item in meterCategoryOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Класс точности" prop="accuracyClass" class="half">
          <el-input v-model="form.accuracyClass" />
        </el-form-item>
      </div>
      <el-form-item label="Место установки" prop="installationLocation">
        <el-input v-model="form.installationLocation" />
      </el-form-item>
      <el-form-item label="Тип подключения">
        <el-select v-model="form.hasCurrentTransformer" style="width: 100%">
          <el-option label="Прямое включение" :value="false" />
          <el-option label="Через трансформаторы тока" :value="true" />
        </el-select>
      </el-form-item>
      <template v-if="form.hasCurrentTransformer">
        <div class="row">
          <el-form-item
            label="Первичный ток (А)"
            prop="primaryCurrent"
            class="half"
          >
            <el-input-number
              v-model="form.primaryCurrent"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item
            label="Вторичный ток (А)"
            prop="secondaryCurrent"
            class="half"
          >
            <el-input-number
              v-model="form.secondaryCurrent"
              :min="1"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <div class="ratio-hint">
          Коэффициент трансформации:
          {{ liveTransformerRatio ?? '—' }}
        </div>
      </template>
      <div class="row">
        <el-form-item label="Статус" class="half">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="Активен" value="active" />
            <el-option label="Неактивен" value="inactive" />
          </el-select>
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">Отмена</el-button>
      <el-button type="primary" :loading="saving" @click="onSubmit">
        Сохранить
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="createTypeVisible"
    title="Новый тип ресурса"
    width="420px"
    append-to-body
  >
    <el-form label-position="top">
      <el-form-item label="Название">
        <el-input v-model="newType.name" placeholder="Сжатый воздух" />
      </el-form-item>
      <el-form-item label="Единица измерения">
        <el-input v-model="newType.unit" placeholder="м³" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="createTypeVisible = false">Отмена</el-button>
      <el-button
        type="primary"
        :loading="creatingType"
        @click="onCreateResourceType"
      >
        Создать
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.half {
  flex: 1;
  min-width: 200px;
}

.ratio-hint,
.unit-hint {
  margin: 0.35rem 0 0;
  color: #4b5563;
  font-size: 14px;
}

.switch-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e5e7eb;
  color: #4b5563;
  font-size: 11px;
  cursor: help;
}
</style>
