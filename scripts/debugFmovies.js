import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const query = process.env.QUERY || "The Avengers";

async function debugFmovies(q) {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(process.env.SCRAPING_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.fmovies.gd/' });
    // Go to homepage first, then type query to trigger SPA search
    const homeUrl = `https://www.fmovies.gd`;
    console.log("Navigating to:", homeUrl);
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Try typical search inputs
    const inputSelectors = [
      'input[name="keyword"]',
      'input[type="search"]',
      '#search input',
      '.search input'
    ];
    let foundInput = false;
    for (const sel of inputSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000, visible: true });
        await page.click(sel, { delay: 50 });
        await page.type(sel, q, { delay: 80 });
        // Try clicking search button if exists, else press Enter
        const btnSel = '.search button, button[type="submit"], .icon-search, [aria-label*="search" i]';
        const hasBtn = await page.$(btnSel);
        if (hasBtn) {
          await page.click(btnSel);
        } else {
          await page.keyboard.press('Enter');
        }
        foundInput = true;
        break;
      } catch {}
    }
    if (!foundInput) {
      // fallback to direct search URL
      const searchUrl = `https://www.fmovies.gd/search?keyword=${encodeURIComponent(q)}`;
      console.log("Navigating to:", searchUrl);
      await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 45000 });
    }

    // Wait for either search XHR completion or results container
    try {
      await Promise.race([
        page.waitForResponse(r => r.url().includes('/search') && r.status() === 200, { timeout: 15000 }),
        page.waitForSelector('.film-list, .items, .movie-list, .film, .movie', { timeout: 18000 })
      ]);
    } catch {}
    // Scroll to trigger lazy rendering
    try {
      await page.evaluate(async () => {
        await new Promise(resolve => {
          let total = 0;
          const step = () => {
            window.scrollBy(0, 600);
            total += 600;
            if (total < 4000) requestAnimationFrame(step);
            else resolve();
          };
          step();
        });
      });
    } catch {}
    await new Promise(r => setTimeout(r, 3000));

    const results = await page.evaluate(() => {
      const items = document.querySelectorAll(
        ".film-list .film, .film, .movie, .movie-item, .item, .card, [class*='film'], [class*='movie']"
      );
      return Array.from(items)
        .map(el => ({
          title: el.querySelector(".film-title, .title, h3 a, h2 a, a")?.textContent?.trim() || "",
          link: el.querySelector("a")?.href || "",
          year: el.querySelector(".film-year, .year")?.textContent?.trim() || null,
          poster: el.querySelector("img")?.src || null
        }))
        .filter(r => r.title && r.link);
    });

    console.log("Found items:", results.length);
    console.log(JSON.stringify(results.slice(0, 10), null, 2));
  } catch (e) {
    console.error("Debug error:", e.message);
  } finally {
    await new Promise(r => setTimeout(r, 2000));
    try { await browser.close(); } catch {}
  }
}

debugFmovies(query).catch(console.error);
