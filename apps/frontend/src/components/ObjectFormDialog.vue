<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import {
  createObject,
  getManagers,
  updateObject,
} from '../api/objects'
import { useAuthStore } from '../stores/auth'
import type { AuthUser } from '../types/auth'
import type { CreateObjectPayload, EnergyObject } from '../types/object'

const props = defineProps<{
  modelValue: boolean
  object?: EnergyObject | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [object: EnergyObject]
}>()

const authStore = useAuthStore()
const isManager = computed(() => authStore.role === 'object_manager')

const formRef = ref<FormInstance>()
const saving = ref(false)
const managers = ref<AuthUser[]>([])

const isEdit = computed(() => Boolean(props.object?.id))

const form = reactive<{
  name: string
  address: string
  typeCode: string
  categoryCode: string
  managerId: string | null
  status: string
}>({
  name: '',
  address: '',
  typeCode: '',
  categoryCode: '',
  managerId: null,
  status: 'active',
})

const typeOptions = ['Жилой', 'Промышленный', 'Офисный', 'Складской']
const categoryOptions = [
  'Многоквартирный дом',
  'Частный дом',
  'Производство',
  'Торговый центр',
  'Офис',
]

const rules: FormRules = {
  name: [{ required: true, message: 'Укажите название', trigger: 'blur' }],
  address: [{ required: true, message: 'Укажите адрес', trigger: 'blur' }],
  typeCode: [{ required: true, message: 'Укажите тип объекта', trigger: 'change' }],
  categoryCode: [
    { required: true, message: 'Укажите категорию', trigger: 'change' },
  ],
}

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

function resetForm() {
  form.name = props.object?.name ?? ''
  form.address = props.object?.address ?? ''
  form.typeCode = props.object?.typeCode ?? ''
  form.categoryCode = props.object?.categoryCode ?? ''
  form.managerId = props.object?.managerId ?? null
  form.status = props.object?.status ?? 'active'
}

async function loadManagers() {
  if (isManager.value) {
    managers.value = []
    return
  }
  try {
    managers.value = await getManagers()
  } catch {
    managers.value = []
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    resetForm()
    await loadManagers()
  },
)

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return 'Не удалось сохранить объект'
}

async function onSubmit() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const payload: CreateObjectPayload = {
      name: form.name.trim(),
      address: form.address.trim(),
      typeCode: form.typeCode,
      categoryCode: form.categoryCode,
    }

    if (!isManager.value && form.managerId) {
      payload.managerId = form.managerId
    }

    let saved: EnergyObject
    if (isEdit.value && props.object) {
      payload.status = form.status
      if (!isManager.value) {
        payload.managerId = form.managerId
      }
      saved = await updateObject(props.object.id, payload)
    } else {
      payload.status = 'active'
      saved = await createObject(payload)
    }

    ElMessage.success('Объект сохранён')
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
    :title="isEdit ? 'Редактировать объект' : 'Добавить объект'"
    width="520px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="Название" prop="name">
        <el-input v-model="form.name" />
      </el-form-item>

      <el-form-item label="Адрес" prop="address">
        <el-input v-model="form.address" />
      </el-form-item>

      <el-form-item label="Тип объекта" prop="typeCode">
        <el-select
          v-model="form.typeCode"
          filterable
          allow-create
          default-first-option
          placeholder="Выберите или введите тип"
          style="width: 100%"
        >
          <el-option v-for="item in typeOptions" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>

      <el-form-item label="Категория" prop="categoryCode">
        <el-select
          v-model="form.categoryCode"
          filterable
          allow-create
          default-first-option
          placeholder="Выберите или введите категорию"
          style="width: 100%"
        >
          <el-option
            v-for="item in categoryOptions"
            :key="item"
            :label="item"
            :value="item"
          />
        </el-select>
      </el-form-item>

      <el-form-item v-if="!isManager" label="Менеджер объекта">
        <el-select
          v-model="form.managerId"
          clearable
          placeholder="Не назначен"
          style="width: 100%"
        >
          <el-option :value="null" label="Не назначен" />
          <el-option
            v-for="manager in managers"
            :key="manager.id"
            :value="manager.id"
            :label="`${manager.fullName} (${manager.email})`"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-else label="Менеджер объекта">
        <el-input
          :model-value="authStore.user?.fullName || authStore.user?.email || 'Вы'"
          disabled
        />
      </el-form-item>

      <el-form-item v-if="isEdit" label="Статус" prop="status">
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
