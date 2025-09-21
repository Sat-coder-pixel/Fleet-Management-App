
import { ThemedText } from '@/components/themed-text';
// Use the legacy expo-file-system API to avoid deprecation warnings for getInfoAsync
import { API_BASE } from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Button, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompleteTaskPlaceholder({ route }: any) {
  const router = useRouter();
  // Merge route.params (native navigation) with query params when opened directly on web.
  // Some environments (web direct URL with ?query) won't populate route.params, so parse
  // window.location.search on web as a safe fallback.
  const webSearchParams: Record<string, string> = {};
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
    const usp = new URLSearchParams(window.location.search);
    usp.forEach((v, k) => (webSearchParams[k] = v));
  }
  const mergedParams: any = { ...(route?.params || {}), ...webSearchParams };
  // route?.params?.assignedTaskId may be passed
  const [podPhoto, setPodPhoto] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [invoicePhoto, setInvoicePhoto] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [checklistVisible, setChecklistVisible] = useState(false);
  const [checklist, setChecklist] = useState(
    [
      { id: 'c1', label: 'Items secured', checked: false, comment: '' },
      { id: 'c2', label: 'Documents attached', checked: false, comment: '' },
      { id: 'c3', label: 'Seal intact', checked: false, comment: '' },
      { id: 'c4', label: 'Delivery notes signed', checked: false, comment: '' },
    ] as Array<{ id: string; label: string; checked: boolean; comment: string }>
  );

  async function requestCameraPermissions() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }

  async function takePhoto(setter: (p: ImagePicker.ImagePickerResult) => void, label: string) {
    const ok = await requestCameraPermissions();
    if (!ok) {
      Alert.alert('Permission required', 'Camera permission is required to take photos');
      return;
    }

    try {
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
      // helpful debug log to inspect shape of the result in web vs native
      console.debug('ImagePicker result', res);
      // Modern API: res.canceled (boolean) and res.assets[] (array)
      const canceled = 'canceled' in res ? (res as any).canceled : ('cancelled' in res ? (res as any).cancelled : false);
      if (!canceled) setter(res as ImagePicker.ImagePickerResult);
    } catch (e: any) {
      console.warn(e);
      Alert.alert('Camera error', String(e));
    }
  }

  function isChecklistComplete() {
    return checklist.every((c) => c.checked === true);
  }

  function toggleChecklistItem(id: string) {
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)));
  }

  function setChecklistComment(id: string, comment: string) {
    setChecklist((prev) => prev.map((c) => (c.id === id ? { ...c, comment } : c)));
  }

  function getImageData(res: ImagePicker.ImagePickerResult | null) {
    if (!res) return null;
    // modern shape: { canceled: false, assets: [{ uri, base64, ... }] }
    const anyRes = res as any;
    if (anyRes.assets && Array.isArray(anyRes.assets) && anyRes.assets.length > 0) {
      const a = anyRes.assets[0];
      return { uri: a.uri, base64: a.base64 };
    }
    // legacy shape: { uri, base64, cancelled }
    if (anyRes.uri) return { uri: anyRes.uri, base64: anyRes.base64 };
    return null;
  }

  function renderThumb(img: ImagePicker.ImagePickerResult | null, label: string) {
    const info = getImageData(img);
    if (!info || !info.uri) return <Text style={styles.placeholder}>{label} (not taken)</Text>;
    // On web, the uri may be a blob or object URL; using a native <img> works reliably in browser.
  if (Platform.OS === 'web') return <img src={info.uri} style={{ width: '100%', height: 180, borderRadius: 8, objectFit: 'cover' }} /> as any;
    return <Image source={{ uri: info.uri }} style={styles.thumb} />;
  }

  async function mergeToPdf() {
    // check cancellation/canceled for both shapes
    const podInfo = getImageData(podPhoto);
    const invInfo = getImageData(invoicePhoto);
    if (!podInfo || !podInfo.uri || !invInfo || !invInfo.uri) {
      Alert.alert('Missing photos', 'Please take both POD and Invoice photos before submitting.');
      return;
    }

    setProcessing(true);
    try {
      const form = new FormData();
      console.log(route?.params);
  // prefer merged params (route.params or search params)
  form.append('driverName', mergedParams.driverName || mergedParams.drivername || 'Unknown');
  form.append('truckNo', String(mergedParams.truckNo ?? mergedParams.truckno ?? mergedParams.truckId ?? mergedParams.truckid ?? 'unknown'));
  form.append('assignedTaskId', String(mergedParams.assignedTaskId ?? mergedParams.assignedtaskid ?? mergedParams.taskId ?? mergedParams.taskid ?? ''));
  form.append('invoiceId', String(mergedParams.invoiceId ?? mergedParams.invoiceid ?? mergedParams.InvoiceId ?? `INV-${Date.now()}`));
      form.append('checklist', JSON.stringify(checklist || []));

      async function appendImage(fieldName: string, info: { uri?: string; base64?: string } | null) {
        if (!info || !info.uri) return;
        const uri = info.uri;
        if (Platform.OS === 'web') {
          try {
            const resp = await fetch(uri);
            const blob = await resp.blob();
            form.append(fieldName, blob, `${fieldName}.jpg` as any);
          } catch (e) {
            console.warn('Failed to fetch web blob for', fieldName, e);
          }
        } else {
          const name = `${fieldName}_${Date.now()}.jpg`;
          const file: any = { uri, name, type: 'image/jpeg' };
          form.append(fieldName, file as any);
        }
      }

      await appendImage('podImage', podInfo);
      await appendImage('invoiceImage', invInfo);

      const res = await fetch(`${API_BASE}/driver/completeAssignment`, {
        method: 'POST',
        body: form as any,
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || res.statusText);
      }

      const json = await res.json();
      console.debug('completeAssignment response', json);
      Alert.alert('Success', 'Task completed successfully');
      router.push('/tasks');
    } catch (err: any) {
      console.warn('submitCompletion failed', err);
      Alert.alert('Error', err?.message || String(err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title">Complete Task</ThemedText>
      <ThemedText style={{ marginTop: 8, marginBottom: 12 }}>Take POD and Invoice photos, then merge into a PDF.</ThemedText>

      <View style={{ marginTop: 8 }}>
        <View style={{ marginBottom: 16 }}>
          {renderThumb(podPhoto, 'POD Photo')}
          <Pressable
            style={[styles.photoBtn, { backgroundColor: getImageData(podPhoto) ? '#28a745' : '#1b7ed6' }]}
            onPress={() => takePhoto(setPodPhoto, 'POD Photo')}
          >
            <Text style={styles.photoBtnText}>{getImageData(podPhoto) ? 'POD Taken' : 'Take POD Photo'}</Text>
          </Pressable>
        </View>

        <View style={{ marginBottom: 16 }}>
          {renderThumb(invoicePhoto, 'Invoice Photo')}
          <Pressable
            style={[styles.photoBtn, { backgroundColor: getImageData(invoicePhoto) ? '#28a745' : '#6f42c1' }]}
            onPress={() => takePhoto(setInvoicePhoto, 'Invoice Photo')}
          >
            <Text style={styles.photoBtnText}>{getImageData(invoicePhoto) ? 'Invoice Taken' : 'Take Invoice Photo'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 18, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Pressable style={[styles.photoBtn, { backgroundColor: '#666' }]} onPress={() => setChecklistVisible(true)}>
          <Text style={styles.photoBtnText}>Open Checklist</Text>
        </Pressable>

        <Button
          title={processing ? 'Processing...' : 'Complete Task'}
          onPress={mergeToPdf}
          disabled={processing || !getImageData(podPhoto) || !getImageData(invoicePhoto) || !isChecklistComplete()}
        />
      </View>

      {/* Checklist Modal */}
      <Modal visible={checklistVisible} animationType="slide" onRequestClose={() => setChecklistVisible(false)}>
        <SafeAreaView style={{ flex: 1, padding: 18 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Checklist</Text>
          {checklist.map((c) => (
            <View key={c.id} style={{ marginBottom: 12, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 8 }}>
              <Pressable onPress={() => toggleChecklistItem(c.id)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600' }}>{c.label}</Text>
                <Text>{c.checked ? '☑' : '⬜'}</Text>
              </Pressable>
              <TextInput
                placeholder="Add comment (optional)"
                value={c.comment}
                onChangeText={(t) => setChecklistComment(c.id, t)}
                style={{ marginTop: 8, borderWidth: 1, borderColor: '#eee', padding: 8, borderRadius: 8 }}
                multiline
              />
            </View>
          ))}

          <View style={{ marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable
              style={[styles.photoBtn, { marginRight: 8 }]}
              onPress={() => {
                // close modal
                setChecklistVisible(false);
              }}
            >
              <Text style={styles.photoBtnText}>Close</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#fff' },
  row: { flexDirection: 'row', gap: 12 },
  thumbWrap: { flex: 1, alignItems: 'center' },
  thumb: { width: '100%', height: 180, borderRadius: 8, resizeMode: 'cover', backgroundColor: '#eee' },
  placeholder: { color: '#666', padding: 12, textAlign: 'center' },
  photoBtn: { marginTop: 8, backgroundColor: '#1b7ed6', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  photoBtnText: { color: '#fff', fontWeight: '600' },
});

