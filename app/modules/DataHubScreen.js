// ══════════════════════════════════════════════════════════════
// DATA HUB SCREEN
// File: app/modules/DataHubScreen.js
//
// The central data integration screen — connects Apple Health,
// genomic files, wearable exports, blood work, DEXA.
// This is the core product differentiator.
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Modal, ActivityIndicator, Alert
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  DATA_SOURCES, parseGenomicFile, parseOuraExport,
  parseWhoopExport, uploadDataFile, getGenomicTrainingInsights
} from './dataIntegration';
import {
  isHealthKitAvailable, requestHealthKitPermissions, fetchTodayMetrics
} from './healthkit';

const C = {
  bg: '#0A0A0F', surface: '#111118', card: '#16161F', border: '#1E1E2A',
  gold: '#C9A84C', goldGlow: 'rgba(201,168,76,0.12)',
  white: '#F0EFE8', muted: '#6B6A7A', dim: '#3A3950',
  green: '#2ECC71', blue: '#4A9EFF', red: '#E74C3C',
  orange: '#F39C12', purple: '#9B59B6',
};

export default function DataHubScreen({ supabase, profile }) {
  const [connected, setConnected] = useState({});   // sourceId → status
  const [healthData, setHealthData] = useState(null);
  const [genomicInsights, setGenomicInsights] = useState([]);
  const [processing, setProcessing] = useState(null);
  const [detailSource, setDetailSource] = useState(null);
  const [healthKitAvailable, setHealthKitAvailable] = useState(false);

  useEffect(() => {
    loadConnectionStatus();
    checkHealthKit();
  }, []);

  const checkHealthKit = async () => {
    const available = await isHealthKitAvailable();
    setHealthKitAvailable(available);
  };

  const loadConnectionStatus = async () => {
    if (!supabase || !profile?.id) return;
    const { data } = await supabase
      .from('data_connections')
      .select('*')
      .eq('user_id', profile.id);
    if (data) {
      const map = {};
      data.forEach(d => { map[d.source_id] = d; });
      setConnected(map);
    }
  };

  // ── CONNECT APPLE HEALTH ───────────────────────────────────
  const connectAppleHealth = async () => {
    setProcessing('apple_health');
    const result = await requestHealthKitPermissions();
    if (result.granted) {
      const metrics = await fetchTodayMetrics();
      setHealthData(metrics);
      await saveConnection('apple_health', { status: 'connected', metrics });
    } else {
      Alert.alert('Permission needed', 'Please allow Health access in Settings to enable live sync.');
    }
    setProcessing(null);
  };

  // ── UPLOAD FILE ────────────────────────────────────────────
  const handleUpload = async (source) => {
    setProcessing(source.id);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: source.fileTypes || ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setProcessing(null);
        return;
      }

      const file = result.assets[0];
      let parsed = null;

      // Parse based on source type
      if (source.id === '23andme' || source.id === 'ancestry') {
        parsed = await parseGenomicFile(file.uri, source.id);
        if (parsed.success && parsed.findings) {
          const insights = getGenomicTrainingInsights(parsed.findings);
          setGenomicInsights(insights);
        }
      } else if (source.id === 'oura') {
        const content = await readFileAsText(file.uri);
        parsed = parseOuraExport(content);
      } else if (source.id === 'whoop') {
        const content = await readFileAsText(file.uri);
        parsed = parseWhoopExport(content);
      } else {
        // Blood work, DEXA — just upload, AI reads it
        parsed = { success: true, provider: source.id, fileName: file.name };
      }

      if (parsed?.success) {
        // Upload to Supabase Storage
        await uploadDataFile(supabase, profile.id, file.uri, source.id, file.name);
        await saveConnection(source.id, { status: 'connected', ...parsed });
        Alert.alert('Connected!', `${source.name} data uploaded and analyzed.`);
      } else {
        Alert.alert('Upload issue', parsed?.error || 'Could not parse file. Check the format and try again.');
      }

    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setProcessing(null);
  };

  const saveConnection = async (sourceId, data) => {
    if (!supabase || !profile?.id) {
      setConnected(prev => ({ ...prev, [sourceId]: { status: 'connected', ...data } }));
      return;
    }
    const { data: row } = await supabase.from('data_connections').upsert({
      user_id: profile.id,
      source_id: sourceId,
      status: 'connected',
      data: data,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id,source_id' }).select().single();
    if (row) setConnected(prev => ({ ...prev, [sourceId]: row }));
  };

  const isConnected = (id) => connected[id]?.status === 'connected';

  const categoryGroups = [
    { id: 'wearable', label: 'WEARABLES & DEVICES', icon: '⌚' },
    { id: 'genomic', label: 'GENOMIC DATA', icon: '🧬' },
    { id: 'medical', label: 'MEDICAL & LAB DATA', icon: '🩺' },
  ];

  return (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Hero section */}
      <View style={s.hero}>
        <Text style={s.heroTitle}>Your Data. Your Edge.</Text>
        <Text style={s.heroSub}>
          Solaryn Fit gets smarter with every data source you connect.
          The AI coach isn't just generic advice — it's built on your actual biology.
        </Text>
        <View style={s.heroStats}>
          <View style={s.heroStat}>
            <Text style={s.heroStatNum}>{Object.keys(connected).filter(k => isConnected(k)).length}</Text>
            <Text style={s.heroStatLabel}>Connected</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatNum}>{DATA_SOURCES.length}</Text>
            <Text style={s.heroStatLabel}>Available</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={[s.heroStatNum, { color: C.green }]}>
              {Object.keys(connected).filter(k => isConnected(k)).length > 0 ? 'Active' : 'Waiting'}
            </Text>
            <Text style={s.heroStatLabel}>AI Context</Text>
          </View>
        </View>
      </View>

      {/* AI impact banner */}
      {Object.keys(connected).filter(k => isConnected(k)).length === 0 && (
        <View style={s.impactBanner}>
          <Text style={s.impactIcon}>💡</Text>
          <Text style={s.impactText}>
            Connect at least Apple Health + one wearable to unlock personalized daily recommendations. Add genomic data to reach maximum AI personalization.
          </Text>
        </View>
      )}

      {/* Genomic insights (if connected) */}
      {genomicInsights.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardLabel}>YOUR GENETIC TRAINING PROFILE</Text>
          {genomicInsights.map((insight, i) => (
            <View key={i} style={[s.insightRow, { borderLeftColor: insightColor(insight.type) }]}>
              <Text style={s.insightIcon}>{insightIcon(insight.type)}</Text>
              <Text style={s.insightText}>{insight.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Live Apple Health preview */}
      {healthData && !healthData.error && (
        <View style={s.card}>
          <Text style={s.cardLabel}>LIVE HEALTH DATA  ·  {healthData.source === 'mock' ? 'PREVIEW' : 'APPLE HEALTH'}</Text>
          <View style={s.metricsGrid}>
            {[
              { label: 'HRV', val: healthData.hrv ? healthData.hrv + 'ms' : '—', color: hrvColor(healthData.hrv) },
              { label: 'RHR', val: healthData.restingHR ? healthData.restingHR + 'bpm' : '—', color: C.blue },
              { label: 'Sleep', val: healthData.sleep?.totalHrs ? healthData.sleep.totalHrs + 'h' : '—', color: C.purple },
              { label: 'Steps', val: healthData.steps ? (healthData.steps / 1000).toFixed(1) + 'k' : '—', color: C.green },
              { label: 'Weight', val: healthData.weightLbs ? healthData.weightLbs + 'lb' : '—', color: C.gold },
              { label: 'VO2 Max', val: healthData.vo2max ? healthData.vo2max.toString() : '—', color: C.orange },
            ].map(({ label, val, color }) => (
              <View key={label} style={s.metricTile}>
                <Text style={[s.metricVal, { color }]}>{val}</Text>
                <Text style={s.metricLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {healthData.sleep && (
            <View style={s.sleepRow}>
              <Text style={s.sleepLabel}>Sleep breakdown:</Text>
              <Text style={s.sleepVal}>{healthData.sleep.totalHrs}h total · {healthData.sleep.deepHrs}h deep · {healthData.sleep.remHrs}h REM</Text>
            </View>
          )}
        </View>
      )}

      {/* Data source groups */}
      {categoryGroups.map(group => {
        const sources = DATA_SOURCES.filter(s => s.category === group.id);
        return (
          <View key={group.id}>
            <Text style={s.groupHeader}>{group.icon}  {group.label}</Text>
            {sources.map(source => {
              const conn = isConnected(source.id);
              const isProcessing = processing === source.id;
              const isIosOnly = source.platform === 'ios' && Platform.OS !== 'ios';

              return (
                <TouchableOpacity
                  key={source.id}
                  style={[s.sourceCard, conn && s.sourceCardConnected]}
                  onPress={() => setDetailSource(source)}
                  disabled={isProcessing}
                >
                  <View style={s.sourceLeft}>
                    <Text style={s.sourceIcon}>{source.icon}</Text>
                    <View style={s.sourceInfo}>
                      <View style={s.sourceNameRow}>
                        <Text style={s.sourceName}>{source.name}</Text>
                        <View style={[s.sourceBadge, { backgroundColor: source.badgeColor + '22', borderColor: source.badgeColor + '44' }]}>
                          <Text style={[s.sourceBadgeText, { color: source.badgeColor }]}>{source.badge}</Text>
                        </View>
                        {source.premium && !conn && (
                          <View style={[s.sourceBadge, { backgroundColor: C.purple + '22', borderColor: C.purple + '44', marginLeft: 4 }]}>
                            <Text style={[s.sourceBadgeText, { color: C.purple }]}>Pro</Text>
                          </View>
                        )}
                      </View>
                      <Text style={s.sourceDesc} numberOfLines={2}>{source.description}</Text>
                      {!conn && <Text style={s.sourceImpact}>AI impact: {source.aiImpact.split(' — ')[0]}</Text>}
                    </View>
                  </View>
                  <View style={s.sourceRight}>
                    {isProcessing ? (
                      <ActivityIndicator color={C.gold} size="small" />
                    ) : conn ? (
                      <View style={s.connectedBadge}>
                        <Text style={s.connectedText}>✓ Live</Text>
                      </View>
                    ) : isIosOnly ? (
                      <Text style={s.iosOnlyText}>iOS only</Text>
                    ) : (
                      <TouchableOpacity
                        style={s.connectBtn}
                        onPress={() => {
                          if (source.id === 'apple_health') connectAppleHealth();
                          else handleUpload(source);
                        }}>
                        <Text style={s.connectBtnText}>Connect</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}

      {/* Privacy note */}
      <View style={s.privacyCard}>
        <Text style={s.privacyIcon}>🔒</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.privacyTitle}>Your data stays yours</Text>
          <Text style={s.privacyText}>
            All health and genomic data is encrypted at rest and in transit.
            We extract only fitness-relevant signals. Your raw data is never sold, shared, or used for advertising.
            You can delete all data at any time from Account → Privacy.
          </Text>
        </View>
      </View>

      {/* Bottom padding */}
      <View style={{ height: 40 }} />

      {/* Detail modal */}
      <Modal visible={!!detailSource} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.detailModal}>
            <View style={s.detailHeader}>
              <Text style={s.detailIcon}>{detailSource?.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.detailTitle}>{detailSource?.name}</Text>
                <Text style={s.detailCategory}>{detailSource?.category?.toUpperCase()}</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailSource(null)} style={s.closeBtn}>
                <Text style={s.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.detailImpact}>
                <Text style={s.detailImpactLabel}>AI IMPACT</Text>
                <Text style={s.detailImpactText}>{detailSource?.aiImpact}</Text>
              </View>

              <Text style={s.detailDesc}>{detailSource?.description}</Text>

              {detailSource?.instructions && (
                <View style={s.instructionsCard}>
                  <Text style={s.instructionsLabel}>HOW TO EXPORT YOUR DATA</Text>
                  <Text style={s.instructionsText}>{detailSource.instructions}</Text>
                </View>
              )}

              {detailSource?.disclaimer && (
                <View style={s.disclaimerCard}>
                  <Text style={s.disclaimerText}>🔒 {detailSource.disclaimer}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.btnPrimary, { marginTop: 16 }]}
                onPress={() => {
                  setDetailSource(null);
                  if (detailSource.id === 'apple_health') connectAppleHealth();
                  else handleUpload(detailSource);
                }}>
                <Text style={s.btnPrimaryText}>
                  {detailSource?.setupType === 'permission' ? 'Connect Apple Health' : `Upload ${detailSource?.name} Data`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setDetailSource(null)} style={{ marginTop: 12, alignItems: 'center', padding: 12 }}>
                <Text style={{ color: C.muted, fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ── HELPERS ────────────────────────────────────────────────────
const hrvColor = (hrv) => {
  if (!hrv) return C.muted;
  if (hrv >= 70) return C.green;
  if (hrv >= 50) return C.gold;
  if (hrv >= 35) return C.orange;
  return C.red;
};

const insightColor = (type) => ({
  strength: C.gold, endurance: C.blue, injury: C.red,
  recovery: C.purple, nutrition: C.green, supplement: C.orange,
}[type] || C.muted);

const insightIcon = (type) => ({
  strength: '💪', endurance: '🏃', injury: '⚠️',
  recovery: '🔄', nutrition: '🥗', supplement: '💊',
}[type] || '•');

const readFileAsText = async (uri) => {
  const { FileSystem } = await import('expo-file-system');
  return FileSystem.readAsStringAsync(uri, { encoding: 'utf8' });
};

// ── STYLES ─────────────────────────────────────────────────────
const s = StyleSheet.create({
  scroll:          { flex: 1, paddingHorizontal: 16, backgroundColor: C.bg },
  hero:            { paddingVertical: 24 },
  heroTitle:       { color: C.white, fontSize: 24, fontWeight: '700', marginBottom: 8 },
  heroSub:         { color: C.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  heroStats:       { flexDirection: 'row', backgroundColor: C.card, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border },
  heroStat:        { flex: 1, alignItems: 'center' },
  heroStatNum:     { color: C.gold, fontSize: 24, fontWeight: '700' },
  heroStatLabel:   { color: C.muted, fontSize: 11, letterSpacing: 1, marginTop: 2 },
  heroStatDivider: { width: 1, backgroundColor: C.border },
  impactBanner:    { flexDirection: 'row', backgroundColor: C.goldGlow, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: C.gold + '33', marginBottom: 12, alignItems: 'flex-start', gap: 10 },
  impactIcon:      { fontSize: 18 },
  impactText:      { color: C.white, fontSize: 13, lineHeight: 18, flex: 1 },
  card:            { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardLabel:       { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  insightRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 6, borderRadius: 2 },
  insightIcon:     { fontSize: 16, width: 22 },
  insightText:     { color: C.white, fontSize: 13, lineHeight: 18, flex: 1 },
  metricsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricTile:      { backgroundColor: C.surface, borderRadius: 8, padding: 12, width: '30%', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  metricVal:       { fontSize: 18, fontWeight: '700' },
  metricLabel:     { color: C.muted, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  sleepRow:        { flexDirection: 'row', alignItems: 'center', paddingTop: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: C.border, flexWrap: 'wrap' },
  sleepLabel:      { color: C.muted, fontSize: 12, marginRight: 6 },
  sleepVal:        { color: C.white, fontSize: 12 },
  groupHeader:     { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  sourceCard:      { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center' },
  sourceCardConnected: { borderColor: C.green + '44' },
  sourceLeft:      { flexDirection: 'row', flex: 1, alignItems: 'flex-start', gap: 12 },
  sourceIcon:      { fontSize: 24, width: 32, marginTop: 2 },
  sourceInfo:      { flex: 1 },
  sourceNameRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  sourceName:      { color: C.white, fontSize: 15, fontWeight: '600' },
  sourceBadge:     { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  sourceBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sourceDesc:      { color: C.muted, fontSize: 12, lineHeight: 17 },
  sourceImpact:    { color: C.gold + 'AA', fontSize: 11, marginTop: 4 },
  sourceRight:     { marginLeft: 8, alignItems: 'center' },
  connectedBadge:  { backgroundColor: C.green + '18', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: C.green + '44' },
  connectedText:   { color: C.green, fontSize: 11, fontWeight: '700' },
  connectBtn:      { backgroundColor: C.goldGlow, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.gold + '44' },
  connectBtnText:  { color: C.gold, fontSize: 12, fontWeight: '600' },
  iosOnlyText:     { color: C.muted, fontSize: 11 },
  privacyCard:     { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.border, gap: 10, alignItems: 'flex-start' },
  privacyIcon:     { fontSize: 20, marginTop: 2 },
  privacyTitle:    { color: C.white, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  privacyText:     { color: C.muted, fontSize: 12, lineHeight: 17 },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  detailModal:     { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%', borderTopWidth: 1, borderColor: C.border },
  detailHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  detailIcon:      { fontSize: 36 },
  detailTitle:     { color: C.white, fontSize: 18, fontWeight: '700' },
  detailCategory:  { color: C.muted, fontSize: 10, letterSpacing: 1 },
  closeBtn:        { width: 32, height: 32, borderRadius: 8, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  closeBtnText:    { color: C.muted, fontSize: 16 },
  detailImpact:    { backgroundColor: C.goldGlow, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.gold + '33', marginBottom: 12 },
  detailImpactLabel: { color: C.gold, fontSize: 9, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  detailImpactText:  { color: C.white, fontSize: 13, lineHeight: 18 },
  detailDesc:      { color: C.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  instructionsCard:{ backgroundColor: C.surface, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.border, marginBottom: 10 },
  instructionsLabel: { color: C.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 6 },
  instructionsText:  { color: C.white, fontSize: 13, lineHeight: 19 },
  disclaimerCard:  { backgroundColor: C.surface, borderRadius: 8, padding: 12, borderWidth: 1, borderColor: C.border + '88' },
  disclaimerText:  { color: C.muted, fontSize: 12, lineHeight: 17 },
  btnPrimary:      { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText:  { color: C.bg, fontWeight: '700', fontSize: 15 },
});
