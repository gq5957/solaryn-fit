// api/intake.js — AI-driven intake conversation + file processing
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const INTAKE_SYSTEM_PROMPT = `You are conducting a health intake conversation for Solaryn Fit, an AI health coaching platform. Your job is to deeply understand this person — not just their logistics, but their story.

You believe in the Iceberg Theory: the visible symptoms (weight gain, low energy, plateaus, inconsistency) are always downstream of systemic patterns running beneath the surface. Your job is to find those patterns.

CONVERSATION APPROACH:
- Ask one focused question at a time. Never stack multiple questions.
- Listen for what's underneath the surface answer. If someone says "I just can't stay consistent," that's not the real answer — dig into why.
- Be warm, direct, and non-judgmental. This isn't a therapy session but it should feel safe enough to be honest.
- Pay attention to what they DON'T say. Avoidance is data.
- When alcohol, stress, or emotional patterns come up, don't skip past them. These are often the actual iceberg.

TOPICS TO COVER (weave naturally, don't checklist):
1. What specifically isn't working right now — and how long has it been this way
2. What they've tried before — and the honest reason it didn't stick
3. Their daily life: sleep quality, stress load, work demands, travel, alcohol habits
4. Their relationship with their own body and fitness — any shame, frustration, or emotional charge
5. What success actually looks like to them — not the goal, but the feeling

CONVERSATION PHASES:
- Opening: Start with "Tell me what's not working." Let them go first.
- Middle: Follow their lead, dig one level deeper on each answer
- Closing: When you feel you have a full picture (usually 6-10 exchanges), summarize what you've heard and ask if it feels accurate. Then say you're going to save this as their coaching baseline.

ENDING THE CONVERSATION:
When ready to close, output EXACTLY this JSON on its own line (no markdown, no backticks):
{"intake_complete": true, "summary": "...comprehensive narrative summary of everything learned..."}

The summary should be 200-400 words, written in third person, structured as:
- What they're dealing with right now
- Their history and what they've tried  
- Key lifestyle factors (sleep, stress, alcohol, work)
- Their emotional relationship with fitness
- What success looks like for them
- Key patterns or iceberg factors you identified

IMPORTANT: Only output the JSON when you genuinely have enough to build a useful coaching baseline. Don't rush it.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, messages, user_id, file_data, file_type, file_name } = req.body;

  // ── ACTION: process uploaded file ──────────────────────────
  if (action === 'process_file') {
    if (!user_id || !file_data) return res.status(400).json({ error: 'Missing user_id or file_data' });

    try {
      let prompt = '';
      let contentBlocks = [];

      if (file_type === 'application/pdf' || file_type?.includes('pdf')) {
        // PDF: send as document
        contentBlocks = [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: file_data }
          },
          {
            type: 'text',
            text: `This is a health document uploaded by a user (filename: ${file_name}). 
            
Please analyze it and extract a structured health summary including:
- Document type (blood panel, genetic report, hormone panel, metabolic panel, etc.)
- Key biomarkers and their values/status (normal/low/high)
- Any flagged abnormalities or items of note
- Relevant fitness and recovery implications based on the data
- Genetic variants if present (e.g. ACTN3, PPARGC1A, APOE, MTHFR, etc.) and their fitness/health implications
- Recommendations or patterns the AI coach should be aware of

Format as a clear, structured summary that can be used as ongoing coaching context. Be specific with numbers and values where present.`
          }
        ];
      } else {
        // Text-based (genetic raw data, CSV exports, etc.)
        const decoded = Buffer.from(file_data, 'base64').toString('utf-8');
        const preview = decoded.substring(0, 8000); // limit context
        contentBlocks = [
          {
            type: 'text',
            text: `This is health data uploaded by a user (filename: ${file_name}):

${preview}

Please analyze this data and extract a structured health summary including:
- Data type and source (23andMe, AncestryDNA, Oura export, Garmin, etc.)
- Key health-relevant genetic variants if present (ACTN3, PPARGC1A, APOE, MTHFR, BDNF, etc.) and their implications
- Any fitness, recovery, or nutrition relevant patterns
- Biomarkers or metrics if present
- What the AI coach should know about this person based on this data

Format as a clear, structured summary for coaching use.`
          }
        ];
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: contentBlocks }]
      });

      const summary = response.content[0].text;

      // Store summary in genomic_insights
      const { error: dbError } = await supabase
        .from('genomic_insights')
        .upsert({
          user_id,
          file_name,
          file_type,
          summary,
          processed_at: new Date().toISOString(),
          raw_available: true
        }, { onConflict: 'user_id,file_name' });

      if (dbError) console.error('DB error storing file summary:', dbError);

      return res.status(200).json({ success: true, summary });

    } catch (err) {
      console.error('File processing error:', err);
      return res.status(500).json({ error: 'Failed to process file', detail: err.message });
    }
  }

  // ── ACTION: intake conversation turn ───────────────────────
  if (!user_id || !messages) return res.status(400).json({ error: 'Missing user_id or messages' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: INTAKE_SYSTEM_PROMPT,
      messages
    });

    const reply = response.content[0].text;

    // Check if intake is complete
    const jsonMatch = reply.match(/\{"intake_complete":\s*true[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.intake_complete && parsed.summary) {
          // Save narrative to profiles
          await supabase
            .from('profiles')
            .update({
              intake_narrative: parsed.summary,
              intake_completed_at: new Date().toISOString(),
              onboarded: true
            })
            .eq('id', user_id);

          return res.status(200).json({
            reply: "I've got a clear picture of where you are and what you're working with. I've saved this as your coaching baseline — every conversation we have from here will build on this context.\n\nLet's get you set up with the rest of your profile, then you can head into the app.",
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
