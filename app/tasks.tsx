import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Button,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import api from '@/services/api';
import storage from '@/storage/store';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TasksScreen() {
  const [driver, setDriver] = useState<any | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const sel = await storage.getSelectedDriver();
      if (!mounted) return;
      if (!sel) {
        router.replace('/');
        return;
      }
      setDriver(sel);
      try {
        const remote = await api.fetchTasksForTruck(sel.truckNo ?? sel.driverId);
        setTasks(remote || []);
        await storage.saveTasksForTruck(sel.truckNo ?? sel.driverId, remote || []);
      } catch (e) {
        console.warn(e);
        const cached = await storage.getTasksForTruck(sel.truckNo ?? sel.driverId);
        if (cached) setTasks(cached);
      } finally {
        if (mounted) setLoading(false);
        Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function onStartTask(assignedTaskId: number) {
    if (!driver) return;
    try {
      await api.startAssignedTask(assignedTaskId, driver.truckNo);
      Alert.alert('Success', 'Task started');
      const updated = tasks.map((item) => (item.assignedTaskId === assignedTaskId ? { ...item, status: 'In Progress' } : item));
      setTasks(updated);
      await storage.saveTasksForTruck(driver.truckNo, updated);
    } catch (e: any) {
      Alert.alert('Error', String(e));
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  function renderItem({ item, index }: { item: any; index: number }) {
    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20 + index * 6, 0] });
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    return (
      <Animated.View style={[styles.card, { transform: [{ translateY }], opacity }]}>
        <View style={styles.cardContent}>
          <View style={{ marginBottom: 8 }}>
            <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
            <ThemedText style={styles.desc}>{item.description}</ThemedText>
            <ThemedText style={styles.small}>Qty: {item.quantityShipped ?? item.quantityOrdered ?? '-'}</ThemedText>
            <ThemedText style={styles.small}>Assigned: {new Date(item.assignedAt || Date.now()).toLocaleString()}</ThemedText>
          </View>

          <ThemedText style={[styles.status]}>{item.status}</ThemedText>

          <View style={styles.actionsColumn}>
            <View style={{ marginBottom: 8 }}>
              <Button
                title={item.status && String(item.status).toLowerCase().includes('start') ? 'Started' : 'Start task'}
                onPress={() => onStartTask(item.assignedTaskId)}
                disabled={Boolean(item.isCompleted) || (item.status && String(item.status).toLowerCase().includes('start'))}
              />
            </View>

            <View>
              <Button
                title="Complete task"
                onPress={() => {
                  // Pass necessary details to the Complete screen so it can submit without missing data
                  router.push({
                    pathname: '/complete',
                    params: {
                      assignedTaskId: item.assignedTaskId,
                      truckNo: driver?.truckNo ?? '',
                      driverName: driver?.driverName ?? '',
                      invoiceId: item.invoiceId ?? '',
                      taskId: item.taskId ?? '',
                    },
                  } as any);
                }}
                disabled={item.isCompleted}
                color="#28a745"
              />
            </View>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <ThemedText type="title">Truck #{driver?.truckNo}</ThemedText>
            <ThemedText style={styles.meta}>{driver?.driverName}</ThemedText>
          </View>
          <View>
            <Button
              title="Logout"
              color="#d9534f"
              onPress={async () => {
                // Clear selected driver and cached tasks for this truck so next login fetches fresh data
                try {
                  if (driver?.truckNo) await storage.saveTasksForTruck(driver.truckNo, []);
                } catch (e) {
                  console.warn('Failed to clear cached tasks on logout', e);
                }
                await storage.saveSelectedDriver(null as any);
                router.replace('/');
              }}
            />
          </View>
        </View>
      </View>

      <FlatList
        data={tasks}
        contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}
        ListEmptyComponent={<ThemedText style={{ padding: 12 }}>No tasks assigned</ThemedText>}
        keyExtractor={(it) => String(it.assignedTaskId ?? Math.random())}
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#f6fbff' },
  header: { marginBottom: 14 },
  meta: { color: '#556', marginTop: 6 },
  card: {
    padding: 14,
    borderRadius: 12,
    marginVertical: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    // flow vertically inside the card
    flexDirection: 'column',
  },
  cardContent: { flex: 1, flexDirection: 'column' },
  desc: { color: '#444', marginTop: 6 },
  small: { color: '#666', marginTop: 6 },
  actionsColumn: { marginTop: 12, alignItems: 'stretch' },
  status: { fontWeight: '600', marginBottom: 6, color: '#1b7ed6' },
});

