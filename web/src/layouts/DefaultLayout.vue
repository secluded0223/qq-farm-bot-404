<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import MysteryMerchantBanner from '@/components/shop/MysteryMerchantBanner.vue'
import Sidebar from '@/components/Sidebar.vue'
import TopAccountMenu from '@/components/TopAccountMenu.vue'
import SceneSwitch from '@/components/ui/SceneSwitch.vue'
import { menuRoutes } from '@/router/menu'
import { useAppStore } from '@/stores/app'
import { SCENE_BRAND, useSceneStore } from '@/stores/scene'

const appStore = useAppStore()
const sceneStore = useSceneStore()
const router = useRouter()
const { loginPageConfig, sidebarOpen } = storeToRefs(appStore)
const { scene } = storeToRefs(sceneStore)

const brandTitle = computed(() => (scene.value === 'ranch'
  ? SCENE_BRAND.ranch.title
  : loginPageConfig.value.title || SCENE_BRAND.farm.title))

// 顶栏面包屑：场景 + 当前页，替代与侧栏重复的品牌名
const sceneLabel = computed(() => (scene.value === 'ranch' ? '牧场' : '农场'))
const currentLabel = computed(() => {
  const path = router.currentRoute.value.path
  const item = menuRoutes.find(i => (i.path ? `/${i.path}` : '/') === path)
  return item?.label || ''
})

// 宠物和分析只有农场有，切到牧场场景后停在原路由会看到与场景对不上的页面，
// 所以跟着菜单一起回到两个场景都有的个人页。
const availablePaths = computed(() => new Set(
  menuRoutes
    .filter(item => !item.scenes || item.scenes.includes(scene.value))
    .map(item => item.path ? `/${item.path}` : '/'),
))

watch([() => router.currentRoute.value.path, scene] as const, ([path]) => {
  if (!availablePaths.value.has(path))
    router.replace('/personal')
}, { immediate: true })

onUnmounted(() => {
  // 清理逻辑
})
</script>

<template>
  <div class="w-screen flex overflow-hidden" style="height: 100dvh; background: transparent;">
    <!-- Mobile Sidebar Overlay -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-40 bg-gray-950/55 backdrop-blur-md transition-opacity lg:hidden"
      @click="appStore.closeSidebar"
    />

    <Sidebar />

    <main class="relative h-full min-h-0 min-w-0 flex flex-1 flex-col overflow-hidden">
      <header class="relative z-30 h-16 flex shrink-0 items-center justify-between border-b px-4 md:px-5" style="background: var(--farm-header); border-color: var(--surface-border);">
        <div class="min-w-0 flex items-center gap-3">
          <button
            aria-label="打开导航"
            :aria-expanded="sidebarOpen"
            class="h-9 w-9 flex items-center justify-center rounded-lg transition lg:hidden hover:bg-black/5 dark:hover:bg-white/10"
            style="color: var(--muted-text);"
            @click="appStore.toggleSidebar"
          >
            <div class="i-carbon-menu text-xl" />
          </button>
          <nav class="min-w-0 flex items-center gap-2 text-sm" aria-label="当前位置">
            <span class="hidden shrink-0 lg:inline" style="color: var(--muted-text);">{{ sceneLabel }}</span>
            <div class="i-carbon-chevron-right hidden shrink-0 text-xs lg:block" style="color: var(--subtle-text);" />
            <span class="truncate font-semibold" style="color: var(--theme-text);">{{ currentLabel || brandTitle }}</span>
          </nav>
        </div>

        <div class="flex shrink-0 items-center gap-1">
          <SceneSwitch />
          <TopAccountMenu />
        </div>
      </header>

      <!-- Main Content Area -->
      <div class="min-h-0 flex flex-1 flex-col overflow-hidden">
        <MysteryMerchantBanner />
        <div class="custom-scrollbar min-h-0 flex flex-1 flex-col overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6 sm:p-4 md:pb-6 sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <RouterView v-slot="{ Component, route }">
            <component :is="Component" :key="route.path" />
          </RouterView>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 3px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}

.custom-scrollbar {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
</style>
