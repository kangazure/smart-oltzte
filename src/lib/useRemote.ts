import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, fetchHealth, getPassword, setPassword, type RemoteOlt, type RemoteOnu, type RemoteSettings, type SavedTemplate } from './api'
import { useLocalStorage } from './useLocalStorage'

export type RemoteStatus = 'checking' | 'off' | 'nopass' | 'nodb' | 'login' | 'ok'

export const DEFAULT_SETTINGS: Required<Pick<RemoteSettings, 'vlans' | 'profiles' | 'types'>> & RemoteSettings = {
  vlans: [450, 444, 500, 200, 300],
  profiles: ['30M', '50M', '100M', '1G'],
  types: ['ALL', 'ZTE-F609', 'F670L'],
  defaultTemplate: null,
}

export function useRemote() {
  const [status, setStatus] = useState<RemoteStatus>('checking')
  const [olts, setOlts] = useState<RemoteOlt[]>([])
  const [activeId, setActiveId] = useLocalStorage<number | null>('olt.active', null)
  const [onus, setOnus] = useState<RemoteOnu[]>([])
  const [loadingOnus, setLoadingOnus] = useState(false)
  const [settings, setSettingsState] = useLocalStorage<typeof DEFAULT_SETTINGS>('olt.settings', DEFAULT_SETTINGS)
  const [saved, setSaved] = useLocalStorage<{ list: SavedTemplate[] }>('olt.saved', { list: [] })
  const [error, setError] = useState('')
  const reqId = useRef(0)

  const handleErr = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      setPassword('')
      setStatus('login')
    }
    setError(e instanceof Error ? e.message : 'Kesalahan tidak dikenal')
    throw e
  }, [])

  const loadOlts = useCallback(async () => {
    try {
      const list = await api.olts()
      setOlts(list)
      setActiveId((cur) => (cur != null && list.some((o) => o.id === cur) ? cur : (list[0]?.id ?? null)))
      return list
    } catch (e) {
      return handleErr(e)
    }
  }, [handleErr, setActiveId])

  const loadOnus = useCallback(
    async (id: number | null) => {
      const mine = ++reqId.current
      if (id == null) {
        setOnus([])
        return
      }
      setLoadingOnus(true)
      try {
        const rows = await api.onus(id)
        if (mine === reqId.current) setOnus(rows)
      } catch (e) {
        handleErr(e)
      } finally {
        if (mine === reqId.current) setLoadingOnus(false)
      }
    },
    [handleErr],
  )

  const loadAll = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([api.settings(), api.templates(), loadOlts()])
      setSettingsState((cur) => ({ ...DEFAULT_SETTINGS, ...cur, ...s }))
      setSaved({ list: t })
    } catch {
      /* status sudah diatur handleErr */
    }
  }, [loadOlts, setSaved, setSettingsState])

  // cek ketersediaan API + login saat start
  useEffect(() => {
    let alive = true
    ;(async () => {
      const h = await fetchHealth()
      if (!alive) return
      if (!h) return setStatus('off')
      if (!h.passwordSet) return setStatus('nopass')
      if (!h.db) return setStatus('nodb')
      if (!h.authed) return setStatus('login')
      setStatus('ok')
      void loadAll()
    })()
    return () => {
      alive = false
    }
  }, [loadAll])

  useEffect(() => {
    if (status === 'ok') void loadOnus(activeId)
  }, [status, activeId, loadOnus])

  const login = async (pw: string): Promise<boolean> => {
    const h = await fetchHealth(pw)
    if (h?.authed) {
      setPassword(pw)
      setStatus('ok')
      setError('')
      void loadAll()
      return true
    }
    return false
  }

  const logout = () => {
    setPassword('')
    setStatus('login')
    setOlts([])
    setOnus([])
  }

  const ok = status === 'ok'

  const saveSettings = async (patch: RemoteSettings) => {
    setSettingsState((cur) => ({ ...cur, ...patch }))
    if (ok) await api.saveSettings(patch).catch(handleErr)
  }

  const saveTemplate = async (t: SavedTemplate) => {
    setSaved((cur) => ({ list: [...cur.list.filter((x) => x.name !== t.name), { ...t, updatedAt: new Date().toISOString() }].sort((a, b) => a.name.localeCompare(b.name)) }))
    if (ok) await api.saveTemplate(t).catch(handleErr)
  }

  const deleteTemplate = async (name: string) => {
    setSaved((cur) => ({ list: cur.list.filter((x) => x.name !== name) }))
    if (settings.defaultTemplate === name) await saveSettings({ defaultTemplate: null })
    if (ok) await api.deleteTemplate(name).catch(handleErr)
  }

  const active = olts.find((o) => o.id === activeId) ?? null

  return {
    status,
    ok,
    hasPassword: !!getPassword(),
    error,
    olts,
    active,
    activeId,
    setActiveId,
    onus,
    loadingOnus,
    reloadOlts: loadOlts,
    reloadOnus: () => loadOnus(activeId),
    settings,
    saveSettings,
    savedTemplates: saved.list,
    saveTemplate,
    deleteTemplate,
    login,
    logout,
  }
}

export type Remote = ReturnType<typeof useRemote>
