import { defineConfig } from 'vite-plus'
import path from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-hook-form', '@hookform/resolvers/zod'],
  },
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
      'no-extend-native': 'off',
      'no-shadow': 'off',
      'no-underscore-dangle': 'off',
      'typescript/no-explicit-any': 'off',
      'typescript/no-non-null-assertion': 'off',
      'typescript/no-unused-vars': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/no-array-index-key': 'warn',
      'react/no-unstable-nested-components': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'import/no-default-export': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-unassigned-import': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/prefer-spread': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-node-protocol': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/no-thenable': 'off',
      'unicorn/no-useless-fallback-in-spread': 'off',
      'unicorn/no-empty-file': 'off',
      'react/jsx-key': 'warn',
      'react/self-closing-comp': 'warn',
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/no-autofocus': 'off',
      'jsx-a11y/label-has-associated-control': 'off',
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'jsx-a11y/heading-has-content': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'eslint/no-useless-constructor': 'off',
    },
    overrides: [
      {
        files: ['**/*.test.ts', '**/*.test.tsx', '*.spec.ts', '**/__tests__/**/*.ts'],
        rules: {
          'no-console': 'off',
          'no-unused-vars': 'off',
          'typescript/no-unused-vars': 'off',
          'typescript/no-explicit-any': 'warn',
          'unicorn/no-empty-file': 'off',
          'no-shadow': 'off',
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
    ignorePatterns: ['.claude/skills/**', 'AGENTS.md', 'CLAUDE.md', 'README.md'],
  },
  staged: {
    '*.{ts,tsx,js,jsx}': 'vp lint --fix',
    '*.{ts,tsx,js,jsx,json,yaml,yml}': 'vp fmt',
  },
})
