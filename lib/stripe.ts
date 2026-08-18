import Stripe from 'stripe'
import { HttpError } from './api-utils.js'
import { setUserSubscription } from './firestore.js'

/** Testpreis in Rappen (CHF). Stripe CHF-Mindestbetrag oft ~0.50 – für Tests 50 Rappen. */
export const PRO_PRICE_CENTS = Number(process.env.STRIPE_PRO_PRICE_CENTS ?? '50')

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new HttpError('Stripe ist nicht konfiguriert.', 503)
  return new Stripe(key)
}

export async function createProCheckoutSession(opts: {
  uid: string
  email?: string
  successUrl: string
  cancelUrl: string
}): Promise<{ url: string }> {
  const client = stripe()
  const priceId = process.env.STRIPE_PRICE_ID

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]
  if (priceId) {
    lineItems = [{ price: priceId, quantity: 1 }]
  } else {
    // Ad-hoc Preis zum Testen (z. B. 0.50 CHF / Monat)
    lineItems = [
      {
        quantity: 1,
        price_data: {
          currency: 'chf',
          unit_amount: Math.max(PRO_PRICE_CENTS, 50),
          recurring: { interval: 'month' },
          product_data: {
            name: 'Zebla Pro (Test)',
            description: 'KI für Lehrkräfte – Testabo',
          },
        },
      },
    ]
  }

  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer_email: opts.email,
    client_reference_id: opts.uid,
    metadata: { uid: opts.uid },
    line_items: lineItems,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: true,
  })

  if (!session.url) throw new HttpError('Checkout-URL fehlt.', 500)
  return { url: session.url }
}

/** Dev/Master: Pro ohne Stripe freischalten. */
export async function unlockProManually(uid: string): Promise<void> {
  await setUserSubscription(uid, { subscriptionStatus: 'active' })
}

export async function handleStripeWebhook(
  rawBody: Buffer | string,
  signature: string | undefined,
): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new HttpError('Webhook-Secret fehlt.', 503)
  if (!signature) throw new HttpError('Stripe-Signatur fehlt.', 400)

  const client = stripe()
  const event = client.webhooks.constructEvent(rawBody, signature, secret)

  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'customer.subscription.updated'
  ) {
    const obj = event.data.object as {
      client_reference_id?: string | null
      metadata?: { uid?: string }
      customer?: string | null
      subscription?: string | null
      status?: string
    }
    const uid = obj.client_reference_id || obj.metadata?.uid
    if (!uid) return

    const status =
      obj.status === 'active' || event.type === 'checkout.session.completed'
        ? 'active'
        : obj.status === 'past_due'
          ? 'past_due'
          : 'canceled'

    await setUserSubscription(uid, {
      subscriptionStatus: status === 'canceled' ? 'canceled' : status,
      stripeCustomerId: typeof obj.customer === 'string' ? obj.customer : undefined,
      stripeSubscriptionId:
        typeof obj.subscription === 'string' ? obj.subscription : undefined,
    })
    return
  }

  if (event.type === 'customer.subscription.deleted') {
    const obj = event.data.object as {
      metadata?: { uid?: string }
      customer?: string
    }
    // Fallback: per Customer suchen
    let uid = obj.metadata?.uid
    if (!uid && obj.customer) {
      const snap = await (
        await import('./firebase-admin.js')
      )
        .adminDb()
        .collection('users')
        .where('stripeCustomerId', '==', obj.customer)
        .limit(1)
        .get()
      uid = snap.docs[0]?.id
    }
    if (uid) {
      await setUserSubscription(uid, {
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
      })
    }
  }
}

export async function confirmCheckoutSession(sessionId: string, uid: string): Promise<void> {
  const client = stripe()
  const session = await client.checkout.sessions.retrieve(sessionId)
  if (session.client_reference_id !== uid && session.metadata?.uid !== uid) {
    throw new HttpError('Sitzung gehört nicht zu diesem Nutzer.', 403)
  }
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw new HttpError('Zahlung noch nicht abgeschlossen.', 400)
  }
  await setUserSubscription(uid, {
    subscriptionStatus: 'active',
    stripeCustomerId:
      typeof session.customer === 'string' ? session.customer : undefined,
    stripeSubscriptionId:
      typeof session.subscription === 'string' ? session.subscription : undefined,
  })
}
