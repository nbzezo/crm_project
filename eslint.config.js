import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.codegraph/**',
      '.playwright/**',
      '.claude/**',
      'server/data/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['client/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Mot so form khoi tao state theo luc mo; ep them mutation object vao dependency
      // se tao vong lap. Bat lai rule theo tung hook sau khi tach form state machine.
      'react-hooks/exhaustive-deps': 'off',
      // Helper/constant duoc dat canh component de dung chung cho test va module khac.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: [
      'server/**/*.ts',
      '*.config.{js,ts}',
      'server/scripts/**/*.mjs',
      'client/scripts/**/*.mjs',
      'scripts/**/*.mjs',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // Cac rule can thong tin kieu (no-floating-promises, no-misused-promises)
        // chi chay duoc khi co projectService. `allowDefaultProject` liet ke cac
        // file cau hinh/cong cu khong nam trong tsconfig nao.
        projectService: {
          allowDefaultProject: [
            'playwright.config.ts',
            'client/vite.config.ts',
            'e2e/auth.setup.ts',
            'e2e/app.spec.ts',
            'scripts/guide-shots/capture.spec.ts',
            'scripts/guide-shots/auth.setup.ts',
            'scripts/guide-shots/playwright.config.ts',
            'scripts/guide-shots/shots.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // MISRA Rule 10.x: so sanh phai chat. Ngoai le duy nhat la `== null` (bat ca
      // null va undefined) — idiom dung nhat quan 254 cho, xem docs/MISRA-COMPLIANCE.md.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // MISRA Rule 17.7: gia tri tra ve phai duoc dung, hoac loai bo tuong minh
      // bang `void`. Hai mien tru duoc ghi trong docs/MISRA-COMPLIANCE.md (D-04, D-05):
      //  - `test()` cua node:test tra ve Promise do chinh test runner quan ly;
      //  - thuoc tinh JSX (onClick, onSubmit...): React bo qua gia tri tra ve cua
      //    handler, va cac handler trong du an deu da tu bao bang try/catch.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['test', 'it', 'describe'] },
          ],
        },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  }
);
