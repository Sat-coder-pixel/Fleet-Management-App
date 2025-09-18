import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import api from '@/services/api';
import storage from '@/storage/store';

// Hide the navigation header for this landing screen so there's no back button.
export const options = {
  headerShown: false,
};

export default function WelcomeScreen() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const router = useRouter();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.fetchAvailableDrivers();
        if (!mounted) return;
        setDrivers(res || []);
      } catch (e: any) {
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  function toggle() {
    const to = open ? 0 : 1;
    Animated.timing(anim, { toValue: to, duration: 220, useNativeDriver: true }).start();
    setOpen(!open);
  }

  async function onConfirm() {
    if (!selected) return;
    await storage.saveSelectedDriver(selected);
    router.push('/tasks');
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  const dropdownHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.min(250, drivers.length * 56)] });
  return (
    <SafeAreaView style={styles.container} >
      <ThemedText type="title">Welcome</ThemedText>
      <ThemedText style={styles.subtitle}>Select your truck</ThemedText>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

      <View style={styles.dropdownWrap}>
        <Pressable style={styles.selector} onPress={toggle}>
          <Text style={styles.selectorText}>{selected ? `Truck #${selected.truckNo} — ${selected.driverName}` : 'Choose a truck...'}</Text>
        </Pressable>

        {/** Use an Animated ScrollView so the list scrolls when taller than the animated height */}
        {/** Create an animated component instance inline */}
        {(() => {
          const AnimatedScroll = Animated.createAnimatedComponent(ScrollView);
          return (
            <AnimatedScroll
              style={[styles.dropdown, { height: dropdownHeight, opacity: anim }]}
              contentContainerStyle={{ paddingVertical: 6 }}
              showsVerticalScrollIndicator
            >
              {drivers.length === 0 ? (
                <ThemedText style={{ padding: 12 }}>No trucks available</ThemedText>
              ) : (
                drivers.map((d) => (
                  <Pressable
                    key={String(d.truckNo ?? d.driverId)}
                    style={[styles.item, selected?.truckNo === d.truckNo && styles.selectedItem]}
                    onPress={() => setSelected(d)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemTitle}>Truck #{d.truckNo}</Text>
                      <Text style={styles.itemMeta}>{d.driverName} · {d.truckType}</Text>
                    </View>
                    <View style={{ width: 40, alignItems: 'flex-end' }}>
                      {selected?.truckNo === d.truckNo ? <Text style={styles.check}>✓</Text> : null}
                    </View>
                  </Pressable>
                ))
              )}
            </AnimatedScroll>
          );
        })()}

        <View style={styles.actions}>
          <Pressable style={[styles.button, !selected && styles.buttonDisabled]} onPress={onConfirm} disabled={!selected}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f7fbff' },
  subtitle: { marginTop: 6, color: '#556', marginBottom: 12 },
  error: { color: 'crimson', marginTop: 8 },
  dropdownWrap: { width: '100%', marginTop: 8 },
  selector: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eef8',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  selectorText: { color: '#223', fontSize: 16 },
  dropdown: {
    overflow: 'hidden',
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e6eef8',
  },
  item: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontWeight: '600', color: '#123' },
  itemMeta: { color: '#667', marginTop: 4 },
  selectedItem: { backgroundColor: 'rgba(34,139,230,0.06)' },
  check: { color: '#1b7ed6', fontWeight: '700' },
  actions: { marginTop: 12, alignItems: 'flex-end' },
  button: { backgroundColor: '#1b7ed6', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  buttonDisabled: { backgroundColor: '#aac8ea' },
  buttonText: { color: '#fff', fontWeight: '600' },
});

