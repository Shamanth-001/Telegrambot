import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

async function findYTS_TV_Movie() {
  console.log("🔍 FINDING YTS-TV MOVIE URL");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  try {
    const browser = await puppeteer.launch({ 
      headless: false, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null 
    });
    
    const page = await browser.newPage();
    
    // Go to YTS-TV homepage
    console.log("🌐 Navigating to YTS-TV homepage...");
    await page.goto('https://ytstv.hair/', { waitUntil: 'networkidle2' });
    
    // Look for movie links - try different selectors
    console.log("🔍 Looking for movie links...");
    const movieLinks = await page.evaluate(() => {
      const links = [];
      
      // Try multiple selectors for movie links
      const selectors = [
        'a[href*="/watch"]',
        'a[href*="/movie"]',
        'a[href*="/tv"]',
        'a[href*="/series"]',
        '.movie-item a',
        '.film-item a',
        '.card a',
        '.poster a'
      ];
      
      selectors.forEach(selector => {
        const allLinks = document.querySelectorAll(selector);
        allLinks.forEach(link => {
          const href = link.href;
          const text = link.textContent?.trim();
          if (href && text && text.length > 0 && text.length < 100 && !links.some(l => l.url === href)) {
            links.push({ url: href, title: text });
          }
        });
      });
      
      return links.slice(0, 10); // Get first 10 movies
    });
    
    console.log(`📊 Found ${movieLinks.length} movie links:`);
    movieLinks.forEach((movie, index) => {
      console.log(`  ${index + 1}. ${movie.title}`);
      console.log(`     URL: ${movie.url}`);
    });
    
    if (movieLinks.length > 0) {
      const testMovie = movieLinks[0];
      console.log(`\n🎯 Testing with: ${testMovie.title}`);
      console.log(`🔗 URL: ${testMovie.url}`);
      
      // Navigate to the movie page
      await page.goto(testMovie.url, { waitUntil: 'networkidle2' });
      
      // Check if it has a video player
      const hasVideoPlayer = await page.evaluate(() => {
        const video = document.querySelector('video');
        const playButtons = document.querySelectorAll('button, a');
        let playButtonCount = 0;
        
        playButtons.forEach(btn => {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('play') || text.includes('watch') || text.includes('▶')) {
            playButtonCount++;
          }
        });
        
        return {
          hasVideo: !!video,
          playButtonCount: playButtonCount,
          pageTitle: document.title
        };
      });
      
      console.log(`\n📊 Video Player Analysis:`);
      console.log(`  ✅ Has video element: ${hasVideoPlayer.hasVideo}`);
      console.log(`  🔘 Play buttons found: ${hasVideoPlayer.playButtonCount}`);
      console.log(`  📄 Page title: ${hasVideoPlayer.pageTitle}`);
      
      if (hasVideoPlayer.hasVideo || hasVideoPlayer.playButtonCount > 0) {
        console.log(`\n🎉 YTS-TV MOVIE FOUND WITH VIDEO PLAYER!`);
        console.log(`🎬 Movie: ${testMovie.title}`);
        console.log(`🔗 URL: ${testMovie.url}`);
        console.log(`✅ Ready for download testing!`);
      } else {
        console.log(`\n❌ No video player found on this page`);
      }
    }
    
    // Keep browser open for 5 seconds
    console.log(`\n👀 Browser will stay open for 5 seconds...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    await browser.close();
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
  }
}

findYTS_TV_Movie();


