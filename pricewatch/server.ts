import fs from 'fs';
import express from 'express';
import fileUpload from 'express-fileupload';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import { scrapePrice } from './src/lib/scraper.js';
import { EntityType } from './src/types.js';
import db from './src/lib/db.js';
import crypto from 'crypto';
import axios from 'axios';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    createParentPath: true
  }));

  // --- Helper for queries ---
  const query = {
    all: (sql: string, params: any[] = []) => db.prepare(sql).all(...params),
    get: (sql: string, params: any[] = []) => db.prepare(sql).get(...params),
    run: (sql: string, params: any[] = []) => db.prepare(sql).run(...params)
  };

  // --- API Endpoints ---
  
  // Custom Asset Upload for Commodities/Raw Materials
  app.post('/api/upload-asset', async (req: any, res: any) => {
    try {
      if (!req.files || !req.files.htmlFile) {
        return res.status(400).json({ error: 'No HTML file uploaded' });
      }

      const file = req.files.htmlFile as fileUpload.UploadedFile;
      const { productId, originalUrl } = req.body;
      
      const sitiPath = path.resolve(process.cwd(), 'Siti');
      if (!fs.existsSync(sitiPath)) fs.mkdirSync(sitiPath, { recursive: true });

      // If productId is provided, name it specifically to bind it to that monitor
      let fileName = file.name.replace(/[^a-z0-9.]/gi, '_');
      if (productId) {
        const shortId = productId.substring(0, 8);
        fileName = `custom_${shortId}_${fileName}`;
      }

      await file.mv(path.join(sitiPath, fileName));
      console.log(`[Upload] Manually added asset: ${fileName}`);
      
      res.json({ success: true, fileName });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Products
  app.get('/api/products', (req, res) => {
    try {
      const products = query.all('SELECT * FROM products ORDER BY lastUpdated DESC');
      res.json(products);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const { name, url, ownerId } = req.body;
      const id = crypto.randomUUID();
      
      // Force initial asset capture
      const sitiPath = path.resolve(process.cwd(), 'Siti');
      if (!fs.existsSync(sitiPath)) fs.mkdirSync(sitiPath, { recursive: true });

      try {
        console.log(`[Asset-Service] Capturing primary feed: ${url}`);
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache',
            'Referer': 'https://www.google.com/',
            'Upgrade-Insecure-Requests': '1'
          },
          timeout: 20000
        });
        
        const fileName = `auto_${id.substring(0, 8)}.html`;
        fs.writeFileSync(path.join(sitiPath, fileName), response.data);
        console.log(`[Asset-Service] Successfully mapped asset to Siti/${fileName}`);
      } catch (cacheErr: any) {
        console.warn(`[Asset-Service] Primary capture failed: ${cacheErr.message}. Scraper will fall back to live mode.`);
      }

      query.run('INSERT INTO products (id, name, url, ownerId, createdAt) VALUES (?, ?, ?, ?, ?)', 
        [id, name, url, ownerId, new Date().toISOString()]);
      
      res.json({ id, name, url });
    } catch (e: any) {
      console.error('[Server] New target rejected:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // Products delete with hard scrubbing and asset cleanup
  app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    try {
      console.log(`[Server] DELETE REQUEST RECEIVED FOR ID: ${id}`);
      
      if (!id || id === 'undefined') {
        console.error('[Server] Rejecting delete: ID is invalid');
        return res.status(400).json({ error: 'Invalid ID' });
      }

      const check = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
      if (!check) {
        console.warn(`[Server] Delete target not found in DB: ${id}`);
        return res.status(404).json({ error: 'Asset not found' });
      }

      const scrub = db.transaction(() => {
        console.log(`[Server] Executing scrub transaction for: ${id}`);
        
        // Manual deep clean to bypass any potential constraint issues
        db.prepare('DELETE FROM price_history WHERE entityId = ?').run(id);
        db.prepare('DELETE FROM alerts WHERE entityId = ?').run(id);
        
        const comps = db.prepare('SELECT id FROM competitors WHERE productId = ?').all(id) as { id: string }[];
        for (const c of comps) {
          db.prepare('DELETE FROM price_history WHERE entityId = ?').run(c.id);
          db.prepare('DELETE FROM alerts WHERE entityId = ?').run(c.id);
        }
        
        db.prepare('DELETE FROM competitors WHERE productId = ?').run(id);
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
      });
      
      scrub();
      
      // Asset cleanup
      try {
        const sitiPath = path.resolve(process.cwd(), 'Siti');
        if (fs.existsSync(sitiPath)) {
          const files = fs.readdirSync(sitiPath);
          const shortId = id.substring(0, 8);
          files.forEach(file => {
            if (file.includes(shortId)) {
              fs.unlinkSync(path.join(sitiPath, file));
              console.log(`[Server] Disk cleanup: ${file}`);
            }
          });
        }
      } catch (fErr) {
        console.warn('[Server] Disk cleanup warning:', fErr);
      }

      console.log(`[Server] DELETE SUCCESSFUL: ${id}`);
      res.json({ success: true, id });
    } catch (e: any) {
      console.error(`[Server] DELETE FATAL ERROR for ${id}:`, e);
      res.status(500).json({ error: 'Critical failure: ' + e.message });
    }
  });

  // Competitors
  app.get('/api/competitors', (req, res) => {
    try {
      const competitors = query.all('SELECT * FROM competitors');
      res.json(competitors);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/competitors', (req, res) => {
    try {
      const { productId, name, url, ownerId } = req.body;
      const id = crypto.randomUUID();
      query.run('INSERT INTO competitors (id, productId, name, url, ownerId, createdAt) VALUES (?, ?, ?, ?, ?, ?)', 
        [id, productId, name, url, ownerId, new Date().toISOString()]);
      res.json({ id, productId, name, url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Price History
  app.get('/api/price-history', (req, res) => {
    try {
      const history = query.all('SELECT * FROM price_history ORDER BY timestamp ASC');
      res.json(history);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Alerts
  app.get('/api/alerts', (req, res) => {
    try {
      const alerts = query.all('SELECT * FROM alerts ORDER BY timestamp DESC');
      res.json(alerts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/scrape-now', async (req, res) => {
    runScraperTask(); // Run in background
    res.json({ status: 'Scraping started' });
  });

  app.post('/api/rescan/:productId', async (req, res) => {
    const { productId } = req.params;
    try {
      const product = query.get('SELECT * FROM products WHERE id = ?', [productId]) as any;
      if (!product) return res.status(404).json({ error: 'Product not found' });
      
      const result = await scrapePrice(product.url, productId);
      if (result && result.price) {
        const now = new Date().toISOString();
        const oldPrice = product.currentPrice;
        
        query.run('UPDATE products SET currentPrice = ?, lastUpdated = ?, name = ? WHERE id = ?', 
          [result.price, now, result.name || product.name, productId]);
        
        query.run('INSERT INTO price_history (id, entityId, entityType, price, timestamp, ownerId) VALUES (?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), productId, EntityType.PRODUCT, result.price, now, product.ownerId]);

        if (oldPrice && oldPrice !== result.price) {
          const diff = result.price - oldPrice;
          const pct = (diff / oldPrice) * 100;
          query.run('INSERT INTO alerts (id, entityId, entityType, entityName, oldPrice, newPrice, percentageChange, timestamp, ownerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), productId, EntityType.PRODUCT, result.name || product.name, oldPrice, result.price, pct, now, product.ownerId]);
        }
        
        res.json({ success: true, price: result.price, name: result.name });
      } else {
        res.status(500).json({ error: 'Extraction failed: No price found' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Scraper Task ---
  async function runScraperTask() {
    console.log(`[Cron] Starting batch scan...`);
    const now = new Date().toISOString();
    
    try {
      // 1. Products
      const products = query.all('SELECT * FROM products') as any[];
      for (const product of products) {
        try {
          console.log(`[Cron] Processing Product: ${product.id} -> ${product.url}`);
          const scraped = await scrapePrice(product.url, product.id);
          
          if (scraped && scraped.price) {
            const oldPrice = product.currentPrice;
            query.run('UPDATE products SET currentPrice = ?, lastUpdated = ?, name = ? WHERE id = ?', 
              [scraped.price, now, scraped.name || product.name, product.id]);
            
            query.run('INSERT INTO price_history (id, entityId, entityType, price, timestamp, ownerId) VALUES (?, ?, ?, ?, ?, ?)',
              [crypto.randomUUID(), product.id, EntityType.PRODUCT, scraped.price, now, product.ownerId]);

            if (oldPrice && oldPrice !== scraped.price) {
              const diff = scraped.price - oldPrice;
              const pct = (diff / oldPrice) * 100;
              query.run('INSERT INTO alerts (id, entityId, entityType, entityName, oldPrice, newPrice, percentageChange, timestamp, ownerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [crypto.randomUUID(), product.id, EntityType.PRODUCT, scraped.name || product.name, oldPrice, scraped.price, pct, now, product.ownerId]);
            }
          }
        } catch (err: any) {
          console.error(`[Cron] Error on product ${product.id}:`, err.message);
        }
      }

      // 2. Competitors
      const competitors = query.all('SELECT * FROM competitors') as any[];
      for (const comp of competitors) {
        try {
          console.log(`[Cron] Processing Competitor: ${comp.id} -> ${comp.url}`);
          const scraped = await scrapePrice(comp.url, comp.id);
          
          if (scraped && scraped.price) {
            query.run('UPDATE competitors SET currentPrice = ?, lastUpdated = ? WHERE id = ?', 
              [scraped.price, now, comp.id]);
            
            query.run('INSERT INTO price_history (id, entityId, entityType, price, timestamp, ownerId) VALUES (?, ?, ?, ?, ?, ?)',
              [crypto.randomUUID(), comp.id, EntityType.COMPETITOR, scraped.price, now, comp.ownerId]);
          }
        } catch (err: any) {
          console.error(`[Cron] Error on competitor ${comp.id}:`, err.message);
        }
      }

      console.log('[Cron] Batch scan completed successfully.');
    } catch (error: any) {
      console.error('[Cron] FATAL error in runScraperTask:', error.message);
    }
  }

  // Schedule cron job (every 6 hours)
  cron.schedule('0 */6 * * *', runScraperTask);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PriceWatch server running on http://localhost:${PORT}`);
  });
}

startServer();
