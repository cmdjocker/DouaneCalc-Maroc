
import { GoogleGenAI, Type } from "@google/genai";
import { InvoiceData } from "../types";

export const extractInvoiceData = async (base64Image: string, mimeType: string): Promise<InvoiceData> => {
  // Initialize AI client inside the function to ensure the correct API key is used
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
          text: `Analyze this invoice for Moroccan Customs (ADII). 
          
          EXTRACTION RULES:
          1. Categorize every item into a Regime Code. 
             - Products/Goods should usually be '023' (ATPA).
             - Packaging/Pallets should be '312'.
          2. For '023' items: extract the Net Weight (Poids Net).
          3. For '312' items: detect the number of 'caisses' (boxes) and 'palettes' (pallets).
          4. Extract the TOTAL GROSS WEIGHT (Poids Brut Total) of the whole invoice.
          5. Extract fret (freight), assurance (insurance), and the INCOTERM (FOB, CFR, CIF, EXW, etc.).
          6. Assign 10-digit HS Codes.
          
          JSON structure must follow the schema strictly. Return ONLY the JSON object.`
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
          incoterm: { type: Type.STRING, description: "The incoterm mentioned on the invoice (e.g., CFR, FOB)" },
          totalWeightBrut: { type: Type.NUMBER, description: "Total gross weight (Brut Total) from the invoice" },
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
                weightNet: { type: Type.NUMBER, description: "Net weight for 023 items" },
                packagingCaisses: { type: Type.NUMBER, description: "Count of boxes for 312 items" },
                packagingPalettes: { type: Type.NUMBER, description: "Count of pallets for 312 items" }
              },
              required: ["description", "quantity", "unitPrice", "totalPrice", "regime", "hsCode"]
            }
          }
        },
        required: ["invoiceNumber", "currency", "items", "subtotal", "fret", "assurance", "totalWeightBrut", "incoterm"]
      }
    }
  });

  // Extract text safely from response.text property
  const text = response.text;
  if (!text) {
    throw new Error("The AI returned an empty response. Please try with a clearer image.");
  }

  return JSON.parse(text) as InvoiceData;
};

export const getExchangeRate = async (from: string, to: string = 'MAD'): Promise<number> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `What is the current official exchange rate from ${from} to ${to}? Return only the number as a float. Today is ${new Date().toDateString()}.`,
    config: { temperature: 1 }
  });
  
  // Safe extraction using response.text property
  const rateStr = response.text?.trim() || "10.5";
  const rate = parseFloat(rateStr);
  return isNaN(rate) ? 10.5 : rate;
};
