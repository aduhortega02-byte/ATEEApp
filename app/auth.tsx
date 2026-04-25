import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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

const RED = '#8B0000';

type Props = { onSignedIn: () => void };

export default function AuthScreen({ onSignedIn }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError(null);
  };

  const submit = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, role } },
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
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
                >
                  <Text style={[s.toggleText, mode === 'signin' && s.toggleTextActive]}>
                    Sign In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, mode === 'signup' && s.toggleActive]}
                  onPress={() => switchMode('signup')}
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
                  />

                  <Text style={s.label}>I AM A</Text>
                  <View style={s.roleRow}>
                    <TouchableOpacity
                      style={[s.roleBtn, role === 'passenger' && s.roleBtnActive]}
                      onPress={() => setRole('passenger')}
                    >
                      <Text style={[s.roleBtnText, role === 'passenger' && s.roleBtnTextActive]}>
                        🚶 Passenger
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.roleBtn, role === 'driver' && s.roleBtnActive]}
                      onPress={() => setRole('driver')}
                    >
                      <Text style={[s.roleBtnText, role === 'driver' && s.roleBtnTextActive]}>
                        🚗 Driver
                      </Text>
                    </TouchableOpacity>
                  </View>
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
              />

              <Text style={s.label}>PASSWORD</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor="#aaa"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {error ? <Text style={s.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[s.submitBtn, loading && { opacity: 0.6 }]}
                onPress={submit}
                disabled={loading}
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
  submitBtn: {
    backgroundColor: RED,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  submitText: { color: 'white', fontSize: 14, fontWeight: '600' },
});
