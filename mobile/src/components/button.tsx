import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type, useBrand, type Brand } from '@/theme';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

const sizes = {
  sm: { minHeight: 36, paddingHorizontal: spacing.md, text: type.subhead, icon: 15 },
  md: { minHeight: 46, paddingHorizontal: spacing.lg, text: type.headline, icon: 17 },
  lg: { minHeight: 54, paddingHorizontal: spacing.xl, text: type.headline, icon: 18 },
} as const;

function paint(variant: Variant, brand: Brand) {
  if (variant === 'primary') return { background: brand.accent, foreground: brand.onAccent };
  if (variant === 'destructive') return { background: brand.dangerSolid, foreground: brand.onDanger };
  if (variant === 'ghost') return { background: 'transparent', foreground: brand.accent };
  return { background: colors.fill, foreground: colors.label };
}

export function Button({
  title,
  onPress,
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const brand = useBrand();
  const { background, foreground } = paint(variant, brand);
  const { text, icon: iconSize, ...box } = sizes[size];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          ...box,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          backgroundColor: background,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          // Buttons dim when pressed; list rows highlight instead.
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style, // callers may adjust layout, last
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon && <Icon name={icon} size={iconSize} color={foreground} />}
          <ThemedText style={[text, { color: foreground, fontWeight: '600' }]}>{title}</ThemedText>
        </>
      )}
    </Pressable>
  );
}
