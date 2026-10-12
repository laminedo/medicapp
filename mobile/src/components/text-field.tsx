import type { Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, type, useBrand } from '@/theme';
import { ThemedText } from './themed-text';

// A labelled input. The label is always visible; the placeholder is only a hint.
export function TextField({ label, hint, optional = false, multiline, style, ref, ...props }: TextInputProps & { label: string; hint?: string; optional?: boolean; ref?: Ref<TextInput> }) {
  const brand = useBrand();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <ThemedText variant="footnote" style={{ fontWeight: '600', color: colors.label }}>
          {label}
        </ThemedText>
        {optional && <ThemedText variant="footnote">Optional</ThemedText>}
      </View>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint}
        multiline={multiline}
        placeholderTextColor={colors.tertiaryLabel}
        selectionColor={brand.accent}
        style={[
          type.body,
          {
            minHeight: multiline ? 96 : 48,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            backgroundColor: colors.fill,
            textAlignVertical: multiline ? 'top' : 'center',
          },
          style,
        ]}
        {...props}
      />
      {hint && <ThemedText variant="footnote">{hint}</ThemedText>}
    </View>
  );
}
