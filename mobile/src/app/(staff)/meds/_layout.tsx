import { Stack } from 'expo-router/stack';

import { stackOptions } from '@/components/stack-options';

export default function Layout() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: 'Medications' }} />
    </Stack>
  );
}
