import { useEffect, useState } from 'react'
import { api, type AiPoints } from '../api/client'
import type { CostEstimate } from '../lib/costEstimates'

interface CostConfirmDialogProps {
  estimate: CostEstimate
  onConfirm: () => void
  onCancel: () => void
}

export function CostConfirmDialog({
  estimate,
  onConfirm,
  onCancel,
}: CostConfirmDialogProps) {
  const [points, setPoints] = useState<AiPoints | null>(null)

  useEffect(() => {
    let alive = true
    api
      .aiPoints()
      .then((p) => {
        if (alive) setPoints(p)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const blocked = points ? !points.allowed : false

  return (
    <div className="cost-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="cost-dialog panel"
        role="dialog"
        aria-labelledby="cost-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="cost-dialog-title">{estimate.title}</h3>
        <p className="muted">{estimate.description}</p>
        <ul className="cost-dialog-items">
          {estimate.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <strong>{item.amount}</strong>
            </li>
          ))}
        </ul>
        <p className="cost-dialog-total">
          <span>Gesamt (geschätzt)</span>
          <strong>{estimate.totalHint}</strong>
        </p>
        {points && !blocked && (
          <p className="cost-dialog-note muted">
            {points.unlimited ? 'KI-Punkte: unbegrenzt' : `Du hast noch ${points.balance ?? 0} KI-Punkte.`}
          </p>
        )}
        {blocked && points?.message && <p className="cost-dialog-note">{points.message}</p>}
        {estimate.note && <p className="cost-dialog-note muted">{estimate.note}</p>}
        <div className="cost-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={blocked}>
            Fortfahren
          </button>
        </div>
      </div>
    </div>
  )
}
