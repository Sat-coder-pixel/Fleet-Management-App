export const API_BASE = 'https://fleet-management-backend-1.onrender.com/api';

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
    const res = await fetch(`${API_BASE}/tasks/getAvailableDrivers`);
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
    const url = `${API_BASE}/tasks/assigned?truckNo=${encodeURIComponent(String(truckId))}`;
    const res = await fetch(url);
  const data = await handleResp(res);
  // Some backends return { tasks: [...] } while others return the array directly.
  const tasks = Array.isArray(data) ? data : (data && Array.isArray((data as any).tasks) ? (data as any).tasks : null);
  // If server returned an array (even empty), return it. Only fall back to dummy when no data at all.
  if (tasks === null) return DUMMY_TASKS;
  return tasks;
  } catch (e) {
    console.warn('fetchTasksForTruck failed, returning dummy', e);
    return DUMMY_TASKS;
  }
}

export async function startAssignedTask(assignedTaskId: number, truckNo: number) {
  try {
    const res = await fetch(`${API_BASE}/driver/startAssignment`, {
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

export async function completeAssignment(payload: {
  driverName: string;
  truckNo: number | string;
  assignedTaskId: number | string;
  invoiceimage: string; // base64 or data URI
  podimage: string; // base64 or data URI
  InvoiceId?: string | number;
}) {
  try {
    const res = await fetch(`${API_BASE}/driver/completeAssignment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResp(res);
  } catch (e) {
    console.warn('completeAssignment failed', e);
    throw e;
  }
}

export default {
  fetchAvailableDrivers,
  fetchTasksForTruck,
  startAssignedTask,
  completeAssignment,
};
