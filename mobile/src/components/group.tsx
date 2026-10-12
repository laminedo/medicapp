import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

// A grouped list: one surface, rows divided by inset hairlines. Used instead
// of putting every row in its own card.
export function Group({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderCurve: 'continuous', overflow: 'hidden' }}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 && <View style={{ height: StyleSheet.hairlineWidth, marginLeft: spacing.lg, backgroundColor: colors.separator }} />}
          {row}
        </View>
      ))}
    </View>
  );
}

export function Section({ title, trailing, children }: { title?: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {(title || trailing) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xs }}>
          {title && <ThemedText variant="headline">{title}</ThemedText>}
          {trailing}
        </View>
      )}
      {children}
    </View>
  );
}

export function Row({
  leading,
  title,
  subtitle,
  detail,
  trailing,
  onPress,
  chevron = Boolean(onPress),
  emphasised = false,
}: {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  emphasised?: boolean;
}) {
  const content = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText variant="body" style={{ fontWeight: emphasised ? '700' : '600' }}>
          {title}
        </ThemedText>
        {subtitle && <ThemedText variant="subhead">{subtitle}</ThemedText>}
        {detail && (
          <ThemedText variant="subhead" numberOfLines={1}>
            {detail}
          </ThemedText>
        )}
      </View>
      {trailing}
      {chevron && <Icon name="chevron" size={13} color={colors.tertiaryLabel} />}
    </>
  );
  const box = { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.md, paddingHorizontal: spacing.lg } as const;

  if (!onPress) return <View style={box}>{content}</View>;
  return (
    // Rows highlight when pressed. They do not scale: that is for buttons.
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [box, pressed && { backgroundColor: colors.fill }]}>
      {content}
    </Pressable>
  );
}
