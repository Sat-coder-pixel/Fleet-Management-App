import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { API_BASE } from '@/services/api';
import storage from '@/storage/store';

// NEW: permissions
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

// Hide the navigation header for this landing screen so there's no back button.
export const options = { headerShown: false };

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // NEW
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const pressedRef = useRef(false); // guard against double-tap

  // existing auto-login check
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
    return () => {
      mounted = false;
    };
  }, []);

  // NEW: proactively ask for camera + gallery permission once at login
  useEffect(() => {
    (async () => {
      try {
        // camera permission
        const cam = await ImagePicker.getCameraPermissionsAsync();
        if (cam.status !== 'granted') {
          await ImagePicker.requestCameraPermissionsAsync();
        }

        // photo library / gallery permission
        const lib = await MediaLibrary.getPermissionsAsync();
        if (lib.status !== 'granted' && lib.canAskAgain) {
          await MediaLibrary.requestPermissionsAsync();
        }
      } catch (e) {
        console.warn('Failed to pre-request permissions', e);
      }
    })();
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
        <View style={styles.passwordContainer}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="password"
            secureTextEntry={!showPassword}
            style={[styles.input, { paddingRight: 60 }]}
            returnKeyType="done"
            onSubmitEditing={onLogin}
          />
          <Pressable
            onPress={() => setShowPassword((s) => !s)}
            style={styles.eyeButton}
          >
            <Text style={{ color: '#555', fontWeight: '600' }}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>
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
  // NEW
  passwordContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
});
