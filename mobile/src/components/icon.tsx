import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';

// One name per icon, mapped to SF Symbols on iOS and Material Symbols on
// Android: each platform gets its own icon family. No emoji as icons.
const ICONS = {
  check: { ios: 'checkmark', android: 'check' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on' },
  locate: { ios: 'location', android: 'my_location' },
  alert: { ios: 'exclamationmark.triangle', android: 'warning' },
  info: { ios: 'info.circle', android: 'info' },
  send: { ios: 'paperplane', android: 'send' },
  signOut: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  clock: { ios: 'clock', android: 'schedule' },
  pill: { ios: 'pills', android: 'medication' },
  inbox: { ios: 'envelope', android: 'mail' },
} as const satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: ColorValue }) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} resizeMode="scaleAspectFit" />;
}
