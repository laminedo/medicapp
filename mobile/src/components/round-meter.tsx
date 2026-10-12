import { View } from 'react-native';

import type { Counts } from '@/api/types';
import { radius, spacing, useBrand } from '@/theme';
import { ThemedText } from './themed-text';

// The medication round as one bar: the proportions are the information.
export function RoundMeter({ counts }: { counts: Counts }) {
  const brand = useBrand();
  const parts = [
    { key: 'given', label: 'Given', count: counts.given, color: brand.accent },
    { key: 'skipped', label: 'Refused or held', count: counts.refused + counts.held, color: brand.inkSoft },
    { key: 'due', label: 'Due now', count: counts.due, color: brand.warnSolid },
    { key: 'late', label: 'Late', count: counts.overdue + counts.missed, color: brand.dangerSolid },
    { key: 'upcoming', label: 'Later', count: counts.upcoming, color: brand.fillSolid },
  ].filter((part) => part.key !== 'skipped' || part.count > 0); // only shown on a day it happened

  const summary = parts.map((part) => `${part.count} ${part.label.toLowerCase()}`).join(', ');
  const shown = parts.filter((part) => part.count > 0);

  return (
    <View style={{ gap: spacing.md }}>
      <View accessible accessibilityRole="image" accessibilityLabel={`Of ${counts.total} doses: ${summary}.`} style={{ flexDirection: 'row', gap: 3, height: 12 }}>
        {shown.length === 0 ? (
          <View style={{ flex: 1, borderRadius: radius.full, backgroundColor: brand.fillSolid }} />
        ) : (
          shown.map((part) => <View key={part.key} style={{ flexGrow: part.count, flexBasis: 0, minWidth: 8, borderRadius: 4, backgroundColor: part.color }} />)
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
        {parts.map((part) => (
          <View key={part.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: part.color }} />
            <ThemedText variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
              {part.count}
            </ThemedText>
            <ThemedText variant="subhead">{part.label}</ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}
