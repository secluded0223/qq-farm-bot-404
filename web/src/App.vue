<script setup lang="ts">
import type { Theme } from '@/stores/app'
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import ToastContainer from '@/components/ToastContainer.vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// 立即应用保存的主题（在组件挂载前）
const savedTheme = localStorage.getItem('ui_theme') as Theme
if (savedTheme && appStore.themes[savedTheme]) {
  appStore.applyTheme(savedTheme)
}

onMounted(() => {
  appStore.fetchTheme()
})
</script>

<template>
  <div class="app-root h-screen w-screen overflow-hidden" :style="{ color: 'var(--theme-text)' }">
    <RouterView />
    <ToastContainer />
  </div>
</template>

<style>
/* Global styles */
body {
  margin: 0;
  font-family:
    Inter,
    'Microsoft YaHei',
    'PingFang SC',
    -apple-system,
    BlinkMacSystemFont,
    system-ui,
    sans-serif;
  line-height: 1.5;
  font-optical-sizing: auto;
  background: var(--app-bg);
  color: var(--theme-text);
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

/* 农场色板：浅色沿用旧版奶油绿体系，深色沿用旧版夜耕体系 */
:root {
  --theme-bg: #edf3e5;
  --theme-text: #203d31;
  --theme-primary: #238452;
  --theme-secondary: #3f9c6b;
  --theme-gradient: linear-gradient(135deg, #40975c 0%, #238452 100%);
  --app-bg: #edf3e5;
  --surface-1: #ffffff;
  --surface-2: #f4f7f5;
  --surface-3: #e8efea;
  --surface-border: #dfe7e2;
  --surface-border-strong: #c9d7ce;
  --surface-shadow: 0 12px 32px rgb(45 70 31 / 7%);
  --surface-shadow-soft: 0 4px 18px rgb(45 70 31 / 4%);
  --muted-text: #586b62;
  --subtle-text: #8a9a91;
  --input-bg: #ffffff;
  --panel-glow: color-mix(in srgb, var(--theme-primary) 6%, transparent);
  --table-head: #eef4e8;
  --radius-card: 8px;
  --radius-control: 8px;
  --farm-accent: #f9c75a;
  --farm-sidebar: #fffef8;
  --farm-header: rgb(255 254 248 / 95%);
  --farm-scene: url(/backgrounds/farm-day.webp);
  --farm-scene-overlay: linear-gradient(180deg, rgb(237 246 232 / 66%), rgb(237 246 232 / 92%));
}

.dark {
  --theme-bg: #111418;
  --theme-text: #e4e8ec;
  --theme-primary: #5bbd88;
  --theme-secondary: #6cc2b2;
  --theme-gradient: linear-gradient(135deg, #40975c 0%, #238452 100%);
  --app-bg: #111418;
  --surface-1: #1a1f25;
  --surface-2: #242a32;
  --surface-3: #20262d;
  --surface-border: rgba(255, 255, 255, 0.07);
  --surface-border-strong: rgba(255, 255, 255, 0.12);
  --surface-shadow: 0 8px 24px rgba(0, 0, 0, 0.36);
  --surface-shadow-soft: 0 1px 2px rgba(0, 0, 0, 0.32);
  --muted-text: #a3acb6;
  --subtle-text: #78818c;
  --input-bg: #1a1f25;
  --panel-glow: color-mix(in srgb, var(--theme-primary) 10%, transparent);
  --table-head: #242a32;
  --farm-sidebar: #15191e;
  --farm-header: rgb(17 20 24 / 95%);
  --farm-scene-overlay: linear-gradient(180deg, rgb(14 24 18 / 74%), rgb(14 24 18 / 90%));
}

@media (max-width: 639px) {
  :root {
    --farm-scene: url(/backgrounds/farm-day-mobile.webp);
  }
}

.app-root {
  position: relative;
  isolation: isolate;
  background: var(--app-bg);
}

/* 农场实景底图：整站铺一张，靠半透明遮罩压住，保证前景可读 */
.app-root::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: var(--farm-scene-overlay), var(--farm-scene) center / cover;
}

/* SaaS surface system */
.bg-white {
  background-color: var(--surface-1) !important;
}

.dark .bg-gray-800,
.dark .bg-gray-900 {
  background-color: var(--surface-1) !important;
}

.bg-gray-50 {
  background-color: var(--surface-2) !important;
}

.dark .bg-gray-700 {
  background-color: var(--surface-3) !important;
}

.ui-card {
  border: 1px solid var(--surface-border);
  background: var(--surface-1);
  box-shadow: var(--surface-shadow-soft);
}

.ui-card-elevated {
  border: 1px solid var(--surface-border);
  background: var(--surface-1);
  box-shadow: var(--surface-shadow);
}

.ui-subtle-panel {
  border: 1px solid var(--surface-border);
  background: var(--surface-2);
}

.glass-panel {
  border: 1px solid var(--surface-border);
  background: var(--farm-header);
  backdrop-filter: blur(10px);
  box-shadow: var(--surface-shadow-soft);
}

/* 农场按钮：主操作实心主色，次要操作白底描边，避免多色按钮并列 */
.farm-btn-primary {
  background: var(--theme-primary);
  border: 1px solid var(--theme-primary);
  color: #fff;
}
.farm-btn-primary:hover {
  filter: brightness(1.06);
}

.farm-btn-soft {
  background: var(--surface-1);
  border: 1px solid var(--surface-border);
  color: var(--theme-text);
}
.farm-btn-soft:hover {
  background: var(--surface-2);
  border-color: var(--surface-border-strong);
}

.farm-btn-accent {
  background: color-mix(in srgb, var(--farm-accent) 16%, var(--surface-1));
  border: 1px solid color-mix(in srgb, var(--farm-accent) 50%, var(--surface-border));
  color: var(--theme-text);
}
.farm-btn-accent:hover {
  background: color-mix(in srgb, var(--farm-accent) 28%, var(--surface-1));
}

.metric-card {
  position: relative;
  overflow: hidden;
}.metric-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, var(--panel-glow), transparent 42%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 34%);
}

.metric-card > * {
  position: relative;
}

.shadow,
.shadow-sm,
.shadow-md {
  box-shadow: var(--surface-shadow-soft) !important;
}

/* Use CSS variables for theme colors */
.btn-primary {
  background: var(--theme-gradient);
  border-color: var(--theme-primary);
}

.btn-primary:hover {
  background: var(--theme-secondary);
}

.text-primary {
  color: var(--theme-primary);
}

.bg-primary {
  background-color: var(--theme-primary);
}

.border-primary {
  border-color: var(--theme-primary);
}

.bg-gradient-primary {
  background: var(--theme-gradient);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--theme-primary) 34%, var(--surface-border-strong));
  border-radius: 999px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--theme-secondary);
  opacity: 0.8;
}
</style>
