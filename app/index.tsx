import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
export const options = {
  headerShown: false,
};

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    if (!username || !password) {
      Alert.alert('Validation', 'Please enter username and password');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/driver/driverLogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch (e) {
        json = null;
      }

      if (!res.ok) {
        const msg = json?.message || json?.error || 'Login failed';
        Alert.alert('Login failed', String(msg));
        return;
      }

      // Expecting response like: { "truckNo": 1230 }
      const truckNo = json?.truckNo ?? json?.truckno ?? json?.data?.truckNo;
      const driverName = json?.driverName ?? json?.drivername ?? username;

      if (!truckNo) {
        Alert.alert('Login', 'Server did not return a truck number');
        return;
      }

      // Save selected driver
      await storage.saveSelectedDriver({ truckNo, driverName });

      // Navigate to tasks (replace so back doesn't return to login)
      router.replace('/tasks');
    } catch (err) {
      console.warn('Login error', err);
      Alert.alert('Error', 'Unable to login. Check network.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title">FleetManage</ThemedText>
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
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="password"
          secureTextEntry
          style={styles.input}
        />
      </View>

      <View style={{ marginTop: 22 }}>
        {loading ? (
          <ActivityIndicator />
        ) : (
          <Button title="Sign in" onPress={onLogin} />
        )}
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

