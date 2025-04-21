require('dotenv').config();
const { IgApiClient } = require('instagram-private-api');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// ======================
// UTILITY FUNCTIONS
// ======================
const utilities = {
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  randomDelay: () => utilities.delay(3000 + Math.random() * 5000)
};

// ======================
// PINTEREST SCRAPER (OPTIMIZED FOR CLOUD)
// ======================
async function getSafeMeme() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Critical for cloud
      '--single-process' // Reduces memory usage
    ],
    timeout: 120000 // Increased timeout
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Search with fallback options
    const searchUrls = [
      'https://www.pinterest.com/search/pins/?q=funny%20memes&rs=typed',
      'https://www.pinterest.com/search/pins/?q=dank%20memes',
      'https://www.pinterest.com/search/pins/?q=trending%20memes'
    ];

    let memeUrls = [];
    for (const url of searchUrls) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        
        await utilities.randomDelay();

        // Scroll with retries
        for (let i = 0; i < 5; i++) {
          await page.evaluate(() => window.scrollBy(0, 1500));
          await utilities.delay(1000);
        }

        // Get images with multiple selector attempts
        const selectors = [
          'img[src*="i.pinimg.com/originals/"]',
          'img[src*="i.pinimg.com/736x/"]',
          'img'
        ];

        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            const urls = await page.$$eval(selector, imgs => 
              imgs.map(img => img.src)
                .filter(src => src && src.match(/\.(jpg|jpeg|png)$/i))
            );
            memeUrls = [...memeUrls, ...urls];
            if (memeUrls.length > 10) break;
          } catch (e) {}
        }

        if (memeUrls.length > 0) break;
      } catch (e) {
        console.log(`Failed with ${url}, trying next...`);
      }
    }

    if (!memeUrls.length) throw new Error('No memes found after all attempts');

    // Filter with safety checks
    const safeUrls = memeUrls.filter(src => 
      src && 
      !src.includes('watermark') &&
      !src.includes('logo') &&
      !src.includes('avatar') &&
      !src.includes('/videos/') &&
      (src.includes('originals') || src.includes('736x'))
    );

    if (!safeUrls.length) throw new Error('No copyright-safe memes found');
    return safeUrls[Math.floor(Math.random() * safeUrls.length)];

  } finally {
    await browser.close();
  }
}

// ======================
// INSTAGRAM POSTER (WITH SESSION HANDLING)
// ======================
async function safeInstagramPost(imagePath) {
  const ig = new IgApiClient();
  ig.state.generateDevice(process.env.INSTA_USERNAME);

  const sessionPath = path.join(__dirname, 'ig-session.json');

  try {
    // Load session if exists
    if (fs.existsSync(sessionPath)) {
      await ig.state.deserialize(JSON.parse(fs.readFileSync(sessionPath)));
      console.log('✅ Restored Instagram session');
    } else {
      console.log('🔐 Logging in...');
      await ig.account.login(process.env.INSTA_USERNAME, process.env.INSTA_PASSWORD);
      const session = await ig.state.serialize();
      delete session.constants;
      fs.writeFileSync(sessionPath, JSON.stringify(session));
      console.log('✅ Saved new session');
    }

    const caption = `😂 Funny meme from Pinterest\n\n` +
                   `Credits to original creator\n` +
                   `#memes #funny #viral`;

    console.log('📤 Uploading...');
    await ig.publish.photo({
      file: await fs.promises.readFile(imagePath),
      caption: caption,
    });

    console.log('✅ Post successful!');
  } catch (err) {
    // Clear session if error occurs
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    throw err;
  }
}

// ======================
// MAIN FUNCTION WITH ERROR HANDLING
// ======================
async function main() {
  let tempFile;
  try {
    console.log('🔍 Finding meme...');
    const memeUrl = await getSafeMeme();
    console.log('📌 Selected:', memeUrl);

    tempFile = path.join(__dirname, `meme_${Date.now()}.jpg`);
    const response = await axios({
      url: memeUrl,
      method: 'GET',
      responseType: 'stream',
      timeout: 60000
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(fs.createWriteStream(tempFile))
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log('📤 Posting to Instagram...');
    await safeInstagramPost(tempFile);
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlink(tempFile, () => {});
    }
  }
}

// ======================
// SCHEDULER WITH RANDOM INTERVALS
// ======================
(async () => {
  while (true) {
    const startTime = Date.now();
    
    try {
      await main();
    } catch (error) {
      console.error('⚠️ Critical error:', error);
      
      // Wait longer if error occurs
      const errorDelay = Math.floor(Math.random() * 30) + 30; // 30-60 minutes
      console.log(`⏳ Waiting ${errorDelay} minutes after error...`);
      await utilities.delay(errorDelay * 60 * 1000);
      continue;
    }

    // Random delay between 40-70 minutes
    const delayMinutes = Math.floor(Math.random() * 31) + 40;
    const elapsed = (Date.now() - startTime) / 1000 / 60;
    const remainingDelay = Math.max(1, delayMinutes - elapsed);
    
    console.log(`⏳ Next post in ${Math.round(remainingDelay)} minutes...`);
    await utilities.delay(remainingDelay * 60 * 1000);
  }
})();
