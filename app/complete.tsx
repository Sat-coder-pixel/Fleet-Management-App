
import { ThemedText } from '@/components/themed-text';
// Use the legacy expo-file-system API to avoid deprecation warnings for getInfoAsync
import { API_BASE } from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Button, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
  // show inline reason options dropdown when invoice is missing
  const [showReasonOptions, setShowReasonOptions] = useState(false);
  const [missingInvoiceReason, setMissingInvoiceReason] = useState<string | null>(null);
  const [otherReasonText, setOtherReasonText] = useState('');
  // toggle to force requiring a reason even if invoice photo exists
  const [requireReasonEvenIfInvoicePresent, setRequireReasonEvenIfInvoicePresent] = useState(false);

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
      // If this was the invoice photo setter, mark the invoice-reason checklist field satisfied
      if (setter === setInvoicePhoto) {
        // clear any missing reason (invoice now present)
        setMissingInvoiceReason(null);
        setOtherReasonText('');
      }
    } catch (e: any) {
      console.warn(e);
      Alert.alert('Camera error', String(e));
    }
  }

  function isChecklistComplete() {
    // kept for backward compatibility but not used anymore
    return true;
  }

  // checklist removed — no toggle or per-item comments

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
    // Allow submission when either invoice exists OR a missing reason was selected
    const invoiceAvailable = !!(invInfo && invInfo.uri);
    if (!podInfo || !podInfo.uri) {
      Alert.alert('Missing photos', 'Please take POD photo before submitting.');
      return;
    }
      if (!invoiceAvailable && !missingInvoiceReason) {
      // prompt inline dropdown for missing invoice reason
      setShowReasonOptions(true);
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
      // Build checklist payload: send as JSON array (backend expects `checklist` param)
      const checklistPayload: Record<string, string> = {};

if (missingInvoiceReason) {
  const reasonValue = missingInvoiceReason === 'Other' ? otherReasonText : missingInvoiceReason;
  if (reasonValue && reasonValue.trim().length > 0) {
    checklistPayload['missingInvoiceReason'] = reasonValue.trim();
  }
}

form.append('checklist', JSON.stringify(checklistPayload));


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
      if (invoiceAvailable) await appendImage('invoiceImage', invInfo);

      // If invoice not available, append the selected missing reason
      if (!invoiceAvailable && missingInvoiceReason) {
        form.append('missingInvoiceReason', missingInvoiceReason + (otherReasonText ? `: ${otherReasonText}` : ''));
      }

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
      // clear cached tasks for this truck so the tasks screen refetches fresh data
      try {
        const truckNo = mergedParams.truckNo ?? mergedParams.truckno ?? mergedParams.truckId ?? mergedParams.truckid;
        if (truckNo) {
          const storage = (await import('@/storage/store')).default;
          await storage.saveTasksForTruck(truckNo, []);
        }
      } catch (e) {
        console.warn('Failed to clear cached tasks after completion', e);
      }
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
      <ThemedText type="title">Complete Task</ThemedText>
      <ThemedText style={{ marginTop: 8, marginBottom: 12 }}>Take POD and Invoice photos, then merge into a PDF.</ThemedText>

      <View style={{ marginTop: 8 }}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>POD Photo</Text>
          {renderThumb(podPhoto, 'POD Photo')}
          <Pressable
            style={[styles.photoBtn, { backgroundColor: getImageData(podPhoto) ? '#28a745' : '#1b7ed6' }]}
            onPress={() => takePhoto(setPodPhoto, 'POD Photo')}
          >
            <Text style={styles.photoBtnText}>{getImageData(podPhoto) ? 'POD Taken' : 'Take POD Photo'}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Invoice Photo (optional)</Text>
          {renderThumb(invoicePhoto, 'Invoice Photo')}
          <Pressable
            style={[styles.photoBtn, { backgroundColor: getImageData(invoicePhoto) ? '#28a745' : '#6f42c1' }]}
            onPress={() => takePhoto(setInvoicePhoto, 'Invoice Photo')}
          >
            <Text style={styles.photoBtnText}>{getImageData(invoicePhoto) ? 'Invoice Taken' : 'Take Invoice Photo'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={{ fontWeight: '600' }}>Require reason even if invoice present</Text>
          <Switch value={requireReasonEvenIfInvoicePresent} onValueChange={setRequireReasonEvenIfInvoicePresent} />
        </View>

        {/* Reason dropdown (visible when invoice not present OR when toggle requires it) */}
        {( !getImageData(invoicePhoto) || requireReasonEvenIfInvoicePresent ) ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '600', marginBottom: 6 }}>Reason (optional)</Text>
            <Pressable
              onPress={() => setShowReasonOptions((s) => !s)}
              style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text style={{ color: missingInvoiceReason ? '#111' : '#888' }}>{missingInvoiceReason ? (missingInvoiceReason === 'Other' ? `Other: ${otherReasonText || '(specify)'}` : missingInvoiceReason) : 'Select reason (required if invoice missing)'}</Text>
              <Text style={{ color: '#888' }}>▾</Text>
            </Pressable>
            {showReasonOptions ? (
              <View style={{ marginTop: 8 }}>
                {[
                  'Cancellation of PO',
                  'Rejected due to carton damage',
                  'No longer required',
                  'Missed invoice',
                  'Missed booking slot',
                  'Other'
                ].map((r) => (
                  <Pressable key={r} style={[styles.photoBtn, { marginBottom: 8 }]} onPress={() => {
                    setMissingInvoiceReason(r);
                    if (r === 'Other') setOtherReasonText('');
                    setShowReasonOptions(false);
                  }}>
                    <Text style={styles.photoBtnText}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {missingInvoiceReason === 'Other' ? (
              <TextInput placeholder="Specify reason" value={otherReasonText} onChangeText={setOtherReasonText} style={{ borderWidth: 1, padding: 8, borderRadius: 8, marginTop: 6 }} />
            ) : null}
          </View>
        ) : null}

        <Button
          title={processing ? 'Processing...' : 'Complete Task'}
          onPress={mergeToPdf}
          disabled={processing || !getImageData(podPhoto) || ( (!getImageData(invoicePhoto) && !missingInvoiceReason) || (missingInvoiceReason === 'Other' && otherReasonText.trim().length === 0) ) }
        />
      </View>

      {/* checklist removed — simplified UI: POD, Invoice, Reason */}

      {/* Missing invoice reason: inline dropdown used above when invoice is missing */}
        </ScrollView>
      </KeyboardAvoidingView>
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
  card: { backgroundColor: '#fafafa', padding: 12, borderRadius: 10, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#222' },
});

