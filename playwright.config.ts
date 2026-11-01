import { defineConfig } from '@playwright/test';
export default defineConfig({
    testDir: 'tests/e2e',
    projects: [
        {
            name: process.env.POSTROOM_BROWSER ?? 'chromium',
            use: {
                browserName: (process.env.POSTROOM_BROWSER ?? 'chromium') as
                    | 'chromium'
                    | 'firefox'
                    | 'webkit',
                launchOptions:
                    process.env.POSTROOM_BROWSER === 'webkit' &&
                    process.env.POSTROOM_WEBKIT_EXECUTABLE
                        ? {
                              executablePath:
                                  process.env.POSTROOM_WEBKIT_EXECUTABLE,
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
            DB_CONNECTION: 'sqlite',
            DB_DATABASE: process.cwd() + '/storage/e2e.sqlite',
            DB_URL: '',
            POSTROOM_PROVIDER: 'mock',
            POSTROOM_DAILY_LIMIT: '2',
        },
        timeout: 30000,
    },
    reporter: [['list'], ['html', { open: 'never' }]],
});
