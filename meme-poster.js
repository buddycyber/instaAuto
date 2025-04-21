const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");

module.exports = async (req, res) => {
  let browser = null;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.goto('https://www.pinterest.com/search/pins/?q=funny%20memes&rs=typed', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.evaluate(() => window.scrollBy(0, 1500));
    await new Promise(res => setTimeout(res, 2000));

    const memeUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src =>
          src.startsWith('https://i.pinimg.com') &&
          /\.(jpg|jpeg|png)$/i.test(src)
        );
    });

    if (!memeUrls.length) throw new Error('No memes found');

    const randomMeme = memeUrls[Math.floor(Math.random() * memeUrls.length)];
    res.status(200).json({ url: randomMeme });

  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (browser !== null) await browser.close();
  }
};
