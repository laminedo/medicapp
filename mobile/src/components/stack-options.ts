import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router/stack';

import { colors } from '@/theme';

// Shared by every stack: the system large title that collapses on scroll, on
// the same ground as the screen. Titles come from the navigation bar, never
// from text drawn on the page.
export const stackOptions: ComponentProps<typeof Stack>['screenOptions'] = {
  headerLargeTitleEnabled: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerStyle: { backgroundColor: colors.background as string },
  headerLargeStyle: { backgroundColor: colors.background as string },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: colors.background },
};
