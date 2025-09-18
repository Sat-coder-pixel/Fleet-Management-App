
import { ThemedText } from '@/components/themed-text';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import React, { useState } from 'react';
import { Alert, Button, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompleteTaskPlaceholder({ route }: any) {
  // route?.params?.assignedTaskId may be passed
  const [podPhoto, setPodPhoto] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [invoicePhoto, setInvoicePhoto] = useState<ImagePicker.ImagePickerResult | null>(null);
  const [processing, setProcessing] = useState(false);

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
      Alert.alert('Missing photos', 'Please take both POD and Invoice photos before creating PDF.');
      return;
    }

    setProcessing(true);
    try {
        // On web, use the image URIs directly (they may be blob: or data: URIs).
        let html: string;
        if (Platform.OS === 'web') {
          const podUri = podInfo!.uri;
          const invUri = invInfo!.uri;
          console.debug('Creating PDF on web with URIs', { podUri, invUri });
          html = `
            <html>
              <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <style>body{font-family: Arial, sans-serif; padding:12px;} img{width:100%; height:auto; margin-bottom:12px;}</style>
              </head>
              <body>
                <h3>POD Photo</h3>
                <img src="${podUri}" />
                <div style="page-break-after: always;"></div>
                <h3>Invoice Photo</h3>
                <img src="${invUri}" />
              </body>
            </html>
          `;

          const { uri } = await Print.printToFileAsync({ html });
          // On web the uri is usually a blob or data URL we can open in a new tab so user can save/print.
          if (uri && (uri.startsWith('data:') || uri.startsWith('blob:') || uri.startsWith('http'))) {
            // @ts-ignore
            window.open(uri, '_blank');
            setProcessing(false);
            return;
          }

          // Fallback: try opening directly
          // @ts-ignore
          if (uri) { window.open(uri); setProcessing(false); return; }
          throw new Error('Unable to create PDF on web');
        }

        // Native flow: use base64 embedded images, or read file to base64 if base64 missing
        let podBase = podInfo!.base64;
        let invBase = invInfo!.base64;
        // if base64 is missing, try reading the file as base64
        const docDirFallback = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
        if (!podBase && podInfo!.uri) {
          try {
            podBase = await FileSystem.readAsStringAsync(podInfo!.uri, { encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64' });
          } catch (readErr) {
            console.warn('Read pod as base64 failed', readErr);
          }
        }
        if (!invBase && invInfo!.uri) {
          try {
            invBase = await FileSystem.readAsStringAsync(invInfo!.uri, { encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64' });
          } catch (readErr) {
            console.warn('Read invoice as base64 failed', readErr);
          }
        }

        if (!podBase || !invBase) {
          Alert.alert('Error', 'Captured images do not contain base64 data and could not be read from file.');
          setProcessing(false);
          return;
        }

        html = `
          <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <style>body{font-family: Arial, sans-serif; padding:12px;} img{width:100%; height:auto; margin-bottom:12px;}</style>
            </head>
            <body>
              <h3>POD Photo</h3>
              <img src="data:image/jpeg;base64,${podBase}" />
              <div style="page-break-after: always;"></div>
              <h3>Invoice Photo</h3>
              <img src="data:image/jpeg;base64,${invBase}" />
            </body>
          </html>
        `;

        const { uri } = await Print.printToFileAsync({ html });

        // Ensure directory
    const docDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    const dir = `${docDir}CompletedTasks`;
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

        const timestamp = Date.now();
        const fileName = `complete_${timestamp}.pdf`;
        const dest = `${dir}/${fileName}`;

        // Move/Copy the generated PDF into our folder
        // printToFileAsync returns a file URI; on native it's a file:// path
        await FileSystem.copyAsync({ from: uri, to: dest });

        Alert.alert('Saved', `PDF saved to ${dest}`);
    } catch (e: any) {
      console.warn(e);
      Alert.alert('Error', String(e));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ThemedText type="title">Complete Task</ThemedText>
      <ThemedText style={{ marginTop: 8, marginBottom: 12 }}>Take POD and Invoice photos, then merge into a PDF.</ThemedText>

      <View style={styles.row}>
        <View style={styles.thumbWrap}>
          {renderThumb(podPhoto, 'POD Photo')}
          <Pressable style={styles.photoBtn} onPress={() => takePhoto(setPodPhoto, 'POD Photo')}>
            <Text style={styles.photoBtnText}>Take POD Photo</Text>
          </Pressable>
        </View>

        <View style={styles.thumbWrap}>
          {renderThumb(invoicePhoto, 'Invoice Photo')}
          <Pressable style={styles.photoBtn} onPress={() => takePhoto(setInvoicePhoto, 'Invoice Photo')}>
            <Text style={styles.photoBtnText}>Take Invoice Photo</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <Button title={processing ? 'Processing...' : 'Merge to PDF'} onPress={mergeToPdf} disabled={processing} />
      </View>
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

