import { useCallback, useState } from 'react'
import type { CostEstimate } from '../lib/costEstimates'

export function useCostConfirm() {
  const [pending, setPending] = useState<{
    estimate: CostEstimate
    resolve: (ok: boolean) => void
  } | null>(null)

  const confirm = useCallback((estimate: CostEstimate) => {
    return new Promise<boolean>((resolve) => {
      setPending({ estimate, resolve })
    })
  }, [])

  const close = useCallback((ok: boolean) => {
    setPending((p) => {
      if (p) p.resolve(ok)
      return null
    })
  }, [])

  return { pending, confirm, close }
}
