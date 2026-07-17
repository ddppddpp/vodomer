#!/usr/bin/env node

const playwright = require('playwright');
const fs = require('fs');

const REQUIRED_ENV = ['ACCOUNT_ID', 'USERNAME', 'PASSWORD'];
const REQUIRED_METERS = ['METER1_ID', 'METER1_SERIAL', 'METER2_ID', 'METER2_SERIAL'];

// Date check: only run 1st-7th, weekdays
function checkDate() {
  const now = new Date();
  const day = now.getDate();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  if (day < 1 || day > 7) {
    console.error(`Error: Day ${day} is outside submission window (1st-7th)`);
    process.exit(1);
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.error('Error: Weekend - submission only allowed Mon-Fri');
    process.exit(1);
  }
}

// Read configuration: .env file or environment variables
function readConfig() {
  let env = {};

  try {
    const content = fs.readFileSync('.env', 'utf8');
    content.trim().split('\n').forEach(line => {
      const parts = line.split(' ');
      env[parts[0]] = parts.slice(1).join(' ');
    });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const allKeys = [...REQUIRED_ENV, ...REQUIRED_METERS];
  for (const key of allKeys) {
    env[key] = env[key] || process.env[key] || '';
  }

  const missing = allKeys.filter(key => !env[key]);
  if (missing.length) {
    console.error(`Error: Missing configuration: ${missing.join(', ')}`);
    console.error('Provide values via .env file or environment variables.');
    console.error('');
    console.error('Required keys:');
    console.error('  ACCOUNT_ID, USERNAME, PASSWORD');
    console.error('  METER1_ID, METER1_SERIAL, METER2_ID, METER2_SERIAL');
    console.error('');
    console.error('See .env-example for a template.');
    process.exit(1);
  }

  const accountId = env.ACCOUNT_ID;
  const baseUrl = `https://www.sofiyskavoda.bg/cp/customer-accounts/${accountId}`;
  env.TARGET_URL = `${baseUrl}/user-readings/create`;

  const meters = [
    { id: env.METER1_ID, serial: env.METER1_SERIAL, field: `meters[${env.METER1_ID}]` },
    { id: env.METER2_ID, serial: env.METER2_SERIAL, field: `meters[${env.METER2_ID}]` },
  ];

  return { env, meters, baseUrl };
}

async function verifyReadings(page, r1, r2, meters, baseUrl) {
  const readings = [
    { serial: meters[0].serial, reading: String(r1) },
    { serial: meters[1].serial, reading: String(r2) },
  ];

  await page.goto(`${baseUrl}/user-readings`, { timeout: 15000 });
  await page.waitForTimeout(2000);

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table.invoices-table tbody tr')).map(tr => ({
      meter: tr.querySelector('td[data-title="Водомер:"] p')?.textContent?.trim() || '',
      reading: tr.querySelector('td[data-title="Показания(в куб.м.):"] p.font-bold')?.textContent?.trim() || '',
      date: tr.querySelector('td[data-title="Дата на отчет:"] time')?.getAttribute('datetime') || '',
      status: tr.querySelector('td[data-title="Статус:"] p')?.textContent?.trim() || '',
    }));
  });

  const results = readings.map(r => ({
    serial: r.serial,
    reading: r.reading,
    found: rows.some(row => row.meter === r.serial && row.reading === r.reading),
  }));

  return results;
}

async function submitReadings(r1, r2) {
  const { env, meters, baseUrl } = readConfig();

  const browserType = process.env.PLAYWRIGHT_BROWSER || 'chromium';
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
  const browser = await playwright[browserType].launch({
    headless: true,
    executablePath,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'bg-BG',
    timezoneId: 'Europe/Sofia'
  });

  // Hide automation
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log('Navigating to login page...');
    await page.goto('https://www.sofiyskavoda.bg/login', { timeout: 30000 });
    await page.waitForTimeout(3000);

    // Accept cookies if present
    await page.evaluate(() => {
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        const text = btn.textContent || '';
        if (text.includes('Приемам') || text.includes('Accept')) {
          btn.click();
          break;
        }
      }
    });
    await page.waitForTimeout(1000);

    // Get CSRF token
    const csrf = await page.$eval('form input[name="_token"]', el => el.value).catch(() => null);
    console.log('CSRF token:', csrf ? 'found' : 'not found');

    // Fill login form
    const creds = { email: env['USERNAME'], pass: env['PASSWORD'] };
    await page.evaluate((creds) => {
      // Find visible email input
      const emailInput = document.querySelector('input[name="email"]:not([style*="display:none"])') ||
                        document.querySelector('#login_email') ||
                        document.querySelector('input[type="email"]');
      if (emailInput) {
        emailInput.value = creds.email;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Find visible password input
      const passInput = document.querySelector('input[name="password"]:not([style*="display:none"])') ||
                       document.querySelector('#login_password') ||
                       document.querySelector('#password_login') ||
                       document.querySelector('input[type="password"]');
      if (passInput) {
        passInput.value = creds.pass;
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, creds);

    await page.waitForTimeout(1000);

    // Submit login
    console.log('Submitting login...');
    await page.evaluate(() => {
      const form = document.querySelector('form[action*="login"]') || document.querySelector('form.js-validate__login');
      if (form) form.submit();
    });

    await page.waitForTimeout(5000);
    console.log('After login URL:', page.url());

    if (page.url().includes('/login')) {
      throw new Error('Login failed - still on login page');
    }

    // Step 2: Navigate to meter readings page
    console.log('Navigating to meter readings page...');
    await page.goto(env['TARGET_URL'], { timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('Meter page URL:', page.url());

    // Step 3: Fill meter readings
    console.log('Filling meter readings...');

    // Wait for inputs to be visible
    await page.waitForSelector(`input[name="${meters[0].field}"]`, { timeout: 10000 });
    await page.waitForSelector(`input[name="${meters[1].field}"]`, { timeout: 10000 });

    // Fill using Playwright's fill method
    await page.fill(`input[name="${meters[0].field}"]`, String(r1));
    console.log(`Filled meter ${meters[0].serial} with ${r1}`);

    await page.fill(`input[name="${meters[1].field}"]`, String(r2));
    console.log(`Filled meter ${meters[1].serial} with ${r2}`);

    // Verify values were set
    const values = await page.evaluate(({ field1, field2 }) => {
      const v1 = document.querySelector(`input[name="${field1}"]`)?.value || '';
      const v2 = document.querySelector(`input[name="${field2}"]`)?.value || '';
      return { v1, v2 };
    }, { field1: meters[0].field, field2: meters[1].field });
    console.log('Verified values:', values);

    const result = { filled1: values.v1 === String(r1), filled2: values.v2 === String(r2) };

    console.log('Fill result:', result);

    if (!result.filled1 || !result.filled2) {
      // Save debug HTML
      const html = await page.content();
      fs.writeFileSync('/tmp/meter-form-debug.html', html);
      throw new Error('Could not find meter reading input fields. Debug HTML saved to /tmp/meter-form-debug.html');
    }

    await page.waitForTimeout(1000);

    // Step 4: Submit
    console.log('Submitting readings...');

    await Promise.all([
      page.waitForNavigation({ timeout: 10000 }).catch(() => {}),
      page.click('button.js-validate__consumption')
    ]);

    console.log('After submit URL:', page.url());

    // Check for success/error messages
    const message = await page.evaluate(() => {
      const results = [];

      // Check for success messages
      document.querySelectorAll('.alert-success, .alert-success *, [class*="success"], .confirmation').forEach(el => {
        if (el.offsetParent !== null) {
          const text = el.textContent.trim();
          if (text && text.length > 0) results.push({ type: 'success', text });
        }
      });

      // Check for error messages
      document.querySelectorAll('.alert-danger, .alert-error, [class*="error"], .text-danger, .alert-warning').forEach(el => {
        if (el.offsetParent !== null) {
          const text = el.textContent.trim();
          if (text && text.length > 0) results.push({ type: 'error', text });
        }
      });

      return results.length > 0 ? results : null;
    });

    if (message && message.length > 0) {
      message.forEach(msg => {
        console.log(`${msg.type.toUpperCase()}: ${msg.text.substring(0, 200)}`);
      });

      const alreadySubmitted = message.some(m =>
        m.type === 'error' && (m.text.includes('Вече имате') || m.text.includes('вече подаден'))
      );
      if (alreadySubmitted) {
        console.log('Readings already submitted this period — nothing to do.');
        await browser.close();
        process.exit(0);
      }
    } else {
      console.log('No success/error message found.');
    }

    // Step 5: Verify by checking submitted reports
    console.log('');
    console.log('Verifying submission...');
    const verification = await verifyReadings(page, r1, r2, meters, baseUrl);

    verification.forEach(v => {
      const icon = v.found ? '✓' : '✗';
      console.log(`  ${icon} meter ${v.serial} = ${v.reading} ${v.found ? 'FOUND' : 'NOT FOUND'}`);
    });

    const allFound = verification.every(v => v.found);
    if (allFound) {
      console.log('RESULT: Submission confirmed.');
    } else {
      console.error('RESULT: Submission could not be verified.');
      const html = await page.content().catch(() => '');
      fs.writeFileSync('/tmp/submission-fail.html', html);
      process.exit(1);
    }

  } catch (err) {
    console.error('Error:', err.message);
    const html = await page.content().catch(() => '');
    fs.writeFileSync('/tmp/error-page.html', html);
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log('Done!');
}

// Main
(async () => {
  checkDate();

  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node submit-readings.js <reading1> <reading2>');
    console.error('Example: node submit-readings.js 12345 67890');
    process.exit(1);
  }

  const r1 = parseInt(args[0], 10);
  const r2 = parseInt(args[1], 10);

  if (isNaN(r1) || isNaN(r2)) {
    console.error('Error: Both readings must be integers');
    process.exit(1);
  }

  await submitReadings(r1, r2);
})();
