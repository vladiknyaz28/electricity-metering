<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import {
  createUser,
  deleteUser,
  getUsers,
  hardDeleteUser,
  updateUser,
} from '../api/users'
import { getObjects } from '../api/objects'
import type { AuthUser } from '../types/auth'
import type { EnergyObject } from '../types/object'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const loading = ref(false)
const managers = ref<AuthUser[]>([])
const objects = ref<EnergyObject[]>([])

const createVisible = ref(false)
const editVisible = ref(false)
const passwordVisible = ref(false)
const editing = ref<AuthUser | null>(null)
const passwordTarget = ref<AuthUser | null>(null)
const saving = ref(false)

const createFormRef = ref<FormInstance>()
const editFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()

const createForm = reactive({
  fullName: '',
  email: '',
  password: '',
})

const editForm = reactive({
  fullName: '',
  email: '',
  status: 'active',
})

const passwordForm = reactive({
  password: '',
})

const createRules: FormRules = {
  fullName: [{ required: true, message: 'Укажите ФИО', trigger: 'blur' }],
  email: [
    { required: true, message: 'Укажите email', trigger: 'blur' },
    { type: 'email', message: 'Некорректный email', trigger: 'blur' },
  ],
  password: [
    { required: true, message: 'Укажите пароль', trigger: 'blur' },
    { min: 6, message: 'Минимум 6 символов', trigger: 'blur' },
  ],
}

const editRules: FormRules = {
  fullName: [{ required: true, message: 'Укажите ФИО', trigger: 'blur' }],
  email: [
    { required: true, message: 'Укажите email', trigger: 'blur' },
    { type: 'email', message: 'Некорректный email', trigger: 'blur' },
  ],
}

const passwordRules: FormRules = {
  password: [
    { required: true, message: 'Укажите пароль', trigger: 'blur' },
    { min: 6, message: 'Минимум 6 символов', trigger: 'blur' },
  ],
}

function assignedCount(managerId: string) {
  return objects.value.filter((item) => item.managerId === managerId).length
}

function canHardDelete(manager: AuthUser) {
  return manager.status === 'inactive' && assignedCount(manager.id) === 0
}

function hardDeleteTooltip(manager: AuthUser) {
  if (canHardDelete(manager)) return ''
  return 'Сначала снимите с объектов и деактивируйте'
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

async function loadData() {
  loading.value = true
  try {
    const [managersData, objectsData] = await Promise.all([
      getUsers({ role: 'object_manager' }),
      getObjects(),
    ])
    managers.value = managersData
    objects.value = objectsData
  } catch {
    ElMessage.error('Не удалось загрузить менеджеров')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  createForm.fullName = ''
  createForm.email = ''
  createForm.password = ''
  createVisible.value = true
}

function openEdit(manager: AuthUser) {
  editing.value = manager
  editForm.fullName = manager.fullName
  editForm.email = manager.email
  editForm.status = manager.status
  editVisible.value = true
}

function openPassword(manager: AuthUser) {
  passwordTarget.value = manager
  passwordForm.password = ''
  passwordVisible.value = true
}

async function submitCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await createUser({
      fullName: createForm.fullName.trim(),
      email: createForm.email.trim(),
      password: createForm.password,
      role: 'object_manager',
    })
    ElMessage.success('Менеджер создан')
    createVisible.value = false
    await loadData()
    emit('changed')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'Не удалось создать менеджера'))
  } finally {
    saving.value = false
  }
}

async function submitEdit() {
  if (!editing.value) return
  const valid = await editFormRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await updateUser(editing.value.id, {
      fullName: editForm.fullName.trim(),
      email: editForm.email.trim(),
      status: editForm.status,
    })
    ElMessage.success('Менеджер обновлён')
    editVisible.value = false
    await loadData()
    emit('changed')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'Не удалось сохранить менеджера'))
  } finally {
    saving.value = false
  }
}

async function submitPassword() {
  if (!passwordTarget.value) return
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await updateUser(passwordTarget.value.id, {
      password: passwordForm.password,
    })
    ElMessage.success('Пароль обновлён')
    passwordVisible.value = false
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'Не удалось сбросить пароль'))
  } finally {
    saving.value = false
  }
}

async function toggleStatus(manager: AuthUser) {
  const nextStatus = manager.status === 'active' ? 'inactive' : 'active'
  try {
    if (nextStatus === 'inactive') {
      await deleteUser(manager.id)
    } else {
      await updateUser(manager.id, { status: 'active' })
    }
    ElMessage.success(
      nextStatus === 'inactive' ? 'Менеджер деактивирован' : 'Менеджер активирован',
    )
    await loadData()
    emit('changed')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'Не удалось изменить статус'))
  }
}

async function onHardDelete(manager: AuthUser) {
  try {
    await hardDeleteUser(manager.id)
    ElMessage.success('Менеджер удалён окончательно')
    await loadData()
    emit('changed')
  } catch (error) {
    ElMessage.error(getErrorMessage(error, 'Не удалось удалить менеджера'))
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    if (open) await loadData()
  },
)
</script>

<template>
  <el-drawer v-model="visible" title="Менеджеры объектов" size="720px">
    <div v-loading="loading" class="drawer-body">
      <div class="toolbar">
        <el-button type="primary" @click="openCreate">+ Добавить менеджера</el-button>
      </div>

      <el-table :data="managers" stripe>
        <el-table-column prop="fullName" label="ФИО" min-width="160" />
        <el-table-column prop="email" label="Email" min-width="180" />
        <el-table-column label="Статус" width="120">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ row.status === 'active' ? 'Активен' : 'Неактивен' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Объектов" width="100">
          <template #default="{ row }">
            {{ assignedCount(row.id) }}
          </template>
        </el-table-column>
        <el-table-column label="Действия" min-width="280">
          <template #default="{ row }">
            <div class="actions">
              <el-button size="small" @click="openEdit(row)">Редактировать</el-button>
              <el-button size="small" @click="openPassword(row)">Сбросить пароль</el-button>
              <el-button size="small" @click="toggleStatus(row)">
                {{ row.status === 'active' ? 'Деактивировать' : 'Активировать' }}
              </el-button>
              <el-tooltip
                :disabled="canHardDelete(row)"
                :content="hardDeleteTooltip(row)"
                placement="top"
              >
                <span>
                  <el-popconfirm
                    v-if="canHardDelete(row)"
                    title="Удалить менеджера окончательно?"
                    confirm-button-text="Удалить"
                    cancel-button-text="Отмена"
                    confirm-button-type="danger"
                    @confirm="onHardDelete(row)"
                  >
                    <template #reference>
                      <el-button size="small" type="danger">
                        Удалить окончательно
                      </el-button>
                    </template>
                  </el-popconfirm>
                  <el-button
                    v-else
                    size="small"
                    type="danger"
                    disabled
                  >
                    Удалить окончательно
                  </el-button>
                </span>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="createVisible"
      title="Добавить менеджера"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
      >
        <el-form-item label="ФИО" prop="fullName">
          <el-input v-model="createForm.fullName" />
        </el-form-item>
        <el-form-item label="Email" prop="email">
          <el-input v-model="createForm.email" />
        </el-form-item>
        <el-form-item label="Пароль" prop="password">
          <el-input v-model="createForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">Отмена</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">
          Создать
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editVisible"
      title="Редактировать менеджера"
      width="480px"
      append-to-body
      destroy-on-close
    >
      <el-form
        ref="editFormRef"
        :model="editForm"
        :rules="editRules"
        label-position="top"
      >
        <el-form-item label="ФИО" prop="fullName">
          <el-input v-model="editForm.fullName" />
        </el-form-item>
        <el-form-item label="Email" prop="email">
          <el-input v-model="editForm.email" />
        </el-form-item>
        <el-form-item label="Статус">
          <el-select v-model="editForm.status" style="width: 100%">
            <el-option label="Активен" value="active" />
            <el-option label="Неактивен" value="inactive" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">Отмена</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">
          Сохранить
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="passwordVisible"
      title="Сбросить пароль"
      width="420px"
      append-to-body
      destroy-on-close
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-position="top"
      >
        <el-form-item label="Новый пароль" prop="password">
          <el-input v-model="passwordForm.password" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">Отмена</el-button>
        <el-button type="primary" :loading="saving" @click="submitPassword">
          Сохранить пароль
        </el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.drawer-body {
  min-height: 240px;
}

.toolbar {
  margin-bottom: 1rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
