// api/stripe-webhook.js — Handle Stripe subscription events
// Set webhook URL in Stripe dashboard: https://your-domain.vercel.app/api/stripe-webhook

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Use service key (not anon) for webhooks
);

const TIER_MAP = {
  [process.env.STRIPE_APP_PRICE_ID]:     'app',
  [process.env.STRIPE_COACHED_PRICE_ID]: 'coached',
  [process.env.STRIPE_ELITE_PRICE_ID]:   'elite',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log event
  await supabase.from('stripe_events').insert({
    stripe_id: event.id,
    type: event.type,
    data: event.data,
  });

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const priceId = sub.items.data[0]?.price?.id;
      const tier = TIER_MAP[priceId] || 'app';
      const customerId = sub.customer;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (profile) {
        await supabase.from('profiles').update({
          subscription_tier: tier,
          subscription_status: sub.status,
          stripe_subscription_id: sub.id,
        }).eq('id', profile.id);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('stripe_subscription_id', sub.id)
        .single();

      if (profile) {
        await supabase.from('profiles').update({
          subscription_tier: 'free',
          subscription_status: 'cancelled',
        }).eq('id', profile.id);
      }
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const customerId = session.customer;

      if (userId) {
        await supabase.from('profiles').update({
          stripe_customer_id: customerId,
        }).eq('id', userId);
      }
      break;
    }
  }

  res.status(200).json({ received: true });
}

export const config = { api: { bodyParser: false } };
