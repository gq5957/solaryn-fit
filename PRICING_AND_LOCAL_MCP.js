// ══════════════════════════════════════════════════════════════
// SOLARYN FIT — PRICING STRATEGY + API COST MODEL
// + LOCAL MCP SERVER ARCHITECTURE
// ══════════════════════════════════════════════════════════════

/*
IMPORTANT NOTE ON OPENCLAW:
As of early 2026, Anthropic's ToS prohibits routing Claude API calls
through OpenClaw. Users have had API keys banned for doing so.
The architecture below uses Ollama directly via MCP — no OpenClaw 
in the Claude API path. OpenClaw can be used for personal assistant
tasks on your home network, but NOT as a proxy for client API calls.
*/

// ══════════════════════════════════════════════════════════════
// SECTION 1: API COST MODEL
// Based on actual Claude API pricing (March 2026)
// ══════════════════════════════════════════════════════════════

/*
CLAUDE API PRICING (current):
  Haiku 4.5:  $1.00 input  / $5.00 output  per 1M tokens
  Sonnet 4.6: $3.00 input  / $15.00 output per 1M tokens
  Opus 4.6:   $5.00 input  / $25.00 output per 1M tokens
  
DISCOUNTS:
  Prompt caching (cache hits): 0.1x base = 90% off input
  Batch API: 50% off both input and output

TOKEN ESTIMATES PER INTERACTION:
  System prompt (profile + health data): ~800 tokens input
  User message (avg): ~50 tokens input
  Assistant response (avg): ~200 tokens output
  Conversation history (per turn): ~250 tokens accumulated

  Total per AI coach interaction: ~1,100 tokens input, ~200 tokens output
  
  With prompt caching (system prompt cached):
  - Cache write (first call): 800 × $3/1M = $0.0024
  - Cache hit (all subsequent): 800 × $0.30/1M = $0.00024
  - User message: 50 × $3/1M = $0.00015
  - Output: 200 × $15/1M = $0.003
  
  EFFECTIVE COST PER CACHED INTERACTION: ~$0.0034 (~0.34 cents)
  COST PER INTERACTION (no cache): ~$0.0057 (~0.57 cents)
*/

const PRICING = {
  // API costs per interaction (with prompt caching active)
  claudeHaiku:  { input: 1.00, output: 5.00,  cacheRead: 0.10,  cacheWrite: 1.25 },
  claudeSonnet: { input: 3.00, output: 15.00, cacheRead: 0.30,  cacheWrite: 3.75 },
  claudeOpus:   { input: 5.00, output: 25.00, cacheRead: 0.50,  cacheWrite: 6.25 },
};

// Per-interaction costs (tokens: 800 system cached, 50 user, 200 output)
const COST_PER_INTERACTION = {
  sonnetCached:  (800 * 0.30 + 50 * 3.00 + 200 * 15.00) / 1_000_000, // $0.0034
  sonnetUncached:(800 * 3.00 + 50 * 3.00 + 200 * 15.00) / 1_000_000, // $0.0057
  haikuCached:   (800 * 0.10 + 50 * 1.00 + 200 * 5.00)  / 1_000_000, // $0.0011
  haikuUncached: (800 * 1.00 + 50 * 1.00 + 200 * 5.00)  / 1_000_000, // $0.0019
  ollama:        0, // zero per-interaction cost (just electricity ~$0.002/hr)
};

// Monthly cost projections by scenario
function monthlyAPICost(users, msgsPerUserPerDay, model, cacheRate = 0.8) {
  const costPerMsg = model === 'haiku'
    ? (cacheRate * COST_PER_INTERACTION.haikuCached + (1-cacheRate) * COST_PER_INTERACTION.haikuUncached)
    : (cacheRate * COST_PER_INTERACTION.sonnetCached + (1-cacheRate) * COST_PER_INTERACTION.sonnetUncached);
  const totalMsgs = users * msgsPerUserPerDay * 30;
  return (totalMsgs * costPerMsg).toFixed(2);
}

/*
COST PROJECTIONS (Sonnet 4.6 with 80% cache hit rate):

SCENARIO A — Early stage (50 users, 5 msgs/day avg):
  Total messages/month: 7,500
  API cost: $0.0034 × 7,500 = $25.50/mo

SCENARIO B — Growing (200 users, 8 msgs/day avg):
  Total messages/month: 48,000
  API cost: $0.0034 × 48,000 = $163/mo

SCENARIO C — Scale (500 users, 10 msgs/day avg):
  Total messages/month: 150,000
  API cost: $0.0034 × 150,000 = $510/mo
  With Haiku for free tier users: reduces to ~$310/mo

SCENARIO D — With Local MCP (500 users, free tier → local, paid → Claude):
  200 paid users (Sonnet): $204/mo
  300 free users (Ollama/local): $0
  Total: $204/mo (60% reduction)

BREAK-EVEN CHECK:
  At $19/mo (App tier), even 1 subscriber covers ~5,588 AI interactions
  At your margins, API costs are minimal until you hit 500+ users
  Biggest cost driver is COACHED tier users with high msg volume
*/

// ══════════════════════════════════════════════════════════════
// SECTION 2: REVISED PRICING STRATEGY
// ══════════════════════════════════════════════════════════════

/*
PROBLEMS WITH CURRENT TIERS:
1. "Coached" is vague — what exactly do they get from you?
2. No clear separation between what the AI does vs what YOU do
3. White-label is buried at the bottom
4. No entry hook for the Latino/bilingual market
5. Free tier doesn't drive upgrades — needs a stronger conversion path

REVISED TIER ARCHITECTURE:

──────────────────────────────────────────────────────
TIER 0: SOLARYN FREE
Price: $0/mo
AI: Haiku 4.5 (routed to local Ollama if available, 
     Claude Haiku as fallback)
AI limit: 10 msgs/day
Features:
  - Today's workout (generic, schedule-based)
  - Manual HRV/stats logging
  - Basic Apple Health sync (steps, weight)
  - Web app only
  - No coach access
Target: Lead gen, latino market entry, soccer community
Conversion hook: "Connect Apple Health to unlock personalized AI"
──────────────────────────────────────────────────────

TIER 1: SOLARYN APP · $19/mo
AI: Claude Haiku 4.5 (fast, cheap, ~90% of Sonnet quality)
AI limit: Unlimited
Features:
  - Everything in Free
  - Full Apple Health sync (HRV, sleep stages, VO2 max)
  - Genomic data upload + analysis
  - Wearable imports (Oura, Whoop, Garmin)
  - iOS + Android + Web
  - Personalized daily programming
  - Progress analytics
  - Bilingual (EN/ES)
Target: High-performance professionals, self-directed athletes
Cost to serve: ~$2-4/mo API (Haiku, avg 6 msgs/day)
Margin: ~$15-17/mo
──────────────────────────────────────────────────────

TIER 2: SOLARYN COACHED · $249/mo
AI: Claude Sonnet 4.6 (best quality for coaching interactions)
AI limit: Unlimited
Features:
  - Everything in App
  - Custom weekly program built BY ESTEBAN
  - Direct messaging with 24hr response SLA
  - Monthly 30-min video check-in
  - Nutrition strategy review
  - Race/event/game-day programming
  - Coach sees ALL your health data dashboard
  - Priority AI responses (Sonnet vs Haiku)
Target: Serious athletes, executives, people who want accountability
Max clients: 20 (your time constraint)
Cost to serve: ~$10-15/mo (API + time)
Margin: ~$234/mo per client
──────────────────────────────────────────────────────

TIER 3: SOLARYN ELITE · $499/mo
AI: Claude Sonnet 4.6 + option to use Opus for complex analysis
AI limit: Unlimited + coach analysis
Features:
  - Everything in Coached
  - Weekly 45-min 1:1 video call
  - Same-day message response
  - In-app training video reviews (send video, get coaching)
  - Blood work analysis and programming adjustments
  - Genetic deep-dive session (90 min onboarding)
  - Travel + disruption programming
  - Access to Esteban's personal supplement stack recommendations
Max clients: 8-10 (premium time)
Cost to serve: ~$25-40/mo
Margin: ~$459-474/mo per client
──────────────────────────────────────────────────────

TIER 4: SOLARYN WHITE-LABEL · $997/mo
Features:
  - Full platform under their brand
  - Custom colors, logo, domain
  - Their own coach dashboard
  - Their clients billed through Stripe (you take 15% rev share)
  - Onboarding + setup (one-time $500)
  - Email support
Target: Other fitness coaches who want to launch a tech product
Max: 10 white-label partners initially
──────────────────────────────────────────────────────

LATINO/BILINGUAL PLAY:
"Solaryn Fit — Edición Latino" — Same app, Spanish-first onboarding,
pricing in USD that converts well to MXN psychology ($19 = ~$380MXN, 
feels very accessible vs $1,500MXN gym membership). 
Partner with influencers in CDMX/Monterrey fitness community.
No separate tier — the bilingual toggle is baked in to all tiers.
──────────────────────────────────────────────────────

TOTAL MRR SCENARIOS:
Conservative (6mo):
  5 App × $19 = $95
  5 Coached × $249 = $1,245
  2 Elite × $499 = $998
  1 WL × $997 = $997
  TOTAL: $3,335/mo
  API costs: ~$80/mo
  Net: ~$3,255/mo

Aggressive (12mo):
  50 App × $19 = $950
  15 Coached × $249 = $3,735
  6 Elite × $499 = $2,994
  3 WL × $997 = $2,991
  TOTAL: $10,670/mo
  API costs: ~$250/mo (mix of Haiku + Sonnet + local)
  Net: ~$10,420/mo
*/

// ══════════════════════════════════════════════════════════════
// SECTION 3: LOCAL MCP SERVER ARCHITECTURE
// Ollama on Mac Mini → MCP server → Solaryn Fit app
// ══════════════════════════════════════════════════════════════

/*
ARCHITECTURE OVERVIEW:

┌─────────────────────────────────────────────────────────┐
│                    SOLARYN FIT APP                       │
│              (React Native / Vercel API)                 │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   MODEL ROUTER      │
              │  (api/ai-router.js) │
              │                     │
              │  Free tier → Local  │
              │  Paid tier → Claude │
              └──────┬──────────────┘
                     │
        ┌────────────┼────────────┐
        │                         │
┌───────▼────────┐    ┌──────────▼──────────┐
│  LOCAL MCP     │    │   CLAUDE API         │
│  (Mac Mini)    │    │   (Anthropic)        │
│                │    │                      │
│  Ollama        │    │  Haiku 4.5 → App     │
│  llama3.3:8b   │    │  Sonnet 4.6 → Coach  │
│  or mistral    │    │  Opus 4.6 → Analysis │
│  :11434        │    │                      │
└────────────────┘    └──────────────────────┘
        │
┌───────▼────────────────┐
│  TAILSCALE MESH VPN    │
│  (secure tunnel,       │
│   no open ports)       │
│                        │
│  Mac Mini at home      │
│  → accessible from     │
│    anywhere via VPN    │
└────────────────────────┘

WHAT RUNS WHERE:
- Free tier users → Ollama on your Mac Mini (zero API cost)
- Paid App users → Claude Haiku via Anthropic API
- Coached/Elite → Claude Sonnet via Anthropic API
- Complex analysis (genomics, blood work) → Claude Opus (one-time calls)
- Your personal use → Local Ollama (free)

RECOMMENDED LOCAL SETUP:
- Hardware: Mac Mini M4 (16GB unified memory) — $599
  OR your existing older Mac Mini for free-tier-only routing
- Model: Llama 3.3 8B (Q5_K_M) — 40-60 tok/s on M4, good quality
  OR Mistral 7B for fastest responses
- Ollama: brew install ollama && ollama pull llama3.3
- Tunnel: Tailscale (free personal plan)
- Runtime cost: ~$2-5/mo electricity (Mac Mini is very efficient)
*/

// ══════════════════════════════════════════════════════════════
// SECTION 4: MCP SERVER CODE (ai-mcp-server.js)
// Run this on your Mac Mini
// ══════════════════════════════════════════════════════════════

const express = require('express');
const app = express();
app.use(express.json());

const OLLAMA_URL = 'http://localhost:11434';
const MCP_SECRET = process.env.MCP_SECRET || 'your-secret-key-here';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.3:8b';

// Auth middleware
app.use('/chat', (req, res, next) => {
  const auth = req.headers['x-mcp-secret'];
  if (auth !== MCP_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await r.json();
    res.json({
      status: 'ok',
      models: data.models?.map(m => m.name) || [],
      server: 'solaryn-local-mcp'
    });
  } catch {
    res.status(503).json({ status: 'ollama_unavailable' });
  }
});

// Chat endpoint — drop-in replacement for Claude API proxy
app.post('/chat', async (req, res) => {
  const { messages, system, model: requestedModel } = req.body;
  const model = requestedModel || DEFAULT_MODEL;

  // Build Ollama message array (add system as first message if present)
  const ollamaMessages = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 1000,
          num_ctx: 8192, // context window
        }
      }),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.status}`);
    const data = await response.json();
    const content = data.message?.content || 'No response from local model.';

    // Return in same format as Claude API for drop-in compatibility
    return res.json({
      content,
      model: model,
      source: 'local',
      usage: {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
      }
    });

  } catch (e) {
    console.error('Ollama error:', e.message);
    return res.status(500).json({ error: 'Local model error', details: e.message });
  }
});

// Model switching endpoint
app.post('/set-model', (req, res) => {
  const auth = req.headers['x-mcp-secret'];
  if (auth !== MCP_SECRET) return res.status(401).end();
  process.env.OLLAMA_MODEL = req.body.model || DEFAULT_MODEL;
  res.json({ model: process.env.OLLAMA_MODEL });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Solaryn Local MCP running on :${PORT}`);
  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log(`Tailscale: accessible on your mesh network`);
});

// ══════════════════════════════════════════════════════════════
// SECTION 5: AI ROUTER (api/ai-router.js)
// Smart routing based on user tier
// ══════════════════════════════════════════════════════════════

export async function routeAICall({ messages, system, userId, tier }) {
  const LOCAL_MCP_URL = process.env.LOCAL_MCP_URL; // Tailscale IP
  const MCP_SECRET = process.env.MCP_SECRET;

  // Routing logic
  const useLocal = tier === 'free' && LOCAL_MCP_URL;
  const claudeModel = tier === 'elite' ? 'claude-opus-4-6' :
                      tier === 'coached' ? 'claude-sonnet-4-6' :
                      'claude-haiku-4-5-20251001'; // App tier

  if (useLocal) {
    // Free tier → Mac Mini Ollama (zero API cost)
    try {
      const response = await fetch(`${LOCAL_MCP_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-secret': MCP_SECRET,
        },
        body: JSON.stringify({ messages, system }),
      });
      if (response.ok) {
        const data = await response.json();
        return { content: data.content, source: 'local', cost: 0 };
      }
      // Fall through to Claude on local failure
      console.warn('Local MCP unavailable, falling back to Claude Haiku');
    } catch {
      console.warn('Local MCP error, falling back to Claude Haiku');
    }
  }

  // Paid tiers OR local fallback → Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 1000,
      system,
      messages,
    }),
  });

  const data = await response.json();
  const content = data.content?.[0]?.text || 'No response.';

  // Estimate cost for monitoring
  const inputTokens = (data.usage?.input_tokens || 0);
  const outputTokens = (data.usage?.output_tokens || 0);
  const rates = {
    'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
    'claude-sonnet-4-6': { in: 3.0, out: 15.0 },
    'claude-opus-4-6': { in: 5.0, out: 25.0 },
  };
  const rate = rates[claudeModel] || rates['claude-haiku-4-5-20251001'];
  const cost = (inputTokens * rate.in + outputTokens * rate.out) / 1_000_000;

  return { content, source: 'claude', model: claudeModel, cost };
}

// ══════════════════════════════════════════════════════════════
// SECTION 6: MAC MINI SETUP COMMANDS
// Run these on your Mac Mini to set up the local MCP
// ══════════════════════════════════════════════════════════════

/*
# 1. Install Ollama
brew install ollama

# 2. Pull recommended model (fits in 16GB, good quality)
ollama pull llama3.3:8b
# OR for fastest responses:
ollama pull mistral:7b
# OR for best tool-calling (important for coaching):
ollama pull qwen3:7b

# 3. Start Ollama as a background service
brew services start ollama

# 4. Install Node.js if not present
brew install node

# 5. Set up the MCP server
mkdir ~/solaryn-mcp && cd ~/solaryn-mcp
npm init -y
npm install express

# Copy ai-mcp-server.js to ~/solaryn-mcp/server.js
# Set your secret: export MCP_SECRET="your-strong-secret-here"

# 6. Run as background daemon (launchd)
cat > ~/Library/LaunchAgents/com.solaryn.mcp.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.solaryn.mcp</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/YOUR_USER/solaryn-mcp/server.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MCP_SECRET</key><string>your-strong-secret-here</string>
    <key>OLLAMA_MODEL</key><string>llama3.3:8b</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/solaryn-mcp.log</string>
  <key>StandardErrorPath</key><string>/tmp/solaryn-mcp-error.log</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.solaryn.mcp.plist

# 7. Install Tailscale for secure remote access
brew install tailscale
# Sign up at tailscale.com (free personal plan)
# Then: tailscale up
# Get your Mac Mini's Tailscale IP: tailscale ip -4

# 8. Add to Vercel env vars:
# LOCAL_MCP_URL=http://100.x.x.x:3001  (your Tailscale IP)
# MCP_SECRET=your-strong-secret-here

# 9. Test it
curl http://localhost:3001/health
curl http://localhost:3001/chat \
  -H "Content-Type: application/json" \
  -H "x-mcp-secret: your-secret" \
  -d '{"messages":[{"role":"user","content":"What should I eat pre-workout?"}],"system":"You are a fitness coach."}'
*/
