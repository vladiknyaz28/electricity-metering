<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { getObjects } from '../api/objects'
import {
  createConsumer,
  getTariffs,
  updateConsumer,
} from '../api/consumers'
import type { EnergyObject } from '../types/object'
import type {
  Consumer,
  CreateConsumerPayload,
  TariffOption,
} from '../types/consumer'

const props = defineProps<{
  modelValue: boolean
  consumer?: Consumer | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [consumer: Consumer]
}>()

const formRef = ref<FormInstance>()
const saving = ref(false)
const objects = ref<EnergyObject[]>([])
const tariffs = ref<TariffOption[]>([])

const isEdit = computed(() => Boolean(props.consumer?.id))

const form = reactive<{
  objectId: string
  name: string
  type: string
  taxId: string
  contactPerson: string
  phone: string
  email: string
  area: number | undefined
  sharePercent: number | undefined
  tariffId: string | null
  status: string
}>({
  objectId: '',
  name: '',
  type: '',
  taxId: '',
  contactPerson: '',
  phone: '',
  email: '',
  area: undefined,
  sharePercent: undefined,
  tariffId: null,
  status: 'active',
})

const activeTariffs = computed(() =>
  tariffs.value.filter((item) => item.status === 'active'),
)

const rules: FormRules = {
  objectId: [{ required: true, message: 'Выберите объект', trigger: 'change' }],
  name: [{ required: true, message: 'Укажите наименование', trigger: 'blur' }],
  type: [{ required: true, message: 'Выберите тип', trigger: 'change' }],
}

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

function resetForm() {
  form.objectId = props.consumer?.objectId ?? ''
  form.name = props.consumer?.name ?? ''
  form.type = props.consumer?.type ?? ''
  form.taxId = props.consumer?.taxId ?? ''
  form.contactPerson = props.consumer?.contactPerson ?? ''
  form.phone = props.consumer?.phone ?? ''
  form.email = props.consumer?.email ?? ''
  form.area = props.consumer?.area ?? undefined
  form.sharePercent = props.consumer?.sharePercent ?? undefined
  form.tariffId = props.consumer?.tariffId ?? null
  form.status = props.consumer?.status ?? 'active'
}

async function loadOptions() {
  try {
    const [objectsData, tariffsData] = await Promise.all([
      getObjects(),
      getTariffs(),
    ])
    objects.value = objectsData
    tariffs.value = tariffsData
  } catch {
    objects.value = []
    tariffs.value = []
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

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return 'Не удалось сохранить потребителя'
}

async function onSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload: CreateConsumerPayload = {
      objectId: form.objectId,
      name: form.name.trim(),
      type: form.type,
      tariffId: form.tariffId,
    }

    if (form.taxId.trim()) payload.taxId = form.taxId.trim()
    if (form.contactPerson.trim()) payload.contactPerson = form.contactPerson.trim()
    if (form.phone.trim()) payload.phone = form.phone.trim()
    if (form.email.trim()) payload.email = form.email.trim()
    if (form.area != null) payload.area = form.area
    if (form.sharePercent != null) payload.sharePercent = form.sharePercent

    let saved: Consumer
    if (isEdit.value && props.consumer) {
      payload.status = form.status
      saved = await updateConsumer(props.consumer.id, payload)
    } else {
      payload.status = 'active'
      saved = await createConsumer(payload)
    }

    ElMessage.success('Потребитель сохранён')
    emit('saved', saved)
    visible.value = false
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="isEdit ? 'Редактировать потребителя' : 'Добавить потребителя'"
    width="560px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="Объект" prop="objectId">
        <el-select
          v-model="form.objectId"
          :disabled="isEdit"
          filterable
          placeholder="Выберите объект"
          style="width: 100%"
        >
          <el-option
            v-for="item in objects"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="Наименование" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>

      <el-form-item label="Тип" prop="type">
        <el-select v-model="form.type" placeholder="Выберите тип" style="width: 100%">
          <el-option label="Физическое лицо" value="individual" />
          <el-option label="Юридическое лицо" value="legal_entity" />
        </el-select>
      </el-form-item>

      <el-form-item label="ИНН">
        <el-input v-model="form.taxId" />
      </el-form-item>

      <el-form-item label="Контактное лицо">
        <el-input v-model="form.contactPerson" />
      </el-form-item>

      <el-form-item label="Телефон">
        <el-input v-model="form.phone" />
      </el-form-item>

      <el-form-item label="Email">
        <el-input v-model="form.email" type="email" />
      </el-form-item>

      <el-form-item label="Площадь, м²">
        <el-input-number v-model="form.area" :min="0" style="width: 100%" />
      </el-form-item>

      <el-form-item label="Доля, %">
        <el-input-number
          v-model="form.sharePercent"
          :min="0"
          :max="100"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="Тариф">
        <el-select
          v-model="form.tariffId"
          clearable
          placeholder="Без тарифа"
          style="width: 100%"
        >
          <el-option :value="null" label="Без тарифа" />
          <el-option
            v-for="tariff in activeTariffs"
            :key="tariff.id"
            :label="tariff.name"
            :value="tariff.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item v-if="isEdit" label="Статус">
        <el-select v-model="form.status" style="width: 100%">
          <el-option label="Активен" value="active" />
          <el-option label="Неактивен" value="inactive" />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">Отмена</el-button>
      <el-button type="primary" :disabled="saving" :loading="saving" @click="onSubmit">
        {{ saving ? 'Сохранение...' : 'Сохранить' }}
      </el-button>
    </template>
  </el-dialog>
</template>
