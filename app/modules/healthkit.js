// ══════════════════════════════════════════════════════════════
// HEALTHKIT INTEGRATION MODULE
// File: app/modules/healthkit.js
//
// Setup: expo install expo-health
// Requires iOS only — gracefully degrades on Android/Web
// ══════════════════════════════════════════════════════════════

import { Platform } from 'react-native';

// Lazy import — only loads on iOS
let Health = null;
const getHealth = async () => {
  if (Platform.OS !== 'ios') return null;
  if (!Health) {
    try {
      Health = await import('expo-health');
    } catch {
      console.warn('expo-health not installed. Run: expo install expo-health');
      return null;
    }
  }
  return Health;
};

// ── PERMISSION SET ─────────────────────────────────────────────
// Everything we want to read from Apple Health
const READ_PERMISSIONS = [
  'HeartRateVariabilitySDNN',  // HRV — primary signal
  'RestingHeartRate',           // RHR
  'HeartRate',                  // Active HR
  'SleepAnalysis',              // Sleep stages + duration
  'ActiveEnergyBurned',         // Calories out
  'BasalEnergyBurned',          // BMR
  'StepCount',                  // Daily steps
  'DistanceWalkingRunning',     // Running distance
  'Workout',                    // All workout sessions
  'BodyMass',                   // Weight
  'BodyFatPercentage',          // Body fat %
  'OxygenSaturation',           // SpO2
  'RespiratoryRate',            // Breathing
  'AppleExerciseTime',          // Apple exercise minutes
  'AppleStandTime',             // Stand time
  'VO2Max',                     // Cardio fitness
  'WalkingHeartRateAverage',    // Walking HR
  'BloodPressureSystolic',      // Blood pressure (if logged)
  'BloodPressureDiastolic',
];

// ── REQUEST PERMISSIONS ────────────────────────────────────────
export const requestHealthKitPermissions = async () => {
  const Health = await getHealth();
  if (!Health) return { granted: false, platform: Platform.OS };

  try {
    const result = await Health.requestPermissionsAsync({
      read: READ_PERMISSIONS,
      write: ['HeartRateVariabilitySDNN', 'BodyMass'], // optional write-back
    });
    return { granted: result.status === 'granted', status: result.status };
  } catch (e) {
    console.error('HealthKit permission error:', e);
    return { granted: false, error: e.message };
  }
};

// ── CHECK AVAILABILITY ─────────────────────────────────────────
export const isHealthKitAvailable = async () => {
  if (Platform.OS !== 'ios') return false;
  const Health = await getHealth();
  if (!Health) return false;
  try {
    return await Health.isAvailableAsync();
  } catch {
    return false;
  }
};

// ── FETCH TODAY'S METRICS ──────────────────────────────────────
export const fetchTodayMetrics = async () => {
  const Health = await getHealth();
  if (!Health) return getMockData(); // return mock for dev/web

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(startOfDay);
  yesterday.setDate(yesterday.getDate() - 1);

  const results = {};

  try {
    // HRV — get morning reading (last night's average)
    const hrv = await Health.queryAsync('HeartRateVariabilitySDNN', {
      startDate: yesterday,
      endDate: now,
      limit: 10,
      ascending: false,
    });
    if (hrv?.length) {
      results.hrv = Math.round(hrv[0].quantity);
      results.hrvSamples = hrv.map(s => ({ value: Math.round(s.quantity), time: s.startDate }));
    }

    // Resting Heart Rate
    const rhr = await Health.queryAsync('RestingHeartRate', {
      startDate: yesterday,
      endDate: now,
      limit: 1,
      ascending: false,
    });
    if (rhr?.length) results.restingHR = Math.round(rhr[0].quantity);

    // Sleep
    const sleep = await Health.queryAsync('SleepAnalysis', {
      startDate: yesterday,
      endDate: now,
    });
    if (sleep?.length) {
      const inBed = sleep.filter(s => s.value === 'inBed');
      const asleep = sleep.filter(s => s.value === 'asleep' || s.value === 'asleepCore' || s.value === 'asleepDeep' || s.value === 'asleepREM');
      const deepSleep = sleep.filter(s => s.value === 'asleepDeep');
      const remSleep = sleep.filter(s => s.value === 'asleepREM');

      const totalMs = (arr) => arr.reduce((sum, s) => {
        return sum + (new Date(s.endDate) - new Date(s.startDate));
      }, 0);

      results.sleep = {
        totalHrs: Math.round((totalMs(asleep) / 3600000) * 10) / 10,
        deepHrs: Math.round((totalMs(deepSleep) / 3600000) * 10) / 10,
        remHrs: Math.round((totalMs(remSleep) / 3600000) * 10) / 10,
        inBedHrs: Math.round((totalMs(inBed) / 3600000) * 10) / 10,
      };
    }

    // Steps
    const steps = await Health.queryAsync('StepCount', {
      startDate: startOfDay,
      endDate: now,
    });
    if (steps?.length) {
      results.steps = steps.reduce((sum, s) => sum + s.quantity, 0);
    }

    // Active Calories
    const activeCalories = await Health.queryAsync('ActiveEnergyBurned', {
      startDate: startOfDay,
      endDate: now,
    });
    if (activeCalories?.length) {
      results.activeCalories = Math.round(activeCalories.reduce((sum, s) => sum + s.quantity, 0));
    }

    // Body Weight (most recent)
    const weight = await Health.queryAsync('BodyMass', {
      startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate: now,
      limit: 1,
      ascending: false,
    });
    if (weight?.length) results.weightLbs = Math.round(weight[0].quantity * 2.20462 * 10) / 10;

    // Body Fat
    const bodyFat = await Health.queryAsync('BodyFatPercentage', {
      startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: now,
      limit: 1,
      ascending: false,
    });
    if (bodyFat?.length) results.bodyFatPct = Math.round(bodyFat[0].quantity * 100 * 10) / 10;

    // VO2 Max
    const vo2 = await Health.queryAsync('VO2Max', {
      startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      endDate: now,
      limit: 1,
      ascending: false,
    });
    if (vo2?.length) results.vo2max = Math.round(vo2[0].quantity * 10) / 10;

    // Recent workouts (last 7 days)
    const workouts = await Health.queryAsync('Workout', {
      startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      endDate: now,
    });
    if (workouts?.length) {
      results.recentWorkouts = workouts.map(w => ({
        type: w.workoutActivityType,
        durationMins: Math.round((new Date(w.endDate) - new Date(w.startDate)) / 60000),
        calories: Math.round(w.totalEnergyBurned || 0),
        date: w.startDate,
      }));
    }

    results.source = 'apple_health';
    results.syncedAt = new Date().toISOString();
    return results;

  } catch (e) {
    console.error('HealthKit fetch error:', e);
    return { error: e.message, source: 'error' };
  }
};

// ── FETCH HRV TREND (last 30 days) ────────────────────────────
export const fetchHRVTrend = async (days = 30) => {
  const Health = await getHealth();
  if (!Health) return generateMockHRVTrend(days);

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const data = await Health.queryAsync('HeartRateVariabilitySDNN', {
      startDate: start,
      endDate: now,
      ascending: true,
    });

    // Group by day, take morning average
    const byDay = {};
    data.forEach(sample => {
      const day = new Date(sample.startDate).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(sample.quantity);
    });

    return Object.entries(byDay).map(([date, values]) => ({
      date,
      hrv: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    }));
  } catch (e) {
    return [];
  }
};

// ── FETCH SLEEP TREND ─────────────────────────────────────────
export const fetchSleepTrend = async (days = 14) => {
  const Health = await getHealth();
  if (!Health) return [];

  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const data = await Health.queryAsync('SleepAnalysis', {
      startDate: start,
      endDate: now,
      ascending: true,
    });

    const byNight = {};
    data.filter(s => s.value === 'asleep' || s.value === 'asleepCore').forEach(s => {
      const night = new Date(s.startDate).toISOString().split('T')[0];
      if (!byNight[night]) byNight[night] = 0;
      byNight[night] += (new Date(s.endDate) - new Date(s.startDate)) / 3600000;
    });

    return Object.entries(byNight).map(([date, hrs]) => ({
      date,
      sleepHrs: Math.round(hrs * 10) / 10,
    }));
  } catch {
    return [];
  }
};

// ── BUILD AI CONTEXT FROM HEALTH DATA ─────────────────────────
// This feeds into the AI coach system prompt
export const buildHealthContext = (metrics) => {
  if (!metrics || metrics.error) return '';

  const lines = [];

  if (metrics.hrv) {
    const hrvStatus = metrics.hrv > 70 ? 'high (recover well, train hard)' :
                      metrics.hrv > 50 ? 'moderate (normal training)' :
                      metrics.hrv > 35 ? 'low (consider reducing intensity)' :
                      'very low (prioritize recovery today)';
    lines.push(`Current HRV: ${metrics.hrv}ms — ${hrvStatus}`);
  }

  if (metrics.restingHR) lines.push(`Resting heart rate: ${metrics.restingHR}bpm`);
  if (metrics.sleep) {
    lines.push(`Last night's sleep: ${metrics.sleep.totalHrs}hrs total (${metrics.sleep.deepHrs}hrs deep, ${metrics.sleep.remHrs}hrs REM)`);
    const sleepQuality = metrics.sleep.totalHrs >= 7.5 ? 'well-rested' : metrics.sleep.totalHrs >= 6 ? 'adequately rested' : 'under-slept — take it easy';
    lines.push(`Sleep assessment: ${sleepQuality}`);
  }
  if (metrics.steps) lines.push(`Steps today: ${metrics.steps.toLocaleString()}`);
  if (metrics.activeCalories) lines.push(`Active calories burned: ${metrics.activeCalories}`);
  if (metrics.weightLbs) lines.push(`Body weight: ${metrics.weightLbs}lbs`);
  if (metrics.bodyFatPct) lines.push(`Body fat: ${metrics.bodyFatPct}%`);
  if (metrics.vo2max) lines.push(`VO2 max: ${metrics.vo2max} (cardio fitness)`);

  if (metrics.recentWorkouts?.length) {
    lines.push(`Recent workouts (7 days): ${metrics.recentWorkouts.length} sessions — ${metrics.recentWorkouts.map(w => `${w.type} ${w.durationMins}min`).join(', ')}`);
  }

  return lines.length ? `\n\nLIVE APPLE HEALTH DATA:\n${lines.join('\n')}` : '';
};

// ── MOCK DATA (dev / non-iOS) ──────────────────────────────────
const getMockData = () => ({
  hrv: 58,
  restingHR: 54,
  sleep: { totalHrs: 7.2, deepHrs: 1.4, remHrs: 1.8, inBedHrs: 7.9 },
  steps: 6840,
  activeCalories: 312,
  weightLbs: 185.4,
  bodyFatPct: 18.2,
  vo2max: 44.1,
  recentWorkouts: [
    { type: 'Soccer', durationMins: 65, calories: 520, date: new Date().toISOString() },
    { type: 'FunctionalStrengthTraining', durationMins: 42, calories: 280, date: new Date().toISOString() },
  ],
  source: 'mock',
  syncedAt: new Date().toISOString(),
});

const generateMockHRVTrend = (days) => {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));
    return {
      date: date.toISOString().split('T')[0],
      hrv: Math.round(50 + Math.sin(i * 0.4) * 15 + (Math.random() - 0.5) * 8),
    };
  });
};

// ── WORKOUT TYPE MAPPING ───────────────────────────────────────
export const HK_WORKOUT_LABELS = {
  'AmericanFootball': 'Football',
  'Archery': 'Archery',
  'AustralianFootball': 'Football',
  'Badminton': 'Badminton',
  'Baseball': 'Baseball',
  'Basketball': 'Basketball',
  'Bowling': 'Bowling',
  'Boxing': 'Boxing',
  'Climbing': 'Climbing',
  'Cricket': 'Cricket',
  'CrossTraining': 'Cross Training',
  'Curling': 'Curling',
  'Cycling': 'Cycling',
  'Dance': 'Dance',
  'Elliptical': 'Elliptical',
  'EquestrianSports': 'Horse Riding',
  'Fencing': 'Fencing',
  'FishingMinorWaterSports': 'Fishing',
  'FunctionalStrengthTraining': 'Strength Training',
  'Golf': 'Golf',
  'Gymnastics': 'Gymnastics',
  'Handball': 'Handball',
  'Hiking': 'Hiking',
  'Hockey': 'Hockey',
  'Hunting': 'Hunting',
  'Lacrosse': 'Lacrosse',
  'MartialArts': 'Martial Arts',
  'MindAndBody': 'Yoga/Pilates',
  'MixedMetabolicCardioTraining': 'HIIT',
  'PaddleSports': 'Paddling',
  'Play': 'Play',
  'PreparationAndRecovery': 'Recovery',
  'Racquetball': 'Racquetball',
  'Rowing': 'Rowing',
  'Rugby': 'Rugby',
  'Running': 'Run',
  'Sailing': 'Sailing',
  'SkatingSports': 'Skating',
  'SnowSports': 'Snow Sports',
  'Soccer': 'Soccer',
  'Softball': 'Softball',
  'Squash': 'Squash',
  'StairClimbing': 'Stair Climbing',
  'SurfingSports': 'Surfing',
  'Swimming': 'Swimming',
  'TableTennis': 'Table Tennis',
  'Tennis': 'Tennis',
  'TrackAndField': 'Track & Field',
  'TraditionalStrengthTraining': 'Weight Training',
  'Volleyball': 'Volleyball',
  'Walking': 'Walk',
  'WaterFitness': 'Water Fitness',
  'WaterPolo': 'Water Polo',
  'WaterSports': 'Water Sports',
  'Wrestling': 'Wrestling',
  'Yoga': 'Yoga',
  'Other': 'Workout',
};
