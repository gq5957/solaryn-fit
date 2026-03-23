// ══════════════════════════════════════════════════════════════
// SOLARYN FIT — COMMERCIAL APP
// React Native + Expo · Supabase · Stripe · Claude API
// ══════════════════════════════════════════════════════════════
// Setup: npm install @supabase/supabase-js @stripe/stripe-react-native
//        expo install expo-secure-store expo-linear-gradient
// ══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Dimensions, Animated, Platform, KeyboardAvoidingView,
  Modal, Alert, ActivityIndicator, FlatList, Switch
} from 'react-native';
import { createClient } from '@supabase/supabase-js';

const { width } = Dimensions.get('window');
const isWeb = Platform.OS === 'web';

// ── CONFIG (replace with your values) ─────────────────────────
const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  || 'https://bhjmebxgcmcmwoeqxxvs.supabase.co';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON || 'sb_publishable_tY3mw8BgW-U9qgs4FUUxIg_t2qDwEVQ';
const STRIPE_KEY    = process.env.EXPO_PUBLIC_STRIPE_KEY    || 'pk_test_YOUR_KEY';
const API_BASE      = process.env.EXPO_PUBLIC_API_URL        || 'https://solaryn-fit.vercel.app/api';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── DESIGN TOKENS ──────────────────────────────────────────────
const C = {
  bg: '#0A0A0F', surface: '#111118', card: '#16161F', border: '#1E1E2A',
  gold: '#C9A84C', goldDim: '#8A6E2F', goldGlow: 'rgba(201,168,76,0.12)',
  white: '#F0EFE8', muted: '#6B6A7A', dim: '#3A3950',
  green: '#2ECC71', blue: '#4A9EFF', red: '#E74C3C', orange: '#F39C12',
  purple: '#9B59B6',
};

// ── PRICING TIERS ─────────────────────────────────────────────
const TIERS = [
  {
    id: 'free', name: 'Free', price: '$0', period: '',
    color: C.muted, badge: null,
    features: ['AI coach (10 msgs/day)', 'Standard workouts', 'Basic tracking', 'Web app only'],
    stripePriceId: null,
    cta: 'Start free',
  },
  {
    id: 'app', name: 'App', price: '$19', period: '/mo',
    color: C.blue, badge: null,
    features: ['Unlimited AI coach', 'Custom workout programs', 'Full progress tracking', 'iOS + Web app', 'Meal logging'],
    stripePriceId: process.env.EXPO_PUBLIC_STRIPE_APP_PRICE,
    cta: 'Start 7-day trial',
  },
  {
    id: 'coached', name: 'Coached', price: '$299', period: '/mo',
    color: C.gold, badge: 'Most popular',
    features: ['Everything in App', '1:1 with Esteban Frias', 'Custom weekly programs', 'Direct messaging', 'Monthly check-in call', 'Nutrition guidance'],
    stripePriceId: process.env.EXPO_PUBLIC_STRIPE_COACHED_PRICE,
    cta: 'Apply for coaching',
  },
  {
    id: 'elite', name: 'Elite', price: '$599', period: '/mo',
    color: C.purple, badge: 'Limited spots',
    features: ['Everything in Coached', 'Weekly 1:1 calls', 'Same-day response', 'Travel program adjustments', 'Race/event programming', 'Priority access'],
    stripePriceId: process.env.EXPO_PUBLIC_STRIPE_ELITE_PRICE,
    cta: 'Apply for elite',
  },
];

// ── AUTH CONTEXT ───────────────────────────────────────────────
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (id) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
    setProfile(data);
    setLoading(false);
  };

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signUp = (email, password, name) => supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
  const signOut = () => supabase.auth.signOut();
  const updateProfile = async (updates) => {
    const { data } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single();
    setProfile(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateProfile, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// ══════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════
export default function App() {
  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}

function AppNavigator() {
  const { user, profile, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <AuthScreen />;
  if (!profile?.onboarded) return <OnboardingScreen />;
  return <MainApp />;
}

// ══════════════════════════════════════════════════════════════
// SPLASH
// ══════════════════════════════════════════════════════════════
function SplashScreen() {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start(); }, []);
  return (
    <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
      <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
        <Text style={s.splashBrand}>SOLARYN FIT</Text>
        <ActivityIndicator color={C.gold} style={{ marginTop: 24 }} />
      </Animated.View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// AUTH SCREEN
// ══════════════════════════════════════════════════════════════
function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'pricing'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async () => {
    setError(''); setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: e } = await signUp(email, password, name);
        if (e) throw e;
      } else {
        const { error: e } = await signIn(email, password);
        if (e) throw e;
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  if (mode === 'pricing') return <PricingScreen onBack={() => setMode('signin')} onSelect={() => setMode('signup')} />;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.authContainer} showsVerticalScrollIndicator={false}>
        <Text style={s.splashBrand}>SOLARYN FIT</Text>
        <Text style={s.authTagline}>Your personal fitness OS</Text>

        <View style={s.card}>
          <Text style={s.cardLabel}>{mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}</Text>
          {mode === 'signup' && (
            <TextInput style={s.input} placeholder="Full name" placeholderTextColor={C.muted}
              value={name} onChangeText={setName} autoCapitalize="words" />
          )}
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Email" placeholderTextColor={C.muted}
            value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={[s.input, { marginTop: 8 }]} placeholder="Password" placeholderTextColor={C.muted}
            value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={s.errorText}>{error}</Text> : null}
          <TouchableOpacity style={[s.btnPrimary, { marginTop: 16 }]} onPress={handleAuth} disabled={loading}>
            {loading ? <ActivityIndicator color={C.bg} /> : <Text style={s.btnPrimaryText}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={s.linkText}>{mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.btnOutline} onPress={() => setMode('pricing')}>
          <Text style={s.btnOutlineText}>View pricing & plans</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════════════
// PRICING SCREEN
// ══════════════════════════════════════════════════════════════
function PricingScreen({ onBack, onSelect }) {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={s.headerBrand}>PLANS</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>CHOOSE YOUR LEVEL</Text>
        {TIERS.map(tier => (
          <View key={tier.id} style={[s.tierCard, { borderColor: tier.color + '44' }]}>
            {tier.badge && (
              <View style={[s.tierBadge, { backgroundColor: tier.color + '22', borderColor: tier.color + '44' }]}>
                <Text style={[s.tierBadgeText, { color: tier.color }]}>{tier.badge}</Text>
              </View>
            )}
            <View style={s.tierHeader}>
              <Text style={s.tierName}>{tier.name}</Text>
              <View style={s.tierPrice}>
                <Text style={[s.tierPriceNum, { color: tier.color }]}>{tier.price}</Text>
                <Text style={s.tierPricePer}>{tier.period}</Text>
              </View>
            </View>
            {tier.features.map(f => (
              <View key={f} style={s.featureRow}>
                <Text style={[s.featureDot, { color: tier.color }]}>✓</Text>
                <Text style={s.featureText}>{f}</Text>
              </View>
            ))}
            <TouchableOpacity style={[s.btnPrimary, { backgroundColor: tier.color, marginTop: 12 }]} onPress={onSelect}>
              <Text style={[s.btnPrimaryText, { color: tier.id === 'free' ? C.white : C.bg }]}>{tier.cta}</Text>
            </TouchableOpacity>
          </View>
        ))}
        <View style={s.whitelabelCard}>
          <Text style={s.wlTitle}>Are you a fitness coach?</Text>
          <Text style={s.wlSub}>White-label this platform under your own brand. Custom colors, your logo, your clients.</Text>
          <Text style={s.wlPrice}>Starting at $997/mo</Text>
          <TouchableOpacity style={[s.btnOutline, { marginTop: 12 }]}>
            <Text style={s.btnOutlineText}>Contact for white-label →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════════
function OnboardingScreen() {
  const { updateProfile, profile, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    full_name: profile?.full_name || '',
    date_of_birth: '',
    language: 'en',
    activity_level: 'intermediate',
    goals: [],
    equipment: [],
    diet_proteins: [],
    supplements: [],
    schedule: {
      0: 'recovery', 1: 'soccer', 2: 'pilates',
      3: 'kettlebell', 4: 'soccer', 5: 'run', 6: 'recovery'
    }
  });

  const STEPS = [
    { title: "Let's get to know you", subtitle: 'Basic info' },
    { title: 'Your goals', subtitle: 'What are you training for?' },
    { title: 'Your schedule', subtitle: 'What does your week look like?' },
    { title: 'Your diet', subtitle: 'How do you fuel?' },
    { title: "You're all set", subtitle: 'Start training' },
  ];

  const toggleItem = (field, val) => {
    setData(d => ({
      ...d,
      [field]: d[field].includes(val)
        ? d[field].filter(x => x !== val)
        : [...d[field], val]
    }));
  };

  const finish = async () => {
    await updateProfile({ ...data, onboarded: true });
  };

  const GOAL_OPTIONS = ['Lose body fat', 'Build muscle', 'Improve endurance', 'Soccer performance', 'Increase HRV', 'Run a race', 'General fitness', 'Stress management'];
  const EQUIP_OPTIONS = ['Kettlebells', 'Barbell + plates', 'Pull-up bar', 'Resistance bands', 'Dumbbells', 'Gym membership', 'No equipment'];
  const PROTEIN_OPTIONS = ['Chicken', 'Beef', 'Fish', 'Pork', 'Eggs', 'Plant-based', 'Whey protein', 'Vegan protein'];
  const SUPP_OPTIONS = ['Creatine', 'Vitamin D', 'Magnesium', 'Fish oil', 'Collagen', 'Electrolytes', 'Pre-workout', 'Melatonin'];
  const SCHED_TYPES = ['soccer', 'kettlebell', 'pilates', 'run', 'cardio', 'recovery', 'off'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <View style={s.root}>
      {/* Progress bar */}
      <View style={s.progressBar}>
        <View style={[s.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.onboardTitle}>{STEPS[step].title}</Text>
        <Text style={s.onboardSub}>{STEPS[step].subtitle}</Text>

        {step === 0 && (
          <View style={s.card}>
            <Text style={s.inputLabel}>FULL NAME</Text>
            <TextInput style={s.input} placeholder="Esteban Frias" placeholderTextColor={C.muted}
              value={data.full_name} onChangeText={v => setData(d => ({ ...d, full_name: v }))} />
            <Text style={[s.inputLabel, { marginTop: 12 }]}>PREFERRED LANGUAGE</Text>
            <View style={s.segmented}>
              {['en', 'es'].map(lang => (
                <TouchableOpacity key={lang} style={[s.segmentBtn, data.language === lang && s.segmentActive]}
                  onPress={() => setData(d => ({ ...d, language: lang }))}>
                  <Text style={[s.segmentText, data.language === lang && s.segmentTextActive]}>{lang === 'en' ? 'English' : 'Español'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.inputLabel, { marginTop: 12 }]}>ACTIVITY LEVEL</Text>
            <View style={s.segmented}>
              {['beginner', 'intermediate', 'advanced'].map(level => (
                <TouchableOpacity key={level} style={[s.segmentBtn, data.activity_level === level && s.segmentActive]}
                  onPress={() => setData(d => ({ ...d, activity_level: level }))}>
                  <Text style={[s.segmentText, data.activity_level === level && s.segmentTextActive]}>{level}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={s.card}>
            <Text style={s.inputLabel}>SELECT ALL THAT APPLY</Text>
            <View style={s.chipGrid}>
              {GOAL_OPTIONS.map(g => (
                <TouchableOpacity key={g} style={[s.chip, data.goals.includes(g) && s.chipActive]}
                  onPress={() => toggleItem('goals', g)}>
                  <Text style={[s.chipText, data.goals.includes(g) && s.chipTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.inputLabel, { marginTop: 16 }]}>EQUIPMENT YOU HAVE</Text>
            <View style={s.chipGrid}>
              {EQUIP_OPTIONS.map(e => (
                <TouchableOpacity key={e} style={[s.chip, data.equipment.includes(e) && s.chipActive]}
                  onPress={() => toggleItem('equipment', e)}>
                  <Text style={[s.chipText, data.equipment.includes(e) && s.chipTextActive]}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={s.card}>
            <Text style={s.inputLabel}>TAP EACH DAY TO SET YOUR TRAINING TYPE</Text>
            {DAYS.map((day, i) => (
              <View key={i} style={s.schedRow}>
                <Text style={s.schedDay}>{day}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {SCHED_TYPES.map(type => (
                      <TouchableOpacity key={type}
                        style={[s.schedChip, data.schedule[i] === type && s.schedChipActive]}
                        onPress={() => setData(d => ({ ...d, schedule: { ...d.schedule, [i]: type } }))}>
                        <Text style={[s.schedChipText, data.schedule[i] === type && { color: C.bg }]}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ))}
          </View>
        )}

        {step === 3 && (
          <View style={s.card}>
            <Text style={s.inputLabel}>PROTEIN SOURCES</Text>
            <View style={s.chipGrid}>
              {PROTEIN_OPTIONS.map(p => (
                <TouchableOpacity key={p} style={[s.chip, data.diet_proteins.includes(p) && s.chipActive]}
                  onPress={() => toggleItem('diet_proteins', p)}>
                  <Text style={[s.chipText, data.diet_proteins.includes(p) && s.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[s.inputLabel, { marginTop: 16 }]}>SUPPLEMENTS</Text>
            <View style={s.chipGrid}>
              {SUPP_OPTIONS.map(sup => (
                <TouchableOpacity key={sup} style={[s.chip, data.supplements.includes(sup) && s.chipActive]}
                  onPress={() => toggleItem('supplements', sup)}>
                  <Text style={[s.chipText, data.supplements.includes(sup) && s.chipTextActive]}>{sup}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>💪</Text>
            <Text style={s.tierName}>Profile complete, {data.full_name.split(' ')[0]}.</Text>
            <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>
              Your AI coach is ready. Your first workout is waiting.
            </Text>
          </View>
        )}

        <View style={s.onboardButtons}>
          {step > 0 && (
            <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => setStep(s => s - 1)}>
              <Text style={s.btnSecondaryText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.btnPrimary, { flex: 2 }]}
            onPress={() => step < STEPS.length - 1 ? setStep(s => s + 1) : finish()}>
            <Text style={s.btnPrimaryText}>{step === STEPS.length - 1 ? "Let's go" : 'Continue'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN APP (post-auth, post-onboard)
// ══════════════════════════════════════════════════════════════
function MainApp() {
  const [tab, setTab] = useState('today');
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const { profile } = useAuth();

  const today = new Date();
  const DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const todayScheduleType = profile?.schedule?.[today.getDay()] || 'recovery';
  const ICONS = { soccer:'⚽', kettlebell:'🏋️', pilates:'🧘', run:'🏃', cardio:'🚴', recovery:'🌙', off:'😴' };

  const switchTab = (t) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setTab(t);
  };

  const tabs = [
    { key: 'today',    icon: '⚡', label: 'Today'    },
    { key: 'program',  icon: '📋', label: 'Program'  },
    { key: 'log',      icon: '📊', label: 'Log'      },
    { key: 'coach',    icon: '🤖', label: 'Coach'    },
    { key: 'account',  icon: '👤', label: 'Account'  },
  ];

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View>
          <Text style={s.headerBrand}>SOLARYN FIT</Text>
          <Text style={s.headerSub}>{DAYS_SHORT[today.getDay()]}, {MONTHS[today.getMonth()]} {today.getDate()}</Text>
        </View>
        <View style={s.headerRight}>
          <Text style={{ fontSize: 22 }}>{ICONS[todayScheduleType] || '💪'}</Text>
          <Text style={s.headerDayType}>{todayScheduleType}</Text>
        </View>
      </View>

      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
        {tab === 'today'   && <TodayTab />}
        {tab === 'program' && <ProgramTab />}
        {tab === 'log'     && <LogTab />}
        {tab === 'coach'   && <CoachTab />}
        {tab === 'account' && <AccountTab onSwitchTab={switchTab} />}
      </Animated.View>

      <View style={s.nav}>
        {tabs.map(t => (
          <TouchableOpacity key={t.key} style={s.navItem} onPress={() => switchTab(t.key)}>
            <Text style={s.navIcon}>{t.icon}</Text>
            <Text style={[s.navLabel, tab === t.key && s.navActive]}>{t.label}</Text>
            {tab === t.key && <View style={s.navDot} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// TODAY TAB
// ══════════════════════════════════════════════════════════════
function TodayTab() {
  const { profile } = useAuth();
  const [hrv, setHrv] = useState('');
  const [energy, setEnergy] = useState(null);
  const [checked, setChecked] = useState(false);
  const [logs, setLogs] = useState({});
  const [logModal, setLogModal] = useState(null);
  const [logValue, setLogValue] = useState({ weight: '', sets: '', reps: '', notes: '' });

  const today = new Date();
  const todayKey = today.toISOString().split('T')[0];
  const type = profile?.schedule?.[today.getDay()] || 'recovery';

  const WORKOUTS = {
    soccer: [
      { name: 'Dynamic warm-up', sets: 1, reps: '10 min', notes: 'Leg swings, high knees, hip circles' },
      { name: 'Reactive agility', sets: 3, reps: '30 sec', notes: 'Ladder or cone drills' },
      { name: 'Sprint activation', sets: 4, reps: '20m', notes: '70% effort' },
    ],
    kettlebell: [
      { name: 'KB Swing', sets: 5, reps: 15, notes: 'Hip hinge, explosive' },
      { name: 'Turkish Get-Up', sets: 3, reps: '3/side', notes: 'Controlled' },
      { name: 'KB Clean + Press', sets: 4, reps: '5/side', notes: '' },
      { name: 'Goblet Squat', sets: 4, reps: 12, notes: 'Chest tall' },
      { name: 'KB Row', sets: 3, reps: '10/side', notes: '' },
    ],
    pilates: [
      { name: 'Hundred', sets: 1, reps: 100, notes: '' },
      { name: 'Roll Up', sets: 1, reps: 10, notes: '' },
      { name: 'Swimming', sets: 3, reps: '30 sec', notes: '' },
      { name: 'Side Plank', sets: 2, reps: '45 sec/side', notes: '' },
      { name: 'Teaser', sets: 3, reps: 5, notes: '' },
    ],
    run: [
      { name: 'Easy run', sets: 1, reps: '30 min', notes: 'Zone 2' },
      { name: 'Core finisher', sets: 3, reps: '45 sec', notes: 'Plank, dead bug, bird dog' },
    ],
    recovery: [
      { name: 'Full body stretch', sets: 1, reps: '20 min', notes: '' },
      { name: 'Breathwork', sets: 1, reps: '10 min', notes: '4-7-8 breathing' },
      { name: 'Walk', sets: 1, reps: '20 min', notes: 'Zone 1' },
    ],
  };

  const exercises = WORKOUTS[type] || WORKOUTS.recovery;

  const saveCheckin = async () => {
    if (!hrv && !energy) return;
    await supabase.from('body_stats').insert({
      user_id: (await supabase.auth.getUser()).data.user.id,
      logged_at: todayKey,
      hrv_ms: hrv ? parseFloat(hrv) : null,
    });
    setChecked(true);
  };

  const saveLog = async () => {
    if (!logModal) return;
    const { data: { user } } = await supabase.auth.getUser();
    const existing = logs[`${todayKey}_${logModal.name}`];
    setLogs(prev => ({ ...prev, [`${todayKey}_${logModal.name}`]: logValue }));
    if (!existing) {
      await supabase.from('workout_logs').upsert({
        user_id: user.id,
        logged_at: todayKey,
        exercises: { ...logs, [logModal.name]: logValue },
      }, { onConflict: 'user_id,logged_at' });
    }
    setLogModal(null);
    setLogValue({ weight: '', sets: '', reps: '', notes: '' });
  };

  return (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Check-in */}
      <View style={s.card}>
        <Text style={s.cardLabel}>MORNING CHECK-IN</Text>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.inputLabel}>HRV (ms)</Text>
            <TextInput style={s.input} placeholder="e.g. 62" placeholderTextColor={C.muted}
              keyboardType="numeric" value={hrv} onChangeText={setHrv} />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={s.inputLabel}>ENERGY  {energy ? '⚡'.repeat(energy) : ''}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n}
                  style={[s.energyBtn, energy === n && { backgroundColor: [C.red,C.orange,C.gold,C.green,C.green][n-1] }]}
                  onPress={() => setEnergy(n)}>
                  <Text style={[{ color: C.muted, fontSize: 13, fontWeight: '600' }, energy === n && { color: C.bg }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        {!checked
          ? <TouchableOpacity style={[s.btnPrimary, { marginTop: 12 }]} onPress={saveCheckin}><Text style={s.btnPrimaryText}>Save check-in</Text></TouchableOpacity>
          : <View style={s.savedBadge}><Text style={s.savedText}>✓ Check-in logged</Text></View>
        }
      </View>

      {/* Workout */}
      <View style={s.card}>
        <Text style={s.cardLabel}>TODAY'S WORKOUT · {type.toUpperCase()}</Text>
        {exercises.map((ex, i) => {
          const logged = logs[`${todayKey}_${ex.name}`];
          return (
            <TouchableOpacity key={i} style={[s.exerciseRow, logged && { opacity: 0.65 }]}
              onPress={() => { setLogModal(ex); setLogValue(logged || { weight: '', sets: String(ex.sets), reps: String(ex.reps), notes: ex.notes || '' }); }}>
              <View style={{ flex: 1 }}>
                <Text style={s.exerciseName}>{ex.name}</Text>
                <Text style={s.exerciseDetail}>{ex.sets} × {ex.reps}{ex.notes ? '  ·  ' + ex.notes : ''}</Text>
                {logged && <Text style={{ color: C.green, fontSize: 11, marginTop: 2 }}>✓ {logged.weight ? logged.weight + 'lb · ' : ''}{logged.sets}×{logged.reps}</Text>}
              </View>
              <View style={[s.logBtn, logged && { backgroundColor: C.green + '22', borderColor: C.green }]}>
                <Text style={s.logBtnText}>{logged ? '✓' : '+'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Log modal */}
      <Modal visible={!!logModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView behavior="padding">
            <View style={s.modalCard}>
              <Text style={s.modalTitle}>Log: {logModal?.name}</Text>
              {[['Weight (lbs)', 'weight', 'numeric'], ['Sets', 'sets', 'numeric'], ['Reps', 'reps', 'numeric'], ['Notes', 'notes', 'default']].map(([label, field, kb]) => (
                <View key={field} style={[s.inputRow, { marginBottom: 8 }]}>
                  <Text style={s.inputLabel}>{label}</Text>
                  <TextInput style={s.input} placeholder={label} placeholderTextColor={C.muted}
                    keyboardType={kb} value={logValue[field]}
                    onChangeText={v => setLogValue(p => ({ ...p, [field]: v }))} />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity style={[s.btnSecondary, { flex: 1 }]} onPress={() => setLogModal(null)}>
                  <Text style={s.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btnPrimary, { flex: 2 }]} onPress={saveLog}>
                  <Text style={s.btnPrimaryText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════
// PROGRAM TAB
// ══════════════════════════════════════════════════════════════
function ProgramTab() {
  const { profile } = useAuth();
  const [programs, setPrograms] = useState([]);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from('programs').select('*').eq('client_id', user.id).eq('status', 'active');
      if (data) setPrograms(data);
    };
    load();
  }, []);

  const tier = profile?.subscription_tier || 'free';
  const isCoached = ['coached', 'elite'].includes(tier);

  return (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      {!isCoached && (
        <View style={[s.card, { borderColor: C.gold + '44', borderWidth: 1 }]}>
          <Text style={s.cardLabel}>UPGRADE TO GET COACHED</Text>
          <Text style={[s.muted, { lineHeight: 20, marginBottom: 12 }]}>
            Get a custom weekly program built specifically for your goals, schedule, and equipment — plus direct messaging with your coach.
          </Text>
          <TouchableOpacity style={[s.btnPrimary, { backgroundColor: C.gold }]}>
            <Text style={s.btnPrimaryText}>View coaching plans →</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={s.sectionTitle}>YOUR WEEKLY SCHEDULE</Text>
      {DAYS.map((day, i) => {
        const type = profile?.schedule?.[i] || 'recovery';
        const ICONS = { soccer:'⚽', kettlebell:'🏋️', pilates:'🧘', run:'🏃', cardio:'🚴', recovery:'🌙', off:'😴' };
        const today = new Date().getDay();
        return (
          <View key={i} style={[s.weekRow, i === today && { borderColor: C.gold, borderWidth: 1.5 }]}>
            <View style={{ width: 40 }}>
              <Text style={[{ color: C.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' }, i === today && { color: C.gold }]}>{day.toUpperCase()}</Text>
              {i === today && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold, alignSelf: 'center', marginTop: 2 }} />}
            </View>
            <Text style={{ fontSize: 18, marginHorizontal: 10 }}>{ICONS[type] || '💪'}</Text>
            <Text style={{ color: i === today ? C.white : C.muted, flex: 1 }}>{type}</Text>
          </View>
        );
      })}

      {programs.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { marginTop: 24 }]}>ACTIVE PROGRAMS</Text>
          {programs.map(p => (
            <View key={p.id} style={s.card}>
              <Text style={s.tierName}>{p.name}</Text>
              <Text style={s.muted}>{p.description}</Text>
              {p.start_date && <Text style={[s.muted, { marginTop: 4 }]}>Started: {p.start_date}</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════
// LOG TAB
// ══════════════════════════════════════════════════════════════
function LogTab() {
  const [recentLogs, setRecentLogs] = useState([]);
  const [bodyStats, setBodyStats] = useState([]);
  const [showStatForm, setShowStatForm] = useState(false);
  const [newStat, setNewStat] = useState({ weight_lbs: '', body_fat_pct: '', hrv_ms: '', sleep_hrs: '' });

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [logs, stats] = await Promise.all([
        supabase.from('workout_logs').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(10),
        supabase.from('body_stats').select('*').eq('user_id', user.id).order('logged_at', { ascending: false }).limit(30),
      ]);
      if (logs.data) setRecentLogs(logs.data);
      if (stats.data) setBodyStats(stats.data);
    };
    load();
  }, []);

  const saveStat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = Object.fromEntries(
      Object.entries(newStat).filter(([_,v]) => v !== '').map(([k,v]) => [k, parseFloat(v)])
    );
    const { data } = await supabase.from('body_stats').insert({ user_id: user.id, ...payload }).select().single();
    if (data) setBodyStats(prev => [data, ...prev]);
    setNewStat({ weight_lbs: '', body_fat_pct: '', hrv_ms: '', sleep_hrs: '' });
    setShowStatForm(false);
  };

  const latest = bodyStats[0];
  const prev = bodyStats[1];
  const delta = (field) => {
    if (!latest?.[field] || !prev?.[field]) return null;
    const d = latest[field] - prev[field];
    return d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1);
  };

  return (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      <Text style={s.sectionTitle}>BODY METRICS</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Weight', key: 'weight_lbs', unit: 'lb', icon: '⚖️' },
          { label: 'Body fat', key: 'body_fat_pct', unit: '%', icon: '📉' },
          { label: 'HRV', key: 'hrv_ms', unit: 'ms', icon: '💓' },
        ].map(({ label, key, unit, icon }) => {
          const val = latest?.[key];
          const d = delta(key);
          return (
            <View key={key} style={[s.card, { flex: 1, alignItems: 'center', padding: 12 }]}>
              <Text style={{ fontSize: 18, marginBottom: 4 }}>{icon}</Text>
              <Text style={{ color: C.white, fontSize: 18, fontWeight: '700' }}>{val ? val : '—'}{val ? <Text style={{ color: C.muted, fontSize: 11 }}> {unit}</Text> : null}</Text>
              <Text style={{ color: C.muted, fontSize: 10, letterSpacing: 1, marginTop: 2 }}>{label.toUpperCase()}</Text>
              {d && <Text style={{ fontSize: 11, fontWeight: '700', marginTop: 4, color: key === 'hrv_ms' ? (d.startsWith('+') ? C.green : C.red) : (d.startsWith('+') ? C.red : C.green) }}>{d}</Text>}
            </View>
          );
        })}
      </View>

      <TouchableOpacity style={s.btnPrimary} onPress={() => setShowStatForm(!showStatForm)}>
        <Text style={s.btnPrimaryText}>{showStatForm ? 'Cancel' : '+ Log today\'s stats'}</Text>
      </TouchableOpacity>

      {showStatForm && (
        <View style={[s.card, { marginTop: 12 }]}>
          {[['Weight (lbs)', 'weight_lbs'], ['Body fat (%)', 'body_fat_pct'], ['HRV (ms)', 'hrv_ms'], ['Sleep (hrs)', 'sleep_hrs']].map(([label, field]) => (
            <View key={field} style={[s.inputRow, { marginBottom: 8 }]}>
              <Text style={s.inputLabel}>{label}</Text>
              <TextInput style={s.input} placeholder={label} placeholderTextColor={C.muted}
                keyboardType="numeric" value={newStat[field]} onChangeText={v => setNewStat(p => ({ ...p, [field]: v }))} />
            </View>
          ))}
          <TouchableOpacity style={[s.btnPrimary, { marginTop: 8 }]} onPress={saveStat}><Text style={s.btnPrimaryText}>Save</Text></TouchableOpacity>
        </View>
      )}

      {recentLogs.length > 0 && (
        <>
          <Text style={[s.sectionTitle, { marginTop: 24 }]}>RECENT WORKOUTS</Text>
          {recentLogs.map(log => (
            <View key={log.id} style={s.logRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.white, fontSize: 14, fontWeight: '600' }}>{log.logged_at}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{log.duration_mins ? `${log.duration_mins} min` : 'Logged'}</Text>
              </View>
              {log.hrv && <Text style={{ color: C.gold, fontWeight: '700' }}>HRV {log.hrv}</Text>}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════════
// COACH TAB (AI)
// ══════════════════════════════════════════════════════════════
function CoachTab() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const scrollRef = useRef();

  // Free tier: max 10 messages per day
  const tier = profile?.subscription_tier || 'free';
  const msgCount = messages.filter(m => m.role === 'user').length;
  const atLimit = tier === 'free' && msgCount >= 10;

  useEffect(() => {
    const loadThread = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase.from('ai_threads')
        .select('*').eq('user_id', user.id)
        .gte('created_at', today).order('created_at', { ascending: false }).limit(1).single();
      if (data) {
        setThreadId(data.id);
        setMessages(data.messages || []);
      }
    };
    loadThread();
  }, []);

  const send = async () => {
    if (!input.trim() || loading || atLimit) return;
    const userMsg = { role: 'user', content: input.trim(), ts: Date.now() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput('');
    setLoading(true);

    try {
      // Build personalized system prompt from profile
      const system = buildSystemPrompt(profile);
      const response = await fetch(`${API_BASE}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
          system,
          user_id: profile?.id,
        }),
      });
      const data = await response.json();
      const assistantMsg = { role: 'assistant', content: data.content, ts: Date.now() };
      const finalMsgs = [...newMsgs, assistantMsg];
      setMessages(finalMsgs);

      // Persist to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (threadId) {
        await supabase.from('ai_threads').update({ messages: finalMsgs, updated_at: new Date() }).eq('id', threadId);
      } else {
        const { data: newThread } = await supabase.from('ai_threads').insert({ user_id: user.id, messages: finalMsgs }).select().single();
        if (newThread) setThreadId(newThread.id);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Try again.', ts: Date.now() }]);
    }
    setLoading(false);
  };

  const SUGGESTIONS = [
    "What should I do today?",
    "Modify my workout for low energy",
    "Best KB weight for my level?",
    "How do I improve HRV?",
    "Pre-game meal timing?",
  ];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ flex: 1 }}>
        {messages.length === 0 ? (
          <ScrollView style={s.scroll}>
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🤖</Text>
              <Text style={{ color: C.white, fontSize: 22, fontWeight: '700' }}>AI Coach</Text>
              <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 6 }}>
                Personalized to your profile · Powered by Claude
              </Text>
              {tier === 'free' && (
                <View style={[s.card, { marginTop: 12, width: '100%' }]}>
                  <Text style={{ color: C.gold, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>FREE TIER · 10 MESSAGES/DAY</Text>
                  <Text style={[s.muted, { marginTop: 4 }]}>Upgrade to App or Coached for unlimited AI coaching.</Text>
                </View>
              )}
            </View>
            <Text style={s.sectionTitle}>QUICK QUESTIONS</Text>
            {SUGGESTIONS.map(q => (
              <TouchableOpacity key={q} style={s.suggestionBtn} onPress={() => setInput(q)}>
                <Text style={{ color: C.white, fontSize: 14 }}>{q}</Text>
                <Text style={{ color: C.gold, fontSize: 16 }}>→</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <ScrollView ref={scrollRef} style={s.scroll}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {messages.map((msg, i) => (
              <View key={i} style={[
                { borderRadius: 14, padding: 14, marginVertical: 4, maxWidth: '88%' },
                msg.role === 'user'
                  ? { backgroundColor: C.gold, alignSelf: 'flex-end' }
                  : { backgroundColor: C.card, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border }
              ]}>
                {msg.role === 'assistant' && <Text style={{ color: C.gold, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>COACH</Text>}
                <Text style={{ color: msg.role === 'user' ? C.bg : C.white, fontSize: 14, lineHeight: 20 }}>{msg.content}</Text>
              </View>
            ))}
            {loading && (
              <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border }}>
                <Text style={{ color: C.gold, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>COACH</Text>
                <ActivityIndicator color={C.gold} size="small" />
              </View>
            )}
          </ScrollView>
        )}

        {atLimit && (
          <View style={{ padding: 12, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border }}>
            <Text style={{ color: C.orange, textAlign: 'center', fontSize: 13 }}>Daily limit reached. Upgrade for unlimited coaching.</Text>
          </View>
        )}

        {!atLimit && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 }}>
            <TextInput
              style={{ flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, color: C.white, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 100 }}
              placeholder="Ask your coach..."
              placeholderTextColor={C.muted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              returnKeyType="send"
              multiline
            />
            <TouchableOpacity
              style={[{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' }, (!input.trim() || loading) && { opacity: 0.4 }]}
              onPress={send}>
              <Text style={{ color: C.bg, fontSize: 18, fontWeight: '700' }}>↑</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ══════════════════════════════════════════════════════════════
// ACCOUNT TAB
// ══════════════════════════════════════════════════════════════
function AccountTab({ onSwitchTab }) {
  const { profile, signOut } = useAuth();
  const tier = profile?.subscription_tier || 'free';
  const currentTier = TIERS.find(t => t.id === tier);

  return (
    <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
      {/* Profile header */}
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.goldGlow, borderWidth: 1, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.gold, fontSize: 20, fontWeight: '700' }}>
            {profile?.full_name?.split(' ').map(n => n[0]).join('').substring(0,2) || '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.white, fontSize: 17, fontWeight: '700' }}>{profile?.full_name || 'Your Name'}</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>{profile?.email}</Text>
        </View>
        <View style={[s.tierBadge, { backgroundColor: (currentTier?.color || C.muted) + '22' }]}>
          <Text style={{ color: currentTier?.color || C.muted, fontSize: 11, fontWeight: '700' }}>{tier.toUpperCase()}</Text>
        </View>
      </View>

      {/* Subscription */}
      <Text style={s.sectionTitle}>SUBSCRIPTION</Text>
      <View style={[s.card, { borderColor: (currentTier?.color || C.muted) + '44' }]}>
        <Text style={[{ color: currentTier?.color || C.muted, fontSize: 18, fontWeight: '700' }]}>{currentTier?.name} Plan</Text>
        <Text style={[s.muted, { marginTop: 4 }]}>{currentTier?.price}{currentTier?.period}</Text>
        {tier !== 'elite' && (
          <TouchableOpacity style={[s.btnPrimary, { marginTop: 12 }]}>
            <Text style={s.btnPrimaryText}>Upgrade plan →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Coaching (coached+ only) */}
      {['coached', 'elite'].includes(tier) && (
        <>
          <Text style={s.sectionTitle}>YOUR COACH</Text>
          <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.goldGlow, borderWidth: 1, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.gold, fontSize: 16, fontWeight: '700' }}>EF</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.white, fontSize: 15, fontWeight: '600' }}>Esteban Frias</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>Cisco AI Leader · Solaryn Advisory</Text>
            </View>
            <TouchableOpacity style={{ backgroundColor: C.gold + '22', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: C.gold + '44' }}>
              <Text style={{ color: C.gold, fontSize: 12, fontWeight: '600' }}>Message</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Settings */}
      <Text style={s.sectionTitle}>SETTINGS</Text>
      {[
        { label: 'Edit profile', onPress: () => {} },
        { label: 'Notifications', onPress: () => {} },
        { label: 'Language / Idioma', onPress: () => {} },
        { label: 'Privacy', onPress: () => {} },
      ].map(item => (
        <TouchableOpacity key={item.label} style={s.settingsRow} onPress={item.onPress}>
          <Text style={{ color: C.white, fontSize: 15 }}>{item.label}</Text>
          <Text style={{ color: C.muted }}>›</Text>
        </TouchableOpacity>
      ))}

      {/* White-label CTA */}
      <View style={[s.card, { marginTop: 24, borderColor: C.purple + '44' }]}>
        <Text style={{ color: C.purple, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>ARE YOU A COACH?</Text>
        <Text style={s.muted}>White-label this platform under your own brand. Custom colors, your clients, your business.</Text>
        <TouchableOpacity style={[s.btnOutline, { marginTop: 12, borderColor: C.purple + '66' }]}>
          <Text style={[s.btnOutlineText, { color: C.purple }]}>Learn about white-labeling →</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[s.btnSecondary, { marginTop: 16, marginBottom: 40 }]} onPress={signOut}>
        <Text style={[s.btnSecondaryText, { color: C.red }]}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── HELPERS ────────────────────────────────────────────────────
function buildSystemPrompt(profile) {
  if (!profile) return 'You are a personal fitness coach. Be direct, specific, and practical.';
  const lang = profile.language === 'es' ? 'Respond in Spanish.' : 'Respond in English.';
  const schedule = Object.entries(profile.schedule || {}).map(([day, type]) =>
    `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]}: ${type}`).join(', ');
  return `You are ${profile.full_name}'s personal fitness coach inside the Solaryn Fit app. 
Here is everything you know about them:
- Name: ${profile.full_name}
- Activity level: ${profile.activity_level}
- Goals: ${(profile.goals || []).join(', ')}
- Equipment: ${(profile.equipment || []).join(', ')}
- Weekly schedule: ${schedule}
- Diet proteins: ${(profile.diet_proteins || []).join(', ')}
- Supplements: ${(profile.supplements || []).join(', ')}
- Subscription: ${profile.subscription_tier}
Be direct, specific, and practical. No fluff. Give concrete recommendations with sets/reps/weights when relevant.
Keep responses under 200 words unless asked for more. ${lang}`;
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════
const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: C.bg, paddingTop: Platform.OS === 'ios' ? 50 : 24 },
  authContainer:  { padding: 24, paddingTop: 80, alignItems: 'stretch', minHeight: '100%' },
  splashBrand:    { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 28, fontWeight: '700', color: C.gold, letterSpacing: 4, textAlign: 'center', marginBottom: 8 },
  authTagline:    { color: C.muted, textAlign: 'center', marginBottom: 32, fontSize: 15 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerBrand:    { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 18, fontWeight: '700', color: C.gold, letterSpacing: 3 },
  headerSub:      { fontSize: 11, color: C.muted, marginTop: 2, letterSpacing: 1 },
  headerRight:    { alignItems: 'flex-end' },
  headerDayType:  { fontSize: 10, color: C.muted, marginTop: 2, textTransform: 'capitalize' },
  backBtn:        { color: C.gold, fontSize: 15, paddingVertical: 4, paddingHorizontal: 8 },
  scroll:         { flex: 1, paddingHorizontal: 16 },
  card:           { backgroundColor: C.card, borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1, borderColor: C.border },
  cardLabel:      { fontSize: 10, fontWeight: '700', color: C.gold, letterSpacing: 2, marginBottom: 12 },
  sectionTitle:   { color: C.gold, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 20, marginBottom: 8 },
  muted:          { color: C.muted, fontSize: 13, lineHeight: 18 },
  errorText:      { color: C.red, fontSize: 13, marginTop: 8 },
  linkText:       { color: C.gold, fontSize: 14 },
  // Inputs
  inputRow:       { marginBottom: 10 },
  inputLabel:     { color: C.muted, fontSize: 10, letterSpacing: 1, marginBottom: 4, fontWeight: '600' },
  input:          { backgroundColor: C.surface, borderRadius: 8, borderWidth: 1, borderColor: C.border, color: C.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  energyBtn:      { width: 34, height: 34, borderRadius: 6, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  // Buttons
  btnPrimary:     { backgroundColor: C.gold, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnPrimaryText: { color: C.bg, fontWeight: '700', fontSize: 15 },
  btnSecondary:   { backgroundColor: C.surface, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  btnSecondaryText:{ color: C.white, fontWeight: '600', fontSize: 15 },
  btnOutline:     { borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: C.gold + '66', marginTop: 12 },
  btnOutlineText: { color: C.gold, fontWeight: '600', fontSize: 14 },
  savedBadge:     { backgroundColor: C.green + '18', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.green + '44', marginTop: 8 },
  savedText:      { color: C.green, fontSize: 13, fontWeight: '600' },
  // Chips
  chipGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip:           { backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  chipActive:     { backgroundColor: C.goldGlow, borderColor: C.gold },
  chipText:       { color: C.muted, fontSize: 13 },
  chipTextActive: { color: C.gold, fontWeight: '600' },
  // Segmented
  segmented:      { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 8, padding: 3, marginTop: 4 },
  segmentBtn:     { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
  segmentActive:  { backgroundColor: C.card },
  segmentText:    { color: C.muted, fontSize: 13 },
  segmentTextActive: { color: C.white, fontWeight: '600' },
  // Schedule
  schedRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  schedDay:       { color: C.muted, fontSize: 12, fontWeight: '700', width: 30 },
  schedChip:      { backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border },
  schedChipActive:{ backgroundColor: C.gold },
  schedChipText:  { color: C.muted, fontSize: 11 },
  // Onboarding
  onboardTitle:   { color: C.white, fontSize: 24, fontWeight: '700', marginTop: 24, marginBottom: 4 },
  onboardSub:     { color: C.muted, fontSize: 14, marginBottom: 16 },
  onboardButtons: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 40 },
  progressBar:    { height: 3, backgroundColor: C.border },
  progressFill:   { height: 3, backgroundColor: C.gold },
  // Exercises
  exerciseRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  exerciseName:   { color: C.white, fontSize: 15, fontWeight: '600' },
  exerciseDetail: { color: C.muted, fontSize: 12, marginTop: 2 },
  logBtn:         { width: 32, height: 32, borderRadius: 8, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.dim },
  logBtnText:     { color: C.gold, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  logRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  // Week
  weekRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.card, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  // Pricing
  tierCard:       { backgroundColor: C.card, borderRadius: 14, padding: 20, marginTop: 12, borderWidth: 1 },
  tierBadge:      { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, marginBottom: 10 },
  tierBadgeText:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tierHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 },
  tierName:       { color: C.white, fontSize: 18, fontWeight: '700' },
  tierPrice:      { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  tierPriceNum:   { fontSize: 28, fontWeight: '700' },
  tierPricePer:   { color: C.muted, fontSize: 13 },
  featureRow:     { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  featureDot:     { fontSize: 14, fontWeight: '700', marginTop: 1 },
  featureText:    { color: C.white, fontSize: 14, flex: 1 },
  // White label
  whitelabelCard: { backgroundColor: C.card, borderRadius: 14, padding: 20, marginTop: 12, marginBottom: 40, borderWidth: 1, borderColor: C.purple + '44' },
  wlTitle:        { color: C.white, fontSize: 17, fontWeight: '700' },
  wlSub:          { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  wlPrice:        { color: C.purple, fontSize: 20, fontWeight: '700', marginTop: 8 },
  // Settings
  settingsRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, backgroundColor: C.card, borderRadius: 10, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  // Suggestions
  suggestionBtn:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  // Modal
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard:      { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, borderTopWidth: 1, borderColor: C.border },
  modalTitle:     { color: C.white, fontSize: 18, fontWeight: '700', marginBottom: 16 },
  // Nav
  nav:            { flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.border, paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8 },
  navItem:        { flex: 1, alignItems: 'center', paddingTop: 4 },
  navIcon:        { fontSize: 19 },
  navLabel:       { color: C.muted, fontSize: 10, marginTop: 2, letterSpacing: 0.5 },
  navActive:      { color: C.gold, fontWeight: '700' },
  navDot:         { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold, marginTop: 2 },
});
