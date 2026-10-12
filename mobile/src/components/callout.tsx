import { View } from 'react-native';

import { colors, radius, spacing, useBrand } from '@/theme';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const ICON: Record<Tone, IconName> = { ok: 'check', warn: 'alert', danger: 'alert', neutral: 'info' };

// A short, coloured note inside a screen: instructions, care notes, results.
export function Callout({ tone, title, text }: { tone: Tone; title?: string; text?: string }) {
  const brand = useBrand();
  const paint = {
    ok: { background: brand.accentWash, accent: brand.accent },
    warn: { background: brand.warnWash, accent: brand.warn },
    danger: { background: brand.dangerWash, accent: brand.danger },
    neutral: { background: colors.fill, accent: colors.secondaryLabel },
  }[tone];

  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: paint.background }}>
      <View style={{ paddingTop: 2 }}>
        <Icon name={ICON[tone]} size={16} color={paint.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {title && (
          <ThemedText variant="subhead" selectable style={{ fontWeight: '600', color: tone === 'danger' ? paint.accent : colors.label }}>
            {title}
          </ThemedText>
        )}
        {text && (
          <ThemedText variant="subhead" selectable style={{ color: colors.label }}>
            {text}
          </ThemedText>
        )}
      </View>
    </View>
  );
}
