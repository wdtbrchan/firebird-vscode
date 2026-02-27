import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Downgrading for now since we have a lot
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'prefer-const': 'warn'
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    }
  },
  {
    ignores: ['out/', 'node_modules/', '.vscode-test/', '.agent/', '**/*.js', '*.config.js', '*.config.mjs'],
  }
);
