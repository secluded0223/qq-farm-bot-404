import { defineConfig, presetAttributify, presetIcons, presetUno, presetWebFonts } from 'unocss'

export default defineConfig({
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
  // 农场风格：卡片与控件统一 8px 圆角，灰色阶整体偏暖绿，避免冷灰跳出背景
  theme: {
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '6px',
      md: '6px',
      lg: '8px',
      xl: '8px',
      '2xl': '8px',
      '3xl': '10px',
      full: '9999px',
    },
    colors: {
      gray: {
        50: '#f6f9f3',
        100: '#eef3e9',
        200: '#dfe7dc',
        300: '#c9d5c6',
        400: '#9aa89a',
        500: '#78877c',
        600: '#586b62',
        700: '#3f5048',
        800: '#2c3a34',
        900: '#203d31',
        950: '#141d18',
      },
    },
  },
  shortcuts: {
    'i-carbon-list-blocked': 'i-fas-ban',
    'i-carbon-user-offline': 'i-fas-user-slash',
    'i-carbon-leaf': 'i-fas-leaf',
    'i-carbon-crown': 'i-fas-crown',
    'i-carbon-circle': 'i-fas-circle',
    'i-fas-circle-notch-function': 'i-fas-circle-notch',
    'i-fas-circle-notch-string': 'i-fas-circle-notch',
    'i-fas-circle-notch-return': 'i-fas-circle-notch',
    'i-carbon-circle-dash-function': 'i-carbon-circle-dash',
    'i-carbon-circle-dash-string': 'i-carbon-circle-dash',
    'i-carbon-circle-dash-return': 'i-carbon-circle-dash',
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      safelist: [
        'i-fas-ban',
        'i-fas-user-slash',
        'i-fas-leaf',
        'i-fas-crown',
        'i-fas-circle',
        'i-fas-circle-notch',
      ],
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
        fas: () => import('@iconify-json/fa-solid/icons.json').then(i => i.default),
        'svg-spinners': () => import('@iconify-json/svg-spinners/icons.json').then(i => i.default),
      },
    }),
    presetWebFonts({
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
      },
    }),
  ],
})
