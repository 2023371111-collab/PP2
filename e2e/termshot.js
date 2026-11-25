// Convierte la salida real de un comando (archivo de texto) en una captura estilo terminal.
// Uso: node termshot.js <entrada.txt> <salida.png> "<titulo/prompt>"
const { chromium } = require('@playwright/test');
const fs = require('fs');

const [input, output, title = ''] = process.argv.slice(2);
// Quita códigos ANSI pero conserva el texto
const raw = fs.readFileSync(input, 'utf8').replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const colorize = (line) => {
  const e = esc(line);
  if (/(✓|√|\bok\b|PASS|passed|Despliegue OK|healthy|Up )/.test(line) && !/failed [1-9]/.test(line)) return `<span class="ok">${e}</span>`;
  if (/(✘|×|FAIL|failed|Error|ERROR)/.test(line)) return `<span class="err">${e}</span>`;
  if (/^(\$|PS |ubuntu@|>>)/.test(line)) return `<span class="cmd">${e}</span>`;
  return e;
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#1e1e1e;font-family:'Cascadia Mono',Consolas,'DejaVu Sans Mono',monospace;}
.bar{background:#2d2d2d;color:#ccc;font:13px system-ui;padding:8px 14px;display:flex;gap:8px;align-items:center}
.dot{width:12px;height:12px;border-radius:50%;display:inline-block}
pre{margin:0;padding:14px 18px;color:#d4d4d4;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-all}
.ok{color:#4ec97b}.err{color:#f48771}.cmd{color:#e5c07b;font-weight:bold}
</style></head><body><div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span>&nbsp;${esc(title)}</div>
<pre>${raw.split('\n').map(colorize).join('\n')}</pre></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 400 } });
  await page.setContent(html);
  await page.screenshot({ path: output, fullPage: true });
  await browser.close();
  console.log('ok', output);
})();
