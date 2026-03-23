// ══════════════════════════════════════════════════════════════
// INVITE CODE SCREEN (add to app)
// Show during onboarding step 0 or in Account tab
// ══════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const C = {
  bg: '#0A0A0F', card: '#16161F', border: '#1E1E2A',
  gold: '#C9A84C', white: '#F0EFE8', muted: '#6B6A7A',
  green: '#2ECC71', red: '#E74C3C',
};

export function InviteCodeScreen({ supabase, userId, onSuccess }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // {success, tier, message} or {success:false, error}

  const redeem = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);

    const { data, error } = await supabase
      .rpc('redeem_invite_code', {
        p_code: code.trim().toUpperCase(),
        p_user_id: userId,
      });

    setLoading(false);

    if (error || !data?.success) {
      setResult({ success: false, error: data?.error || 'Invalid code. Try again.' });
    } else {
      setResult(data);
      setTimeout(() => onSuccess?.(data.tier), 1500);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Have an invite code?</Text>
      <Text style={s.sub}>Enter it below to unlock your access tier.</Text>

      <View style={s.card}>
        <Text style={s.label}>INVITE CODE</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. SOLARYN-BETA"
          placeholderTextColor={C.muted}
          value={code}
          onChangeText={v => setCode(v.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        {result && (
          <View style={[s.resultBox, { borderColor: result.success ? C.green : C.red }]}>
            <Text style={{ color: result.success ? C.green : C.red, fontSize: 13, fontWeight: '600' }}>
              {result.success ? `✓ ${result.message}` : `✗ ${result.error}`}
            </Text>
            {result.success && (
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                Tier unlocked: {result.tier.toUpperCase()}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[s.btn, (!code.trim() || loading) && { opacity: 0.4 }]}
          onPress={redeem}
          disabled={!code.trim() || loading}
        >
          {loading
            ? <ActivityIndicator color={C.bg} />
            : <Text style={s.btnText}>Redeem Code</Text>
          }
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => onSuccess?.('free')} style={s.skip}>
        <Text style={s.skipText}>Skip — continue with free tier</Text>
      </TouchableOpacity>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// ADMIN PANEL HTML (add to coach-dashboard/index.html)
// Paste inside the renderSettingsView() function
// ══════════════════════════════════════════════════════════════

export const ADMIN_PANEL_HTML = `
<!-- Add this inside the Settings view in coach-dashboard/index.html -->

<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:14px">
  <div style="font-size:10px;color:var(--gold);letter-spacing:2px;font-weight:700;margin-bottom:16px">
    BETA ACCESS — FREE TIER OVERRIDES
  </div>

  <!-- Give access to someone by email -->
  <div style="margin-bottom:20px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Grant free access by email</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="override-email" placeholder="their@email.com"
        style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--white);padding:10px;border-radius:8px;font-size:13px">
      <select id="override-tier"
        style="background:var(--surface);border:1px solid var(--border);color:var(--white);padding:10px;border-radius:8px;font-size:13px">
        <option value="app">App</option>
        <option value="coached">Coached</option>
        <option value="elite">Elite</option>
      </select>
      <input id="override-reason" placeholder="reason (optional)"
        style="width:140px;background:var(--surface);border:1px solid var(--border);color:var(--white);padding:10px;border-radius:8px;font-size:13px">
      <button class="btn-primary" onclick="grantAccess()">Grant Access</button>
    </div>
    <div id="grant-result" style="margin-top:8px;font-size:12px"></div>
  </div>

  <!-- Create invite code -->
  <div style="margin-bottom:20px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Create invite code</div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="new-code" placeholder="CODE-NAME"
        style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--white);padding:10px;border-radius:8px;font-size:13px;text-transform:uppercase">
      <select id="code-tier"
        style="background:var(--surface);border:1px solid var(--border);color:var(--white);padding:10px;border-radius:8px;font-size:13px">
        <option value="app">App tier</option>
        <option value="coached">Coached tier</option>
        <option value="elite">Elite tier</option>
      </select>
      <input id="code-uses" type="number" value="1" min="1" max="100"
        style="width:60px;background:var(--surface);border:1px solid var(--border);color:var(--white);padding:10px;border-radius:8px;font-size:13px;text-align:center">
      <span style="font-size:12px;color:var(--muted)">uses</span>
      <button class="btn-primary" onclick="createCode()">Create</button>
    </div>
    <div id="code-result" style="margin-top:8px;font-size:12px"></div>
  </div>

  <!-- Existing overrides -->
  <div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Active overrides</div>
    <div id="overrides-list" style="font-size:13px;color:var(--muted)">Loading...</div>
  </div>

  <!-- Active invite codes -->
  <div style="margin-top:20px">
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Invite codes</div>
    <div id="codes-list" style="font-size:13px;color:var(--muted)">Loading...</div>
  </div>
</div>

<script>
// Load overrides + codes on settings view
async function loadAccessPanel() {
  const { data: overrides } = await sb.from('access_overrides').select('*').order('created_at', { ascending: false });
  const { data: codes } = await sb.from('invite_codes').select('*').order('created_at', { ascending: false });

  document.getElementById('overrides-list').innerHTML = overrides?.length
    ? overrides.map(o => \`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="flex:1">\${o.email || o.user_id?.substring(0,8)+'...'}</span>
          <span class="tier-badge tier-\${o.tier}">\${o.tier.toUpperCase()}</span>
          <span style="color:var(--muted);font-size:11px">\${o.reason || ''}</span>
          <button onclick="revokeOverride('\${o.id}')" style="background:none;border:1px solid var(--red);color:var(--red);padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer">Revoke</button>
        </div>
      \`).join('')
    : '<span style="color:var(--muted)">No overrides yet</span>';

  document.getElementById('codes-list').innerHTML = codes?.length
    ? codes.map(c => \`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-family:monospace;background:var(--surface);padding:3px 8px;border-radius:4px;border:1px solid var(--border)">\${c.code}</span>
          <span class="tier-badge tier-\${c.tier}">\${c.tier.toUpperCase()}</span>
          <span style="color:var(--muted);font-size:11px">\${c.uses}/\${c.max_uses} used</span>
          <span style="color:var(--muted);font-size:11px;flex:1">\${c.note || ''}</span>
          <button onclick="copyCode('\${c.code}')" style="background:none;border:1px solid var(--gold);color:var(--gold);padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer">Copy</button>
        </div>
      \`).join('')
    : '<span style="color:var(--muted)">No codes yet</span>';
}

async function grantAccess() {
  const email = document.getElementById('override-email').value.trim();
  const tier = document.getElementById('override-tier').value;
  const reason = document.getElementById('override-reason').value.trim() || 'manual_grant';
  const result = document.getElementById('grant-result');
  if (!email) return;

  const { error } = await sb.from('access_overrides').insert({ email, tier, reason });
  if (error) {
    result.innerHTML = '<span style="color:var(--red)">Error: ' + error.message + '</span>';
  } else {
    result.innerHTML = '<span style="color:var(--green)">✓ Access granted to ' + email + ' — ' + tier + ' tier</span>';
    document.getElementById('override-email').value = '';
    loadAccessPanel();
  }
}

async function createCode() {
  const code = document.getElementById('new-code').value.trim().toUpperCase();
  const tier = document.getElementById('code-tier').value;
  const maxUses = parseInt(document.getElementById('code-uses').value) || 1;
  const result = document.getElementById('code-result');
  if (!code) return;

  const { error } = await sb.from('invite_codes').insert({ code, tier, max_uses: maxUses });
  if (error) {
    result.innerHTML = '<span style="color:var(--red)">Error: ' + (error.code === '23505' ? 'Code already exists' : error.message) + '</span>';
  } else {
    result.innerHTML = '<span style="color:var(--green)">✓ Code created: ' + code + '</span>';
    document.getElementById('new-code').value = '';
    loadAccessPanel();
  }
}

async function revokeOverride(id) {
  if (!confirm('Revoke this access?')) return;
  await sb.from('access_overrides').delete().eq('id', id);
  loadAccessPanel();
}

function copyCode(code) {
  navigator.clipboard.writeText(code);
  alert('Copied: ' + code);
}

// Auto-load when settings view is shown
loadAccessPanel();
</script>
`;

const s = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: C.bg },
  title:     { color: C.white, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sub:       { color: C.muted, fontSize: 14, marginBottom: 24, lineHeight: 20 },
  card:      { backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  label:     { color: C.muted, fontSize: 10, letterSpacing: 1, fontWeight: '600', marginBottom: 6 },
  input:     { backgroundColor: '#111118', borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.white, padding: 12, fontSize: 18, letterSpacing: 2, fontWeight: '600', textAlign: 'center' },
  resultBox: { borderRadius: 8, padding: 10, borderWidth: 1, marginTop: 10 },
  btn:       { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText:   { color: C.bg, fontWeight: '700', fontSize: 15 },
  skip:      { marginTop: 16, alignItems: 'center', padding: 12 },
  skipText:  { color: C.muted, fontSize: 13 },
});
