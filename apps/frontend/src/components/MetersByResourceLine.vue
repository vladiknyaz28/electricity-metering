<script setup lang="ts">
import { computed } from 'vue'
import {
  resourceTypeColor,
  resourceTypeTitle,
} from '../utils/resourceColors'

const props = defineProps<{
  items?: Array<{
    resourceTypeId: string | null
    resourceName: string
    count: number
  }>
  fallbackCount?: number
}>()

const rows = computed(() => {
  if (props.items?.length) return props.items
  if ((props.fallbackCount ?? 0) > 0) {
    return [
      {
        resourceTypeId: null,
        resourceName: 'Счётчики',
        count: props.fallbackCount ?? 0,
      },
    ]
  }
  return []
})

const isSingleGeneric = computed(
  () =>
    rows.value.length === 1 &&
    rows.value[0].resourceName === 'Счётчики',
)
</script>

<template>
  <span v-if="!rows.length" class="meters-by-resource empty">Счётчики: 0</span>
  <span v-else-if="isSingleGeneric" class="meters-by-resource">
    Счётчики: {{ rows[0].count }}
  </span>
  <span v-else class="meters-by-resource">
    <template v-for="(row, index) in rows" :key="row.resourceTypeId || row.resourceName">
      <span
        class="meters-item"
        :style="{ color: resourceTypeColor(row.resourceName) }"
      >
        {{ resourceTypeTitle(row.resourceName) }}: {{ row.count }}
      </span>
      <span v-if="index < rows.length - 1" class="sep"> · </span>
    </template>
  </span>
</template>

<style scoped>
.meters-by-resource {
  display: inline;
  font-size: inherit;
  line-height: 1.4;
}

.meters-item {
  font-weight: 600;
}

.sep {
  color: #9ca3af;
  font-weight: 400;
}

.empty {
  color: inherit;
}
</style>
