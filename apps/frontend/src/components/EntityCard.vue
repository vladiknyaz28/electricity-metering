<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    statusLabel: string
    statusType?: 'success' | 'info' | 'warning' | 'danger'
    highlighted?: boolean
  }>(),
  {
    statusType: 'info',
    highlighted: false,
  },
)
</script>

<template>
  <el-card
    shadow="hover"
    class="entity-card"
    :class="{ highlighted }"
  >
    <div class="entity-card__inner">
      <div class="entity-card__header">
        <h3 class="entity-card__title" :title="title">{{ title }}</h3>
        <div class="entity-card__header-side">
          <slot name="header-extra" />
          <el-tag :type="statusType" size="small">{{ statusLabel }}</el-tag>
        </div>
      </div>

      <div class="entity-card__body">
        <slot />
      </div>

      <div class="entity-card__actions">
        <slot name="actions" />
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.entity-card {
  height: 100%;
  min-height: 280px;
  border-radius: 10px;
  transition: outline 0.2s ease, box-shadow 0.2s ease;
}

.entity-card.highlighted {
  outline: 2px solid var(--el-color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-primary) 25%, transparent);
}

.entity-card :deep(.el-card__body) {
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.entity-card__inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 248px;
}

.entity-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.entity-card__title {
  margin: 0;
  flex: 1 1 auto;
  min-width: 4rem;
  max-width: 100%;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.35;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.entity-card__header-side {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 0 0 auto;
}

.entity-card__body {
  flex: 1;
  font-size: 14.5px;
  line-height: 1.45;
  color: #374151;
}

.entity-card__body :deep(.line),
.entity-card__body :deep(.meta),
.entity-card__body :deep(.id),
.entity-card__body :deep(.address) {
  margin: 0.25rem 0;
  font-size: 14.5px;
  color: #4b5563;
}

.entity-card__body :deep(.counts) {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin: 0.75rem 0 0;
  font-size: 14.5px;
}

.entity-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 1rem;
}
</style>
