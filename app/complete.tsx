// app/complete.tsx
import { ThemedText } from '@/components/themed-text';
import { API_BASE } from '@/services/api';

// SDK 54: use legacy shim
// NOTE: import the legacy namespace and reference FileSystemUploadType from that namespace.
// Avoid importing FileSystemUploadType as a named import because it may be undefined in some build contexts.
import * as FileSystem from 'expo-file-system/legacy';

import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
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

/* ---------- Component ---------- */
export default function CompleteTaskPlaceholder() {
  const router = useRouter();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Complete Task' });
  }, [navigation]);

  // params
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

  // state
  const [podPhoto, setPodPhoto] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [invoicePhoto, setInvoicePhoto] = useState<ImagePicker.ImagePickerResult | null>(null);

  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);

  // only ask for gallery when needed
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [cameraGranted, setCameraGranted] = useState<boolean>(false);
  const [galleryGranted, setGalleryGranted] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const cam = await ImagePicker.getCameraPermissionsAsync();
        setCameraGranted(cam.status === 'granted');
        const lib = await MediaLibrary.getPermissionsAsync();
        setGalleryGranted(lib.status === 'granted');
      } catch {}
    })();
  }, []);

  // reason
  const [showReasonOptions, setShowReasonOptions] = useState(false);
  const [missingInvoiceReason, setMissingInvoiceReason] = useState<string | null>(null);
  const [otherReasonText, setOtherReasonText] = useState('');
  const [requireReasonEvenIfInvoicePresent, setRequireReasonEvenIfInvoicePresent] =
    useState(false);

  // upload results
  const [podItemPath, setPodItemPath] = useState<string | null>(null);
  const [invoiceItemPath, setInvoiceItemPath] = useState<string | null>(null);
  const [podServerFileName, setPodServerFileName] = useState<string | null>(null);
  const [invoiceServerFileName, setInvoiceServerFileName] = useState<string | null>(null);

  // progress
  const [podProgress, setPodProgress] = useState<number | null>(null);
  const [invoiceProgress, setInvoiceProgress] = useState<number | null>(null);

  // click guard
  const [taking, setTaking] = useState<{ pod?: boolean; inv?: boolean }>({});
  async function guarded(action: () => Promise<void>, key: 'pod' | 'inv') {
    if (taking[key]) return;
    setTaking((s) => ({ ...s, [key]: true }));
    try {
      await action();
    } finally {
      setTaking((s) => ({ ...s, [key]: false }));
    }
  }

  /* ---------- Permissions ---------- */
  async function ensureCameraPermission() {
    if (cameraGranted) return true;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    const ok = status === 'granted';
    setCameraGranted(ok);
    if (!ok) Alert.alert('Permission required', 'Camera permission is needed to take a photo.');
    return ok;
  }

  async function ensureGalleryPermissionIfNeeded(reason: 'pick' | 'save') {
    if (galleryGranted) return true;
    const current = await MediaLibrary.getPermissionsAsync();
    if (current.status === 'granted') {
      setGalleryGranted(true);
      return true;
    }
    if (!current.canAskAgain) {
      Alert.alert(
        'Gallery access needed',
        `Enable photo library access in device Settings to ${reason === 'pick' ? 'pick an image' : 'save photos to gallery'}.`
      );
      return false;
    }
    const req = await MediaLibrary.requestPermissionsAsync();
    const ok = req.status === 'granted';
    setGalleryGranted(ok);
    if (!ok) {
      Alert.alert(
        'Gallery access required',
        `We need photo library access to ${reason === 'pick' ? 'select an image' : 'save photos'}.`
      );
    }
    return ok;
  }

  /* ---------- filenames ---------- */
  function makeFilenames() {
    const stamp = nowStampAU();
    const inv = invoiceIdParam;
    return {
      podFilename: `PodImage_${inv}_${stamp}.jpg`,
      invoiceFilename: `InvoiceImage_${inv}_${stamp}.jpg`,
    };
  }

  /* ---------- capture / pick ---------- */
  async function scanInvoicePhoto() {
    const ok = await ensureCameraPermission();
    if (!ok) return;

    try {
      // Cast options as any because the plugin's TS types may not include some runtime options
      const result = await DocumentScanner.scanDocument({
        letUserAdjustCrop: true,
        maxNumDocuments: 1,
        croppedImageQuality: 90,
      } as any);
      const scanned = result?.scannedImages ?? [];
      if (!scanned.length) {
        Alert.alert('Scan canceled', 'No image was captured.');
        return;
      }

      const uri = scanned[0];
      setInvoicePhoto({ assets: [{ uri }] } as ImagePicker.ImagePickerResult);
      setMissingInvoiceReason(null);
      setOtherReasonText('');
      setInvoiceItemPath(null);
      setInvoiceServerFileName(null);
      setInvoiceProgress(null);

      if (saveToGallery) {
        const g = await ensureGalleryPermissionIfNeeded('save');
        if (g) await MediaLibrary.saveToLibraryAsync(uri);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to scan invoice.');
    }
  }

  async function takePhoto(setter: (p: ImagePicker.ImagePickerResult) => void) {
    const ok = await ensureCameraPermission();
    if (!ok) return;

    try {
      const res = await ImagePicker.launchCameraAsync({ base64: false, quality: 0.8 });
      const canceled = 'canceled' in res ? (res as any).canceled : false;
      if (canceled) return;

      setter(res as ImagePicker.ImagePickerResult);

      const imgUri = (res as any).assets?.[0]?.uri;
      if (imgUri && saveToGallery) {
        const g = await ensureGalleryPermissionIfNeeded('save');
        if (g) await MediaLibrary.saveToLibraryAsync(imgUri);
      }

      if (setter === setInvoicePhoto) {
        setMissingInvoiceReason(null);
        setOtherReasonText('');
        setInvoiceItemPath(null);
        setInvoiceServerFileName(null);
        setInvoiceProgress(null);
      } else {
        setPodItemPath(null);
        setPodServerFileName(null);
        setPodProgress(null);
      }
    } catch (e: any) {
      Alert.alert('Camera error', String(e));
    }
  }

  async function pickFromGallery(setter: (p: ImagePicker.ImagePickerResult) => void) {
    const ok = await ensureGalleryPermissionIfNeeded('pick');
    if (!ok) return;

    try {
      const res = await ImagePicker.launchImageLibraryAsync({ base64: false, quality: 0.8 });
      if (!res.canceled) {
        setter(res as ImagePicker.ImagePickerResult);
        if (setter === setPodPhoto) {
          setPodItemPath(null);
          setPodServerFileName(null);
          setPodProgress(null);
        } else {
          setInvoiceItemPath(null);
          setInvoiceServerFileName(null);
          setInvoiceProgress(null);
          setMissingInvoiceReason(null);
          setOtherReasonText('');
        }
      }
    } catch (e: any) {
      Alert.alert('Gallery error', String(e));
    }
  }

  /* ---------- helpers to read/stream ---------- */

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

  // Some Android URIs are content:// — copy to a local cache file so uploadAsync can stream it
  async function ensureFileUriNative(uri: string): Promise<string> {
    if (!uri) throw new Error('Invalid URI');
    if (uri.startsWith('file://')) return uri;

    const tmp = `${FileSystem.cacheDirectory}up_${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: tmp } as any);
    return tmp;
  }

  // Native: stream the whole file in a single PUT to the upload session
async function uploadNativeWhole(
  uploadUrl: string,
  fileUri: string,
  onProgress?: (p: number) => void
) {
  // Ensure we have a file:// path (content:// copied to cache)
  const localUri = await ensureFileUriNative(fileUri);

  const info = await FileSystem.getInfoAsync(localUri);
  const size = (info as any).size as number;
  if (!size || size <= 0) throw new Error('Could not determine file size');

  const headers: Record<string, string> = {
    'Content-Range': `bytes 0-${size - 1}/${size}`,
    'Content-Type': 'application/octet-stream',
  };

  if (onProgress) onProgress(0);

  // ⚠️ Do NOT read FileSystem.FileSystemUploadType from the enum (it may be undefined in release).
  // Binary upload type is 0 — use it directly as a safe fallback.
  const BINARY_UPLOAD_TYPE = 0;

  const res = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'PUT',
    uploadType: BINARY_UPLOAD_TYPE,
    headers,
    contentType: 'application/octet-stream',
  } as any);

  if (!(res.status >= 200 && res.status < 300) && res.status !== 202) {
    throw new Error(`Upload failed (${res.status}) ${res.body || ''}`);
  }

  if (onProgress) onProgress(100);
}

  // Web: chunked upload with fetch
  async function putWithRetryWeb(url: string, slice: Uint8Array, contentRange: string, tries = 3) {
    let attempt = 0;
    while (attempt < tries) {
      attempt++;
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Range': contentRange,
          'Content-Length': String(slice.length),
        },
        // Some TypeScript lib defs don't include Uint8Array as BodyInit; cast to any to satisfy the compiler.
        body: slice as any,
      });
      if (res.ok || res.status === 201 || res.status === 202) return;
      if (attempt >= tries) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Chunk upload failed (${res.status}) ${txt}`.trim());
      }
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }

  async function uploadWebInChunks(uploadUrl: string, bytes: Uint8Array, chunkSize = 5 * 1024 * 1024, onProgress?: (pct: number) => void) {
    const total = bytes.length;
    let start = 0;
    if (onProgress) onProgress(0);
    while (start < total) {
      const end = Math.min(start + chunkSize, total);
      const slice = bytes.subarray(start, end);
      const cr = `bytes ${start}-${end - 1}/${total}`;
      await putWithRetryWeb(uploadUrl, slice, cr, 3);
      start = end;
      if (onProgress) onProgress(Math.min(100, Math.floor((start / total) * 100)));
    }
  }

  // Web only: read file as bytes
  async function readFileBytesWeb(uri: string): Promise<Uint8Array> {
    const resp = await fetch(uri);
    const blob = await resp.blob();
    const ab = await blob.arrayBuffer();
    return new Uint8Array(ab);
  }

  /* ---------- upload flow ---------- */
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
      // 1) create upload sessions
      const body = {
        assignedTaskId: Number(
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
      if (!createRes.ok) throw new Error((await createRes.text()) || 'Failed to create upload sessions');
      const createJson: any = await createRes.json();

      const serverChunkHint: number | undefined = createJson?.chunkHintBytes;
      const chunkSize =
        typeof serverChunkHint === 'number' && serverChunkHint > 0
          ? serverChunkHint
          : 5 * 1024 * 1024;

      // 2) upload POD
      if (!createJson?.pod?.uploadUrl || !createJson?.pod?.itemPath) {
        throw new Error('Missing POD upload session data from server');
      }

      if (Platform.OS === 'web') {
        const podBytes = await readFileBytesWeb(podInfo.uri!);
        await uploadWebInChunks(createJson.pod.uploadUrl, podBytes, chunkSize, setPodProgress);
      } else {
        await uploadNativeWhole(createJson.pod.uploadUrl, podInfo.uri!, setPodProgress);
      }
      setPodItemPath(createJson.pod.itemPath);
      setPodServerFileName(createJson.pod.fileName || null);

      // 3) upload Invoice if present
      if (invInfo?.uri && createJson?.invoice?.uploadUrl && createJson?.invoice?.itemPath) {
        if (Platform.OS === 'web') {
          const invBytes = await readFileBytesWeb(invInfo.uri!);
          await uploadWebInChunks(createJson.invoice.uploadUrl, invBytes, chunkSize, setInvoiceProgress);
        } else {
          await uploadNativeWhole(createJson.invoice.uploadUrl, invInfo.uri!, setInvoiceProgress);
        }
        setInvoiceItemPath(createJson.invoice.itemPath);
        setInvoiceServerFileName(createJson.invoice.fileName || null);
      } else if (!invInfo?.uri) {
        setInvoiceItemPath(null);
        setInvoiceServerFileName(null);
        setInvoiceProgress(null);
      }

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
        const reasonValue =
          missingInvoiceReason === 'Other' ? otherReasonText : missingInvoiceReason;
        if (reasonValue && reasonValue.trim().length > 0) {
          checklistPayload['missingInvoiceReason'] = reasonValue.trim();
        }
      }

      const body = {
        assignedTaskId: Number(
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
        invoiceItemPath,
        checklist: checklistPayload,
      };

      const res = await fetch(`${API_BASE}/driver/finalizeAssignmentUploads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Finalize failed');

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
      Alert.alert('Error', e?.message || 'Task submission failed.');
    } finally {
      setProcessing(false);
    }
  }

  /* ---------- UI ---------- */
  const podInfo = getImageData(podPhoto);
  const invoiceInfo = getImageData(invoicePhoto);
  const invoiceSatisfied = !!invoiceInfo?.uri || !!missingInvoiceReason;

  const uploadDisabled =
    uploading || !podInfo?.uri || (!invoiceInfo?.uri && !missingInvoiceReason);

  const completeDisabled =
    processing ||
    uploading ||
    !podItemPath ||
    !invoiceSatisfied ||
    (missingInvoiceReason === 'Other' && otherReasonText.trim().length === 0);

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
        {/* Context */}
        <View style={styles.contextChip}>
          <Text style={styles.contextTitle}>Task Context</Text>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <View style={styles.pillInfo}>
              <Text style={styles.pillInfoText}>
                Order: {mergedParams.orderNumber ?? mergedParams.ordernumber ?? '—'}
              </Text>
            </View>
            <View style={styles.pillInfo}>
              <Text style={styles.pillInfoText}>Invoice: {invoiceIdParam}</Text>
            </View>
          </View>
        </View>

        <ThemedText style={{ marginTop: 8, marginBottom: 12, fontSize: 16, fontWeight: '600' }}>
          Take or Upload POD and Invoice photos.
        </ThemedText>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontWeight: '600', marginRight: 8 }}>Save photos to gallery</Text>
          <Switch
            value={saveToGallery}
            onValueChange={async (v) => {
              setSaveToGallery(v);
              if (v && !galleryGranted) await ensureGalleryPermissionIfNeeded('save');
            }}
          />
        </View>

        {/* POD */}
        <View style={{ marginTop: 8 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>POD Photo</Text>
            {podInfo?.uri ? (
              Platform.OS === 'web' ? (
                <img src={podInfo.uri} style={{ width: '100%', height: 200, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <Image source={{ uri: podInfo.uri }} style={styles.thumb} />
              )
            ) : (
              <Text style={styles.placeholder}>POD Photo (not taken)</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: podInfo ? '#28a745' : '#1b7ed6' }]}
                onPress={() => guarded(() => takePhoto(setPodPhoto), 'pod')}
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

          {/* Invoice */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Invoice Photo (optional)</Text>
            {invoiceInfo?.uri ? (
              Platform.OS === 'web' ? (
                <img src={invoiceInfo.uri} style={{ width: '100%', height: 200, borderRadius: 8, objectFit: 'cover' }} />
              ) : (
                <Image source={{ uri: invoiceInfo.uri }} style={styles.thumb} />
              )
            ) : (
              <Text style={styles.placeholder}>Invoice Photo (not taken)</Text>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: '#6f42c1' }]}
                onPress={() => guarded(scanInvoicePhoto, 'inv')}
              >
                <Text style={styles.photoBtnText}>{invoiceInfo ? 'Rescan Invoice' : 'Scan Invoice'}</Text>
              </Pressable>
              <Pressable
                style={[styles.photoBtn, { backgroundColor: '#6c757d' }]}
                onPress={() => pickFromGallery(setInvoicePhoto)}
              >
                <Text style={styles.photoBtnText}>Pick</Text>
              </Pressable>
            </View>

            {typeof invoiceProgress === 'number' ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: '#333', marginBottom: 4 }}>Uploading Invoice: {invoiceProgress}%</Text>
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

        {/* Reason */}
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontWeight: '600' }}>Require reason even if invoice present</Text>
            <Switch value={requireReasonEvenIfInvoicePresent} onValueChange={setRequireReasonEvenIfInvoicePresent} />
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
                        style={[styles.pill, { backgroundColor: selected ? '#1b7ed6' : '#eef2f7' }]}
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

          {/* Upload first */}
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

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, paddingTop: 5, backgroundColor: '#fff' },
  thumb: { width: '100%', height: 200, borderRadius: 8, resizeMode: 'cover', backgroundColor: '#eee' },
  placeholder: { color: '#666', padding: 12, textAlign: 'center' },
  photoBtn: { backgroundColor: '#1b7ed6', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  photoBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fafafa', padding: 12, borderRadius: 10, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#222' },
  contextChip: { backgroundColor: '#eef6ff', borderRadius: 10, padding: 12, marginBottom: 8 },
  contextTitle: { fontWeight: '700', marginBottom: 6, color: '#123' },
  pillInfo: { backgroundColor: '#dfefff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14 },
  pillInfoText: { color: '#123' },
  dropdown: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  progressOuter: { height: 8, width: '100%', borderRadius: 6, backgroundColor: '#e9edf5', overflow: 'hidden' },
  progressInner: { height: 8, borderRadius: 6, backgroundColor: '#1b7ed6' },
});
