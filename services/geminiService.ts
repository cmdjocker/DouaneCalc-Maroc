
import { GoogleGenAI, Type } from "@google/genai";
import { InvoiceData } from "../types";

/**
 * Fetches exchange rates using the Frankfurter API (Free, no key required).
 */
export const getExchangeRate = async (from: string, to: string = 'MAD'): Promise<number> => {
  try {
    // Frankfurter is a free service for current and historical exchange rates
    const response = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!response.ok) throw new Error('Exchange rate service unavailable');
    const data = await response.json();
    return data.rates[to] || 10.5;
  } catch (error) {
    console.warn("Falling back to estimated rate due to network error:", error);
    return 10.5; // Standard fallback for EUR/MAD
  }
};

/**
 * Uses Gemini 3 Flash to analyze the invoice image/PDF.
 * Flash is used because it's fast and has a generous free tier.
 */
export const extractInvoiceData = async (base64Image: string, mimeType: string): Promise<InvoiceData> => {
  // The API key is injected by the platform environment
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Image.split(',')[1],
            mimeType: mimeType
          }
        },
        {
          text: `You are an expert Moroccan Customs (ADII) consultant. 
          Extract data from this invoice for a "Valeur à Déclarer" (VAD) calculation.
          
          RULES:
          1. REGIMES: 
             - Commercial goods/products = '023'.
             - Pallets, crates, or packaging mentioned as line items = '312'.
          2. WEIGHTS: 
             - Extract 'Poids Net' for each item if available.
             - Extract 'Poids Brut Total' for the whole shipment.
          3. INCOTERM: Detect FOB, CFR, CIF, EXW, etc. (Default to FOB if unclear).
          4. HS CODES: Assign 10-digit Moroccan HS Codes (SH) based on descriptions.
          5. PACKAGING: For regime '312' items, count 'caisses' (boxes) and 'palettes'.
          
          Return JSON format only.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          invoiceNumber: { type: Type.STRING },
          date: { type: Type.STRING },
          currency: { type: Type.STRING },
          subtotal: { type: Type.NUMBER },
          fret: { type: Type.NUMBER },
          assurance: { type: Type.NUMBER },
          incoterm: { type: Type.STRING },
          totalWeightBrut: { type: Type.NUMBER },
          transportMethod: { type: Type.STRING },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unitPrice: { type: Type.NUMBER },
                totalPrice: { type: Type.NUMBER },
                regime: { type: Type.STRING },
                hsCode: { type: Type.STRING },
                weightNet: { type: Type.NUMBER },
                packagingCaisses: { type: Type.NUMBER },
                packagingPalettes: { type: Type.NUMBER }
              },
              required: ["description", "quantity", "unitPrice", "totalPrice", "regime", "hsCode"]
            }
          }
        },
        required: ["invoiceNumber", "currency", "items", "subtotal", "fret", "assurance", "totalWeightBrut", "incoterm"]
      }
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("L'IA n'a pas pu lire le document. Assurez-vous que l'image est nette et bien éclairée.");
  }

  try {
    return JSON.parse(text) as InvoiceData;
  } catch (e) {
    throw new Error("Erreur de formatage des données. Veuillez réessayer avec une autre capture.");
  }
};
