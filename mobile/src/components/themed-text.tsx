import { Text, type TextProps } from 'react-native';

import { type } from '@/theme';

// The one way text gets its size and weight: pick a variant from the type ramp.
export function ThemedText({ variant = 'body', style, ...props }: TextProps & { variant?: keyof typeof type }) {
  return <Text style={[type[variant], style]} {...props} />;
}
