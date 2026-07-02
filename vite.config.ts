import { defineConfig } from 'vite-plus'
import path from 'path'

export default defineConfig({
  resolve: {
    dedupe: ['@tanstack/react-query', 'react', 'react-dom'],
    alias: {
      '@xartifact/x-llm-gateway-ui': path.resolve(__dirname, 'packages/ui/src'),
      '@xartifact/x-llm-gateway-shared': path.resolve(__dirname, 'packages/shared/src'),
      '@xartifact/x-llm-gateway-db': path.resolve(__dirname, 'packages/db/src'),
      '@xartifact/x-llm-gateway-core': path.resolve(__dirname, 'apps/gateway/src'),
    },
  },
  test: {
    include: ['**/*.ui.test.tsx', '**/*.ui.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./apps/gateway/src/test/ui-setup.ts'],
    globals: true,
    css: false,
  },
  lint: {
    plugins: ['typescript', 'import', 'unicorn', 'react', 'jsx-a11y'],
    env: {
      browser: true,
      node: true,
      es2024: true,
    },
    settings: {
      react: { version: '19' },
    },
    categories: {
      correctness: 'warn',
      suspicious: 'warn',
      perf: 'off',
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'no-debugger': 'error',
      eqeqeq: ['warn', 'smart'],
      'no-undef': 'off',
      'typescript/no-explicit-any': 'warn',
      'typescript/no-non-null-assertion': 'off',
      'typescript/no-unused-vars': 'warn',
      'import/no-default-export': 'off',
      'import/no-named-as-default': 'warn',
      'unicorn/no-array-for-each': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/filename-case': 'off',
      'react/jsx-key': 'warn',
      'react/no-array-index-key': 'warn',
      'react/self-closing-comp': 'warn',
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/no-autofocus': 'warn',
    },
    overrides: [
      {
        files: ['*.test.ts', '*.test.tsx', '*.spec.ts', '**/__tests__/**/*.ts'],
        rules: {
          'no-console': 'off',
          'no-unused-vars': 'off',
          'typescript/no-unused-vars': 'off',
          'typescript/no-explicit-any': 'off',
          'unicorn/no-empty-file': 'off',
        },
      },
      {
        files: ['**/e2e/**/*.ts'],
        rules: { 'no-console': 'off' },
      },
      {
        files: ['apps/web/app/**/*.tsx', 'apps/web/app/**/*.ts'],
        rules: { 'unicorn/filename-case': 'off' },
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: true,
    printWidth: 100,
  },
  staged: {
    '*.{ts,tsx,js,jsx}': 'vp lint --fix',
  },
})
