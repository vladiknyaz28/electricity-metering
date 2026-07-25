<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useAuthStore } from '../stores/auth'
import { deleteObject, getObjects, hardDeleteObject } from '../api/objects'
import type { EnergyObject } from '../types/object'
import ObjectFormDialog from '../components/ObjectFormDialog.vue'
import EntityCard from '../components/EntityCard.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isAdmin = computed(() => authStore.role === 'admin')

const objects = ref<EnergyObject[]>([])
const loading = ref(false)
const search = ref('')
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const currentPage = ref(1)
const pageSize = 9
const highlightedId = ref<string | null>(null)

const dialogVisible = ref(false)
const editingObject = ref<EnergyObject | null>(null)

const filteredObjects = computed(() => {
  const query = search.value.trim().toLowerCase()
  return objects.value.filter((item) => {
    const matchesStatus =
      statusFilter.value === 'all' ? true : item.status === statusFilter.value
    const matchesSearch =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.address.toLowerCase().includes(query)
    return matchesStatus && matchesSearch
  })
})

const pagedObjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredObjects.value.slice(start, start + pageSize)
})

const totalFiltered = computed(() => filteredObjects.value.length)

async function loadObjects() {
  loading.value = true
  try {
    objects.value = await getObjects()
  } catch (error) {
    if (axios.isAxiosError(error)) {
      ElMessage.error('Не удалось загрузить объекты')
    }
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingObject.value = null
  dialogVisible.value = true
}

function openEdit(object: EnergyObject) {
  editingObject.value = object
  dialogVisible.value = true
}

function onSaved(saved: EnergyObject) {
  const index = objects.value.findIndex((item) => item.id === saved.id)
  if (index >= 0) {
    objects.value[index] = {
      ...saved,
      _count: saved._count ?? objects.value[index]._count,
    }
  } else {
    objects.value.unshift({
      ...saved,
      _count: saved._count ?? { meters: 0, consumers: 0 },
    })
  }
}

async function onDelete(object: EnergyObject) {
  try {
    const updated = await deleteObject(object.id)
    const index = objects.value.findIndex((item) => item.id === object.id)
    if (index >= 0) {
      objects.value[index] = {
        ...objects.value[index],
        ...updated,
        status: 'inactive',
        _count: updated._count ?? objects.value[index]._count,
      }
    }
    ElMessage.success('Объект удалён')
  } catch {
    ElMessage.error('Не удалось удалить объект')
  }
}

function canHardDelete(object: EnergyObject) {
  return (
    object.status === 'inactive' &&
    (object._count?.meters ?? 0) === 0 &&
    (object._count?.consumers ?? 0) === 0
  )
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (Array.isArray(message)) return message.join(', ')
    if (typeof message === 'string' && message) return message
  }
  return 'Не удалось удалить объект окончательно'
}

async function onHardDelete(object: EnergyObject) {
  try {
    await hardDeleteObject(object.id)
    objects.value = objects.value.filter((item) => item.id !== object.id)
    ElMessage.success('Объект удалён окончательно')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function statusLabel(status: string) {
  if (status === 'active') return 'Активен'
  if (status === 'inactive') return 'Неактивен'
  return status
}

function goToConsumers(objectId: string) {
  router.push({ path: '/consumers', query: { objectId } })
}

function goToMeters(objectId: string) {
  router.push({ path: '/meters', query: { objectId } })
}

async function applyHighlight() {
  const highlightId =
    typeof route.query.highlightId === 'string' ? route.query.highlightId : null
  if (!highlightId) return

  const indexInFiltered = filteredObjects.value.findIndex((item) => item.id === highlightId)
  if (indexInFiltered < 0) return

  currentPage.value = Math.floor(indexInFiltered / pageSize) + 1
  highlightedId.value = highlightId
  await nextTick()
  const el = document.getElementById(`object-card-${highlightId}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    if (highlightedId.value === highlightId) highlightedId.value = null
  }, 2500)
}

watch(
  () => route.query.highlightId,
  async () => {
    if (!loading.value) await applyHighlight()
  },
)

onMounted(async () => {
  await loadObjects()
  await applyHighlight()
})
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="toolbar">
      <h2>Объекты</h2>
      <div class="toolbar-actions">
        <el-input
          v-model="search"
          clearable
          placeholder="Поиск по названию или адресу"
          :prefix-icon="Search"
          style="width: 280px"
          @input="currentPage = 1"
        />
        <el-select
          v-model="statusFilter"
          style="width: 160px"
          @change="currentPage = 1"
        >
          <el-option label="Все" value="all" />
          <el-option label="Активен" value="active" />
          <el-option label="Неактивен" value="inactive" />
        </el-select>
        <el-button v-if="isAdmin" type="primary" @click="openCreate">
          Добавить объект
        </el-button>
      </div>
    </div>

    <el-empty
      v-if="!loading && objects.length === 0"
      :description="
        isAdmin
          ? 'Пока нет ни одного объекта'
          : 'Вам пока не назначены объекты. Обратитесь к администратору.'
      "
    >
      <el-button v-if="isAdmin" type="primary" @click="openCreate">
        Добавить объект
      </el-button>
    </el-empty>

    <el-empty
      v-else-if="!loading && filteredObjects.length === 0"
      description="Объекты не найдены"
    />

    <template v-else-if="!loading">
      <div class="grid">
        <EntityCard
          v-for="item in pagedObjects"
          :id="`object-card-${item.id}`"
          :key="item.id"
          :title="item.name"
          :status-label="statusLabel(item.status)"
          :status-type="item.status === 'active' ? 'success' : 'info'"
          :highlighted="highlightedId === item.id"
        >
          <div class="meta">{{ item.typeCode }} · {{ item.categoryCode }}</div>
          <div class="address">{{ item.address }}</div>
          <div class="id">id: {{ shortId(item.id) }}</div>

          <div class="counts">
            <el-link type="primary" @click="goToConsumers(item.id)">
              Потребители: {{ item._count?.consumers ?? 0 }}
            </el-link>
            <el-link type="primary" @click="goToMeters(item.id)">
              Счётчики: {{ item._count?.meters ?? 0 }}
            </el-link>
          </div>

          <template v-if="isAdmin" #actions>
            <el-button type="primary" plain @click="openEdit(item)">
              Редактировать
            </el-button>
            <el-popconfirm
              :title="`Удалить объект ${item.name}?`"
              confirm-button-text="Удалить"
              cancel-button-text="Отмена"
              @confirm="onDelete(item)"
            >
              <template #reference>
                <el-button type="danger" plain>Удалить</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="canHardDelete(item)"
              title="Это действие необратимо. Объект и вся история будут удалены без возможности восстановления. Продолжить?"
              confirm-button-text="Да, удалить навсегда"
              cancel-button-text="Отмена"
              confirm-button-type="danger"
              @confirm="onHardDelete(item)"
            >
              <template #reference>
                <el-button type="danger">Удалить окончательно</el-button>
              </template>
            </el-popconfirm>
          </template>
        </EntityCard>
      </div>

      <div class="pager">
        <el-pagination
          v-model:current-page="currentPage"
          background
          layout="prev, pager, next"
          :page-size="pageSize"
          :total="totalFiltered"
        />
      </div>
    </template>

    <ObjectFormDialog
      v-model="dialogVisible"
      :object="editingObject"
      @saved="onSaved"
    />
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

.toolbar-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  align-items: stretch;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 1.25rem;
}
</style>
