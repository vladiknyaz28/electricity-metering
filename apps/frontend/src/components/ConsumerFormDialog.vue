<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { getObjects } from '../api/objects'
import {
  createConsumer,
  updateConsumer,
} from '../api/consumers'
import { getTariffFamilies } from '../api/tariffs'
import {
  createUser,
  deleteUser,
  getUsers,
  hardDeleteUser,
  updateUser,
} from '../api/users'
import type { EnergyObject } from '../types/object'
import type {
  Consumer,
  CreateConsumerPayload,
} from '../types/consumer'
import type { TariffFamily } from '../types/tariff'
import type { AuthUser } from '../types/auth'

const props = defineProps<{
  modelValue: boolean
  consumer?: Consumer | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [consumer: Consumer]
  usersChanged: []
}>()

const formRef = ref<FormInstance>()
const saving = ref(false)
const objects = ref<EnergyObject[]>([])
const tariffs = ref<TariffFamily[]>([])

const linkedUsers = ref<AuthUser[]>([])
const usersLoading = ref(false)
const loginDialogVisible = ref(false)
const loginSaving = ref(false)
const loginFormRef = ref<FormInstance>()
const loginForm = reactive({
  email: '',
  password: '',
})

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

function tariffLabel(family: TariffFamily) {
  const resource = family.resourceType?.name
  return resource ? `${family.name} (${resource})` : family.name
}

const rules: FormRules = {
  objectId: [{ required: true, message: 'Выберите объект', trigger: 'change' }],
  name: [{ required: true, message: 'Укажите наименование', trigger: 'blur' }],
  type: [{ required: true, message: 'Выберите тип', trigger: 'change' }],
}

const loginRules: FormRules = {
  email: [
    { required: true, message: 'Укажите email', trigger: 'blur' },
    { type: 'email', message: 'Некорректный email', trigger: 'blur' },
  ],
  password: [
    { required: true, message: 'Укажите пароль', trigger: 'blur' },
    { min: 6, message: 'Минимум 6 символов', trigger: 'blur' },
  ],
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
  const [objectsResult, tariffsResult] = await Promise.allSettled([
    getObjects(),
    getTariffFamilies(),
  ])

  objects.value =
    objectsResult.status === 'fulfilled' ? objectsResult.value : []
  tariffs.value =
    tariffsResult.status === 'fulfilled' ? tariffsResult.value : []

  if (objectsResult.status === 'rejected') {
    ElMessage.error('Не удалось загрузить список объектов')
  }
  if (tariffsResult.status === 'rejected') {
    ElMessage.error('Не удалось загрузить список тарифов')
  }
}

async function loadLinkedUsers() {
  if (!props.consumer?.id) {
    linkedUsers.value = []
    return
  }

  usersLoading.value = true
  try {
    linkedUsers.value = await getUsers({ consumerId: props.consumer.id })
  } catch {
    linkedUsers.value = []
    ElMessage.error('Не удалось загрузить привязанные логины')
  } finally {
    usersLoading.value = false
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    resetForm()
    await loadOptions()
    await loadLinkedUsers()
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

function openCreateLogin() {
  loginForm.email = form.email.trim() || ''
  loginForm.password = ''
  loginDialogVisible.value = true
}

async function submitCreateLogin() {
  if (!props.consumer?.id) return
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return

  loginSaving.value = true
  try {
    await createUser({
      fullName: form.name.trim() || props.consumer.name,
      email: loginForm.email.trim(),
      password: loginForm.password,
      role: 'consumer',
      consumerId: props.consumer.id,
    })
    ElMessage.success('Логин создан')
    loginDialogVisible.value = false
    await loadLinkedUsers()
    emit('usersChanged')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    loginSaving.value = false
  }
}

async function toggleUserStatus(user: AuthUser) {
  try {
    if (user.status === 'active') {
      await deleteUser(user.id)
      ElMessage.success('Логин деактивирован')
    } else {
      await updateUser(user.id, { status: 'active' })
      ElMessage.success('Логин активирован')
    }
    await loadLinkedUsers()
    emit('usersChanged')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function onHardDeleteUser(user: AuthUser) {
  try {
    await hardDeleteUser(user.id)
    ElMessage.success('Логин удалён окончательно')
    await loadLinkedUsers()
    emit('usersChanged')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
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
    width="640px"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="Объект" prop="objectId">
        <el-select
          v-model="form.objectId"
          :disabled="isEdit"
          filterable
          placeholder="Выберите объект"
          no-data-text="Нет доступных объектов. Сначала создайте объект в разделе Объекты."
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
          filterable
          placeholder="Выберите тариф"
          style="width: 100%"
        >
          <el-option :value="null" label="Без тарифа" />
          <el-option
            v-for="tariff in activeTariffs"
            :key="tariff.familyId"
            :label="tariffLabel(tariff)"
            :value="tariff.familyId"
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

    <div v-if="isEdit" v-loading="usersLoading" class="logins-section">
      <div class="logins-title">Привязанные логины</div>

      <el-empty
        v-if="!usersLoading && linkedUsers.length === 0"
        description="Нет привязанного логина для входа"
        :image-size="64"
      >
        <el-button type="primary" @click="openCreateLogin">
          Создать логин для этого потребителя
        </el-button>
      </el-empty>

      <template v-else-if="linkedUsers.length > 0">
        <div
          v-for="user in linkedUsers"
          :key="user.id"
          class="login-row"
        >
          <div class="login-meta">
            <div class="login-email">{{ user.email }}</div>
            <el-tag
              :type="user.status === 'active' ? 'success' : 'info'"
              size="small"
            >
              {{ user.status === 'active' ? 'Активен' : 'Неактивен' }}
            </el-tag>
          </div>
          <div class="login-actions">
            <el-button size="small" @click="toggleUserStatus(user)">
              {{ user.status === 'active' ? 'Деактивировать' : 'Активировать' }}
            </el-button>
            <el-popconfirm
              v-if="user.status === 'inactive'"
              title="Удалить логин окончательно?"
              confirm-button-text="Удалить"
              cancel-button-text="Отмена"
              @confirm="onHardDeleteUser(user)"
            >
              <template #reference>
                <el-button size="small" type="danger">
                  Удалить окончательно
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
        <el-button class="add-login" @click="openCreateLogin">
          + Добавить ещё логин
        </el-button>
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">Отмена</el-button>
      <el-button type="primary" :disabled="saving" :loading="saving" @click="onSubmit">
        {{ saving ? 'Сохранение...' : 'Сохранить' }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="loginDialogVisible"
    title="Создать логин потребителя"
    width="420px"
    append-to-body
  >
    <el-form
      ref="loginFormRef"
      :model="loginForm"
      :rules="loginRules"
      label-position="top"
    >
      <el-form-item label="Email" prop="email">
        <el-input v-model="loginForm.email" type="email" />
      </el-form-item>
      <el-form-item label="Пароль" prop="password">
        <el-input v-model="loginForm.password" type="password" show-password />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="loginDialogVisible = false">Отмена</el-button>
      <el-button
        type="primary"
        :loading="loginSaving"
        @click="submitCreateLogin"
      >
        Создать
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.logins-section {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--el-border-color);
}

.logins-title {
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.login-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.login-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.login-email {
  font-weight: 500;
}

.login-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.add-login {
  margin-top: 0.75rem;
}
</style>
