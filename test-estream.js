import axios from 'axios';

async function testEstream() {
  const testUrl = 'https://einthusan.tv/movie/watch/1D3Q/';
  
  console.log('Testing Einthusan page fetch...');
  try {
    const resp = await axios.get(testUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://einthusan.tv/'
      }
    });
    
    const html = String(resp?.data || '');
    console.log('Page fetched successfully, length:', html.length);
    
    // Try to extract m3u8 URL
    const candidates = [];
    const absRe = /(https?:\/\/[^\"'\s]+\.m3u8[^\"'\s]*)/gi;
    let m; while ((m = absRe.exec(html)) && candidates.length < 3) candidates.push(m[1]);
    
    const relRe = /['\"](\/[^'\"]+\.m3u8[^'\"]*)['\"]/gi;
    let m2; while ((m2 = relRe.exec(html)) && candidates.length < 3) candidates.push(new URL(m2[1], 'https://einthusan.tv').toString());
    
    console.log('Found m3u8 candidates:', candidates);
    
    if (candidates.length > 0) {
      const m3u8Url = candidates[0];
      console.log('Testing m3u8 URL:', m3u8Url);
      
      // Test if m3u8 is accessible
      try {
        const m3u8Resp = await axios.get(m3u8Url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://einthusan.tv/'
          }
        });
        console.log('M3U8 accessible, content preview:', String(m3u8Resp.data).substring(0, 200));
      } catch (err) {
        console.log('M3U8 not accessible:', err.message);
      }
    } else {
      console.log('No m3u8 URLs found in page');
      // Look for other video-related patterns
      const videoPatterns = [
        /(https?:\/\/[^\"'\s]+\.mp4[^\"'\s]*)/gi,
        /(https?:\/\/[^\"'\s]+\.webm[^\"'\s]*)/gi,
        /(https?:\/\/[^\"'\s]+\.ts[^\"'\s]*)/gi
      ];
      
      videoPatterns.forEach((pattern, i) => {
        const matches = [];
        let match;
        while ((match = pattern.exec(html)) && matches.length < 3) {
          matches.push(match[1]);
        }
        if (matches.length > 0) {
          console.log(`Found ${['mp4', 'webm', 'ts'][i]} candidates:`, matches);
        }
      });
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testEstream();
