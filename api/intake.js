// api/intake.js — AI intake conversation + health file processing
// CommonJS, uses raw fetch (no @anthropic-ai/sdk needed)

const { createClient } = require('@supabase/supabase-js');

const INTAKE_SYSTEM_PROMPT = `You are conducting a health intake conversation for Solaryn Fit, an AI health coaching platform. Your job is to deeply understand this person — not just their logistics, but their story.

You believe in the Iceberg Theory: the visible symptoms (weight gain, low energy, plateaus, inconsistency) are always downstream of systemic patterns running beneath the surface. Your job is to find those patterns.

CONVERSATION APPROACH:
- Ask one focused question at a time. Never stack multiple questions.
- Listen for what's underneath the surface answer. If someone says "I just can't stay consistent," that's not the real answer — dig into why.
- Be warm, direct, and non-judgmental. This should feel safe enough to be honest.
- Pay attention to what they DON'T say. Avoidance is data.
- When alcohol, stress, or emotional patterns come up, don't skip past them. These are often the actual iceberg.

TOPICS TO COVER (weave naturally, don't checklist):
1. What specifically isn't working right now — and how long it's been this way
2. What they've tried before — and the honest reason it didn't stick
3. Their daily life: sleep quality, stress load, work demands, travel, alcohol habits
4. Their relationship with their own body and fitness — any shame, frustration, or emotional charge
5. What success actually looks like to them — not the goal, but the feeling

CONVERSATION PHASES:
- Opening: Start with "Tell me what's not working." Let them go first.
- Middle: Follow their lead, dig one level deeper on each answer
- Closing: When you have a full picture (usually 6-10 exchanges), summarize what you have heard and ask if it feels accurate. Then say you are saving this as their coaching baseline.

ENDING THE CONVERSATION:
When ready to close, output EXACTLY this JSON on its own line (no markdown, no backticks):
{"intake_complete": true, "summary": "...comprehensive narrative summary..."}

The summary should be 200-400 words, third person, covering:
- What they are dealing with right now
- History and what they have tried
- Key lifestyle factors (sleep, stress, alcohol, work)
- Emotional relationship with fitness
- What success looks like for them
- Key iceberg patterns you identified

Only output the JSON when you genuinely have enough to build a useful coaching baseline.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, messages, user_id, file_data, file_type, file_name, language } = req.body || {};
  const lang = language || 'en';
  const isSpanish = lang === 'es';

  const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

  // ── ACTION: process uploaded health file ───────────────────
  if (action === 'process_file') {
    if (!user_id || !file_data) return res.status(400).json({ error: 'Missing user_id or file_data' });

    try {
      let userContent;

      if (file_type === 'application/pdf' || (file_type && file_type.includes('pdf'))) {
        userContent = [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: file_data }
          },
          {
            type: 'text',
            text: 'This is a health document uploaded by a user (filename: ' + file_name + ').\n\nPlease analyze it and extract a structured health summary including:\n- Document type (blood panel, genetic report, hormone panel, metabolic panel, etc.)\n- Key biomarkers and their values/status (normal/low/high)\n- Any flagged abnormalities or items of note\n- Relevant fitness and recovery implications\n- Genetic variants if present (ACTN3, PPARGC1A, APOE, MTHFR, etc.) and their fitness/health implications\n- Recommendations the AI coach should be aware of\n\nFormat as a clear, structured summary for ongoing coaching context.'
          }
        ];
      } else {
        const decoded = Buffer.from(file_data, 'base64').toString('utf-8');
        const preview = decoded.substring(0, 8000);
        userContent = 'This is health data uploaded by a user (filename: ' + file_name + '):\n\n' + preview + '\n\nPlease analyze this data and extract a structured health summary including:\n- Data type and source (23andMe, AncestryDNA, Oura, Garmin, etc.)\n- Key health-relevant genetic variants if present and their implications\n- Any fitness, recovery, or nutrition relevant patterns\n- Biomarkers or metrics if present\n- What the AI coach should know about this person based on this data\n\nFormat as a clear, structured summary for coaching use.';
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1500,
          messages: [{ role: 'user', content: userContent }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Claude file processing error:', response.status, errText);
        return res.status(500).json({ error: 'File processing failed' });
      }

      const data = await response.json();
      const summary = (data.content && data.content[0] && data.content[0].text) || 'Could not process file.';

      if (supabase) {
        await supabase.from('genomic_insights').upsert({
          user_id,
          file_name,
          file_type,
          summary,
          processed_at: new Date().toISOString(),
          raw_available: true
        }, { onConflict: 'user_id,file_name' });
      }

      return res.status(200).json({ success: true, summary });

    } catch (err) {
      console.error('File processing error:', err);
      return res.status(500).json({ error: 'Failed to process file', detail: err.message });
    }
  }

  // ── ACTION: intake conversation turn ───────────────────────
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing messages' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: isSpanish
          ? INTAKE_SYSTEM_PROMPT + '\n\nIDIOMA CRÍTICO: Responde SIEMPRE en español latinoamericano. Usa tú (informal). Sé cálido, directo y conversacional. Mantén la terminología de fitness precisa pero accesible.'
          : INTAKE_SYSTEM_PROMPT,
        messages: messages.map(function(m) { return { role: m.role, content: m.content }; }),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude intake error:', response.status, errText);
      return res.status(500).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const reply = (data.content && data.content[0] && data.content[0].text) || 'Something went wrong.';

    // Check if intake is complete
    const jsonMatch = reply.match(/\{"intake_complete":\s*true[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intake_complete && parsed.summary && supabase && user_id) {
          await supabase.from('profiles').update({
            intake_narrative: parsed.summary,
            intake_completed_at: new Date().toISOString(),
            onboarded: true
          }).eq('id', user_id);

          const completionMsg = isSpanish
              ? "Ya tengo una imagen clara de dónde estás y con qué estás trabajando. Guardé esto como tu base de coaching — cada conversación que tengamos a partir de aquí se construirá sobre este contexto.\n\n¡Entremos a la app."
              : "I've got a clear picture of where you are and what you're working with. I've saved this as your coaching baseline — every conversation we have from here will build on this context.\n\nLet's get you into the app.";
          return res.status(200).json({
            reply: completionMsg,
            intake_complete: true,
            summary: parsed.summary
          });
        }
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr);
      }
    }

    return res.status(200).json({ reply, intake_complete: false });

  } catch (err) {
    console.error('Intake conversation error:', err);
    return res.status(500).json({ error: 'Conversation failed', detail: err.message });
  }
};
