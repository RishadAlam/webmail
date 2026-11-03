import { chromium, firefox, webkit } from '@playwright/test';
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await engine.launch({
        executablePath:
            name === 'webkit'
                ? process.env.WEBMAIL_WEBKIT_EXECUTABLE
                : undefined,
    });
    process.stdout.write(`${name}: ${browser.version()}\n`);
    await browser.close();
}
