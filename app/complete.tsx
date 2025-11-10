// app/complete.tsx
import { ThemedText } from '@/components/themed-text';
import { API_BASE } from '@/services/api';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';

type ImgData = { uri?: string; base64?: string } | null;

const REASONS = [
  'Cancellation of PO',
  'Rejected due to carton damage',
  'No longer required',
  'Missed invoice',
  'Missed booking slot',
  'Other',
];

// ---- small utils ----
const pad2 = (n: number) => String(n).padStart(2, '0');
function nowStampAU() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const MM = pad2(d.getMonth() + 1);
  const DD = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}${MM}${DD}_${hh}${mm}${ss}`;
}

// Convert base64 -> Uint8Array
function base64ToBytes(b64: string) {
  const binary = globalThis.atob ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function CompleteTaskPlaceholder({ route }: any) {
  const router = useRouter();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Complete Task' });
  }, [navigation]);

  // --- Params merge ---
  const localParams = useLocalSearchParams();
  const mergedParams: Record<string, string> = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(localParams)) out[k] = String(v);
    return out;
  }, [localParams]);

  const invoiceIdParam =
    mergedParams.invoiceId ??
    mergedParams.invoiceid ??
    mergedParams.InvoiceId ??
    `INV-${Date.now()}`;

  // --- State ---
  const [podPhoto, setPodPhoto] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [invoicePhoto, setInvoicePhoto] = useState<ImagePicker.ImagePickerResult | null>(null);

  const [processing, setProcessing] = useState(false); // for Complete Task
  const [uploading, setUploading] = useState(false); // for Upload Images
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [taking, setTaking] = useState<{ pod?: boolean; inv?: boolean }>({});

  // Reason handling
  const [showReasonOptions, setShowReasonOptions] = useState(false);
  const [missingInvoiceReason, setMissingInvoiceReason] = useState<string | null>(null);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [requireReasonEvenIfInvoicePresent, setRequireReasonEvenIfInvoicePresent] = useState(false);

  // After successful OneDrive upload, store item paths + server filenames
  const [podItemPath, setPodItemPath] = useState<string | null>(null);
  const [invoiceItemPath, setInvoiceItemPath] = useState<string | null>(null);
  const [podServerFileName, setPodServerFileName] = useState<string | null>(null);
  const [invoiceServerFileName, setInvoiceServerFileName] = useState<string | null>(null);

  // Progress (0-100); null = not uploading
  const [podProgress, setPodProgress] = useState<number | null>(null);
  const [invoiceProgress, setInvoiceProgress] = useState<number | null>(null);

  // Guard double taps for capture actions
  async function guarded(action: () => Promise<void>, key: 'pod' | 'inv') {
    if (taking[key]) return;
    setTaking((s) => ({ ...s, [key]: true }));
    try {
      await action();
    } finally {
      setTaking((s) => ({ ...s, [key]: false }));
    }
  }

  async function requestCameraPermissions() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  }

  async function ensureGalleryPermission() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    return status === 'granted';
  }

  // Filenames (client-side; backend still builds canonical names incl. description)
  function makeFilenames() {
    const stamp = nowStampAU();
    const inv = invoiceIdParam;
    return {
      podFilename: `PodImage_${inv}_${stamp}.jpg`,
      invoiceFilename: `InvoiceImage_${inv}_${stamp}.jpg`,
    };
  }

  async function scanInvoicePhoto() {
    const ok = await requestCameraPermissions();
    if (!ok) {
      Alert.alert('Permission required', 'Camera permission is required to scan documents');
      return;
    }
    try {
      const result = await DocumentScanner.scanDocument({
        letUserAdjustCrop: true,
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      });

      const scannedImages = result?.scannedImages ?? [];
      if (scannedImages.length > 0) {
        const scannedUri = scannedImages[0];
        setInvoicePhoto({ assets: [{ uri: scannedUri }] } as ImagePicker.ImagePickerResult);
        setMissingInvoiceReason(null);
        setOtherReasonText('');

        // Invalidate any previous uploaded link since image changed
        setInvoiceItemPath(null);
        setInvoiceServerFileName(null);
        setInvoiceProgress(null);

        if (saveToGallery) {
          const granted = await ensureGalleryPermission();
          if (granted) await MediaLibrary.saveToLibraryAsync(scannedUri);
        }
      } else {
        Alert.alert('Scan canceled', 'No image was captured.');
      }
    } catch (error: any) {
      console.error('Scanner error', error);
      Alert.alert('Error', error.message || 'Failed to scan invoice.');
    }
  }

  async function takePhoto(setter: (p: ImagePicker.ImagePickerResult) => void, label: string) {
    const ok = await requestCameraPermissions();
    if (!ok) {
      Alert.alert('Permission required', 'Camera permission is required to take photos');
      return;
    }

    try {
      const res = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
      const canceled =
        'canceled' in res ? (res as any).canceled : 'cancelled' in res ? (res as any).cancelled : false;

      if (!canceled) {
        setter(res as ImagePicker.ImagePickerResult);

        const imgUri = (res as any).assets?.[0]?.uri;
        if (imgUri && saveToGallery) {
          const granted = await ensureGalleryPermission();
          if (granted) await MediaLibrary.saveToLibraryAsync(imgUri);
        }

        // Invalidate uploaded references if user retakes
        if (setter === setInvoicePhoto) {
          setMissingInvoiceReason(null);
          setOtherReasonText('');
          setInvoiceItemPath(null);
          setInvoiceServerFileName(null);
          setInvoiceProgress(null);
        }
        if (setter === setPodPhoto) {
          setPodItemPath(null);
          setPodServerFileName(null);
          setPodProgress(null);
        }
      }
    } catch (e: any) {
      console.warn(e);
      Alert.alert('Camera error', String(e));
    }
  }

  async function pickFromGallery(setter: (p: ImagePicker.ImagePickerResult) => void) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Gallery access is required to pick photos');
      return;
    }
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
      if (!res.canceled) {
        setter(res as ImagePicker.ImagePickerResult);
        if (setter === setPodPhoto) {
          setPodItemPath(null);
          setPodServerFileName(null);
          setPodProgress(null);
        }
        if (setter === setInvoicePhoto) {
          setInvoiceItemPath(null);
          setInvoiceServerFileName(null);
          setInvoiceProgress(null);
          setMissingInvoiceReason(null);
          setOtherReasonText('');
        }
      }
    } catch (e: any) {
      console.warn('Gallery pick error', e);
    }
  }

  function getImageData(res: ImagePicker.ImagePickerResult | null): ImgData {
    if (!res) return null;
    const anyRes = res as any;
    if (anyRes.assets && Array.isArray(anyRes.assets) && anyRes.assets.length > 0) {
      const a = anyRes.assets[0];
      return { uri: a.uri, base64: a.base64 };
    }
    if (anyRes.uri) return { uri: anyRes.uri, base64: anyRes.base64 };
    return null;
  }

  function renderThumb(img: ImagePicker.ImagePickerResult | null, label: string) {
    const info = getImageData(img);
    if (!info || !info.uri) return <Text style={styles.placeholder}>{label} (not taken)</Text>;
    if (Platform.OS === 'web')
      return (
        <img
          src={info.uri}
          style={{ width: '100%', height: 200, borderRadius: 8, objectFit: 'cover' }}
        /> as any
      );
    return <Image source={{ uri: info.uri }} style={styles.thumb} />;
  }

  // ---- OneDrive direct upload flow ----

  // Read entire file as bytes (Uint8Array)
  async function readFileBytes(uri: string): Promise<Uint8Array> {
    if (!uri) throw new Error('Invalid URI');
    // Native: file:// — use FileSystem to get base64
    if (uri.startsWith('file://') || Platform.OS !== 'web') {
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      return base64ToBytes(b64);
    }
    // Web: fetch blob and arrayBuffer
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  }

  // small retry helper for chunk PUT
  async function putWithRetry(url: string, slice: Uint8Array, contentRange: string, tries = 3) {
    let attempt = 0;
    while (attempt < tries) {
      attempt++;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Length': String(slice.length),
          'Content-Range': contentRange,
        },
        body: slice,
      });
      if (res.ok || res.status === 202 || res.status === 201) return;
      if (attempt >= tries) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Chunk upload failed (${res.status}) ${txt}`.trim());
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  async function uploadInChunks(
    uploadUrl: string,
    bytes: Uint8Array,
    chunkSize = 5 * 1024 * 1024,
    onProgress?: (pct: number) => void
  ) {
    const total = bytes.length;
    let start = 0;

    // progress init
    if (onProgress) onProgress(0);

    while (start < total) {
      const end = Math.min(start + chunkSize, total);
      const slice = bytes.subarray(start, end);
      const contentRange = `bytes ${start}-${end - 1}/${total}`;
      await putWithRetry(uploadUrl, slice, contentRange, 3);
      start = end;

      if (onProgress) {
        const pct = Math.min(100, Math.floor((start / total) * 100));
        onProgress(pct);
      }
    }
  }

  // Step 1: upload both images (if present) — must succeed before completion
  async function onUploadImages() {
    const podInfo = getImageData(podPhoto);
    const invInfo = getImageData(invoicePhoto);

    if (!podInfo?.uri) {
      Alert.alert('Missing POD', 'Please take or pick the POD photo before uploading.');
      return;
    }
    if (!invInfo?.uri && !missingInvoiceReason) {
      Alert.alert('Missing invoice', 'Add invoice photo or choose a reason.');
      return;
    }

    const { podFilename, invoiceFilename } = makeFilenames();

    setUploading(true);
    setPodProgress(0);
    if (invInfo?.uri) setInvoiceProgress(0);

    try {
      // Ask backend to create sessions and return uploadUrls & itemPaths
      const body = {
        assignedTaskId:
          Number(
            mergedParams.assignedTaskId ??
              mergedParams.assignedtaskid ??
              mergedParams.taskId ??
              mergedParams.taskid ??
              ''
          ),
        truckNo:
          mergedParams.truckNo ??
          mergedParams.truckno ??
          mergedParams.truckId ??
          mergedParams.truckid ??
          'unknown',
        driverName: mergedParams.driverName ?? mergedParams.drivername ?? 'Unknown',
        invoiceId: invoiceIdParam,
        podFilename,
        invoiceFilename,
        includeInvoice: Boolean(invInfo?.uri),
      };

      const createRes = await fetch(`${API_BASE}/driver/createUploadSessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!createRes.ok) {
        const t = await createRes.text();
        throw new Error(t || 'Failed to create upload sessions');
      }
      const createJson: any = await createRes.json();

      const serverChunkHint: number | undefined = createJson?.chunkHintBytes;
      const chunkSize =
        typeof serverChunkHint === 'number' && serverChunkHint > 0
          ? serverChunkHint
          : 5 * 1024 * 1024;

      // Upload POD (required)
      if (!createJson?.pod?.uploadUrl || !createJson?.pod?.itemPath) {
        throw new Error('Missing POD upload session data from server');
      }
      const podBytes = await readFileBytes(podInfo.uri!);
      await uploadInChunks(createJson.pod.uploadUrl, podBytes, chunkSize, (p) =>
        setPodProgress(p)
      );
      setPodItemPath(createJson.pod.itemPath);
      setPodServerFileName(createJson.pod.fileName || null);

      // Upload Invoice if available
      if (invInfo?.uri && createJson?.invoice?.uploadUrl && createJson?.invoice?.itemPath) {
        const invBytes = await readFileBytes(invInfo.uri);
        await uploadInChunks(createJson.invoice.uploadUrl, invBytes, chunkSize, (p) =>
          setInvoiceProgress(p)
        );
        setInvoiceItemPath(createJson.invoice.itemPath);
        setInvoiceServerFileName(createJson.invoice.fileName || null);
      } else if (!invInfo?.uri) {
        // User selected reason; keep invoiceItemPath null
        setInvoiceItemPath(null);
        setInvoiceServerFileName(null);
        setInvoiceProgress(null);
      }

      // Ensure progress ends at 100 for visual polish
      setPodProgress(100);
      if (invInfo?.uri) setInvoiceProgress(100);

      Alert.alert('Uploaded', 'Images uploaded to OneDrive successfully.');
    } catch (e: any) {
      console.error('Upload error', e);
      setPodItemPath(null);
      setPodServerFileName(null);
      setPodProgress(null);
      setInvoiceItemPath(null);
      setInvoiceServerFileName(null);
      setInvoiceProgress(null);
      Alert.alert('Upload failed', e?.message || 'Could not upload images. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  // Step 2: finalize (tell backend to update DB and start background PDF creation)
  async function onCompleteTask() {
    const podUploaded = !!podItemPath;
    const invoiceOk = !!invoiceItemPath || !!missingInvoiceReason;

    if (!podUploaded) {
      Alert.alert('Not uploaded', 'Please upload images first.');
      return;
    }
    if (!invoiceOk) {
      Alert.alert('Missing invoice', 'Upload invoice or select a reason.');
      return;
    }

    setProcessing(true);
    try {
      const checklistPayload: Record<string, string> = {};
      if (missingInvoiceReason) {
        const reasonValue = missingInvoiceReason === 'Other' ? otherReasonText : missingInvoiceReason;
        if (reasonValue && reasonValue.trim().length > 0) {
          checklistPayload['missingInvoiceReason'] = reasonValue.trim();
        }
      }

      const body = {
        assignedTaskId:
          Number(
            mergedParams.assignedTaskId ??
              mergedParams.assignedtaskid ??
              mergedParams.taskId ??
              mergedParams.taskid ??
              ''
          ),
        truckNo:
          mergedParams.truckNo ??
          mergedParams.truckno ??
          mergedParams.truckId ??
          mergedParams.truckid ??
          'unknown',
        driverName: mergedParams.driverName ?? mergedParams.drivername ?? 'Unknown',
        invoiceId: invoiceIdParam,
        podItemPath,
        invoiceItemPath, // may be null if reason selected
        checklist: checklistPayload,
      };

      const res = await fetch(`${API_BASE}/driver/finalizeAssignmentUploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || 'Finalize failed');
      }

      Alert.alert('Success', 'Task completed successfully');

      try {
        const truckNo =
          mergedParams.truckNo ??
          mergedParams.truckno ??
          mergedParams.truckId ??
          mergedParams.truckid;
        if (truckNo) {
          const storage = (await import('@/storage/store')).default;
          await storage.saveTasksForTruck(truckNo, []);
        }
      } catch {}

      router.push('/tasks');
    } catch (e: any) {
      console.warn('Finalize error', e);
      Alert.alert('Error', e?.message || 'Task submission failed.');
    } finally {
      setProcessing(false);
    }
  }

  // computed UI state
  const podInfo = getImageData(podPhoto);
  const invoiceInfo = getImageData(invoicePhoto);

  const invoiceSatisfied =
    !!invoiceInfo?.uri || !!missingInvoiceReason; // either image or reason

  const uploadDisabled =
    uploading ||
    !podInfo?.uri ||
    (!invoiceInfo?.uri && !missingInvoiceReason); // need pod + (invoice or reason)

  const completeDisabled =
    processing ||
    uploading ||
    !podItemPath || // must have successfully uploaded
    !invoiceSatisfied ||
    (missingInvoiceReason === 'Other' && otherReasonText.trim().length === 0);

  // --- simple progress bar component ---
  const Progress = ({ pct }: { pct: number }) => (
    <View style={styles.progressOuter}>
      <View style={[styles.progressInner, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        extraScrollHeight={100}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        {/* --- Task Context --- */}
        <View style={styles.contextChip}>
          <Text style={styles.contextTitle}>Task Context</Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <View style={styles.pillInfo}>
              <Text style={styles.pillInfoText}>
                Order: {mergedParams.orderNumber ?? mergedParams.ordernumber ?? '—'}
              </Text>
            </View>
            <View style={styles.pillInfo}>
              <Text style={styles.pillInfoText}>
                Invoice: {invoiceIdParam}
              </Text>
            </View>
          </View>
        </View>

        <ThemedText style={{ marginTop: 8, marginBottom: 12, fontSize: 16, fontWeight: '600' }}>
          Take or Upload POD and Invoice photos.
        </ThemedText>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontWeight: '600', marginRight: 8 }}>Save photos to gallery</Text>
          <Switch value={saveToGallery} onValueChange={setSaveToGallery} />
        </View>

        {/* --- POD --- */}
        <View style={{ marginTop: 8 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>POD Photo</Text>
            {renderThumb(podPhoto, 'POD Photo')}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: podInfo ? '#28a745' : '#1b7ed6' }]}
                onPress={() => guarded(() => takePhoto(setPodPhoto, 'POD Photo'), 'pod')}
              >
                <Text style={styles.photoBtnText}>{podInfo ? 'Retake POD' : 'Take POD'}</Text>
              </Pressable>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: '#6c757d' }]}
                onPress={() => pickFromGallery(setPodPhoto)}
              >
                <Text style={styles.photoBtnText}>Pick</Text>
              </Pressable>
            </View>

            {/* Upload status for POD */}
            {typeof podProgress === 'number' ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: '#333', marginBottom: 4 }}>Uploading POD: {podProgress}%</Text>
                <Progress pct={podProgress} />
              </View>
            ) : null}

            {podItemPath ? (
              <Text style={{ marginTop: 6, color: '#2a6' }}>
                Uploaded ✓ {podServerFileName ? `(${podServerFileName})` : ''}
              </Text>
            ) : null}
          </View>

          {/* --- Invoice --- */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Invoice Photo (optional)</Text>
            {renderThumb(invoicePhoto, 'Invoice Photo')}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: '#6f42c1' }]}
                onPress={() => guarded(scanInvoicePhoto, 'inv')}
              >
                <Text style={styles.photoBtnText}>
                  {invoiceInfo ? 'Rescan Invoice' : 'Scan Invoice'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: '#6c757d' }]}
                onPress={() => pickFromGallery(setInvoicePhoto)}
              >
                <Text style={styles.photoBtnText}>Pick</Text>
              </Pressable>
            </View>

            {/* Upload status for Invoice */}
            {typeof invoiceProgress === 'number' ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: '#333', marginBottom: 4 }}>
                  Uploading Invoice: {invoiceProgress}%
                </Text>
                <Progress pct={invoiceProgress} />
              </View>
            ) : null}

            {invoiceItemPath ? (
              <Text style={{ marginTop: 6, color: '#2a6' }}>
                Uploaded ✓ {invoiceServerFileName ? `(${invoiceServerFileName})` : ''}
              </Text>
            ) : null}
          </View>
        </View>

        {/* --- Reason Dropdown --- */}
        <View style={{ marginTop: 18 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text style={{ fontWeight: '600' }}>Require reason even if invoice present</Text>
            <Switch
              value={requireReasonEvenIfInvoicePresent}
              onValueChange={setRequireReasonEvenIfInvoicePresent}
            />
          </View>

          {!invoiceInfo || requireReasonEvenIfInvoicePresent ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontWeight: '600', marginBottom: 6 }}>Reason (optional)</Text>
              <Pressable onPress={() => setShowReasonOptions((s) => !s)} style={styles.dropdown}>
                <Text style={{ color: missingInvoiceReason ? '#111' : '#888' }}>
                  {missingInvoiceReason
                    ? missingInvoiceReason === 'Other'
                      ? `Other: ${otherReasonText || '(specify)'}`
                      : missingInvoiceReason
                    : 'Select reason (required if invoice missing)'}
                </Text>
                <Text style={{ color: '#888' }}>▾</Text>
              </Pressable>

              {showReasonOptions ? (
                <View style={styles.pillWrap}>
                  {REASONS.map((r) => {
                    const selected = r === missingInvoiceReason;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => {
                          setMissingInvoiceReason(r);
                          if (r === 'Other') setOtherReasonText('');
                          setShowReasonOptions(false);
                        }}
                        style={[
                          styles.pill,
                          { backgroundColor: selected ? '#1b7ed6' : '#eef2f7' },
                        ]}
                      >
                        <Text style={{ color: selected ? '#fff' : '#223' }}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {missingInvoiceReason === 'Other' ? (
                <TextInput
                  placeholder="Specify reason"
                  value={otherReasonText}
                  onChangeText={setOtherReasonText}
                  style={{ borderWidth: 1, padding: 8, borderRadius: 8, marginTop: 6 }}
                />
              ) : null}
            </View>
          ) : null}

          {/* Upload Images first */}
          <Pressable
            onPress={onUploadImages}
            disabled={uploadDisabled || uploading}
            style={({ pressed }) => ({
              backgroundColor: uploadDisabled || uploading ? '#bbb' : '#5c6bc0',
              opacity: pressed ? 0.85 : 1,
              paddingVertical: 14,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 6,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
              {uploading ? 'Uploading…' : 'Upload Images'}
            </Text>
          </Pressable>

          {/* Complete after upload */}
          <Pressable
            onPress={onCompleteTask}
            disabled={completeDisabled}
            style={({ pressed }) => ({
              backgroundColor: completeDisabled ? '#ccc' : '#1b7ed6',
              opacity: pressed ? 0.85 : 1,
              paddingVertical: 14,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 12,
            })}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
              {processing ? 'Finalizing…' : 'Complete Task'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, paddingTop: 5, backgroundColor: '#fff' },
  thumb: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    resizeMode: 'cover',
    backgroundColor: '#eee',
  },
  placeholder: { color: '#666', padding: 12, textAlign: 'center' },
  photoBtn: {
    backgroundColor: '#1b7ed6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  photoBtnText: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fafafa',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#222' },
  contextChip: {
    backgroundColor: '#eef6ff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  contextTitle: { fontWeight: '700', marginBottom: 6, color: '#123' },
  pillInfo: {
    backgroundColor: '#dfefff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  pillInfoText: { color: '#123' },
  dropdown: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },

  // progress
  progressOuter: {
    height: 8,
    width: '100%',
    borderRadius: 6,
    backgroundColor: '#e9edf5',
    overflow: 'hidden',
  },
  progressInner: {
    height: 8,
    borderRadius: 6,
    backgroundColor: '#1b7ed6',
  },
});
