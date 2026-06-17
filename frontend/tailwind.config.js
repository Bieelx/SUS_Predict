/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#1E3C3C',
        'sidebar-active': '#2A5050',
        'sidebar-bar': '#4DB8A0',
        canvas: '#F6F5F2',
        elev: '#FFFFFF',
        subtle: '#F0EDE6',
        tint: '#E9E5DC',
        ink: {
          900: '#1A1814',
          700: '#3D3A33',
          500: '#6B665D',
          400: '#8A8579',
          300: '#A8A39A',
          200: '#C9C4BA',
          100: '#E5E1D6',
          50: '#EFEBE0',
        },
        primary: {
          DEFAULT: '#1B5E6E',
          700: '#134756',
          100: '#D6E9EE',
          50: '#EBF4F7',
        },
        risk: {
          alto: '#D94F4F',
          medio: '#E8903A',
          baixo: '#4A9B6F',
        },
        good: '#2A6B40',
        bad: '#8A2A38',
        warn: '#A6580F',
      },
      fontFamily: {
        tight: ['Inter Tight', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
