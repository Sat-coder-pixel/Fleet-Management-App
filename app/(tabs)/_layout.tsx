import { Stack } from 'expo-router';
import React from 'react';

// Minimal layout: use a Stack so we can push the tasks screen
export default function TabLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* tasks should show a header so the back button appears when navigated to */}
      <Stack.Screen name="Pending Tasks" options={{ title: 'Tasks', headerShown: true }} />
    </Stack>
  );
}
