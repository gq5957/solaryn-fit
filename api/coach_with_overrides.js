// api/coach.js — now checks access overrides before rate limiting
// Access overrides bypass Stripe tier checks entirely

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Your email — always gets Elite, no limits, no cost tracking
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'esteban.frias@gmail.com';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { messages, user_id } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'Invalid messages' });

  try {
    // ── RESOLVE EFFECTIVE TIER ─────────────────────────────────
    let effectiveTier = 'free';
    let userEmail = null;

    if (user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, email')
        .eq('id', user_id)
        .single();

      userEmail = profile?.email;
      effectiveTier = profile?.subscription_tier || 'free';

      // Check for owner shortcut
      if (userEmail === OWNER_EMAIL) {
        effectiveTier = 'elite';
      } else {
        // Check access_overrides table
        const { data: override } = await supabase
          .rpc('get_access_override', { p_user_id: user_id, p_email: userEmail });

        if (override?.length) {
          effectiveTier = override[0].tier;
        }
      }
    }

    // ── RATE LIMIT (only applies to actual free tier, no override) ─
    if (effectiveTier === 'free' && user_id) {
      const today = new Date().toISOString().split('T')[0];
      const { data: thread } = await supabase
        .from('ai_threads')
        .select('messages')
        .eq('user_id', user_id)
        .gte('created_at', today)
        .single();

      const msgCount = (thread?.messages || []).filter(m => m.role === 'user').length;
      if (msgCount >= 10) {
        return res.status(429).json({
          content: "You've reached today's 10-message limit. Grab an invite code from Esteban to unlock full access."
        });
      }
    }

    // ── SELECT MODEL BASED ON EFFECTIVE TIER ──────────────────
    const model = effectiveTier === 'elite' || effectiveTier === 'coached'
      ? 'claude-sonnet-4-6'
      : 'claude-haiku-4-5-20251001';

    // ── GET AI CONTEXT ─────────────────────────────────────────
    let systemPrompt = 'You are a personal fitness coach. Be direct and practical.';
    if (user_id) {
      const { data: context } = await supabase
        .rpc('get_user_ai_context', { p_user_id: user_id });
      if (context) systemPrompt = buildSystemPrompt(context);
    }

    // ── CALL CLAUDE ────────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await response.json();
    return res.status(200).json({
      content: data.content?.[0]?.text || 'No response.',
      tier: effectiveTier, // client can show this if useful
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server error' });
  }
}

function buildSystemPrompt(ctx) {
  const p = ctx.profile || {};
  const h = ctx.today_health;
  const genomic = ctx.genomic_insights;
  const lang = p.language === 'es' ? 'Respond in Spanish.' : 'Respond in English.';
  const scheduleStr = p.schedule
    ? Object.entries(p.schedule).map(([d,t]) =>
        `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]}:${t}`).join(', ')
    : 'not set';

  let prompt = `You are ${p.name || 'this user'}'s personal AI fitness coach inside Solaryn Fit.
PROFILE: Age ${p.age ? Math.round(p.age) : '?'} · Goals: ${(p.goals||[]).join(', ')||'not set'} · Equipment: ${(p.equipment||[]).join(', ')||'none'} · Level: ${p.activity_level||'intermediate'} · Schedule: ${scheduleStr} · Proteins: ${(p.diet_proteins||[]).join(', ')||'not set'} · Supplements: ${(p.supplements||[]).join(', ')||'none'}`;

  if (h) {
    const hrvNote = !h.hrv_ms ? '' : h.hrv_ms >= 70 ? ' [TRAIN HARD]' : h.hrv_ms >= 50 ? ' [NORMAL]' : h.hrv_ms >= 35 ? ' [REDUCE INTENSITY]' : ' [RECOVERY DAY]';
    const sleepNote = !h.sleep_hrs ? '' : h.sleep_hrs >= 7.5 ? ' (well-rested)' : h.sleep_hrs >= 6 ? '' : ' (UNDER-SLEPT)';
    prompt += `\nLIVE HEALTH: HRV ${h.hrv_ms||'—'}ms${hrvNote} · RHR ${h.resting_hr||'—'}bpm · Sleep ${h.sleep_hrs||'—'}hrs${sleepNote} · Steps ${h.steps?.toLocaleString()||'—'} · Weight ${h.weight_lbs||'—'}lb`;
    prompt += `\nUSE HRV + SLEEP to modify today's intensity recommendation specifically.`;
  }

  if (genomic?.length) {
    prompt += `\nGENETICS:\n${genomic.map(i => `- ${i.text}`).join('\n')}`;
  }

  prompt += `\nSTYLE: Direct, specific, data-driven. Under 200 words unless asked for a full program. ${lang}`;
  return prompt;
}
