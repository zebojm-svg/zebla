import type { CostEstimate } from '../lib/costEstimates'

interface CostConfirmDialogProps {
  estimate: CostEstimate
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function CostConfirmDialog({
  estimate,
  busy,
  onConfirm,
  onCancel,
}: CostConfirmDialogProps) {
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
        {estimate.note && <p className="cost-dialog-note muted">{estimate.note}</p>}
        <div className="cost-dialog-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? 'Bitte warten …' : 'Fortfahren'}
          </button>
        </div>
      </div>
    </div>
  )
}
