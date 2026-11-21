// Renders pictures of Wizra's real 3D model through Brenai's own snapshot renderer (avatar.snapshot), the way the
// picture pack is made (brenai/tools/picpack/gen2.cjs). Run by the Brenebase worker on the PC:
//   node render-brenai.cjs <specs.json> <outDir>
// Env: BRENAI_URL (default https://brenai.fly.dev), BRENAI_COOKIES (a curl cookie jar for a logged-in Brenai player,
// the same kind gen2.cjs uses). Needs Playwright with Chromium in the Brenebase folder:
//   npm i playwright && npx playwright install chromium
// specs.json: [{ name, spec }] where spec is a Brenai takeSnap spec ({ cam, pose, face, scene, set, ... }).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [specFile, out] = process.argv.slice(2);
const base = (process.env.BRENAI_URL || 'https://brenai.fly.dev').replace(/\/$/, ''), jar = process.env.BRENAI_COOKIES;
(async () => {
  if (!jar || !fs.existsSync(jar)) { console.log('NEED BRENAI_COOKIES: a cookie jar for a logged-in Brenai player'); process.exit(2); }
  const items = JSON.parse(fs.readFileSync(specFile, 'utf8')); fs.mkdirSync(out, { recursive: true });
  const cookies = fs.readFileSync(jar, 'utf8').split('\n').filter(l => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_'))).map(l => l.replace(/^#HttpOnly_/, '').split('\t')).filter(p => p.length >= 7).map(p => ({ name: p[5], value: p[6], domain: p[0].replace(/^\./, ''), path: p[2], secure: p[3] === 'TRUE', httpOnly: true }));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } }); await ctx.addCookies(cookies); await ctx.addInitScript(() => { window.WIZRA_STILL = true; });
  const p = await ctx.newPage(); let n = 0;
  try {
    await p.goto(base + '/'); await p.waitForFunction(() => document.querySelector('#stage canvas') && typeof avatar !== 'undefined' && avatar.snapshot, null, { timeout: 150000 });
    await p.waitForTimeout(2500);
    for (const it of items) {
      const url = await p.evaluate(spec => avatar.snapshot(spec), it.spec);
      if (!url || url.length < 2000) { console.log('FAILED', it.name); continue; }
      fs.writeFileSync(path.join(out, it.name + (url.startsWith('data:image/png') ? '.png' : '.webp')), Buffer.from(url.split(',')[1], 'base64')); n++; console.log('made', it.name);
    }
  } catch (e) { console.log('RENDER FAILED', String(e.message).slice(0, 200)); }
  await b.close(); console.log(`made ${n} of ${items.length}`); process.exit(n ? 0 : 1);
})();
