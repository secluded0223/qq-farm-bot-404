import { useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import { useAccountStore } from '@/stores/account'
import { useUserStore } from '@/stores/user'

type AlertType = 'primary' | 'danger'

export function useAccountSettings(showAlert: (message: string, type?: AlertType) => void) {
  const router = useRouter()
  const accountStore = useAccountStore()
  const userStore = useUserStore()
  const { accounts, loading: accountsLoading, currentAccountId } = storeToRefs(accountStore)

  const showModal = ref(false)
  const showDeleteConfirm = ref(false)
  const deleteLoading = ref(false)
  const editingAccount = ref<any>(null)
  const accountToDelete = ref<any>(null)
  const showClearStoppedConfirm = ref(false)
  const clearStoppedLoading = ref(false)
  const refreshAllLoading = ref(false)
  const refreshingAccountId = ref('')

  const userIsAdmin = computed(() => userStore.isAdmin)
  const isAccountOpsDisabled = computed(() => !userStore.isAdmin && userStore.isExpired)
  const quotaLimit = computed(() => {
    const limit = userStore.accountLimit
    if (limit === undefined || limit === null)
      return 3
    return limit
  })
  const isOverQuota = computed(() => {
    if (userStore.isAdmin)
      return false
    const limit = quotaLimit.value
    if (limit === -1)
      return false
    return accounts.value.length >= limit
  })
  const isAddAccountDisabled = computed(() => isAccountOpsDisabled.value || isOverQuota.value)
  const addAccountDisabledReason = computed(() => {
    if (isAccountOpsDisabled.value)
      return '账号已到期，无法添加账号'
    if (isOverQuota.value)
      return '已超过配额，无法添加账号'
    return ''
  })

  const stoppedAccounts = computed(() => accounts.value.filter((acc: any) => !acc.running))
  const stoppedAccountsCount = computed(() => stoppedAccounts.value.length)
  const currentAccountName = computed(() => {
    const acc = accounts.value.find((item: any) => item.id === currentAccountId.value)
    return acc ? (acc.name || acc.nick || acc.id) : null
  })

  useIntervalFn(() => {
    accountStore.fetchAccounts()
  }, 3000)

  async function fetchAccounts() {
    await accountStore.fetchAccounts()
  }

  function selectFirstAccountIfNeeded() {
    if (!currentAccountId.value && accounts.value.length > 0 && accounts.value[0]) {
      accountStore.selectAccount(String(accounts.value[0].id))
    }
  }

  function openSettings(account: any) {
    accountStore.selectAccount(account.id)
    router.push('/settings')
  }

  function openAddModal() {
    editingAccount.value = null
    showModal.value = true
  }

  function openEditModal(account: any) {
    editingAccount.value = { ...account }
    showModal.value = true
  }

  function handleDelete(account: any) {
    accountToDelete.value = account
    showDeleteConfirm.value = true
  }

  async function confirmDelete() {
    if (accountToDelete.value) {
      try {
        deleteLoading.value = true
        await accountStore.deleteAccount(accountToDelete.value.id)
        accountToDelete.value = null
        showDeleteConfirm.value = false
      }
      finally {
        deleteLoading.value = false
      }
    }
  }

  async function toggleAccount(account: any) {
    if (account.running) {
      await accountStore.stopAccount(account.id)
    }
    else {
      await accountStore.startAccount(account.id)
    }
  }

  // 上游不再有按账号批量刷新微信 Code 的端点，入口置灰，避免发出必然 404 的请求。
  function handleSaved() {
    accountStore.fetchAccounts()
  }

  function selectAccount(account: any) {
    if (!account || !account.id)
      return
    accountStore.selectAccount(String(account.id))
  }

  /** 批量续期微信授权：后端逐账号刷新 refreshtoken 并写回新 Code。 */
  async function refreshAllCredentials() {
    if (refreshAllLoading.value)
      return
    refreshAllLoading.value = true
    try {
      const { data } = await api.post('/api/accounts/refresh-wx-credentials', undefined, { timeout: 120000 } as any)
      const summary = data?.data || {}
      const success = Number(summary.success) || 0
      const failed = Number(summary.failed) || 0
      if (!data?.ok)
        showAlert(data?.error || `续期失败：成功 ${success} 个，失败 ${failed} 个`, 'danger')
      else
        showAlert(`续期完成：成功 ${success} 个${summary.skipped ? `，跳过 ${summary.skipped} 个无凭证账号` : ''}`, 'primary')
      await accountStore.fetchAccounts()
    }
    catch (error: any) {
      showAlert(error.response?.data?.error || error.message || '续期失败', 'danger')
    }
    finally {
      refreshAllLoading.value = false
    }
  }

  /** 单账号续期。 */
  async function refreshAccountCredential(account: any) {
    const id = String(account?.id || '')
    if (!id || refreshingAccountId.value)
      return
    refreshingAccountId.value = id
    try {
      const { data } = await api.post(`/api/accounts/${id}/refresh-wx-credential`, undefined, { timeout: 60000 } as any)
      if (!data?.ok)
        throw new Error(data?.error || '续期失败')
      showAlert(`账号 ${account.name || id} 微信授权已续期`, 'primary')
      await accountStore.fetchAccounts()
    }
    catch (error: any) {
      showAlert(error.response?.data?.error || error.message || '续期失败', 'danger')
    }
    finally {
      refreshingAccountId.value = ''
    }
  }

  function openClearStoppedConfirm() {
    if (stoppedAccountsCount.value === 0) {
      showAlert('没有已停止的账号需要清理', 'primary')
      return
    }
    showClearStoppedConfirm.value = true
  }

  async function confirmClearStopped() {
    clearStoppedLoading.value = true
    try {
      const stoppedIds = stoppedAccounts.value.map((acc: any) => acc.id)
      let deletedCount = 0
      for (const id of stoppedIds) {
        try {
          await accountStore.deleteAccount(id)
          deletedCount++
        }
        catch (e) {
          console.error(`删除账号 ${id} 失败:`, e)
        }
      }
      showClearStoppedConfirm.value = false
      showAlert(`成功清理 ${deletedCount} 个已停止的账号`, 'primary')
      await accountStore.fetchAccounts()
    }
    finally {
      clearStoppedLoading.value = false
    }
  }

  return {
    accounts,
    accountsLoading,
    currentAccountId,
    currentAccountName,
    userIsAdmin,
    showModal,
    showDeleteConfirm,
    deleteLoading,
    editingAccount,
    accountToDelete,
    showClearStoppedConfirm,
    clearStoppedLoading,
    refreshAllLoading,
    refreshingAccountId,
    stoppedAccountsCount,
    isAddAccountDisabled,
    addAccountDisabledReason,
    isAccountOpsDisabled,
    fetchAccounts,
    selectFirstAccountIfNeeded,
    openSettings,
    openAddModal,
    openEditModal,
    handleDelete,
    confirmDelete,
    toggleAccount,
    handleSaved,
    selectAccount,
    openClearStoppedConfirm,
    confirmClearStopped,
    refreshAllCredentials,
    refreshAccountCredential,
  }
}
