// Captura el detalle de una traza (cascada de spans) en OpenObserve.
// Uso: node trace-shot.js <O2_URL> <salida.png> [texto_operacion]
const { chromium } = require('@playwright/test');
(async () => {
  const [O2, out, op = 'GET /api/products'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  await p.goto(`${O2}/web/login`); await p.waitForLoadState('networkidle');
  await p.locator('input[type="email"], input[name="email"], input[data-test="login-user-id"]').first().fill(process.env.O2_USER || 'admin@demo.com');
  await p.locator('input[type="password"]').first().fill(process.env.O2_PASSWORD || 'Complexpass#123');
  await p.locator('button[type="submit"], button:has-text("Login")').first().click(); await p.waitForTimeout(2500);
  await p.goto(`${O2}/web/traces?org_identifier=default&stream=default&period=30m`);
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(3000);
  await p.getByRole('button', { name: /^Traces$/ }).first().click().catch(() => p.getByText('Traces', { exact: true }).nth(1).click());
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(4000);
  await p.screenshot({ path: out.replace('.png', '-lista.png') });
  await p.getByText(op, { exact: false }).first().click();
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(5000);
  await p.screenshot({ path: out });
  await b.close();
  console.log('ok', out);
})().catch((e) => { console.error(e.message); process.exit(1); });
