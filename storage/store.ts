import AsyncStorage from '@react-native-async-storage/async-storage';

const SELECTED_DRIVER_KEY = 'selectedDriver';
const TASKS_PREFIX = 'tasks_';

export async function saveSelectedDriver(obj: any) {
  try {
    await AsyncStorage.setItem(SELECTED_DRIVER_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn('Failed to save selected driver', e);
  }
}

export async function getSelectedDriver() {
  try {
    const v = await AsyncStorage.getItem(SELECTED_DRIVER_KEY);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    console.warn('Failed to read selected driver', e);
    return null;
  }
}

export async function saveTasksForTruck(truckId: string | number, tasks: any[]) {
  try {
    await AsyncStorage.setItem(TASKS_PREFIX + truckId, JSON.stringify(tasks));
  } catch (e) {
    console.warn('Failed to save tasks', e);
  }
}

export async function getTasksForTruck(truckId: string | number) {
  try {
    const v = await AsyncStorage.getItem(TASKS_PREFIX + truckId);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    console.warn('Failed to read tasks', e);
    return null;
  }
}

export default {
  saveSelectedDriver,
  getSelectedDriver,
  saveTasksForTruck,
  getTasksForTruck,
};
