import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { API_BASE } from '@/services/api';
import storage from '@/storage/store';

// Hide the navigation header for this landing screen so there's no back button.
export const options = { headerShown: false };

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const pressedRef = useRef(false); // guard against double-tap

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sel = await storage.getSelectedDriver();
        if (!mounted) return;
        if (sel) {
          router.replace('/tasks');
          return;
        }
      } catch (e) {
        console.warn('failed to read selected driver', e);
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function onLogin() {
    if (pressedRef.current) return;
    const u = username.trim();
    const p = password; // don’t trim password to avoid changing it
    if (!u || !p) {
      Alert.alert('Validation', 'Please enter username and password');
      return;
    }

    pressedRef.current = true;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/driver/driverLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // leave json null; handle below
      }

      if (!res.ok) {
        const msg = json?.message || json?.error || `HTTP ${res.status}`;
        Alert.alert('Login failed', String(msg));
        return;
      }

      const truckNo = json?.truckNo ?? json?.truckno ?? json?.data?.truckNo;
      const driverName = json?.driverName ?? json?.drivername ?? u;

      if (!truckNo) {
        Alert.alert('Login', 'Server did not return a truck number');
        return;
      }

      await storage.saveSelectedDriver({ truckNo, driverName });
      setPassword(''); // clear sensitive input
      router.replace('/tasks');
    } catch (err: any) {
      console.warn('Login error', err);
      Alert.alert('Error', err?.friendlyMessage || 'Unable to login. Check network.');
    } finally {
      setLoading(false);
      pressedRef.current = false;
    }
  }

  if (checking) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title">MMM Logistics</ThemedText>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <View style={{ marginTop: 18 }}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="username"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="password"
          secureTextEntry
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={onLogin}
        />
      </View>

      <View style={{ marginTop: 22 }}>
        {loading ? <ActivityIndicator /> : <Button title="Sign in" onPress={onLogin} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 30, backgroundColor: '#f7fbff' },
  subtitle: { marginTop: 6, color: '#556', marginBottom: 12 },
  label: { color: '#334', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e6eef8',
  },
});
