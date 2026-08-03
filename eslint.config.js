import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/__tests_backup/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
      globals: {
        Blob: 'readonly',
        MediaRecorder: 'readonly',
        MediaStream: 'readonly',
        MediaStreamTrack: 'readonly',
        navigator: 'readonly',
        Record: 'readonly',
        RTCIceCandidate: 'readonly',
        RTCIceCandidateInit: 'readonly',
        RTCPeerConnection: 'readonly',
        RTCRtpSender: 'readonly',
        RTCSessionDescription: 'readonly',
        RTCSessionDescriptionInit: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      // TypeScript performs name and unused-symbol checking for this mixed
      // Node/browser package. ESLint is retained for syntax-level safeguards.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-constant-condition': 'error',
      'no-dupe-class-members': 'error',
    },
  },
]
