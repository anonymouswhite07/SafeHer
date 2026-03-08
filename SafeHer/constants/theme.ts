import { Platform } from 'react-native';

// SafeHer Brand Colors
export const Colors = {
  primary: '#E8547A',        // Warm Rose — main brand color
  primaryDark: '#C93D62',
  primaryLight: '#F4A0B5',
  secondary: '#7C3AED',      // Purple accent
  secondaryLight: '#A78BFA',
  danger: '#EF4444',
  dangerDark: '#B91C1C',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',

  light: {
    text: '#1A1A2E',
    textSecondary: '#6B7280',
    background: '#FFF8FA',
    surface: '#FFFFFF',
    border: '#F3E8ED',
    tint: '#E8547A',
    icon: '#9CA3AF',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#E8547A',
    card: '#FFFFFF',
    overlay: 'rgba(232, 84, 122, 0.08)',
  },
  dark: {
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    background: '#0F0F1A',
    surface: '#1A1A2E',
    border: '#2D1F2D',
    tint: '#F4A0B5',
    icon: '#6B7280',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#F4A0B5',
    card: '#1E1E30',
    overlay: 'rgba(244, 160, 181, 0.08)',
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
