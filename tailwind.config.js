/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0D0D12',
        surface: '#1A1A24',
        border: '#2A2A35',
        primary: '#6366F1',
        secondary: '#94A3B8',
        text: '#F8FAFC',
        muted: '#6b7280',
        textMuted: '#6b7280',
        positive: '#10B981',
        warning: '#F59E0B',
        danger: '#F43F5E',
        info: '#0EA5E9',
        heatmap: {
          level0: '#2A2A35',
          level1: '#064E3B',
          level2: '#047857',
          level3: '#059669',
          level4: '#10B981',
        },
      },
    },
  },
  plugins: [],
};
