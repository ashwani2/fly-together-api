import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    // Never hit a real email provider during tests — force the console-log path.
    // (mailer.test sets these on `env` itself to exercise the Brevo/SMTP code.)
    env: {
      BREVO_API_KEY: '',
      SMTP_HOST: '',
    },
  },
});
