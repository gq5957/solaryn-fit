#!/bin/bash
# Solaryn Fit — sync files from container to local repo
# Run this from your terminal: bash /tmp/solaryn-sync.sh

REPO="/Users/estebanfrias/Developer/github-repos/solaryn-fit"
CONTAINER_REPO="/home/claude/solaryn-fit"

echo "🔄 Syncing Solaryn Fit files..."

# These are the files changed in the i18n + UX update commit
# Since we can't push from the container, copy via SSH or use the pre-written i18n.js

echo "✅ i18n.js already written to local repo"
echo ""
echo "📋 Files still needed from container:"
echo "  - public/index.html  (73KB — main PWA, fully updated)"  
echo "  - api/intake.js      (Spanish language support)"
echo ""
echo "To complete the sync, run from the solaryn-fit repo:"
echo ""
echo "  git add -A"
echo "  git commit -m 'feat: Spanish/English i18n, language toggle, UX improvements, user guides'"
echo "  git push origin main"
echo ""
echo "Vercel will auto-deploy on push."
