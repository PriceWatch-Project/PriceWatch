import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

export interface ScrapeResult {
  url: string;
  price: number | null;
  name: string;
  currency: string;
  error: string | null;
}

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
];

async function scrapeWithPlaywright(url: string): Promise<{ html: string; title: string }> {
  console.log(`[Scraper] Initializing Playwright: ${url}`);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: userAgents[0],
      viewport: { width: 1280, height: 720 },
      extraHTTPHeaders: {
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });
    const page = await context.newPage();
    
    // Navigate with a reasonable timeout
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Some sites need a bit of time for price to render via JS
    await page.waitForTimeout(2500);
    
    const html = await page.content();
    const title = await page.title();
    
    return { html, title };
  } finally {
    await browser.close();
  }
}

export async function scrapePrice(url: string, id?: string, retries = 3): Promise<ScrapeResult> {
  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    const userAgent = userAgents[attempt % userAgents.length];
    try {
      let localFile: string | null = null;
      const sitiPath = path.resolve(process.cwd(), 'Siti');

      if (fs.existsSync(sitiPath)) {
        const files = fs.readdirSync(sitiPath);
        if (id) {
          const shortId = id.substring(0, 8);
          const idMatch = files.find(f => f.includes(shortId));
          if (idMatch) localFile = path.join(sitiPath, idMatch);
        }
        if (!localFile) {
          try {
            const host = new URL(url).hostname.replace('www.', '').split('.')[0];
            const domainMatch = files.find(f => f.toLowerCase().startsWith(host));
            if (domainMatch) localFile = path.join(sitiPath, domainMatch);
          } catch (e) {}
        }
      }

      let html = '';
      if (localFile && fs.existsSync(localFile)) {
        console.log(`[Scraper] Local asset active: ${path.basename(localFile)}`);
        html = fs.readFileSync(localFile, 'utf-8');
      } else if (url.startsWith('http')) {
        const host = new URL(url).hostname;
        const isBotBlockedSite = host.includes('amazon') || host.includes('ebay') || host.includes('mediaworld');

        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        
        // Attempt Playwright if it's a known tough site or we've already failed with axios
        if (isBotBlockedSite || attempt >= 1) {
          try {
            console.log(`[Scraper] Using Playwright for ${host} (Attempt ${attempt + 1})`);
            const pw = await scrapeWithPlaywright(url);
            html = pw.html;
          } catch (pwErr: any) {
            console.error(`[Scraper] Playwright fallback failed: ${pwErr.message}`);
          }
        }

        if (!html) {
          console.log(`[Scraper] Live extract (Axios): ${url} (Attempt ${attempt + 1})`);
          const response = await axios.get(url, {
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'Referer': 'https://www.google.com/',
              'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
              'Sec-Ch-Ua-Mobile': '?0',
              'Sec-Ch-Ua-Platform': '"Windows"',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'cross-site',
              'Sec-Fetch-User': '?1',
              'Upgrade-Insecure-Requests': '1'
            },
            timeout: 20000,
            validateStatus: (s) => s < 500,
            maxRedirects: 5
          });

          if (response.status === 403 || response.status === 429) {
            console.warn(`[Scraper] Bot protection hit (${response.status}) for ${host}.`);
            throw new Error(`Bot Detection (${response.status})`);
          }
          html = response.data;
        }
      } else {
        throw new Error('Invalid URL Schema');
      }

      const $ = cheerio.load(html);
      let price: number | null = null;
      let name = $('h1').first().text().trim() || $('title').first().text().trim();

      // Meta Tag Extraction (High Priority)
      const metaSelectors = [
        'meta[property="og:price:amount"]',
        'meta[property="product:price:amount"]',
        'meta[name="twitter:data1"]',
        'meta[itemprop="price"]',
        'meta[name="price"]'
      ];

      for (const sel of metaSelectors) {
        if (price !== null) break;
        const content = $(sel).attr('content');
        if (content) {
          const num = parseFloat(content.replace(/[^\d.,]/g, '').replace(',', '.'));
          if (!isNaN(num) && num > 0) price = num;
        }
      }

      // JSON-LD Extraction
      if (price === null) {
        $('script[type="application/ld+json"]').each((_, el) => {
          if (price !== null) return;
          try {
            const rawJson = $(el).html() || '{}';
            const json = JSON.parse(rawJson);
            
            const extractFromJson = (data: any): any => {
              if (!data) return null;
              if (Array.isArray(data)) {
                for (const item of data) {
                  const p = extractFromJson(item);
                  if (p) return p;
                }
              }
              if (data.offers) {
                if (Array.isArray(data.offers)) return data.offers[0].price;
                return data.offers.price;
              }
              return data.price || null;
            };

            const p = extractFromJson(json);
            if (p) {
              const num = parseFloat(String(p).replace(/[^\d.,]/g, '').replace(',', '.'));
              if (!isNaN(num) && num > 0) price = num;
            }
            if (json.name && !name) name = json.name;
          } catch (e) {}
        });
      }

      // Price Selectors
      if (price === null) {
        // Amazon specific logic - Target the main price containers first
        const amazonMainSelectors = [
          '#corePrice_feature_div .a-price .a-offscreen',
          '#corePrice_desktop .a-price .a-offscreen',
          '#price_inside_buybox',
          '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
          '.a-price.apexPriceToPay .a-offscreen'
        ];

        for (const sel of amazonMainSelectors) {
          const text = $(sel).first().text().trim();
          if (text) {
            const numStr = text.replace(/[^\d.,]/g, '').replace(',', '.');
            const num = parseFloat(numStr);
            if (!isNaN(num) && num > 1) { // Numbers like 1 are usually fake or too small for electronics
              price = num;
              break;
            }
          }
        }

        // Fallback for fragmented Amazon price if main offscreen text failed
        if (price === null) {
          const amazonWhole = $('.a-price-whole').first().text().trim();
          const amazonFraction = $('.a-price-fraction').first().text().trim();
          if (amazonWhole) {
            let whole = amazonWhole.replace(/[^\d]/g, '');
            let frac = amazonFraction.replace(/[^\d]/g, '') || '00';
            const combined = parseFloat(`${whole}.${frac}`);
            if (!isNaN(combined) && combined > 0) price = combined;
          }
        }
      }

      if (price === null) {
        const selectors = [
          '.p-price', '[data-price]', '.current-price', '#priceblock_ourprice', 
          '#priceblock_dealprice', '.spot-price', '.price-val', '.price-now',
          '.pi-price', '.price-amount', '[itemprop="price"]', '.titolo-prezzo',
          '.price', '.value'
        ];
        
        for (const s of selectors) {
          const elements = $(s);
          for (let i = 0; i < Math.min(elements.length, 3); i++) {
            const rawText = $(elements[i]).text().trim();
            if (!rawText) continue;
            
            // Clean common noise
            const cleanText = rawText.replace(/\s/g, '');
            // Match pattern like € 1.234,56 or 1,234.56
            const match = cleanText.match(/(\d{1,3}(\.?\d{3})*(,\d+)?|\d+(,\d+)?)/);
            
            if (match) {
              const numStr = match[0].replace(/\./g, '').replace(',', '.');
              const num = parseFloat(numStr);
              
              // HEURISTIC: If the number is suspiciously low (like 10 for a high-end electronic) 
              // and we found it via a generic selector, we keep looking.
              // We also check if the text contains a currency symbol nearby.
              const hasCurrency = /€|\$|EUR|USD/i.test(rawText) || /€|\$|EUR|USD/i.test($(elements[i]).parent().text());
              
              if (!isNaN(num) && num > 0) {
                // If we have a currency symbol, high confidence
                if (hasCurrency) {
                  price = num;
                  break;
                }
                // If it's a "reasonable" price (usually > 5 if not specified otherwise)
                if (num > 5 && price === null) {
                  price = num;
                }
              }
            }
            if (price !== null) break;
          }
          if (price !== null) break;
        }
      }

      if (price !== null) {
        console.log(`[Scraper] Success: Found price ${price} EUR for ${name.substring(0, 30)}...`);
      }

      return {
        url,
        price,
        name: name || 'Unknown Asset',
        currency: 'EUR',
        error: null
      };
    } catch (e: any) {
      lastError = e.message;
      console.warn(`[Scraper] Attempt failed: ${e.message}`);
    }
  }

  return {
    url,
    price: null,
    name: 'Extraction Failed',
    currency: 'EUR',
    error: lastError
  };
}
