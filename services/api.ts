export const API_BASE = 'http://localhost:3000/api';

type Driver = {
  driverId: number;
  truckNo: number;
  cubic: number;
  driverName: string;
  truckType: string;
  status: string;
};

type Task = Record<string, any>;

async function handleResp(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

const DUMMY_DRIVERS: Driver[] = [
  {
    driverId: 1,
    truckNo: 445,
    cubic: 43.91,
    driverName: 'Danton B',
    truckType: 'Pantech',
    status: 'available',
  },
  {
    driverId: 2,
    truckNo: 459,
    cubic: 44.7,
    driverName: 'Nathan S',
    truckType: 'Pantech',
    status: 'available',
  },
];

export async function fetchAvailableDrivers(): Promise<Driver[]> {
  try {
    const res = await fetch(`${API_BASE}/tasks/getavailable/drivers`);
    const data = await handleResp(res);
    if (!data || (Array.isArray(data) && data.length === 0)) return DUMMY_DRIVERS;
    return data;
  } catch (e) {
    console.warn('fetchAvailableDrivers failed, returning dummy', e);
    return DUMMY_DRIVERS;
  }
}

const DUMMY_TASKS = [
  {
    assignedTaskId: 33,
    taskId: 220,
    orderCo: 1500,
    orTy: 'SN',
    orderNumber: 20591925,
    name: 'HARVEY NORMAN @DOMAYNE - KOTARA WHS',
    description: 'WASHER WL1064G1 FP AA',
    quantityShipped: 2,
    truckNo: 459,
    cubic: 44.7,
    driverName: 'Nathan S',
    truckType: 'Pantech',
    status: 'Not Started',
    assignedAt: new Date().toISOString(),
    isCompleted: false,
  },
];

export async function fetchTasksForTruck(truckId: number | string): Promise<Task[]> {
  try {
    const url = `${API_BASE}/tasks/getTasksInProgress?Truckid=${encodeURIComponent(String(truckId))}`;
    const res = await fetch(url);
    const data = await handleResp(res);
    if (!data || (Array.isArray(data) && data.length === 0)) return DUMMY_TASKS;
    return data;
  } catch (e) {
    console.warn('fetchTasksForTruck failed, returning dummy', e);
    return DUMMY_TASKS;
  }
}

export async function startAssignedTask(assignedTaskId: number, truckNo: number) {
  try {
    const res = await fetch(`${API_BASE}/tasks/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedTaskId, truckNo }),
    });
    return handleResp(res);
  } catch (e) {
    // If network fails, simulate a successful response so the app is still usable offline
    console.warn('startAssignedTask failed, simulating success', e);
    return { success: true, assignedTaskId, truckNo };
  }
}

export default {
  fetchAvailableDrivers,
  fetchTasksForTruck,
  startAssignedTask,
};
