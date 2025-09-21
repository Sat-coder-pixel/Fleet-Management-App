
import { ThemedText } from '@/components/themed-text';
// Use the legacy expo-file-system API to avoid deprecation warnings for getInfoAsync
import { API_BASE } from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Button, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, ScrollView, KeyboardAvoidingView } from 'react-native';
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
  // show inline reason options dropdown when invoice is missing
  const [showReasonOptions, setShowReasonOptions] = useState(false);
  const [missingInvoiceReason, setMissingInvoiceReason] = useState<string | null>(null);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [checklist, setChecklist] = useState(
    [
      { id: 'c1', label: 'Items secured', checked: false, comment: '' },
      { id: 'c2', label: 'Documents attached', checked: false, comment: '' },
      { id: 'c3', label: 'Seal intact', checked: false, comment: '' },
      { id: 'c4', label: 'Delivery notes signed', checked: false, comment: '' },
      // Invoice reason is presented as one more checklist field — it's required only when invoice photo is missing
      { id: 'c5', label: 'Invoice missing reason', checked: false, comment: '' },
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
      // If this was the invoice photo setter, mark the invoice-reason checklist field satisfied
      if (setter === setInvoicePhoto) {
        // clear any missing reason (invoice now present)
        setMissingInvoiceReason(null);
        setOtherReasonText('');
        setChecklist((prev) => prev.map((c) => (c.id === 'c5' ? { ...c, checked: true } : c)));
      }
    } catch (e: any) {
      console.warn(e);
      Alert.alert('Camera error', String(e));
    }
  }

  function isChecklistComplete() {
    // invoiceAvailable:false -> require missingInvoiceReason (and otherReasonText if Other chosen)
    const invoiceAvailable = !!getImageData(invoicePhoto);
    const baseOk = checklist
      .filter((c) => c.id !== 'c5')
      .every((c) => c.checked === true);
    // invoice reason field validation
    const invoiceReasonOk = invoiceAvailable ? true : !!missingInvoiceReason && (missingInvoiceReason !== 'Other' ? true : otherReasonText.trim().length > 0);
    // also ensure c5 is marked checked in the checklist state (keeps UI consistent)
    const c5Checked = checklist.find((c) => c.id === 'c5')?.checked === true;
    return baseOk && invoiceReasonOk && c5Checked;
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

      <View style={{ marginTop: 18, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Pressable style={[styles.photoBtn, { backgroundColor: '#666' }]} onPress={() => setChecklistVisible(true)}>
          <Text style={styles.photoBtnText}>Open Checklist</Text>
        </Pressable>

        <Button
          title={processing ? 'Processing...' : 'Complete Task'}
          onPress={mergeToPdf}
          // allow submission when POD exists and checklist (with conditional invoice rule) is satisfied
          disabled={processing || !getImageData(podPhoto) || !isChecklistComplete()}
        />
      </View>

      {/* Checklist Modal */}
      <Modal visible={checklistVisible} animationType="slide" onRequestClose={() => setChecklistVisible(false)}>
        <SafeAreaView style={{ flex: 1, padding: 18 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Checklist</Text>
          {checklist.map((c) => {
            // Render the special invoice-reason field differently; show it only when invoice NOT present
            if (c.id === 'c5') {
              const invInfo = getImageData(invoicePhoto);
              // if invoice is attached, don't show the missing-reason checklist entry
              if (invInfo) return null;
              const hasReason = !!missingInvoiceReason;
              return (
                <View key={c.id} style={{ marginBottom: 12, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 8 }}>
                  <Text style={{ fontWeight: '600', marginBottom: 6 }}>{c.label}</Text>
                      <Pressable
                        onPress={() => setShowReasonOptions((s) => !s)}
                        style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <Text style={{ color: hasReason ? '#111' : '#888' }}>
                          {hasReason ? (missingInvoiceReason === 'Other' ? `Other: ${otherReasonText || '(specify)'}` : missingInvoiceReason) : 'Select reason'}
                        </Text>
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
                            'Other: (specify the reason for rejection)'
                          ].map((r) => (
                            <Pressable key={r} style={[styles.photoBtn, { marginBottom: 8 }]} onPress={() => {
                              if (r.startsWith('Other')) {
                                setMissingInvoiceReason('Other');
                                // show text input immediately
                                setOtherReasonText('');
                              } else {
                                setMissingInvoiceReason(r);
                              }
                              // mark checklist invoice reason as checked
                              setChecklist((prev) => prev.map((c) => (c.id === 'c5' ? { ...c, checked: true } : c)));
                              // close options
                              setShowReasonOptions(false);
                            }}>
                              <Text style={styles.photoBtnText}>{r}</Text>
                            </Pressable>
                          ))}
                          {missingInvoiceReason === 'Other' ? (
                            <TextInput placeholder="Specify reason" value={otherReasonText} onChangeText={setOtherReasonText} style={{ borderWidth: 1, padding: 8, borderRadius: 8, marginTop: 6 }} />
                          ) : null}
                        </View>
                      ) : null}
                </View>
              );
            }

            return (
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
            );
          })}

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

