import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: 'tests/e2e',
    projects: [
        {
            name: process.env.WEBMAIL_BROWSER ?? 'chromium',
            use: {
                browserName: (process.env.WEBMAIL_BROWSER ?? 'chromium') as
                    | 'chromium'
                    | 'firefox'
                    | 'webkit',
                launchOptions:
                    process.env.WEBMAIL_BROWSER === 'webkit' &&
                    process.env.WEBMAIL_WEBKIT_EXECUTABLE
                        ? {
                              executablePath:
                                  process.env.WEBMAIL_WEBKIT_EXECUTABLE,
                          }
                        : undefined,
            },
        },
    ],
    fullyParallel: false,
    workers: 1,
    timeout: 30000,
    use: {
        baseURL: 'http://127.0.0.1:8010',
        storageState: 'storage/test-auth.json',
        viewport: { width: 1440, height: 960 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command:
            'php scripts/prepare-e2e.php && php artisan serve --no-reload --host=127.0.0.1 --port=8010',
        url: 'http://127.0.0.1:8010/login',
        reuseExistingServer: false,
        env: {
            APP_ENV: 'testing',
            APP_URL: 'http://127.0.0.1:8010',
            DB_CONNECTION: 'mysql',
            DB_DATABASE: 'webmail_test',
            DB_HOST: '127.0.0.1',
            DB_PORT: '3306',
            DB_USERNAME: 'root',
            DB_PASSWORD: '',
            DB_URL: '',
            WEBMAIL_PROVIDER: 'mock',
            WEBMAIL_DAILY_LIMIT: '2',
        },
        timeout: 30000,
    },
    reporter: [['list'], ['html', { open: 'never' }]],
});
