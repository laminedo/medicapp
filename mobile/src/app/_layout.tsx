import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ComponentProps } from 'react';
import { useColorScheme } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { SessionProvider, useSession } from '@/hooks/use-session';
import { useBrand } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15 * 1000, retry: 1 } },
});

// A sheet rises from the bottom edge with a grabber and can be swiped away.
const sheet = (title: string): ComponentProps<typeof Stack.Screen>['options'] => ({
  title,
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.75, 1],
  headerShown: false,
});

function RootStack() {
  const { status, user } = useSession();

  // Nothing routes until the saved session has been checked, or a signed-in
  // user would see the sign-in screen flash on every launch.
  useEffect(() => {
    if (status !== 'loading') void SplashScreen.hideAsync();
  }, [status]);
  if (status === 'loading') return null;

  const role = status === 'signedIn' ? user?.role : null;
  return (
    <Stack>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={role === 'staff'}>
        <Stack.Screen name="(staff)" options={{ headerShown: false }} />
        <Stack.Screen name="record-dose" options={sheet('Record dose')} />
        <Stack.Screen name="prn-dose" options={sheet('As-needed dose')} />
      </Stack.Protected>
      <Stack.Protected guard={role === 'admin'}>
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const brand = useBrand();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  // The accent tints navigation chrome: back buttons, links, selected tabs.
  const theme = { ...base, colors: { ...base.colors, primary: brand.accent } };

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <KeyboardProvider>
          <ThemeProvider value={theme}>
            <RootStack />
            <StatusBar style="auto" />
          </ThemeProvider>
        </KeyboardProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
