import type { ReactNode } from 'react';
import { RefreshControl, ScrollView } from 'react-native';

import { colors, gutter, spacing } from '@/theme';

// The scroll container every tab screen uses: system-managed safe areas, one
// edge padding, one gap between sections, and pull to refresh.
export function Screen({ children, refreshing = false, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: gutter, gap: spacing.xl, paddingBottom: spacing.xxxl }}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
      {children}
    </ScrollView>
  );
}
