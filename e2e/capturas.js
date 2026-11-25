// Genera capturas de pantalla para el reporte (app + OpenObserve).
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
  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
    console.log('captura', name);
  };

  // --- Aplicación
  await page.goto(APP);
  await page.getByTestId('login-email').waitFor();
  await shot('01-app-login');
  await page.getByTestId('login-email').fill(ADMIN.email);
  await page.getByTestId('login-password').fill(ADMIN.password);
  await page.getByTestId('login-submit').click();
  await page.getByTestId('logout').waitFor();
  await page.waitForTimeout(800);
  await shot('02-app-productos');
  await page.getByTestId('product-new').click();
  await shot('03-app-producto-form');
  await page.keyboard.press('Escape');
  await page.goto(APP);
  await page.getByTestId('nav-users').click();
  await page.waitForTimeout(800);
  await shot('04-app-usuarios');

  // --- OpenObserve
  await page.goto(`${O2}/web/login`);
  await page.waitForLoadState('networkidle');
  const email = page.locator('input[type="email"], input[name="email"], input[data-test="login-user-id"]').first();
  await email.fill(O2_USER);
  await page.locator('input[type="password"]').first().fill(O2_PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign")').first().click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  await page.goto(`${O2}/web/dashboards?org_identifier=default`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await shot('10-o2-lista-dashboards');

  const titles = ['1. Observabilidad General', '2. Aplicación - Endpoints', '3. Infraestructura EC2', '4. Pipeline CI/CD'];
  for (let i = 0; i < titles.length; i++) {
    await page.goto(`${O2}/web/dashboards?org_identifier=default`);
    await page.waitForLoadState('networkidle');
    await page.getByText(titles[i], { exact: true }).first().click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(6000);
    await shot(`1${i + 1}-o2-dashboard-${i + 1}`);
  }

  await page.goto(`${O2}/web/alerts?org_identifier=default`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await shot('20-o2-alertas');

  await page.goto(`${O2}/web/traces?org_identifier=default`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(4000);
  await shot('21-o2-trazas');

  await page.goto(`${O2}/web/logs?org_identifier=default`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await shot('22-o2-logs');

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
