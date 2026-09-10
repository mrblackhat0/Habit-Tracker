import { DarkTheme as NavDarkTheme } from 'expo-router';

export const ThemeConfig = {
  theme: 'obsidian-neon',
  dark: true,
  colors: {
    background: '#0D0D12',
    surface: '#1A1A24',
    border: '#2A2A35',
    primary: '#6366F1',
    secondary: '#94A3B8',
    text: '#F8FAFC',
    textMuted: '#6b7280',
  },
  data: {
    positive: '#10B981',
    warning: '#F59E0B',
    danger: '#F43F5E',
    info: '#0EA5E9',
    disabled: '#94A3B8',
  },
  heatmap: {
    level0: '#2A2A35',
    level1: '#064E3B',
    level2: '#047857',
    level3: '#059669',
    level4: '#10B981',
  },
} as const;

export const Colors = ThemeConfig.colors;
export const DataColors = ThemeConfig.data;
export const HeatmapColors = ThemeConfig.heatmap;

export const CustomDarkTheme = {
  ...NavDarkTheme,
  dark: true,
  colors: {
    ...NavDarkTheme.colors,
    primary: ThemeConfig.colors.primary,
    background: ThemeConfig.colors.background,
    card: ThemeConfig.colors.surface,
    text: ThemeConfig.colors.text,
    border: ThemeConfig.colors.border,
    notification: ThemeConfig.data.danger,
  },
};

export default ThemeConfig;
