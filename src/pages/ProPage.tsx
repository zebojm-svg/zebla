import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { User } from '../types'

export function ProPage() {
  const { user, firebaseReady } = useAuth()
  const [searchParams] = useSearchParams()
  const [statusUser, setStatusUser] = useState<User | null>(user)
  const [priceCents, setPriceCents] = useState(50)
  const [stripeConfigured, setStripeConfigured] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStatusUser(user)
  }, [user])

  useEffect(() => {
    api.billing
      .status()
      .then((res) => {
        setStatusUser(res.user)
        setPriceCents(res.priceCents)
        setStripeConfigured(res.stripeConfigured)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Fehler'))
  }, [])

  useEffect(() => {
    const sessionId = searchParams.get('session_id')
    if (!sessionId || searchParams.get('success') !== '1') return
    setBusy(true)
    api.billing
      .confirm(sessionId)
      .then((res) => {
        setStatusUser(res.user)
        setMessage('Pro ist aktiv. Du kannst KI wieder nutzen.')
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen'))
      .finally(() => setBusy(false))
  }, [searchParams])

  const startCheckout = async () => {
    setError('')
    setBusy(true)
    try {
      const origin = window.location.origin
      const { url } = await api.billing.checkout(
        `${origin}/pro?success=1&session_id={CHECKOUT_SESSION_ID}`,
        `${origin}/pro?canceled=1`,
      )
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout fehlgeschlagen')
      setBusy(false)
    }
  }

  const devUnlock = async () => {
    setError('')
    setBusy(true)
    try {
      const { user: updated } = await api.billing.devUnlock()
      setStatusUser(updated)
      setMessage('Pro manuell freigeschaltet (Test).')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Freischaltung fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseReady || !user) {
    return (
      <div className="page-center">
        <p className="muted">Bitte anmelden.</p>
      </div>
    )
  }

  const priceLabel = (priceCents / 100).toFixed(2)

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Zebla Pro</h1>
          <p className="muted">
            Lehrkräfte nutzen KI erst mit Abo. Schüler arbeiten über Klassenkontingente.
          </p>
        </div>
        <Link to="/" className="btn btn-secondary">
          Zur Bibliothek
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      {searchParams.get('canceled') === '1' && (
        <div className="alert alert-warn">Checkout abgebrochen.</div>
      )}

      <section className="panel" style={{ padding: '1.25rem' }}>
        <p>
          Status:{' '}
          <strong>
            {statusUser?.proActive
              ? 'Pro aktiv'
              : statusUser?.role === 'master'
                ? 'Master'
                : 'ohne Pro'}
          </strong>
        </p>
        {statusUser?.quota && (
          <p className="muted">
            Restkontingent: {statusUser.quota.aiCalls} KI · {statusUser.quota.dialogCreates}{' '}
            Dialoge · {statusUser.quota.slideshowPreps} Diashow — Details unten.
          </p>
        )}

        {statusUser?.role === 'teacher' && !statusUser.proActive && (
          <>
            <p>
              Testpreis: <strong>CHF {priceLabel}</strong> / Monat (später echter Preis).
            </p>
            {stripeConfigured ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={startCheckout}
              >
                {busy ? 'Weiter …' : 'Pro testweise abonnieren'}
              </button>
            ) : (
              <p className="muted">
                Stripe ist noch nicht konfiguriert (`STRIPE_SECRET_KEY`). Als Master kannst du
                unten freischalten.
              </p>
            )}
          </>
        )}

        {(statusUser?.role === 'master' || statusUser?.proActive) && (
          <p className="muted">Du hast bereits vollen Zugriff.</p>
        )}

        {statusUser?.role === 'master' && (
          <p style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={devUnlock}>
              Pro für diesen Account freischalten (Master-Test)
            </button>
          </p>
        )}
      </section>

      <section className="panel pro-find-block" style={{ padding: '1.25rem' }}>
        <h2>Dein Zebla-Kontingent diesen Monat</h2>
        {statusUser?.quota ? (
          <ul className="pro-quota-list">
            <li>
              KI-Aufrufe übrig: <strong>{statusUser.quota.aiCalls}</strong>
            </li>
            <li>
              Dialoge übrig: <strong>{statusUser.quota.dialogCreates}</strong>
            </li>
            <li>
              Diashow-Vorbereitungen übrig: <strong>{statusUser.quota.slideshowPreps}</strong>
            </li>
          </ul>
        ) : (
          <p className="muted">Kontingent erscheint nach dem Laden.</p>
        )}
        <p className="muted">
          Das zählt, was in Zebla selbst gemacht wird (Texte, Stimmen, …).
        </p>

        <h2>Standbilder (FLUX)</h2>
        <p>
          Die Standbilder (FLUX) laufen über Replicate — Guthaben dort anschauen.
        </p>
        <p className="pro-find-links">
          <a href="https://replicate.com/account/billing" target="_blank" rel="noreferrer">
            Replicate-Guthaben
          </a>
          <a href="https://replicate.com" target="_blank" rel="noreferrer">
            Replicate-Übersicht
          </a>
        </p>

        <h2>Neue Version live: Vercel, Projekt Zebla</h2>
        <p>
          Wenn etwas Neues in Zebla erscheint, steht das bei Vercel. Unter «Deployments» siehst
          du, wann es live ging.
        </p>
        <p className="pro-find-links">
          <a href="https://vercel.com/zebojm-svgs-projects/zebla" target="_blank" rel="noreferrer">
            Vercel · Projekt Zebla
          </a>
        </p>
      </section>
    </div>
  )
}
