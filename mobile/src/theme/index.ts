// The single entry point for design tokens: import { spacing, type } from '@/theme'.
import type { TextStyle } from 'react-native';

import { colors } from './colors';

export { colors, useBrand, type Brand } from './colors';

// One scale on a 4-point grid, named by size.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

// Screen edge padding. One value, used everywhere.
export const gutter = spacing.lg;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
} as const;

// Named text styles mirroring the platform ramp, so sizes feel native.
// Screens never set fontSize directly: they pick a variant.
export const type = {
  display: { fontSize: 56, lineHeight: 60, fontWeight: '700', letterSpacing: -1.6, color: colors.label, fontVariant: ['tabular-nums'] },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: -0.4, color: colors.label },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3, color: colors.label },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: colors.label },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400', color: colors.label },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400', color: colors.secondaryLabel },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: colors.secondaryLabel },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.secondaryLabel },
} as const satisfies Record<string, TextStyle>;

// Two elevation steps are enough: iOS is a low-shadow platform.
export const shadows = {
  card: '0 1px 2px rgba(0, 0, 0, 0.05)',
  raised: '0 4px 12px rgba(0, 0, 0, 0.10)',
} as const;

export const motion = {
  fast: 150, // state feedback: press, toggle
  base: 250, // element transitions
  slow: 400, // large surfaces
} as const;
