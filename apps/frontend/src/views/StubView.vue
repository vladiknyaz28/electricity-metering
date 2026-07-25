<template>
  <div class="stub">
    <h2>{{ title }}</h2>
    <p v-if="title === 'Показания' && meterId">
      Раздел «Показания» в разработке. Запрошен счётчик: {{ meterId }}
    </p>
    <p v-else>Раздел в разработке</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

defineProps<{ title: string }>()

const route = useRoute()
const meterId = computed(() => {
  const value = route.query.meterId
  return typeof value === 'string' ? value : ''
})
</script>

<style scoped>
.stub {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}

h2 {
  margin: 0 0 0.5rem;
}

p {
  margin: 0;
  color: #6b7280;
}
</style>
