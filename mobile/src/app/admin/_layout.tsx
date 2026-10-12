import { Link } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { stackOptions } from '@/components/stack-options';
import { ThemedText } from '@/components/themed-text';
import { useBrand } from '@/theme';

function AccountLink() {
  const brand = useBrand();
  return (
    <Link href="/admin/account" accessibilityRole="button">
      <ThemedText variant="body" style={{ color: brand.accent }}>
        Account
      </ThemedText>
    </Link>
  );
}

export default function Layout() {
  return (
    <Stack screenOptions={stackOptions}>
      <Stack.Screen name="index" options={{ title: 'Overview', headerRight: () => <AccountLink /> }} />
      <Stack.Screen name="account" options={{ title: 'Account', headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
