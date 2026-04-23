import { chromium } from 'playwright';

const url = process.env.PLAYWRIGHT_URL || 'http://127.0.0.1:5178/';
const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--no-sandbox',
  ],
});

const context = await browser.newContext({ permissions: ['microphone'] });
const page = await context.newPage();
const consoleMessages = [];
const pageErrors = [];
const responses = [];

page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('response', (response) => {
  const responseUrl = response.url();
  if (responseUrl.includes('/models/') || responseUrl.includes('.wasm') || responseUrl === url) {
    responses.push(`${response.status()} ${responseUrl}`);
  }
});

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'web-voice-changer' }).waitFor();

  const recordButton = page.getByRole('button', { name: /record/i });
  const stopButton = page.getByRole('button', { name: /stop/i });
  const replayButton = page.getByRole('button', { name: /replay output/i });

  await recordButton.click();
  await page.locator('#status').filter({ hasText: 'recording' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(1300);
  await stopButton.click();
  await page.locator('#status').filter({ hasText: 'done' }).waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#recordButton')?.disabled, null, {
    timeout: 30000,
  });
  await page.waitForFunction(() => !document.querySelector('#replayButton')?.disabled, null, {
    timeout: 30000,
  });
  await replayButton.click();
  await page.waitForFunction(() => document.querySelector('#replayButton')?.disabled, null, {
    timeout: 5000,
  });
  await page.waitForFunction(() => !document.querySelector('#replayButton')?.disabled, null, {
    timeout: 30000,
  });

  const snapshot = await page.evaluate(() => {
    const nonBackgroundPixelCount = (selector) => {
      const canvas = document.querySelector(selector);
      const context = canvas.getContext('2d');
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;

      for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (!(r === 240 && g === 243 && b === 239)) {
          count += 1;
        }
      }

      return count;
    };

    return {
      status: document.querySelector('#status')?.textContent,
      timer: document.querySelector('#timer')?.textContent,
      engine: document.querySelector('#engine')?.textContent,
      sampleRate: document.querySelector('#sampleRate')?.textContent,
      duration: document.querySelector('#duration')?.textContent,
      message: document.querySelector('#message')?.textContent,
      recordDisabled: document.querySelector('#recordButton')?.disabled,
      stopDisabled: document.querySelector('#stopButton')?.disabled,
      replayDisabled: document.querySelector('#replayButton')?.disabled,
      inputPixels: nonBackgroundPixelCount('#inputWaveform'),
      outputPixels: nonBackgroundPixelCount('#outputWaveform'),
    };
  });

  const failedResponses = responses.filter((entry) => !entry.startsWith('200 '));

  if (pageErrors.length || failedResponses.length || snapshot.status !== 'done') {
    throw new Error('Smoke test failed.');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        url,
        snapshot,
        responses,
        consoleMessages,
        pageErrors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        url,
        error: error.message,
        responses,
        consoleMessages,
        pageErrors,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
