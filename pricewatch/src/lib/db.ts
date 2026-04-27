import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In local mode, the db file will be in the root
const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    currentPrice REAL,
    lastUpdated TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    ownerId TEXT -- to keep it consistent with the multi-user logic if needed
  );

  CREATE TABLE IF NOT EXISTS competitors (
    id TEXT PRIMARY KEY,
    productId TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    currentPrice REAL,
    lastUpdated TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    ownerId TEXT,
    FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id TEXT PRIMARY KEY,
    entityId TEXT NOT NULL,
    entityType TEXT NOT NULL, -- 'product' or 'competitor'
    price REAL NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    ownerId TEXT
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    entityId TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityName TEXT,
    oldPrice REAL,
    newPrice REAL,
    percentageChange REAL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    ownerId TEXT
  );
`);

export default db;
