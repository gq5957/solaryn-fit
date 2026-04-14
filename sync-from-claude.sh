#!/bin/bash
# Run this once to pull the updated index.html and intake.js from the Claude container
# Then commit and push to trigger Vercel deploy

set -e
REPO="/Users/estebanfrias/Developer/github-repos/solaryn-fit"

echo "📥 Copying updated files from Claude container..."

# index.html — the main PWA with all i18n wiring
docker cp claude-container:/home/claude/solaryn-fit/public/index.html "$REPO/public/index.html" 2>/dev/null || \
  echo "  ⚠️  Docker not available — see manual instructions below"

# intake.js — Spanish language support in AI intake
docker cp claude-container:/home/claude/solaryn-fit/api/intake.js "$REPO/api/intake.js" 2>/dev/null || \
  echo "  ⚠️  Docker not available — see manual instructions below"

echo ""
echo "📝 Committing and pushing..."
cd "$REPO"
git add -A
git status
git commit -m "feat: Spanish/English i18n, language toggle, UX improvements, user guides

- public/i18n.js: Full EN/ES LATAM string translations
- public/index.html: Language toggle, data-i18n attributes, help modal, rest day empty state, onboarding progress bar, auth tagline
- api/intake.js: Spanish language support in AI intake conversation
- docs/user-guide-en.md + user-guide-es.md: Full bilingual user guides

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

git push origin main
echo ""
echo "✅ Done! Vercel will auto-deploy in ~30 seconds."
echo "   https://solaryn-fit.vercel.app"
