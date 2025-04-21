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
// PINTEREST SCRAPER
// ======================
async function getSafeMeme() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    // Search popular memes
    await page.goto('https://www.pinterest.com/search/pins/?q=funny%20memes&rs=typed', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await utilities.randomDelay();

    // Scroll multiple times
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await utilities.delay(1000);
    }
    

    // Get images with safety filters
    const memeUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => {
          // Get high-res version from common formats
          let src = img.src;
          if (src.includes('/236x/')) {
            src = src.replace('/236x/', '/originals/');
          } else if (src.includes('/474x/')) {
            src = src.replace('/474x/', '/originals/');
          } else if (src.includes('/736x/')) {
            src = src.replace('/736x/', '/originals/');
          }
          return src;
        })
        .filter(src =>
          src.startsWith('https://i.pinimg.com/originals/') &&
          /\.(jpg|jpeg|png)$/i.test(src)
        );
    });
    
    

    if (!memeUrls.length) throw new Error('No copyright-safe memes found');
    return memeUrls[Math.floor(Math.random() * memeUrls.length)];

  } finally {
    await browser.close();
  }
}

// ======================
// INSTAGRAM POSTER
// ======================
async function safeInstagramPost(imagePath) {
  const ig = new IgApiClient();
  ig.state.generateDevice(process.env.INSTA_USERNAME);

  const sessionPath = path.join(__dirname, 'ig-session.json');

  // Load session if it exists
  if (fs.existsSync(sessionPath)) {
    const savedSession = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    await ig.state.deserialize(savedSession);
    console.log('✅ Restored previous Instagram session');
  } else {
    console.log('🔐 Logging in...');
    await ig.account.login(process.env.INSTA_USERNAME, process.env.INSTA_PASSWORD);
    const session = await ig.state.serialize();
    delete session.constants; // recommended to avoid issues
    fs.writeFileSync(sessionPath, JSON.stringify(session));
    console.log('✅ Logged in and saved session');
  }

  const caption = `😂 Funny meme from Pinterest\n\n` +
                 `Credits to original creator\n` +
                 `#memes #funny #viral`;

  console.log('📤 Uploading post...');
  await ig.publish.photo({
    file: await fs.promises.readFile(imagePath),
    caption: caption,
  });

  console.log('✅ Post successful!');
}


// ======================
// MAIN FUNCTION
// ======================
async function main() {
  let tempFile;
  try {
    console.log('🔍 Finding a copyright-safe meme...');
    const memeUrl = await getSafeMeme();
    console.log('📌 Selected:', memeUrl);

    tempFile = path.join(__dirname, `meme_${Date.now()}.jpg`);
    const response = await axios({
      url: memeUrl,
      method: 'GET',
      responseType: 'stream'
    });

    await new Promise((resolve, reject) => {
      response.data.pipe(fs.createWriteStream(tempFile))
        .on('finish', resolve)
        .on('error', reject);
    });

    console.log('📤 Posting to Instagram...');
    await safeInstagramPost(tempFile);
  } catch (error) {
    console.error('❌ Failed:', error.message);
  } finally {
    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlink(tempFile, () => { });
    }
  }
}

// ======================
// START THE BOT
// ======================
(async () => {
  try {
    await main();
  } catch (error) {
    console.error('Fatal error:', error);
  }
})();

(async () => {
  while (true) {
    try {
      await main();
    } catch (error) {
      console.error('Fatal error:', error);
    }

    // ⏱️ Wait before posting the next meme (e.g., 1 hour)
    const delayInMinutes = Math.floor(Math.random() * 11) + 40;
    console.log(`🕒 Waiting ${delayInMinutes} minutes before next post...`);
    await utilities.delay(delayInMinutes * 60 * 1000);
  }
})();
