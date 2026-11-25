// Genera las capturas del reporte (aplicación + OpenObserve).
// Uso: node capturas.js [APP_URL] [O2_URL] [carpeta_salida]
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const APP = process.argv[2] || 'http://localhost:8080';
const O2 = process.argv[3] || 'http://localhost:5080';
const OUT = process.argv[4] || path.join(__dirname, 'capturas');
const O2_USER = process.env.O2_USER || 'admin@demo.com';
const O2_PASSWORD = process.env.O2_PASSWORD || 'Complexpass#123';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@demo.com', password: process.env.ADMIN_PASSWORD || 'Admin123!' };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const shot = async (name, opts = {}) => {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
    console.log('captura', name);
  };
  const settle = async (ms = 3000) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(ms);
  };

  // ---------------- Aplicación
  await page.goto(APP);
  await page.getByTestId('login-email').waitFor();
  await shot('fig-app-login');
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('logout').waitFor();
  await page.waitForTimeout(1200);
  await shot('fig-app-productos');
  await page.getByTestId('product-new').click();
  await page.getByTestId('product-name').fill('Monitor 27 pulgadas');
  await page.getByTestId('product-description').fill('Monitor IPS Full HD');
  await page.getByTestId('product-price').fill('3499.00');
  await page.getByTestId('product-stock').fill('12');
  await shot('fig-app-producto-form');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByTestId('nav-users').click();
  await page.waitForTimeout(1200);
  await shot('fig-app-usuarios');

  // ---------------- OpenObserve
  await page.goto(`${O2}/web/login`);
  await settle(1500);
  await page.locator('input[type="email"], input[name="email"], input[data-test="login-user-id"]').first().fill(O2_USER);
  await page.locator('input[type="password"]').first().fill(O2_PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign")').first().click();
  await settle(2500);

  const dashboards = [
    ['1. Observabilidad General', 'fig-o2-general'],
    ['2. Aplicación - Endpoints', 'fig-o2-app'],
    ['3. Infraestructura EC2', 'fig-o2-infra'],
    ['4. Pipeline CI/CD', 'fig-o2-cicd'],
  ];
  for (const [title, file] of dashboards) {
    await page.goto(`${O2}/web/dashboards?org_identifier=default`);
    await settle(2000);
    await page.getByText(title, { exact: true }).first().click();
    await settle(7000);
    await shot(file);
    if (file === 'fig-o2-app') {
      // Parte inferior del tablero: tabla de últimas peticiones
      const tabla = page.getByText('Últimas peticiones', { exact: false }).first();
      await tabla.scrollIntoViewIfNeeded().catch(() => {});
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(3000);
      await shot('fig-o2-app-tabla');
    }
  }

  await page.goto(`${O2}/web/alerts?org_identifier=default`);
  await settle(3000);
  await shot('fig-o2-alertas');

  // Las trazas se capturan con trace-shot.js

  await page.goto(`${O2}/web/logs?org_identifier=default&stream_type=logs&stream=app_logs&period=15m&refresh=0&query=`);
  await settle(5000);
  await shot('fig-o2-logs');

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
