export enum EntityType {
  PRODUCT = 'product',
  COMPETITOR = 'competitor'
}

export interface PriceRecord {
  id: string;
  entityId: string;
  entityType: EntityType;
  price: number;
  timestamp: Date;
}

export interface Product {
  id: string;
  name: string;
  url: string;
  currentPrice: number;
  lastUpdated: Date;
  competitors: string[]; // Competitor IDs
}

export interface Competitor {
  id: string;
  productId: string;
  name: string;
  url: string;
  currentPrice: number;
  lastUpdated: Date;
}

export interface Alert {
  id: string;
  entityId: string;
  entityName: string;
  oldPrice: number;
  newPrice: number;
  percentageChange: number;
  timestamp: Date;
}
