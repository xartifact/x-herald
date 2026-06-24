export default {
  plugins: {
    '@tailwindcss/postcss': {
      content: [
        './app/**/*.tsx',
        '../../packages/ui/src/**/*.tsx',
      ],
    },
  },
};
