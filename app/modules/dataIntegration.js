// ══════════════════════════════════════════════════════════════
// GENOMIC & WEARABLE DATA INTEGRATION MODULE
// File: app/modules/dataIntegration.js
//
// Handles:
//   - 23andMe / AncestryDNA raw data parsing
//   - Oura Ring export parsing
//   - Whoop data export parsing
//   - Garmin connect export parsing
//   - File upload to Supabase Storage
//   - AI context generation from genomic markers
// ══════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

// ── DATA SOURCE CATALOG ────────────────────────────────────────
export const DATA_SOURCES = [
  {
    id: 'apple_health',
    name: 'Apple Health',
    icon: '❤️',
    description: 'HRV, sleep, heart rate, workouts, body stats — live sync',
    badge: 'Auto-sync',
    badgeColor: '#2ECC71',
    category: 'wearable',
    platform: 'ios',
    setupType: 'permission',
    premium: false,
    aiImpact: 'HIGH — daily training recommendations personalized to your recovery state',
  },
  {
    id: 'oura',
    name: 'Oura Ring',
    icon: '💍',
    description: 'Readiness score, sleep stages, body temperature, HRV trends',
    badge: 'Export CSV',
    badgeColor: '#4A9EFF',
    category: 'wearable',
    setupType: 'upload',
    fileTypes: ['text/csv', 'application/json'],
    instructions: 'Oura app → Account → Data Export → CSV',
    premium: false,
    aiImpact: 'HIGH — readiness score directly modifies workout intensity recommendations',
  },
  {
    id: 'whoop',
    name: 'Whoop',
    icon: '⚡',
    description: 'Recovery score, strain, sleep performance, HRV',
    badge: 'Export CSV',
    badgeColor: '#4A9EFF',
    category: 'wearable',
    setupType: 'upload',
    fileTypes: ['text/csv'],
    instructions: 'Whoop app → Profile → Export Data → Select date range → Download',
    premium: false,
    aiImpact: 'HIGH — recovery % maps directly to training load suggestions',
  },
  {
    id: 'garmin',
    name: 'Garmin Connect',
    icon: '🏃',
    description: 'Training load, VO2 max, body battery, running dynamics',
    badge: 'Export ZIP',
    badgeColor: '#4A9EFF',
    category: 'wearable',
    setupType: 'upload',
    fileTypes: ['application/zip', 'text/csv', 'application/json'],
    instructions: 'Garmin Connect → Profile → Data Management → Export',
    premium: false,
    aiImpact: 'MEDIUM — VO2 max and training load inform programming blocks',
  },
  {
    id: '23andme',
    name: '23andMe',
    icon: '🧬',
    description: 'Power vs. endurance genetics, injury risk markers, recovery speed',
    badge: 'Raw DNA',
    badgeColor: '#9B59B6',
    category: 'genomic',
    setupType: 'upload',
    fileTypes: ['text/plain', 'application/gzip', 'application/zip'],
    instructions: '23andMe → Settings → 23andMe Data → Download Raw Data → All DNA Data',
    premium: true,
    aiImpact: 'HIGHEST — your genetics inform training modality, injury prevention, and nutrition strategy',
    disclaimer: 'Raw data is encrypted at rest. We extract only fitness-relevant SNPs. Your data is never sold or shared.',
  },
  {
    id: 'ancestry',
    name: 'AncestryDNA',
    icon: '🧬',
    description: 'Same genomic markers as 23andMe — power, endurance, recovery',
    badge: 'Raw DNA',
    badgeColor: '#9B59B6',
    category: 'genomic',
    setupType: 'upload',
    fileTypes: ['text/plain', 'application/zip'],
    instructions: 'AncestryDNA → Settings → Download Raw DNA Data → Request Download',
    premium: true,
    aiImpact: 'HIGHEST — personalized training and nutrition from your actual genetic profile',
    disclaimer: 'Raw data is encrypted at rest. We extract only fitness-relevant SNPs. Your data is never sold or shared.',
  },
  {
    id: 'blood_work',
    name: 'Blood Work / Labs',
    icon: '🩸',
    description: 'Testosterone, cortisol, Vitamin D, iron, thyroid — metabolic picture',
    badge: 'Upload PDF',
    badgeColor: '#E74C3C',
    category: 'medical',
    setupType: 'upload',
    fileTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    instructions: 'Upload PDF or photo of your most recent blood panel',
    premium: true,
    aiImpact: 'HIGH — deficiencies and hormonal profile directly affect training and recovery recommendations',
    disclaimer: 'We extract training-relevant markers only. This does not constitute medical advice.',
  },
  {
    id: 'dexa',
    name: 'DEXA Scan',
    icon: '🦴',
    description: 'Precise body composition: muscle mass, fat mass, bone density by region',
    badge: 'Upload PDF',
    badgeColor: '#F39C12',
    category: 'medical',
    setupType: 'upload',
    fileTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    instructions: 'Upload your DEXA scan results PDF',
    premium: true,
    aiImpact: 'HIGH — regional body composition drives targeted muscle group programming',
    disclaimer: 'Results are stored encrypted and used only for personalized recommendations.',
  },
];

// ── GENOMIC FITNESS MARKERS ────────────────────────────────────
// The SNPs we care about for fitness programming
// Each entry: rsID → what it means for training
export const FITNESS_SNPS = {
  // Power vs Endurance
  'rs1815739': { gene: 'ACTN3', trait: 'muscle_fiber_type',
    CC: 'power athlete profile — fast-twitch dominant',
    CT: 'mixed fiber profile — versatile',
    TT: 'endurance profile — slow-twitch dominant',
  },
  'rs4253778': { gene: 'PPARA', trait: 'fat_oxidation',
    CC: 'efficient fat burner — low carb protocols may work well',
    CG: 'mixed fuel utilization',
    GG: 'carbohydrate-dependent — needs adequate carbs for performance',
  },

  // Recovery speed
  'rs1800012': { gene: 'COL1A1', trait: 'tendon_injury_risk',
    GG: 'lower injury risk',
    GT: 'moderate injury risk — prioritize mobility and warmup',
    TT: 'higher tendon injury risk — increase warm-up, avoid overuse',
  },
  'rs1800051': { gene: 'COL5A1', trait: 'flexibility_injury',
    CC: 'lower soft tissue injury risk',
    CT: 'moderate soft tissue risk',
    TT: 'higher soft tissue injury risk — prioritize stretching and eccentric loading',
  },

  // VO2 Max potential
  'rs8192678': { gene: 'PPARGC1A', trait: 'vo2max_trainability',
    AA: 'high VO2 max trainability — responds well to endurance training',
    AG: 'average trainability',
    GG: 'lower endurance trainability — focus on intensity over volume',
  },

  // Inflammation / Recovery
  'rs1800795': { gene: 'IL6', trait: 'inflammation_recovery',
    GG: 'lower inflammatory response — faster recovery',
    GC: 'moderate inflammatory response',
    CC: 'higher inflammatory response — prioritize anti-inflammatory nutrition and sleep',
  },

  // Cardiac response
  'rs1049730': { gene: 'ADRB2', trait: 'cardio_response',
    AA: 'strong cardiac response to training',
    AG: 'moderate response',
    GG: 'may need higher intensity to drive cardiac adaptations',
  },

  // Caffeine metabolism
  'rs762551': { gene: 'CYP1A2', trait: 'caffeine_metabolism',
    AA: 'fast caffeine metabolizer — pre-workout timing can be earlier',
    AC: 'moderate metabolizer',
    CC: 'slow caffeine metabolizer — avoid caffeine after 2pm, may impair sleep',
  },

  // Vitamin D metabolism
  'rs2228570': { gene: 'VDR', trait: 'vitamin_d',
    CC: 'normal Vitamin D receptor function',
    CT: 'moderately reduced — consider higher Vitamin D supplementation',
    TT: 'reduced Vitamin D receptor function — likely needs higher dose supplementation',
  },

  // Lactate clearance
  'rs1049434': { gene: 'MCT1', trait: 'lactate_clearance',
    AA: 'efficient lactate clearance — handles high-intensity well',
    AT: 'average lactate clearance',
    TT: 'slower lactate clearance — longer rest periods needed at high intensity',
  },
};

// ── PARSE 23ANDME / ANCESTRYDNA RAW FILE ──────────────────────
export const parseGenomicFile = async (fileUri, provider = '23andme') => {
  try {
    const content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const lines = content.split('\n').filter(l => l && !l.startsWith('#'));
    const snpMap = {};

    for (const line of lines) {
      // Both 23andMe and AncestryDNA format: rsID  chromosome  position  genotype
      const parts = line.trim().split('\t');
      if (parts.length >= 4) {
        const rsid = parts[0];
        const genotype = parts[3];
        if (rsid.startsWith('rs')) {
          snpMap[rsid] = genotype;
        }
      }
    }

    // Extract fitness-relevant SNPs
    const findings = {};
    let genesFound = 0;

    for (const [rsid, marker] of Object.entries(FITNESS_SNPS)) {
      const genotype = snpMap[rsid];
      if (genotype) {
        genesFound++;
        const genotypeSorted = genotype.split('').sort().join('');
        const interpretation = marker[genotypeSorted] || marker[genotype] || `${genotype} — analyzing`;
        findings[rsid] = {
          gene: marker.gene,
          trait: marker.trait,
          genotype,
          interpretation,
        };
      }
    }

    return {
      success: true,
      provider,
      snpsAnalyzed: Object.keys(snpMap).length,
      fitnessMarkersFound: genesFound,
      findings,
      parsedAt: new Date().toISOString(),
    };

  } catch (e) {
    return { success: false, error: e.message };
  }
};

// ── PARSE OURA EXPORT ─────────────────────────────────────────
export const parseOuraExport = (csvContent) => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return { success: false, error: 'Empty file' };

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const records = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  }).filter(r => r.date || r.summary_date);

  // Extract key metrics
  const latest = records[records.length - 1] || {};
  return {
    success: true,
    provider: 'oura',
    latest: {
      readinessScore: parseInt(latest.readiness || latest.readiness_score || 0),
      sleepScore: parseInt(latest.sleep || latest.sleep_score || 0),
      activityScore: parseInt(latest.activity || latest.activity_score || 0),
      hrvAvg: parseFloat(latest.average_hrv || latest.hrv_average || 0),
      restingHR: parseInt(latest.lowest_resting_heart_rate || latest.resting_heart_rate || 0),
      sleepHrs: parseFloat(latest.total_sleep_duration || 0) / 3600 || parseFloat(latest.sleep_duration || 0),
      bodyTemp: parseFloat(latest.skin_temperature_delta || latest.temperature_delta || 0),
    },
    trend: records.slice(-30).map(r => ({
      date: r.date || r.summary_date,
      readiness: parseInt(r.readiness || r.readiness_score || 0),
      hrv: parseFloat(r.average_hrv || r.hrv_average || 0),
      sleep: parseFloat(r.total_sleep_duration || 0) / 3600,
    })),
    records: records.length,
    parsedAt: new Date().toISOString(),
  };
};

// ── PARSE WHOOP EXPORT ────────────────────────────────────────
export const parseWhoopExport = (csvContent) => {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return { success: false, error: 'Empty file' };

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
  const records = lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i]]));
  });

  const latest = records[records.length - 1] || {};
  return {
    success: true,
    provider: 'whoop',
    latest: {
      recoveryScore: parseFloat(latest['recovery score %'] || latest.recovery || 0),
      hrv: parseFloat(latest['heart rate variability (ms)'] || latest.hrv || 0),
      restingHR: parseFloat(latest['resting heart rate (bpm)'] || latest.rhr || 0),
      sleepPerformance: parseFloat(latest['sleep performance %'] || latest.sleep || 0),
      strain: parseFloat(latest['day strain'] || latest.strain || 0),
    },
    trend: records.slice(-30).map(r => ({
      date: r.date,
      recovery: parseFloat(r['recovery score %'] || r.recovery || 0),
      hrv: parseFloat(r['heart rate variability (ms)'] || r.hrv || 0),
      strain: parseFloat(r['day strain'] || r.strain || 0),
    })),
    parsedAt: new Date().toISOString(),
  };
};

// ── UPLOAD TO SUPABASE STORAGE ────────────────────────────────
export const uploadDataFile = async (supabase, userId, fileUri, sourceId, fileName) => {
  try {
    const fileContent = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const path = `${userId}/${sourceId}/${Date.now()}_${fileName}`;
    const { data, error } = await supabase.storage
      .from('client-data')
      .upload(path, decode(fileContent), {
        contentType: getContentType(fileName),
        upsert: false,
      });

    if (error) throw error;
    return { success: true, path: data.path };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

// ── BUILD AI CONTEXT FROM ALL DATA SOURCES ────────────────────
export const buildFullDataContext = (profile, healthMetrics, genomicData, wearableData) => {
  const sections = [];

  // Apple Health
  if (healthMetrics && !healthMetrics.error) {
    const { buildHealthContext } = require('./healthkit');
    sections.push(buildHealthContext(healthMetrics));
  }

  // Genomic data
  if (genomicData?.findings && Object.keys(genomicData.findings).length > 0) {
    const lines = ['\n\nGENOMIC FITNESS PROFILE:'];
    const findings = genomicData.findings;

    const traitLines = {
      muscle_fiber_type: findings[Object.keys(findings).find(k => findings[k].trait === 'muscle_fiber_type')],
      fat_oxidation: findings[Object.keys(findings).find(k => findings[k].trait === 'fat_oxidation')],
      lactate_clearance: findings[Object.keys(findings).find(k => findings[k].trait === 'lactate_clearance')],
      tendon_injury_risk: findings[Object.keys(findings).find(k => findings[k].trait === 'tendon_injury_risk')],
      inflammation_recovery: findings[Object.keys(findings).find(k => findings[k].trait === 'inflammation_recovery')],
      caffeine_metabolism: findings[Object.keys(findings).find(k => findings[k].trait === 'caffeine_metabolism')],
      vitamin_d: findings[Object.keys(findings).find(k => findings[k].trait === 'vitamin_d')],
    };

    Object.entries(traitLines).forEach(([trait, finding]) => {
      if (finding) lines.push(`${finding.gene} (${trait.replace(/_/g,' ')}): ${finding.interpretation}`);
    });

    sections.push(lines.join('\n'));
  }

  // Oura data
  if (wearableData?.oura?.latest) {
    const o = wearableData.oura.latest;
    sections.push(`\n\nOURA RING DATA:
Readiness score: ${o.readinessScore}/100${o.readinessScore >= 70 ? ' — ready to push' : o.readinessScore >= 50 ? ' — moderate effort' : ' — take it easy'}
Sleep score: ${o.sleepScore}/100
HRV: ${o.hrvAvg}ms
Resting HR: ${o.restingHR}bpm${o.bodyTemp ? `\nBody temp delta: ${o.bodyTemp > 0.5 ? '+' : ''}${o.bodyTemp}°C` : ''}`);
  }

  // Whoop data
  if (wearableData?.whoop?.latest) {
    const w = wearableData.whoop.latest;
    sections.push(`\n\nWHOOP DATA:
Recovery: ${w.recoveryScore}%${w.recoveryScore >= 67 ? ' — green (train hard)' : w.recoveryScore >= 34 ? ' — yellow (train moderately)' : ' — red (recover today)'}
HRV: ${w.hrv}ms
Resting HR: ${w.restingHR}bpm
Yesterday's strain: ${w.strain}/21`);
  }

  // Blood work
  if (wearableData?.bloodWork) {
    sections.push(`\n\nBLOOD MARKERS:\n${wearableData.bloodWork}`);
  }

  return sections.join('');
};

// ── TRAINING RECOMMENDATIONS FROM GENOMICS ────────────────────
export const getGenomicTrainingInsights = (findings) => {
  if (!findings) return [];
  const insights = [];

  const get = (trait) => Object.values(findings).find(f => f.trait === trait);

  const fiber = get('muscle_fiber_type');
  if (fiber?.genotype) {
    if (fiber.genotype === 'CC') insights.push({ type: 'strength', text: 'Your ACTN3 profile suggests a power/strength bias — prioritize heavy compound lifts and explosive training.' });
    if (fiber.genotype === 'TT') insights.push({ type: 'endurance', text: 'Your ACTN3 profile suggests an endurance bias — longer moderate-intensity sessions will yield better results than short high-intensity work.' });
  }

  const injury = get('tendon_injury_risk');
  if (injury?.genotype === 'TT') {
    insights.push({ type: 'injury', text: 'Elevated tendon injury risk (COL1A1). Extend warm-ups to 15+ min, prioritize eccentric loading in KB training, avoid volume spikes.' });
  }

  const lactate = get('lactate_clearance');
  if (lactate?.genotype === 'TT') {
    insights.push({ type: 'recovery', text: 'Slower lactate clearance (MCT1). Take full 2-3 min rest between heavy KB sets. HIIT-style minimal rest protocols may not suit you.' });
  }

  const inflammation = get('inflammation_recovery');
  if (inflammation?.genotype === 'CC') {
    insights.push({ type: 'nutrition', text: 'Higher inflammatory response (IL6). Prioritize omega-3s, anti-inflammatory foods, and 8+ hrs sleep post-intense sessions.' });
  }

  const caffeine = get('caffeine_metabolism');
  if (caffeine?.genotype === 'CC') {
    insights.push({ type: 'nutrition', text: 'Slow caffeine metabolizer (CYP1A2). Cut caffeine by 2pm or it will impair your sleep quality and next-day HRV.' });
  }

  const vitD = get('vitamin_d');
  if (vitD?.genotype === 'TT') {
    insights.push({ type: 'supplement', text: 'Reduced Vitamin D receptor function (VDR). Standard 2,000IU may be insufficient — consider 4,000–5,000IU with K2, and test levels every 6 months.' });
  }

  return insights;
};

// ── HELPERS ────────────────────────────────────────────────────
const getContentType = (fileName) => {
  if (fileName.endsWith('.pdf')) return 'application/pdf';
  if (fileName.endsWith('.csv')) return 'text/csv';
  if (fileName.endsWith('.json')) return 'application/json';
  if (fileName.endsWith('.zip')) return 'application/zip';
  if (fileName.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
};

const decode = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};
