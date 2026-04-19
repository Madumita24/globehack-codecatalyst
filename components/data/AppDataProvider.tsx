'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getMockAppData } from '@/lib/data/mock-app-data'
import type { AppData } from '@/types/app-data'

type AppDataContextValue = {
  data: AppData
  loading: boolean
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

export default function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => getMockAppData())
  const [loading, setLoading] = useState(true)

  const reloadData = useCallback(async (cancelled?: () => boolean) => {
    try {
      const response = await fetch('/api/app-data', { cache: 'no-store' })
      if (!response.ok) throw new Error('App data request failed')
      const nextData = await response.json() as AppData
      if (!cancelled?.()) setData(nextData)
    } catch (error) {
      console.error('[AppDataProvider]', error)
    } finally {
      if (!cancelled?.()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void reloadData(() => cancelled)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [reloadData])

  useEffect(() => {
    let cancelled = false

    async function syncGmailReplies() {
      if (document.visibilityState === 'hidden') return
      try {
        const response = await fetch('/api/gmail/sync', {
          method: 'POST',
          cache: 'no-store',
        })
        if (!response.ok) return

        const result = await response.json() as {
          skipped?: boolean
          processed?: number
          createdActions?: number
          updatedLeads?: number
        }

        if (
          !cancelled &&
          !result.skipped &&
          ((result.processed ?? 0) > 0 ||
            (result.createdActions ?? 0) > 0 ||
            (result.updatedLeads ?? 0) > 0)
        ) {
          await reloadData(() => cancelled)
        }
      } catch (error) {
        console.error('[GmailSyncPoll]', error)
      }
    }

    const timer = window.setInterval(syncGmailReplies, 60_000)
    window.setTimeout(syncGmailReplies, 5_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [reloadData])

  const value = useMemo(() => ({ data, loading }), [data, loading])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const context = useContext(AppDataContext)
  if (!context) {
    throw new Error('useAppData must be used inside AppDataProvider')
  }
  return context
}
