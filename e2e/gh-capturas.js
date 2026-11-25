// Capturas de páginas públicas (GitHub, app, health).
// Uso: node gh-capturas.js <url> <salida.png> [ancho] [alto] [selectorParaClic]
const { chromium } = require('@playwright/test');

const [url, out, w = '1500', h = '900', click] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, colorScheme: 'dark', locale: 'es-MX' });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  if (click) {
    await page.locator(click).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out });
  await browser.close();
  console.log('ok', out);
})().catch((e) => { console.error(e.message); process.exit(1); });
