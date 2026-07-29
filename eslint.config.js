// ESLint 9 flat config — replaces .eslintrc.cjs.
//
// Scope note: the old `eslint . --ext ts,tsx` linted exactly 210 files
// (src 137 + electron 71 + vite.config.ts + vitest.config.ts). The `files` and
// `ignores` below reproduce that set exactly.
//
// Two flat-config defaults differ from eslintrc and the ignore list compensates:
//   1) The only built-in ignores are node_modules/ and .git/.
//   2) Dot-directories are no longer skipped (the config array and the file
//      walker both use `{ dot: true }`) — that is why ESLint 8 silently skipped
//      .agents/.
// Separately, .js/.mjs/.cjs files are always globbed by ESLint's own default
// config. No block below matches them, so they are parsed with zero rules and
// report zero problems.

import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default defineConfig([
    globalIgnores(
        [
            'dist/', // vite renderer output (was the only entry in ignorePatterns)
            'dist-electron/', // vite-plugin-electron output; previously shielded by --ext
            'release/', // electron-builder output: ~3 GB, thousands of .js files
            'coverage/', // vitest --coverage
            '.agents/', // agent templates; ESLint 8 skipped these as a dot-directory
            'vite.config.js', // tsconfig.node.json composite output (git-ignored)
            'vite.config.d.ts', // same, and .d.ts DOES match **/*.{ts,tsx}
        ],
        'goworks/ignores',
    ),

    {
        name: 'goworks/typescript',
        files: ['**/*.{ts,tsx}'],

        extends: [
            js.configs.recommended, // was: 'eslint:recommended'
            tseslint.configs.recommended, // was: 'plugin:@typescript-eslint/recommended'
            //   supplies the parser, the plugin and sourceType: 'module'
            jsxA11y.flatConfigs.recommended, // was: 'plugin:jsx-a11y/recommended'
            //   supplies parserOptions.ecmaFeatures.jsx
        ],

        plugins: {
            // Deliberately NOT reactHooks.configs.flat.recommended: in v7 that preset
            // carries 16 rules — the two below plus 14 React Compiler rules
            // (purity, refs, immutability, set-state-in-effect, static-components, …).
            // The old v4.6 'plugin:react-hooks/recommended' was just the two. Adopting
            // the compiler rules is a separate decision, not a side effect of moving to
            // flat config, so the plugin is registered by hand and the two rules are
            // spelled out under `rules` below.
            'react-hooks': reactHooks,

            // only-export-components is off, but the plugin still has to be registered:
            // flat config errors on a rule name whose plugin is unknown, even at severity 0.
            'react-refresh': reactRefresh,
        },

        linterOptions: {
            // Equivalent of the old --report-unused-disable-directives CLI flag, which
            // raised this to 'error' (the config default is 'warn'). Keeping it here
            // means the IDE extension and a bare `npx eslint` behave like CI does.
            reportUnusedDisableDirectives: 'error',
        },

        rules: {
            // react-hooks: exact equivalent of the v4.6 'recommended' preset
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'off',

            // carried over from .eslintrc.cjs
            'react-refresh/only-export-components': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            // autoFocus to focus the first input when a modal opens is standard UX — disabled.
            'jsx-a11y/no-autofocus': 'off',

            // `_name` prefix convention: intentionally unused parameter/variable
            // (mock signature compatibility, destructuring, etc.).
            // Note: @typescript-eslint v8 flipped the `caughtErrors` default from
            // 'none' to 'all', so caughtErrorsIgnorePattern now actually does work.
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },

    // Process boundaries. These have zero effect on today's results: no-undef is
    // switched off for .ts/.tsx by the @typescript-eslint compatibility layer, and
    // the only enabled rule that reads globals is no-global-assign, which this repo
    // never trips. They document the renderer/main split and prepare the ground for
    // the no-console work flagged in electron/services/logger.ts.
    {
        name: 'goworks/renderer-globals',
        files: ['src/**/*.{ts,tsx}'],
        languageOptions: { globals: globals.browser },
    },
    {
        name: 'goworks/main-globals',
        files: ['electron/**/*.{ts,tsx}', 'vite.config.ts', 'vitest.config.ts'],
        languageOptions: { globals: globals.node },
    },
    // If no-undef is ever switched on: electron/preload.ts needs both node and browser
    // globals, and the 33 test files use vitest's ambient globals (describe/it/expect/vi),
    // for which the `globals` package has no key — both need their own block.
]);
