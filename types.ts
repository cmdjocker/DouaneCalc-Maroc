
export enum TransportMethod {
  AIR = 'AIR',
  SEA = 'SEA',
  LAND = 'LAND'
}

export type CustomsRegime = string;

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  regime: CustomsRegime;
  hsCode: string;
  weightNet?: number; // Net weight for 023
  packagingCaisses?: number; // Number of boxes for 312
  packagingPalettes?: number; // Number of pallets for 312
}

export interface InvoiceData {
  invoiceNumber: string;
  date: string;
  currency: string;
  subtotal: number;
  fret: number;
  assurance: number;
  incoterm: string; // FOB, CFR, EXW, etc.
  totalWeightBrut: number; 
  transportMethod: TransportMethod;
  originCountry?: string;
  items: InvoiceItem[];
}

export interface HSCodeBreakdown {
  hsCode: string;
  description: string;
  weightBrut: number;
  weightNet?: number;
  fobValueMAD: number;
  fretValueMAD: number;
  assuranceValueMAD: number;
  aconageValueMAD: number;
  totalVAD: number;
}

export interface RegimeResult {
  regime: string;
  regimeLibelle: string;
  fobValueMAD: number;
  fretValueMAD: number;
  assuranceValueMAD: number;
  aconageValueMAD: number;
  weightBrut: number;
  totalVAD: number;
  hsCodeBreakdown?: HSCodeBreakdown[];
}

export interface CustomsResult {
  exchangeRate: number;
  incoterm: string;
  totalFobMAD: number;
  totalFretMAD: number;
  totalAssuranceMAD: number;
  totalAconageMAD: number;
  totalWeightBrut: number;
  totalVAD: number;
  breakdown: RegimeResult[];
}
