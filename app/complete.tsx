import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';

export default function CompleteTaskPlaceholder() {
  return (
    <SafeAreaView style={styles.container}>
      <View>
        <ThemedText type="title">Complete Task</ThemedText>
        <ThemedText style={{ marginTop: 8 }}>This page is a placeholder. We'll design the Complete Task flow next.</ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, backgroundColor: '#fff' },
});
