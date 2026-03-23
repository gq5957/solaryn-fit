// api/coach.js — Enhanced Claude AI coach with full data context
// Pulls Apple Health, genomic insights, and wearable data from Supabase
// before each response — maximum personalization.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    let systemPrompt = '';

    if (user_id) {
      // Pull full context in one RPC call
      const { data: context } = await supabase.rpc('get_user_ai_context', { p_user_id: user_id });
      if (context) systemPrompt = buildSystemPrompt(context);

      // Rate limit free tier
      const { data: profile } = await supabase
        .from('profiles').select('subscription_tier').eq('id', user_id).single();

      if (profile?.subscription_tier === 'free') {
        const today = new Date().toISOString().split('T')[0];
        const { data: thread } = await supabase.from('ai_threads')
          .select('messages').eq('user_id', user_id).gte('created_at', today).single();
        const msgCount = (thread?.messages || []).filter(m => m.role === 'user').length;
        if (msgCount >= 10) {
          return res.status(429).json({
            content: "You've reached today's 10-message limit on the free plan. Upgrade to App ($19/mo) for unlimited AI coaching."
          });
        }
      }
    }

    if (!systemPrompt) {
      systemPrompt = 'You are a personal fitness coach. Be direct and practical. Under 200 words.';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await response.json();
    return res.status(200).json({ content: data.content?.[0]?.text || 'No response.' });

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
    ? Object.entries(p.schedule).map(([d,t]) => `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]}:${t}`).join(', ')
    : 'not set';

  let prompt = `You are ${p.name || 'this user'}'s personal AI fitness coach inside Solaryn Fit.

PROFILE: Age ${p.age ? Math.round(p.age) : '?'} · Goals: ${(p.goals||[]).join(', ')||'not set'} · Equipment: ${(p.equipment||[]).join(', ')||'none'} · Level: ${p.activity_level||'intermediate'} · Schedule: ${scheduleStr} · Proteins: ${(p.diet_proteins||[]).join(', ')||'not set'} · Supplements: ${(p.supplements||[]).join(', ')||'none'}`;

  if (h) {
    const hrvNote = !h.hrv_ms ? '' : h.hrv_ms >= 70 ? ' [TRAIN HARD]' : h.hrv_ms >= 50 ? ' [TRAIN NORMAL]' : h.hrv_ms >= 35 ? ' [REDUCE INTENSITY]' : ' [RECOVERY DAY]';
    const sleepNote = !h.sleep_hrs ? '' : h.sleep_hrs >= 7.5 ? ' (well-rested)' : h.sleep_hrs >= 6 ? '' : ' (UNDER-SLEPT)';
    prompt += `

LIVE APPLE HEALTH (today):
HRV: ${h.hrv_ms||'—'}ms${hrvNote} · RHR: ${h.resting_hr||'—'}bpm · Sleep: ${h.sleep_hrs||'—'}hrs${sleepNote} (${h.sleep_deep_hrs||0}h deep / ${h.sleep_rem_hrs||0}h REM) · Steps: ${h.steps?.toLocaleString()||'—'} · Weight: ${h.weight_lbs||'—'}lb · VO2Max: ${h.vo2max||'—'}

CRITICAL: Use HRV + sleep to modify today's training intensity. Low HRV or poor sleep = reduce volume/intensity, prioritize recovery.`;
  } else {
    prompt += `\n\nHEALTH DATA: Not synced. Prompt them to connect Apple Health in Data Hub for live personalized recommendations.`;
  }

  if (genomic?.length) {
    prompt += `\n\nGENETIC PROFILE:\n${genomic.map(i => `- ${i.text}`).join('\n')}\nUse genetics when making training and nutrition recommendations.`;
  }

  prompt += `\n\nSTYLE: Direct, specific, data-driven. Reference their actual numbers. Concrete sets/reps/weights. Under 200 words unless asked for a full program. ${lang}`;
  return prompt;
}
