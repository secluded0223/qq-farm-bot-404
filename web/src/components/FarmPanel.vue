<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import api from '@/api'
import ConfirmModal from '@/components/ConfirmModal.vue'
import FarmScene from '@/components/FarmScene.vue'
import InteractionItemsPanel from '@/components/InteractionItemsPanel.vue'
import { useAccountStore } from '@/stores/account'
import { useFarmStore } from '@/stores/farm'
import { useStatusStore } from '@/stores/status'
import { useToastStore } from '@/stores/toast'

const farmStore = useFarmStore()
const accountStore = useAccountStore()
const statusStore = useStatusStore()
const toast = useToastStore()
const { lands, summary, weather, loading, dogSkillGiftPendingCount, dogSkillGiftLoading, dogSkillGiftError } = storeToRefs(farmStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)
const { status, loading: statusLoading, realtimeConnected, currentStatusReady } = storeToRefs(statusStore)

const operating = ref(false)
const farmLoaded = ref(false)
const confirmVisible = ref(false)
const farmViewport = ref<HTMLElement | null>(null)
const farmStageWidth = ref<number | null>(null)
const FARM_CANVAS_WIDTH = 1200
const FARM_CANVAS_HEIGHT = 650
type PendingLandAction = 'fertilize' | 'fertilizeAll'

const confirmConfig = ref({
  title: '',
  message: '',
  opType: '',
  landAction: '' as PendingLandAction | '',
  land: null as any | null,
  type: 'primary' as 'primary' | 'danger',
})

async function executeOperate() {
  if (!currentAccountId.value)
    return

  const config = confirmConfig.value
  // 一键施肥没有具体地块，其余地块动作必须带 land。
  if (!config.opType && !config.landAction)
    return
  if (config.landAction === 'fertilize' && !config.land)
    return

  confirmVisible.value = false
  operating.value = true
  try {
    if (config.opType) {
      await farmStore.operate(currentAccountId.value, config.opType)
    }
    else if (config.landAction === 'fertilize') {
      await farmStore.fertilizeLand(currentAccountId.value, Number(config.land.id))
    }
    else if (config.landAction === 'fertilizeAll') {
      const result = await farmStore.fertilizeAllLands(currentAccountId.value, 'organic')
      const successCount = Number(result?.successCount) || 0
      if (successCount > 0)
        toast.success(`已催熟 ${successCount} 块地`)
      else
        toast.info('当前没有可施肥的生长中作物')
    }
  }
  catch (error: any) {
    toast.error(String(error?.response?.data?.error || error?.message || '操作失败'))
  }
  finally {
    operating.value = false
  }
}

function handleOperate(opType: string) {
  if (!currentAccountId.value)
    return

  const confirmMap: Record<string, string> = {
    harvest: '确定要收获所有成熟作物吗？',
    clear: '确定要执行一键务农吗？将自动浇水、除草、除虫。',
    plant: '确定要一键种植吗？(根据策略配置)',
    upgrade: '确定要升级所有可升级的土地吗？(消耗金币)',
    all: '确定要执行一键全收吗？将依次执行收获、务农、种植与升级。',
  }

  confirmConfig.value = {
    title: '确认操作',
    message: confirmMap[opType] || '确定执行此操作吗？',
    opType,
    landAction: '',
    land: null,
    type: 'primary',
  }
  confirmVisible.value = true
}

function getLandActionName(land: any) {
  return `#${land?.id ?? '-'} ${land?.plantName || '该作物'}`
}

function handleLandFertilize(land: any) {
  if (!currentAccountId.value)
    return

  confirmConfig.value = {
    title: '确认催熟',
    message: `确定要对 ${getLandActionName(land)} 使用有机肥料催熟吗？`,
    opType: '',
    landAction: 'fertilize',
    land,
    type: 'primary',
  }
  confirmVisible.value = true
}

function handleFertilizeAllClick() {
  if (!currentAccountId.value)
    return

  confirmConfig.value = {
    title: '确认一键施肥',
    message: '确定对全部生长中的作物使用有机肥料催熟吗？\n只处理生长中且未成熟的地块，已施肥或已成熟的地块会被跳过。',
    opType: '',
    landAction: 'fertilizeAll',
    land: null,
    type: 'primary',
  }
  confirmVisible.value = true
}

const operations = [
  { type: 'harvest', label: '收获', icon: 'i-carbon-wheat', color: 'farm-btn-primary' },
  { type: 'clear', label: '一键务农', icon: 'i-carbon-clean', color: 'farm-btn-soft' },
  { type: 'plant', label: '种植', icon: 'i-carbon-sprout', color: 'farm-btn-soft' },
  { type: 'upgrade', label: '升级土地', icon: 'i-carbon-upgrade', color: 'farm-btn-soft' },
  { type: 'all', label: '一键全收', icon: 'i-carbon-flash', color: 'farm-btn-accent' },
]

// ===== 催熟全部：先预览化肥消耗，确认后逐批执行 =====
const ripenPreview = ref<any>(null)
const ripenLoading = ref(false)
const ripenRunning = ref(false)
const ripenError = ref('')
const ripenProgress = ref({ completed: 0, total: 0 })

function closeRipen() {
  if (ripenRunning.value)
    return
  ripenPreview.value = null
  ripenError.value = ''
  ripenProgress.value = { completed: 0, total: 0 }
}

async function openRipenAllPreview() {
  if (ripenLoading.value || ripenRunning.value)
    return
  ripenLoading.value = true
  ripenError.value = ''
  try {
    const { data } = await api.post('/api/farm/ripen-all/preview', undefined, { timeout: 60000 } as any)
    if (!data?.ok)
      throw new Error(data?.error || '预览失败')
    ripenPreview.value = data.data
    ripenProgress.value = { completed: 0, total: Number(data.data?.targetCount) || 0 }
  }
  catch (error: any) {
    toast.error(error.response?.data?.error || error.message || '预览催熟计划失败')
  }
  finally {
    ripenLoading.value = false
  }
}

async function runRipenAll() {
  if (!ripenPreview.value || ripenRunning.value)
    return
  ripenRunning.value = true
  ripenError.value = ''
  try {
    let cursor = 0
    const token = ripenPreview.value.token
    let isDone = false
    for (let guard = 0; guard < 200; guard++) {
      const { data } = await api.post('/api/farm/ripen-all/step', { token, cursor }, { timeout: 90000 } as any)
      if (!data?.ok)
        throw new Error(data?.error || '催熟执行失败')
      const step = data.data || {}
      ripenProgress.value = {
        completed: Number(step.completed) || 0,
        total: Number(step.total) || ripenProgress.value.total,
      }
      await refresh()
      cursor = Number(step.cursor) || cursor + 1
      if (step.done) {
        isDone = true
        break
      }
      if (step.stopped) {
        ripenError.value = String(step.stopped)
        break
      }
    }
    if (isDone) {
      toast.success(`催熟完成：${ripenProgress.value.completed} 块土地已成熟`)
      closeRipen()
    }
  }
  catch (error: any) {
    ripenError.value = error.response?.data?.error || error.message || '催熟执行失败'
  }
  finally {
    ripenRunning.value = false
  }
}

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    try {
      if (!realtimeConnected.value) {
        await statusStore.fetchStatus(currentAccountId.value)
      }

      if (acc.running) {
        await Promise.all([
          farmStore.fetchLands(currentAccountId.value),
          farmStore.fetchDogSkillGiftStatus(currentAccountId.value),
        ])
      }
    }
    finally {
      farmLoaded.value = true
    }
  }
}

async function claimDogSkillGifts() {
  if (currentAccountId.value)
    await farmStore.claimDogSkillGifts(currentAccountId.value)
}

const showInitialLoading = computed(() =>
  !farmLoaded.value && (loading.value || statusLoading.value),
)

const farmStageStyle = computed(() => farmStageWidth.value
  ? { width: `${farmStageWidth.value}px` }
  : undefined)

function updateFarmStageSize() {
  const viewport = farmViewport.value
  if (!viewport || window.innerWidth < 640) {
    farmStageWidth.value = null
    return
  }
  const documentTop = viewport.getBoundingClientRect().top + window.scrollY
  const availableHeight = Math.max(240, window.innerHeight - documentTop - 72)
  const availableWidth = viewport.parentElement?.clientWidth || FARM_CANVAS_WIDTH
  // 保持 1200×650 比例并限制在当前一屏内；外层 viewport 同步收窄，不再露出第二层背景。
  farmStageWidth.value = Math.min(availableWidth, FARM_CANVAS_WIDTH, availableHeight * FARM_CANVAS_WIDTH / FARM_CANVAS_HEIGHT)
}

watch(currentAccountId, (newId, oldId) => {
  if (oldId !== undefined && newId !== oldId) {
    farmLoaded.value = false
    farmStore.clearFarmData()
    statusStore.clearAccountScopedData()
  }
  refresh()
}, { immediate: true })

watch(() => currentAccount.value?.running, () => {
  refresh()
})

const { pause, resume } = useIntervalFn(() => {
  if (lands.value) {
    lands.value = lands.value.map((l: any) =>
      l.matureInSec > 0 ? { ...l, matureInSec: l.matureInSec - 1 } : l,
    )
  }
}, 1000)

const { pause: pauseRefresh, resume: resumeRefresh } = useIntervalFn(refresh, 60000)

resume()
resumeRefresh()
onMounted(() => {
  window.addEventListener('resize', updateFarmStageSize)
  updateFarmStageSize()
})
onUnmounted(() => {
  pause()
  pauseRefresh()
  window.removeEventListener('resize', updateFarmStageSize)
})
</script>

<template>
  <div
    class="space-y-4"
    :class="{ 'farm-panel-modal-open': confirmVisible }"
  >
    <div class="rounded-lg bg-white shadow dark:bg-gray-800">
      <!-- Header with Title and Actions -->
      <div class="flex flex-col items-stretch justify-between gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center dark:border-gray-700">
        <h3 class="flex items-center gap-2 text-lg font-bold">
          <div class="i-carbon-grid text-xl" />
          土地详情
        </h3>
        <div class="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <button
            v-for="op in operations"
            :key="op.type"
            class="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            :class="op.color"
            :disabled="operating"
            @click="handleOperate(op.type)"
          >
            <div :class="op.icon" />
            <span class="hidden sm:inline">{{ op.label }}</span>
            <span class="sm:hidden">{{ op.type === 'clear' ? '务农' : op.label.replace('一键', '') }}</span>
          </button>
          <button
            class="farm-btn-soft flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="operating"
            title="对全部生长中的作物使用有机肥料催熟"
            @click="handleFertilizeAllClick"
          >
            <div class="i-carbon-chemistry" />
            <span class="hidden sm:inline">一键施肥</span>
            <span class="sm:hidden">施肥</span>
          </button>
          <button
            class="farm-btn-soft flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="operating || ripenLoading || ripenRunning"
            title="催熟全部作物，先预览化肥消耗"
            @click="openRipenAllPreview"
          >
            <div class="i-carbon-growth" />
            <span class="hidden sm:inline">{{ ripenLoading ? '预览中…' : '催熟全部' }}</span>
            <span class="sm:hidden">催熟</span>
          </button>
        </div>
      </div>

      <div
        v-if="dogSkillGiftPendingCount > 0"
        class="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
      >
        <div class="i-carbon-gift text-xl" />
        <div class="min-w-0 flex-1">
          待拾取同气连枝礼包 ×{{ dogSkillGiftPendingCount }}
        </div>
        <button
          class="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
          :disabled="dogSkillGiftLoading"
          @click="claimDogSkillGifts"
        >
          {{ dogSkillGiftLoading ? '拾取中…' : '拾取' }}
        </button>
      </div>
      <div v-else-if="dogSkillGiftError" class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
        {{ dogSkillGiftError }}
      </div>

      <!-- Summary -->
      <div class="grid grid-cols-4 gap-2 border-b border-gray-100 bg-gray-50 p-3 text-xs sm:flex sm:flex-wrap sm:gap-4 dark:border-gray-700 dark:bg-gray-900/50 sm:p-4 sm:text-sm">
        <div class="flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
          <div class="i-carbon-clean" />
          <span class="font-medium">可收: {{ summary?.harvestable || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <div class="i-carbon-sprout" />
          <span class="font-medium">生长: {{ summary?.growing || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
          <div class="i-carbon-checkbox" />
          <span class="font-medium">空闲: {{ summary?.empty || 0 }}</span>
        </div>
        <div class="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <div class="i-carbon-warning" />
          <span class="font-medium">枯萎: {{ summary?.dead || 0 }}</span>
        </div>
      </div>

      <!-- Grid -->
      <div class="p-2 sm:p-4">
        <div v-if="showInitialLoading" class="flex justify-center py-12">
          <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
        </div>

        <div v-else-if="!currentAccountId" class="flex flex-col items-center justify-center gap-4 rounded-lg bg-white p-12 text-center text-gray-500 shadow dark:bg-gray-800">
          <div class="i-carbon-user-offline text-4xl text-gray-400" />
          <div>
            <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
              未登录账号
            </div>
            <div class="mt-1 text-sm text-gray-400">
              请先添加农场账号
            </div>
          </div>
        </div>

        <div v-else-if="!lands || lands.length === 0" class="flex justify-center py-12 text-gray-500">
          暂无土地数据
        </div>

        <div v-else-if="currentStatusReady && !status?.connection?.connected" class="flex flex-col items-center justify-center gap-4 rounded-lg bg-white p-12 text-center text-gray-500 shadow dark:bg-gray-800">
          <div class="i-carbon-connection-signal-off text-4xl text-gray-400" />
          <div>
            <div class="text-lg text-gray-700 font-medium dark:text-gray-300">
              账号未登录
            </div>
            <div class="mt-1 text-sm text-gray-400">
              请先运行账号或检查网络连接
            </div>
          </div>
        </div>

        <div v-else>
          <div ref="farmViewport">
            <FarmScene
              :lands="lands"
              :weather="weather"
              :style="farmStageStyle"
              @fertilize="handleLandFertilize"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 特殊互动道具：与自己农场的自动化流程共用同一批后端校验。 -->
    <InteractionItemsPanel
      v-if="currentAccountId"
      :account-id="currentAccountId"
      mode="self"
      :lands="lands"
      @used="refresh"
    />

    <ConfirmModal
      :show="confirmVisible"
      :title="confirmConfig.title"
      :message="confirmConfig.message"
      :type="confirmConfig.type"
      @confirm="executeOperate"
      @close="confirmVisible = false"
      @cancel="confirmVisible = false"
    />

    <!-- 催熟全部：消耗预览与执行进度 -->
    <div
      v-if="ripenPreview"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeRipen"
    >
      <div class="w-full max-w-md rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800">
        <h4 class="text-base text-gray-900 font-bold dark:text-gray-100">
          催熟全部 · 消耗预览
        </h4>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          确认后按批次施肥，每一批发送前都会重新校验作物状态与化肥库存。
        </p>

        <div class="mt-3 space-y-1.5 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">可催熟地块</span>
            <span class="font-medium">{{ ripenPreview.targetCount }} 块</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">批次 / 施肥次数</span>
            <span class="font-medium">{{ ripenPreview.actionCount }} 批 · {{ ripenPreview.applicationCount }} 次</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">普通化肥 需 / 存</span>
            <span class="font-medium" :class="ripenPreview.cost.normal > ripenPreview.inventory.normal ? 'text-red-600 dark:text-red-400' : ''">
              {{ ripenPreview.cost.normal }} / {{ ripenPreview.inventory.normal }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-gray-400">有机化肥 需 / 存</span>
            <span class="font-medium" :class="ripenPreview.cost.organic > ripenPreview.inventory.organic ? 'text-red-600 dark:text-red-400' : ''">
              {{ ripenPreview.cost.organic }} / {{ ripenPreview.inventory.organic }}
            </span>
          </div>
        </div>

        <div v-if="ripenPreview.skipped?.length" class="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <div class="font-medium">
            跳过 {{ ripenPreview.skipped.length }} 块土地
          </div>
          <ul class="mt-1 list-inside list-disc space-y-0.5">
            <li v-for="item in ripenPreview.skipped.slice(0, 5)" :key="item.landId">
              土地 #{{ item.landId }}：{{ item.reason }}
            </li>
          </ul>
        </div>

        <div v-if="!ripenPreview.sufficient" class="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
          化肥不足，请先补充后再催熟。
        </div>

        <div v-if="ripenRunning || ripenProgress.completed > 0" class="mt-3">
          <div class="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>进度</span>
            <span>{{ ripenProgress.completed }} / {{ ripenProgress.total }}</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              class="h-full rounded-full transition-all"
              :style="{
                width: `${ripenProgress.total ? Math.min(100, (ripenProgress.completed / ripenProgress.total) * 100) : 0}%`,
                background: 'var(--theme-primary)',
              }"
            />
          </div>
        </div>

        <p v-if="ripenError" class="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {{ ripenError }}
        </p>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="farm-btn-soft rounded-lg px-3 py-2 text-sm transition"
            :disabled="ripenRunning"
            @click="closeRipen"
          >
            {{ ripenError ? '关闭' : '取消' }}
          </button>
          <button
            v-if="!ripenError && ripenPreview.sufficient && ripenPreview.targetCount"
            class="farm-btn-primary rounded-lg px-3 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="ripenRunning"
            @click="runRipenAll"
          >
            {{ ripenRunning ? '催熟中…' : '开始催熟' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
