import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Shared flat config; ESLint resolves it upward from each app's `src`. */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/generated/**', '**/*.gen.ts', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // Nest modules are intentionally empty classes carrying only a decorator.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
