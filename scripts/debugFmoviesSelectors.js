import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

async function debugSelectors() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  
  console.log("🔍 DEBUGGING Fmovies Selectors");
  console.log("🌐 Navigating to Fmovies search...");
  
  await page.goto(`https://www.fmovies.gd/search?keyword=The%20Avengers`, {
    waitUntil: "domcontentloaded",
    timeout: 45000
  });

  console.log("⏳ Waiting for page to load...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Debug what's actually on the page
  const pageInfo = await page.evaluate(() => {
    const info = {
      title: document.title,
      url: window.location.href,
      bodyText: document.body.innerText.substring(0, 500),
      allLinks: [],
      allSelectors: []
    };

    // Find all links
    const links = document.querySelectorAll('a');
    links.forEach(link => {
      if (link.href && link.textContent.trim()) {
        info.allLinks.push({
          href: link.href,
          text: link.textContent.trim().substring(0, 100),
          classes: link.className
        });
      }
    });

    // Find common movie-related selectors
    const selectors = [
      '.film', '.movie', '.item', '.card', '.poster', '.thumbnail',
      '[href*="/movie/"]', '[href*="/watch/"]', '[href*="/film/"]',
      '.film-list', '.movie-list', '.results', '.search-results'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        info.allSelectors.push({
          selector: selector,
          count: elements.length,
          firstElement: {
            tagName: elements[0].tagName,
            className: elements[0].className,
            href: elements[0].href || 'N/A',
            text: elements[0].textContent.trim().substring(0, 100)
          }
        });
      }
    });

    return info;
  });

  console.log("📊 PAGE ANALYSIS:");
  console.log("Title:", pageInfo.title);
  console.log("URL:", pageInfo.url);
  console.log("Body text preview:", pageInfo.bodyText);
  console.log("");
  
  console.log("🔗 ALL LINKS FOUND:");
  pageInfo.allLinks.slice(0, 10).forEach((link, i) => {
    console.log(`${i + 1}. ${link.text} -> ${link.href}`);
  });
  console.log("");

  console.log("🎯 SELECTORS FOUND:");
  pageInfo.allSelectors.forEach(sel => {
    console.log(`✅ ${sel.selector}: ${sel.count} elements`);
    console.log(`   First: ${sel.firstElement.tagName}.${sel.firstElement.className}`);
    console.log(`   Text: ${sel.firstElement.text}`);
    console.log(`   Href: ${sel.firstElement.href}`);
    console.log("");
  });

  console.log("⏳ Keeping browser open for 30 seconds for manual inspection...");
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  await browser.close();
}

debugSelectors().catch(err => console.error("❌ Error:", err));

