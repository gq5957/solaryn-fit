// api/coach.js — Solaryn Fit AI Coach
// CommonJS for Vercel serverless compatibility

const { createClient } = require('@supabase/supabase-js');

const OWNER_EMAIL = process.env.OWNER_EMAIL || 'esteban.frias@gmail.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, user_id } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  try {
    let effectiveTier = 'free';
    let systemPrompt = buildDefaultPrompt();

    // ── RESOLVE TIER + CONTEXT ─────────────────────────────────
    if (user_id && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier, email')
        .eq('id', user_id)
        .single();

      const userEmail = profile?.email;
      effectiveTier = profile?.subscription_tier || 'free';

      // Owner shortcut
      if (userEmail === OWNER_EMAIL) {
        effectiveTier = 'elite';
      } else {
        // Check access overrides
        const { data: override } = await supabase
          .rpc('get_access_override', { p_user_id: user_id, p_email: userEmail });
        if (override && override.length > 0) {
          effectiveTier = override[0].tier;
        }
      }

      // Rate limit free tier
      if (effectiveTier === 'free') {
        const today = new Date().toISOString().split('T')[0];
        const { data: thread } = await supabase
          .from('ai_threads')
          .select('messages')
          .eq('user_id', user_id)
          .gte('created_at', today)
          .maybeSingle();

        const msgCount = ((thread?.messages) || []).filter(m => m.role === 'user').length;
        if (msgCount >= 10) {
          return res.status(200).json({
            content: "You've reached today's 10-message limit on the free plan. Enter an invite code in Settings to unlock full access."
          });
        }
      }

      // Get full AI context
      const { data: context } = await supabase
        .rpc('get_user_ai_context', { p_user_id: user_id });
      if (context) systemPrompt = buildSystemPrompt(context, effectiveTier);
    }

    // ── SELECT MODEL ───────────────────────────────────────────
    const model =
      effectiveTier === 'elite'   ? 'claude-opus-4-6' :
      effectiveTier === 'coached' ? 'claude-sonnet-4-6' :
      'claude-haiku-4-5-20251001';

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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      return res.status(500).json({ error: 'AI service error', details: errText });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || 'No response.';
    return res.status(200).json({ content, tier: effectiveTier });

  } catch (error) {
    console.error('Coach handler error:', error);
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
};

// ── DEFAULT PROMPT (no user context) ──────────────────────────
function buildDefaultPrompt() {
  return `You are a personal AI fitness coach inside Solaryn Fit. 
Be direct, specific, and practical. Focus on strength, mobility, recovery, and performance.
Keep responses under 200 words unless asked for a full program.`;
}

// ── FULL PROMPT (with user context from Supabase) ─────────────
function buildSystemPrompt(ctx, tier) {
  const p = ctx.profile || {};
  const h = ctx.today_health;
  const today = ctx.today || {};
  const genomic = ctx.genomic_insights;
  const lang = p.language === 'es' ? 'Respond in Spanish.' : 'Respond in English.';

  const scheduleStr = p.schedule
    ? Object.entries(p.schedule)
        .map(([d, t]) => `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]}:${typeof t === 'object' ? t.type : t}`)
        .join(', ')
    : 'not set';

  // Today's scheduled workout type (so the AI anchors on the right day)
  let todayType = 'unknown';
  if (today.weekday && p.schedule) {
    const dayIdx = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(today.weekday);
    if (dayIdx >= 0 && p.schedule[dayIdx]) {
      todayType = typeof p.schedule[dayIdx] === 'object' ? p.schedule[dayIdx].type : p.schedule[dayIdx];
    }
  }

  let prompt = `You are ${p.name || 'this user'}'s personal AI fitness coach inside Solaryn Fit.

TODAY:
- Date: ${today.date || 'unknown'}
- Day of week: ${today.weekday || 'unknown'}
- Timezone: ${today.timezone || 'unknown'}
- Scheduled training type: ${todayType}

IMPORTANT: Use "today" to mean ${today.weekday || 'the current day'}. Do not guess the weekday from context — the date above is authoritative.

PROFILE:
- Age: ${p.age ? Math.round(p.age) : 'unknown'}
- Goals: ${(p.goals || []).join(', ') || 'not set'}
- Equipment: ${(p.equipment || []).join(', ') || 'not set'}
- Level: ${p.activity_level || 'intermediate'}
- Schedule: ${scheduleStr}
- Proteins: ${(p.diet_proteins || []).join(', ') || 'not set'}
- Supplements: ${(p.supplements || []).join(', ') || 'none'}`;

  if (h) {
    const hrvNote = !h.hrv_ms ? '' :
      h.hrv_ms >= 70 ? ' [HIGH — train hard]' :
      h.hrv_ms >= 50 ? ' [NORMAL]' :
      h.hrv_ms >= 35 ? ' [LOW — reduce intensity]' :
      ' [VERY LOW — recovery day]';
    const sleepNote = !h.sleep_hrs ? '' :
      h.sleep_hrs >= 7.5 ? ' (well-rested)' :
      h.sleep_hrs >= 6 ? '' : ' (under-slept)';

    prompt += `

LIVE HEALTH DATA (Apple Health, today):
- HRV: ${h.hrv_ms || '—'}ms${hrvNote}
- Resting HR: ${h.resting_hr || '—'}bpm
- Sleep: ${h.sleep_hrs || '—'}hrs${sleepNote} (${h.sleep_deep_hrs || 0}h deep / ${h.sleep_rem_hrs || 0}h REM)
- Steps: ${h.steps ? h.steps.toLocaleString() : '—'}
- Weight: ${h.weight_lbs || '—'}lbs
- VO2 Max: ${h.vo2max || '—'}

IMPORTANT: Use HRV and sleep data to personalize today's training recommendation. Low HRV or poor sleep = reduce intensity and volume.`;
  } else {
    prompt += `\n\nHEALTH DATA: Not yet synced from Apple Health. Encourage the user to connect it in the Data Hub tab.`;
  }

  if (genomic && genomic.length > 0) {
    prompt += `\n\nGENETIC PROFILE:\n${genomic.map(i => `- ${i.text}`).join('\n')}\n\nUse genetic data when relevant to training and nutrition recommendations.`;
  }

  prompt += `\n\nCOACHING STYLE:
- Direct and specific — no generic advice
- Reference their actual numbers when available
- Concrete sets/reps/weights/timing when programming
- Under 200 words unless they ask for a full program
- ${lang}`;

  return prompt;
}
