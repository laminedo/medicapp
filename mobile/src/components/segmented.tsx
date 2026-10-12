import { Pressable, View } from 'react-native';

import { colors, radius, shadows, type } from '@/theme';
import { ThemedText } from './themed-text';

// A choice between a few peers, laid out as equal segments. (@expo/ui's
// universal Picker offers only wheel and menu styles, which hide the options.)
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: colors.fill }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderCurve: 'continuous' },
              selected && { backgroundColor: colors.surface, boxShadow: shadows.card },
            ]}>
            <ThemedText style={[type.subhead, { fontWeight: '600', color: selected ? colors.label : colors.secondaryLabel }]}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
