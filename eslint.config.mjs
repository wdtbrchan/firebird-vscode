import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_'
      }],
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
    // Tests use `any` liberally (mock contexts, error casts, ad-hoc fixtures);
    // enforcing strict typing there has very low payoff.
    files: ['src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    ignores: ['out/', 'node_modules/', '.vscode-test/', '.agent/', '**/*.js', '*.config.js', '*.config.mjs'],
  }
);
