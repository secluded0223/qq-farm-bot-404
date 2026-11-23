import { ref } from 'vue'
import api from '@/api'

export interface AutoCodeRefreshConfig {
  enabled: boolean
  intervalMinutes: number
  offlineEnabled: boolean
  offlineDelaySeconds: number
}

export interface SystemConfig {
  serverUrl: string
  clientVersion: string
  platform: string
  os: string
  /** 账号保活：定时重登与掉线重登，只对具备微信刷新凭证的账号生效。 */
  autoCodeRefresh?: AutoCodeRefreshConfig
  /** 服务启动后是否自动拉起已保存的账号。 */
  autoStartAccounts?: boolean
}

interface UseAdminSystemConfigOptions {
  showAlert: (message: string, type?: 'primary' | 'danger') => void
}

export const defaultAutoCodeRefresh: AutoCodeRefreshConfig = {
  enabled: false,
  intervalMinutes: 60,
  offlineEnabled: false,
  offlineDelaySeconds: 60,
}

const defaultSystemConfigValues: SystemConfig = {
  serverUrl: 'wss://gate-obt.nqf.qq.com/prod/ws',
  clientVersion: '1.13.0.5_20260723',
  platform: 'qq',
  os: 'iOS',
  autoCodeRefresh: { ...defaultAutoCodeRefresh },
  autoStartAccounts: true,
}

export function useAdminSystemConfig(options: UseAdminSystemConfigOptions) {
  const systemConfigSaving = ref(false)
  const systemConfigLoading = ref(false)

  const localSystemConfig = ref<SystemConfig>({ ...defaultSystemConfigValues })
  const defaultSystemConfig = ref<SystemConfig>({ ...defaultSystemConfigValues })

  const platformOptions = [
    { label: 'QQ', value: 'qq' },
    { label: '微信', value: 'wx' },
  ]

  const osOptions = [
    { label: 'iOS', value: 'iOS' },
    { label: 'Android', value: 'Android' },
  ]

  async function loadSystemConfig() {
    systemConfigLoading.value = true
    try {
      const { data } = await api.get('/api/settings/system-config')
      if (data?.ok) {
        if (data.data.saved)
          localSystemConfig.value = { ...data.data.saved }
        if (data.data.default)
          defaultSystemConfig.value = { ...data.data.default }
      }
    }
    catch (e: any) {
      console.error('加载系统配置失败:', e)
    }
    finally {
      systemConfigLoading.value = false
    }
  }

  async function handleResetSystemConfig() {
    systemConfigSaving.value = true
    try {
      const { data } = await api.post('/api/settings/system-config/reset', {
        confirmed: true,
      })
      if (data?.ok) {
        localSystemConfig.value = { ...data.data.saved }
        options.showAlert('系统配置已重置为默认值', 'primary')
      }
      else {
        options.showAlert(data?.error || '重置失败', 'danger')
      }
    }
    catch (e: any) {
      options.showAlert(`重置失败: ${e.message || '未知错误'}`, 'danger')
    }
    finally {
      systemConfigSaving.value = false
    }
  }

  return {
    systemConfigSaving,
    localSystemConfig,
    defaultSystemConfig,
    platformOptions,
    osOptions,
    loadSystemConfig,
    handleResetSystemConfig,
  }
}
