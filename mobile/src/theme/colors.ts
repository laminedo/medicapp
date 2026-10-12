import { Platform, useColorScheme } from 'react-native';
import { Color } from 'expo-router';

// Semantic colours come from the platform, so backgrounds, labels and
// separators look native and follow light/dark and accessibility settings.
// These are static-safe: token files can import them at module scope.
export const colors = {
  label: Platform.select({ ios: Color.ios.label, android: Color.android.dynamic.onSurface, default: '#17221C' })!,
  secondaryLabel: Platform.select({ ios: Color.ios.secondaryLabel, android: Color.android.dynamic.onSurfaceVariant, default: '#536058' })!,
  tertiaryLabel: Platform.select({ ios: Color.ios.tertiaryLabel, android: Color.android.dynamic.outline, default: '#8A948D' })!,
  separator: Platform.select({ ios: Color.ios.separator, android: Color.android.dynamic.outlineVariant, default: '#D9DAD3' })!,
  // The screen ground, and the grouped surface that sits on it.
  background: Platform.select({ ios: Color.ios.systemGroupedBackground, android: Color.android.dynamic.surfaceContainerLow, default: '#F2F1EA' })!,
  surface: Platform.select({ ios: Color.ios.secondarySystemGroupedBackground, android: Color.android.dynamic.surfaceContainerLowest, default: '#FBFAF6' })!,
  fill: Platform.select({ ios: Color.ios.tertiarySystemFill, android: Color.android.dynamic.surfaceContainerHigh, default: '#E6E6DF' })!,
};

// The brand: one accent (forest), plus the status washes. Explicit light/dark
// pairs, because the platform has no equivalent. Hook-only: read at render time.
const palette = {
  light: {
    accent: '#1D5A44',
    onAccent: '#F4F3EC',
    accentWash: '#E0E9E2',
    warn: '#7E520A',
    warnWash: '#F5E7C4',
    warnSolid: '#C78A12',
    danger: '#9F3626',
    dangerWash: '#F6DDD5',
    dangerSolid: '#A63C2B',
    onDanger: '#FFF6F2',
    // Static neutrals, for places a platform colour cannot go (SVG, animation).
    ink: '#17221C',
    inkSoft: '#536058',
    hairline: '#D0D2CA',
    card: '#FBFAF6',
    fillSolid: '#E3E3DC',
  },
  dark: {
    accent: '#7CD0A6',
    onAccent: '#0B1A13',
    accentWash: '#22342C',
    warn: '#E8BC66',
    warnWash: '#3A2D10',
    warnSolid: '#E0AE4C',
    danger: '#F29380',
    dangerWash: '#40201A',
    dangerSolid: '#D9604B',
    onDanger: '#1B0A07',
    ink: '#E8ECE4',
    inkSoft: '#9DABA1',
    hairline: '#33403A',
    card: '#1C1C1E',
    fillSolid: '#2C2C2E',
  },
} as const;

export type Brand = { readonly [K in keyof typeof palette.light]: string };

export function useBrand(): Brand {
  return palette[useColorScheme() === 'dark' ? 'dark' : 'light'];
}
