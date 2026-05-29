import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { applyReferralCode } from '../lib/referrals';
import { validateEmail, validatePassword, validateFullName, sanitizeReferralCode } from '../lib/sanitize';

const RED = '#8B0000';

type Props = { onSignedIn: () => void };

export default function AuthScreen({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
  };

  const handleForgotPassword = async () => {
    const doReset = async (addr: string) => {
      try {
        setResetLoading(true);
        const { error: err } = await supabase.auth.resetPasswordForEmail(addr.trim(), {
          redirectTo: 'https://example.com/reset',
        });
        if (err) throw err;
        if (Platform.OS === 'web') {
          (globalThis as any).alert(`Password reset link sent to ${addr.trim()}`);
        } else {
          Alert.alert('Check your email', `A reset link was sent to ${addr.trim()}`);
        }
      } catch (e: any) {
        setError(e.message ?? 'Could not send reset email');
      } finally {
        setResetLoading(false);
      }
    };

    if (email.trim()) {
      doReset(email.trim());
      return;
    }

    if (Platform.OS === 'web') {
      const addr = (globalThis as any).prompt('Enter your email address to reset your password');
      if (addr) doReset(addr);
    } else if (Platform.OS === 'ios') {
      Alert.prompt('Reset Password', 'Enter your email address', (addr) => {
        if (addr) doReset(addr);
      });
    } else {
      Alert.alert('Reset Password', 'Enter your email in the field above, then tap Forgot password?');
    }
  };

  const submit = async () => {
    if (loading) return;
    if (mode === 'signup' && !agreedToTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    // Client-side validation
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    const passwordErr = validatePassword(password);
    if (passwordErr) { setError(passwordErr); return; }
    if (mode === 'signup') {
      const nameErr = validateFullName(fullName);
      if (nameErr) { setError(nameErr); return; }
    }

    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: fullName.trim(), role } },
        });
        if (err) throw err;
        const code = sanitizeReferralCode(referralCode);
        if (code) {
          // The DB trigger that creates the profile row is async; wait briefly before applying
          setTimeout(() => applyReferralCode(code).catch(() => {}), 1500);
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (err) throw err;
      }
      onSignedIn();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: RED }}>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={s.container}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.logo}>ATEE</Text>
            <Text style={s.tagline}>Pick it, Price it, Ride it.</Text>

            <View style={s.card}>
              <View style={s.toggle}>
                <TouchableOpacity
                  style={[s.toggleBtn, mode === 'signin' && s.toggleActive]}
                  onPress={() => switchMode('signin')}
                  accessibilityRole="button"
                  accessibilityLabel="Sign In"
                  accessibilityState={{ selected: mode === 'signin' }}
                >
                  <Text style={[s.toggleText, mode === 'signin' && s.toggleTextActive]}>
                    Sign In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, mode === 'signup' && s.toggleActive]}
                  onPress={() => switchMode('signup')}
                  accessibilityRole="button"
                  accessibilityLabel="Sign Up"
                  accessibilityState={{ selected: mode === 'signup' }}
                >
                  <Text style={[s.toggleText, mode === 'signup' && s.toggleTextActive]}>
                    Sign Up
                  </Text>
                </TouchableOpacity>
              </View>

              {mode === 'signup' && (
                <>
                  <Text style={s.label}>FULL NAME</Text>
                  <TextInput
                    style={s.input}
                    placeholder="Your name"
                    placeholderTextColor="#aaa"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    accessibilityLabel="Full name"
                  />

                  <Text style={s.label}>I AM A</Text>
                  <View style={s.roleRow}>
                    <TouchableOpacity
                      style={[s.roleBtn, role === 'passenger' && s.roleBtnActive]}
                      onPress={() => setRole('passenger')}
                      accessibilityRole="button"
                      accessibilityLabel="Passenger"
                      accessibilityState={{ selected: role === 'passenger' }}
                    >
                      <Text style={[s.roleBtnText, role === 'passenger' && s.roleBtnTextActive]}>
                        🚶 Passenger
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.roleBtn, role === 'driver' && s.roleBtnActive]}
                      onPress={() => setRole('driver')}
                      accessibilityRole="button"
                      accessibilityLabel="Driver"
                      accessibilityState={{ selected: role === 'driver' }}
                    >
                      <Text style={[s.roleBtnText, role === 'driver' && s.roleBtnTextActive]}>
                        🚗 Driver
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={s.label}>REFERRAL CODE (optional)</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. ABC12345"
                    placeholderTextColor="#aaa"
                    value={referralCode}
                    onChangeText={(t) => setReferralCode(t.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    accessibilityLabel="Referral code, optional"
                  />
                </>
              )}

              <Text style={s.label}>EMAIL</Text>
              <TextInput
                style={s.input}
                placeholder="you@example.com"
                placeholderTextColor="#aaa"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Email address"
                textContentType="emailAddress"
              />

              <Text style={s.label}>PASSWORD</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor="#aaa"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                accessibilityLabel="Password"
                textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              />

              {mode === 'signin' && (
                <TouchableOpacity
                  style={{ alignSelf: 'flex-end', marginTop: 6, minHeight: 44, justifyContent: 'center' }}
                  onPress={handleForgotPassword}
                  disabled={resetLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password"
                  hitSlop={{ top: 8, bottom: 8, left: 16, right: 8 }}
                >
                  <Text style={{ fontSize: 12, color: '#c0392b' }}>
                    {resetLoading ? 'Sending…' : 'Forgot password?'}
                  </Text>
                </TouchableOpacity>
              )}

              {mode === 'signup' && (
                <TouchableOpacity
                  style={s.termsRow}
                  onPress={() => setAgreedToTerms((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
                  accessibilityState={{ checked: agreedToTerms }}
                >
                  <View style={[s.checkbox, agreedToTerms && s.checkboxChecked]}>
                    {agreedToTerms && <Text style={s.checkmark}>✓</Text>}
                  </View>
                  <Text style={s.termsText}>
                    {'I agree to the '}
                    <Text
                      style={s.termsLink}
                      onPress={() => Linking.openURL('https://rideatee.com/terms-of-service')}
                      accessibilityRole="link"
                      accessibilityLabel="Terms of Service"
                    >
                      Terms of Service
                    </Text>
                    {' and '}
                    <Text
                      style={s.termsLink}
                      onPress={() => Linking.openURL('https://rideatee.com/privacy-policy')}
                      accessibilityRole="link"
                      accessibilityLabel="Privacy Policy"
                    >
                      Privacy Policy
                    </Text>
                  </Text>
                </TouchableOpacity>
              )}

              {error ? <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text> : null}

              <TouchableOpacity
                style={[s.submitBtn, loading && { opacity: 0.6 }]}
                onPress={submit}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={mode === 'signin' ? 'Sign in' : 'Create account'}
                accessibilityState={{ disabled: loading }}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={s.submitText}>
                    {mode === 'signin' ? 'Sign In →' : 'Create Account →'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    fontSize: 48,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 6,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 28,
  },
  card: {
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: { backgroundColor: RED },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: 'white' },
  label: {
    fontSize: 10,
    color: '#999',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111',
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  roleBtnActive: { borderColor: RED, backgroundColor: '#fff0f0' },
  roleBtnText: { fontSize: 13, color: '#888', fontWeight: '500' },
  roleBtnTextActive: { color: RED },
  error: {
    fontSize: 12,
    color: '#c0392b',
    marginTop: 12,
    textAlign: 'center',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 18,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: RED,
    borderColor: RED,
  },
  checkmark: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  termsText: {
    flex: 1,
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  termsLink: {
    color: RED,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  submitBtn: {
    backgroundColor: RED,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  submitText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
