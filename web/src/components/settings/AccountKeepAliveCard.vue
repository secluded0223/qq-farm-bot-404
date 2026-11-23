<script setup lang="ts">
import type { SystemConfig } from '@/composables/useAdminSystemConfig'
import { computed, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseSwitch from '@/components/ui/BaseSwitch.vue'
import { defaultAutoCodeRefresh } from '@/composables/useAdminSystemConfig'

const props = withDefaults(defineProps<{
  saving?: boolean
}>(), {
  saving: false,
})

const emit = defineEmits<{
  save: []
}>()

const localSystemConfig = defineModel<SystemConfig>('localSystemConfig', { required: true })

// 老配置里没有这两个字段，补默认值，避免开关读到 undefined。
watch(localSystemConfig, (config) => {
  if (!config) return
  if (!config.autoCodeRefresh)
    config.autoCodeRefresh = { ...defaultAutoCodeRefresh }
  if (typeof config.autoStartAccounts !== 'boolean')
    config.autoStartAccounts = true
}, { immediate: true })

const autoCodeRefresh = computed(() => localSystemConfig.value.autoCodeRefresh ?? { ...defaultAutoCodeRefresh })
const autoStartAccounts = computed({
  get: () => localSystemConfig.value.autoStartAccounts !== false,
  set: (value: boolean) => { localSystemConfig.value.autoStartAccounts = value },
})

const keepAliveOff = computed(() => !autoCodeRefresh.value.enabled && !autoCodeRefresh.value.offlineEnabled)
</script>

<template>
  <div class="border border-gray-200 rounded-lg bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
      <h4 class="flex items-center gap-2 text-base text-gray-900 font-bold dark:text-gray-100">
        <div class="i-carbon-renew" />
        账号续签与保活
      </h4>
      <span
        class="rounded px-1.5 py-0.5 text-[11px] font-medium"
        :class="keepAliveOff
          ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'"
      >
        {{ keepAliveOff ? '已关闭' : '已启用' }}
      </span>
    </div>
    <p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
      所有微信账号共享；只对扫码时拿到微信授权凭据（refreshtoken）的账号生效，没有凭据的账号需要重新扫码。
    </p>

    <div class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-900/40">
        <div class="min-w-0">
          <div class="text-sm text-gray-800 font-medium dark:text-gray-200">
            定时重登
          </div>
          <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            每隔固定分钟数续期一次微信授权，并用新 Code 重启账号。
          </div>
        </div>
        <div class="flex items-center gap-3">
          <BaseInput
            v-model="autoCodeRefresh.intervalMinutes"
            type="number"
            min="1"
            max="1440"
            class="w-24"
            :disabled="!autoCodeRefresh.enabled"
          />
          <span class="text-xs text-gray-500 dark:text-gray-400">分钟</span>
          <BaseSwitch v-model="autoCodeRefresh.enabled" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-900/40">
        <div class="min-w-0">
          <div class="text-sm text-gray-800 font-medium dark:text-gray-200">
            掉线重登
          </div>
          <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            账号断开或被踢下线后，等待指定秒数自动续期并重新启动。
          </div>
        </div>
        <div class="flex items-center gap-3">
          <BaseInput
            v-model="autoCodeRefresh.offlineDelaySeconds"
            type="number"
            min="1"
            max="86400"
            class="w-24"
            :disabled="!autoCodeRefresh.offlineEnabled"
          />
          <span class="text-xs text-gray-500 dark:text-gray-400">秒</span>
          <BaseSwitch v-model="autoCodeRefresh.offlineEnabled" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-gray-900/40">
        <div class="min-w-0">
          <div class="text-sm text-gray-800 font-medium dark:text-gray-200">
            服务启动自动登录
          </div>
          <div class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            重启服务后自动拉起已保存的账号；微信账号会自动续期 Code，QQ 账号 Code 失效时仍需重新扫码。
          </div>
        </div>
        <BaseSwitch v-model="autoStartAccounts" />
      </div>
    </div>

    <div class="mt-3 flex justify-end">
      <BaseButton size="sm" variant="primary" :loading="props.saving" @click="emit('save')">
        保存
      </BaseButton>
    </div>
  </div>
</template>