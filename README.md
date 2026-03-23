# Solaryn Fit — Commercial Platform

Full-stack fitness platform with SaaS subscriptions, 1:1 coaching, and white-label capability.

## Architecture

```
solaryn-fit-platform/
├── app/               ← React Native (iOS + Web) client app
│   └── App.js         ← Full client-facing app
├── coach-dashboard/   ← Web-only coach dashboard (you see all clients)
│   └── index.html     ← Deploy this to coach.solaryn.com
├── api/               ← Vercel serverless functions
│   ├── coach.js       ← Claude AI proxy (keeps API key server-side)
│   └── stripe-webhook.js ← Stripe subscription events
├── supabase/
│   └── schema.sql     ← Full database schema, RLS policies
└── README.md
```

---

## Step-by-Step Setup

### 1. Supabase (database + auth)
1. Create project at supabase.com (free tier works)
2. Go to SQL Editor → paste entire `supabase/schema.sql` → Run
3. Copy your project URL and anon key from Settings → API
4. Enable email auth in Authentication → Providers

### 2. Vercel (web deployment + API)
1. Push this repo to GitHub
2. Import project at vercel.com
3. Add environment variables (see below)
4. Deploy — web app lives at `your-project.vercel.app`
5. Coach dashboard: deploy `coach-dashboard/index.html` as a separate Vercel project at `coach.solaryn.com`

### 3. Stripe (payments)
1. Create account at stripe.com
2. Create 3 subscription products:
   - App: $19/mo
   - Coached: $299/mo  
   - Elite: $599/mo
3. Copy each price ID
4. Add webhook: `your-domain.vercel.app/api/stripe-webhook`
   - Events to listen: `customer.subscription.*`, `checkout.session.completed`
5. Copy webhook secret

### 4. Expo (iOS + Android)
```bash
cd app
npm install
npm start          # scan QR with Expo Go for instant iPhone preview
```

For App Store / TestFlight:
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios
eas submit --platform ios
```

---

## Environment Variables

Add these in Vercel project settings:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON=your-anon-key
EXPO_PUBLIC_STRIPE_KEY=pk_live_xxx
EXPO_PUBLIC_API_URL=https://your-domain.vercel.app

ANTHROPIC_API_KEY=sk-ant-xxx          (server-side only)
SUPABASE_SERVICE_KEY=xxx               (server-side only)
STRIPE_SECRET_KEY=sk_live_xxx          (server-side only)
STRIPE_WEBHOOK_SECRET=whsec_xxx        (server-side only)
STRIPE_APP_PRICE_ID=price_xxx
STRIPE_COACHED_PRICE_ID=price_xxx
STRIPE_ELITE_PRICE_ID=price_xxx
```

---

## Business Model

| Tier | Price | What they get |
|------|-------|---------------|
| Free | $0 | App + 10 AI msgs/day |
| App | $19/mo | Unlimited AI, full tracking, iOS |
| Coached | $299/mo | Everything + 1:1 with you |
| Elite | $599/mo | Everything + weekly calls |
| White-label | $997+/mo | Branded platform for other coaches |

**Break-even math:**
- 10 coached clients = $2,990/mo
- 1 white-label coach = $997/mo + their clients' subscriptions
- 100 app subscribers = $1,900/mo (passive)

---

## Coach Dashboard Features
- Client roster with HRV, workout frequency, subscription tier
- Revenue dashboard (MRR, ARR, tier breakdown)
- Direct messaging with coached clients
- Program assignment
- White-label management

**Access:** coach.solaryn.com (sign in with your Supabase coach account)

---

## White-Label Setup
1. Create an `organizations` row in Supabase for the new coach
2. Set their `slug`, `brand_color`, `logo_url`
3. Their clients automatically scope to their org
4. Bill them via Stripe at $997+/mo
5. They get their own coach dashboard instance

---

## Bilingual Support
The app detects `profile.language` and the AI coach responds in the user's language.
All UI strings can be localized — add `i18n/es.json` for full Spanish translation.

---

## Next Phase
- [ ] Push notifications (Expo + OneSignal)
- [ ] Apple Health / HealthKit HRV import
- [ ] Video exercise library
- [ ] In-app video calls (coach → client)
- [ ] Group coaching / cohort model
- [ ] Referral program (clients refer → get discount)
- [ ] Public landing page at solaryn.com/fit

---

Built by Esteban Frias · Solaryn Advisory · March 2026
