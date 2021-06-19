const puppeteer = require("puppeteer");
const fs = require("fs");

const { hideHeadless } = require("./stealth");

const VIEWPORT_HEIGHT = 3000;

function parseDataUrl(dataUrl) {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (matches.length !== 3) {
    throw new Error("Could not parse data URL.");
  }
  return { mime: matches[1], buffer: Buffer.from(matches[2], "base64") };
}

async function saveImage(page, index) {
  const wrapperSelector = `#wideScreen${index}`;
  const canvasSelector = `${wrapperSelector} canvas`;
  const loadingSelector = `${wrapperSelector} .loading`;

  await page.waitForSelector(wrapperSelector);
  await page.waitForSelector(loadingSelector, { hidden: true });
  await page.evaluate((selector) => {
    const wrapperElement = document.querySelector(selector);
    wrapperElement.scrollIntoView();
  }, wrapperSelector);

  const imageHeight = await page.evaluate((selector) => {
    const canvasElement = document.querySelector(selector);
    return parseInt(canvasElement.getAttribute("height"), 10);
  }, canvasSelector);

  await setSmallViewport(page);
  await page.waitForTimeout(1000);

  const imageWidth = await page.evaluate(
    (selector, originalImageHeight) => {
      const canvasElement = document.querySelector(selector);
      const width = parseInt(canvasElement.getAttribute("width"), 10);
      const height = parseInt(canvasElement.getAttribute("height"), 10);
      return Math.round((originalImageHeight * width) / height);
    },
    canvasSelector,
    imageHeight
  );

  await setViewportToWidth(page, imageWidth);
  await page.waitForTimeout(1000);

  const canvasDataUrl = await page.evaluate((selector) => {
    const canvasElement = document.querySelector(selector);
    return canvasElement.toDataURL();
  }, canvasSelector);
  const { buffer } = parseDataUrl(canvasDataUrl);
  fs.writeFileSync(`image_${index}.png`, buffer, "base64");

  await setBigViewport(page);
  await page.waitForTimeout(1000);
}

async function setViewportToWidth(page, width) {
  await page.setViewport({
    width: width,
    height: VIEWPORT_HEIGHT,
    deviceScaleFactor: 1,
  });
}

async function setSmallViewport(page) {
  await setViewportToWidth(page, 1000);
}

async function setBigViewport(page) {
  await setViewportToWidth(page, 2000);
}

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await hideHeadless(page);

  await setBigViewport(page);

  // Load reader
  await page.goto(
    "https://bookwalker.jp/de4f4369e5-f291-4137-b631-cfc9532c2f2d/?sample=1"
  );

  await page.setCookie({
    name: "cookie_optin",
    value: "1",
    domain: ".bookwalker.jp",
    secure: true,
  });

  await page.evaluate(() => {
    localStorage.setItem(
      "/NFBR_Settings/NFBR.SettingData",
      `{"viewerTapRange":50,"viewerPageTransitionAxis":"vertical","viewerAnimationPatternForFixed":"seamless","viewerAnimationPattern":"off","viewerSpreadDouble":false}`
    );
  });

  await page.reload();

  const counterSelector = `#pageSliderCounter`;
  await page.waitForFunction(
    (selector) => {
      const el = document.querySelector(selector);
      return el != null && el.innerText.length > 0;
    },
    {},
    counterSelector
  );
  const counterStr = await page.$eval(counterSelector, (el) => el.innerText);
  const numImages = parseInt(counterStr.split("/")[1], 10);

  try {
    for (let i = 0; i < numImages; i++) {
      await saveImage(page, i);
    }
  } catch (err) {
    console.log("Failure");
  }

  await page.screenshot({ path: "final.png" });

  await browser.close();
})();
