import { ThemedText } from '@/components/themed-text';
import api from '@/services/api';
import storage from '@/storage/store';
import { useNavigation, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Button,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TasksScreen() {
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Pending Tasks' });
  }, [navigation]);

  const [driver, setDriver] = useState<any | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingId, setStartingId] = useState<number | null>(null); // lock per-row
  const router = useRouter();
  const anim = useRef(new Animated.Value(0)).current;

  // initial load
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
    return () => { mounted = false; };
  }, []);

  const reload = useCallback(async () => {
    if (!driver) return;
    setRefreshing(true);
    try {
      const remote = await api.fetchTasksForTruck(driver.truckNo ?? driver.driverId);
      setTasks(remote || []);
      await storage.saveTasksForTruck(driver.truckNo ?? driver.driverId, remote || []);
    } catch (e) {
      console.warn('refresh failed', e);
      showMessage({
        message: 'Refresh failed',
        description: 'Showing last cached tasks',
        type: 'warning',
      });
    } finally {
      setRefreshing(false);
    }
  }, [driver]);

  async function onStartTask(assignedTaskId: number) {
    if (!driver || startingId) return;
    setStartingId(assignedTaskId);
    try {
      await api.startAssignedTask(assignedTaskId, driver.truckNo);
      showMessage({
        message: 'Task started',
        type: 'success',
        backgroundColor: '#4BB543',
        color: '#fff',
      });

      // Trust server state if you want: optionally re-fetch this task only.
      const updated = tasks.map((item) =>
        item.assignedTaskId === assignedTaskId
          ? { ...item, status: 'Started' } // keep consistent with backend
          : item
      );
      setTasks(updated);
      await storage.saveTasksForTruck(driver.truckNo, updated);
    } catch (e: any) {
      Alert.alert('Error', e?.friendlyMessage || String(e));
    } finally {
      setStartingId(null);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} />;

  function renderItem({ item, index }: { item: any; index: number }) {
    const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [20 + index * 6, 0] });
    const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    const isStarted = item.status === 'Started' || item.status === 'In Progress';
    const disableStart = Boolean(item.isCompleted) || isStarted || startingId === item.assignedTaskId;

    return (
      <Animated.View style={[styles.card, { transform: [{ translateY }], opacity }]}>
        <View style={styles.cardContent}>
          <View style={{ marginBottom: 8 }}>
            <ThemedText type="defaultSemiBold">InvoiceNo.: {item.invoiceId ?? '-'}</ThemedText>
            <ThemedText type="defaultSemiBold">OrderNo.: {item.orderNumber ?? '-'}</ThemedText>
            <ThemedText style={styles.desc}>{item.description}</ThemedText>
            <ThemedText style={styles.desc}>{item.name}</ThemedText>
            <ThemedText style={styles.desc}>Zone: {item.zoneNo ?? '-'}</ThemedText>
            <ThemedText style={styles.small}>Qty: {item.quantityShipped ?? item.quantityOrdered ?? '-'}</ThemedText>
            <ThemedText style={styles.small}>
              Assigned: {new Date(item.assignedAt || Date.now()).toLocaleString()}
            </ThemedText>
          </View>

          <ThemedText style={styles.status}>{item.status}</ThemedText>

          <View style={styles.actionsColumn}>
            <View style={{ marginBottom: 8 }}>
              <Button
                title={isStarted ? 'Started' : 'Start task'}
                onPress={() => onStartTask(item.assignedTaskId)}
                disabled={disableStart}
              />
            </View>

            <View>
              <Button
                title="Complete task"
                onPress={() => {
                  router.push({
                    pathname: '/complete',
                    params: {
                      assignedTaskId: String(item.assignedTaskId),
                      truckNo: String(driver?.truckNo ?? ''),
                      driverName: driver?.driverName ?? '',
                      invoiceId: String(item.invoiceId ?? ''),
                      taskId: String(item.taskId ?? ''),
                      orderNumber: String(item.orderNumber ?? ''),
                    },
                  });
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
                try {
                  if (driver?.truckNo) await storage.saveTasksForTruck(driver.truckNo, []);
                } catch (e) {
                  console.warn('Failed to clear cached tasks on logout', e);
                }
                // If you have storage.clearSelectedDriver(), prefer that.
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
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
    flexDirection: 'column',
  },
  cardContent: { flex: 1, flexDirection: 'column' },
  desc: { color: '#444', marginTop: 6 },
  small: { color: '#666', marginTop: 6 },
  actionsColumn: { marginTop: 12, alignItems: 'stretch' },
  status: { fontWeight: '600', marginBottom: 6, color: '#1b7ed6' },
});
