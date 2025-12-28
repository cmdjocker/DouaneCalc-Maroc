
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { ThemeToggle } from './components/ThemeToggle';

// --- Types & Constants ---
interface Item {
  description: string;
  qty: number;
  price: number;
  hsCode?: string;
  weight?: number;
}

interface Calculation {
  fob: number;
  fret: number;
  assurance: number;
  aconage: number;
  totalVAD: number;
  exchangeRate: number;
  currency: string;
}

const ACONAGE_BASE = 2300; // MAD
const ASSURANCE_RATE = 0.005; // 0.5%

// --- Helper Services ---
const getRate = async (currency: string): Promise<number> => {
  if (currency === 'MAD') return 1;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=MAD`);
    const data = await res.json();
    return data.rates.MAD || 10.85;
  } catch {
    return 10.85; // Fallback for EUR
  }
};

// --- Main App Component ---
const App = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Calculation | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isManual, setIsManual] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    // Check if platform provided key
    setHasApiKey(!!process.env.API_KEY);
  }, []);

  const handleConnectKey = async () => {
    if ((window as any).aistudio) {
      await (window as any).aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const processCalculation = (fob: number, fret: number, rate: number, currency: string) => {
    const fobMAD = fob * rate;
    const fretMAD = fret * rate;
    const assurance = (fobMAD + fretMAD) * ASSURANCE_RATE;
    const aconage = ACONAGE_BASE; // Static estimate for simplicity, can be weight-based
    
    setResults({
      fob: fobMAD,
      fret: fretMAD,
      assurance,
      aconage,
      totalVAD: fobMAD + fretMAD + assurance + aconage,
      exchangeRate: rate,
      currency
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!hasApiKey) {
      setError("Veuillez connecter l'API Gemini pour scanner automatiquement.");
      setIsManual(true);
      return;
    }

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64, mimeType: file.type } },
              { text: "Extract invoice details for Moroccan customs. Provide JSON with: invoiceNumber, currency, subtotal, fret, items (description, qty, price, weight, hsCode)." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                invoiceNumber: { type: Type.STRING },
                currency: { type: Type.STRING },
                subtotal: { type: Type.NUMBER },
                fret: { type: Type.NUMBER },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      description: { type: Type.STRING },
                      qty: { type: Type.NUMBER },
                      price: { type: Type.NUMBER },
                      weight: { type: Type.NUMBER },
                      hsCode: { type: Type.STRING }
                    }
                  }
                }
              }
            }
          }
        });

        const data = JSON.parse(response.text);
        setInvoiceId(data.invoiceNumber || "Facture-" + Math.floor(Math.random() * 1000));
        setItems(data.items || []);
        const rate = await getRate(data.currency || 'EUR');
        processCalculation(data.subtotal || 0, data.fret || 0, rate, data.currency || 'EUR');
      } catch (err: any) {
        setError("L'analyse a échoué. Passez en mode manuel.");
        setIsManual(true);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const subtotal = parseFloat(formData.get('subtotal') as string);
    const fret = parseFloat(formData.get('fret') as string);
    const curr = formData.get('currency') as string;
    
    getRate(curr).then(rate => {
      processCalculation(subtotal, fret, rate, curr);
    });
  };

  const exportPDF = () => {
    const element = document.getElementById('printable-report');
    if (!element) return;
    document.body.classList.add('generating-pdf');
    // @ts-ignore
    html2pdf().from(element).set({
      margin: 10,
      filename: `Calcul_VAD_${invoiceId || 'Import'}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).save().then(() => {
      document.body.classList.remove('generating-pdf');
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-12 no-print">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-morocco-red rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-morocco-red/20">D</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">DouaneCalc Pro</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculateur Valeur à Déclarer (VAD)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!hasApiKey && (
            <button onClick={handleConnectKey} className="px-4 py-2 bg-morocco-red text-white text-[10px] font-black uppercase rounded-xl hover:scale-105 transition-all">Connecter Scan AI</button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Input */}
        <div className="lg:col-span-4 space-y-6 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Importer Document</h2>
            
            <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-8 hover:border-morocco-red transition-all group cursor-pointer text-center bg-slate-50 dark:bg-slate-800/30">
              <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="space-y-4">
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-lg flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-morocco-red" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <p className="text-xs font-black uppercase text-slate-500">Facture PDF / Image</p>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button onClick={() => setIsManual(true)} className="text-[10px] font-black uppercase text-morocco-red hover:underline">Ou Saisie Manuelle Rapide</button>
            </div>
          </div>

          {isManual && (
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6">Saisie Manuelle</h3>
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-2 mb-1 block">Sous-total</label>
                    <input name="subtotal" type="number" step="0.01" required className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-2 mb-1 block">Devise</label>
                    <select name="currency" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold">
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-2 mb-1 block">Frais de Transport (Fret)</label>
                  <input name="fret" type="number" step="0.01" required className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold" />
                </div>
                <button type="submit" className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all">Calculer</button>
              </form>
            </div>
          )}

          {loading && (
            <div className="text-center p-8">
              <div className="w-8 h-8 border-4 border-morocco-red border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-[10px] font-black uppercase text-morocco-red animate-pulse">Lecture de la facture...</p>
            </div>
          )}

          {error && <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 rounded-2xl text-red-600 text-xs font-bold">{error}</div>}
        </div>

        {/* Right Column: Output & Dashboard */}
        <div className="lg:col-span-8">
          {results ? (
            <div className="space-y-6">
              <div className="flex justify-end no-print">
                <button onClick={exportPDF} className="flex items-center gap-2 px-6 py-3 bg-morocco-green text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-morocco-green/20 hover:scale-105 transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Imprimer Rapport A4
                </button>
              </div>

              <div id="printable-report" className="space-y-8 animate-in fade-in slide-in-from-right-4">
                {/* Visual Summary Card */}
                <div className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <svg className="w-32 h-32" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 4.5l7.5 13H4.5L12 6.5z"/></svg>
                  </div>
                  <div className="relative z-10">
                     <p className="text-[10px] font-black uppercase tracking-[0.4em] mb-4 text-morocco-red">Valeur Totale à Déclarer (CIF)</p>
                     <h3 className="text-5xl font-black tracking-tighter mb-8 tabular-nums">
                       {results.totalVAD.toLocaleString('fr-MA', { minimumFractionDigits: 2 })} <span className="text-xl font-normal opacity-50 ml-2 uppercase">MAD</span>
                     </h3>
                     <div className="grid grid-cols-3 gap-8 pt-8 border-t border-white/10 dark:border-slate-200">
                        <div>
                          <p className="text-[8px] font-bold uppercase opacity-50 mb-1">FOB Invoice</p>
                          <p className="text-sm font-black tabular-nums">{results.fob.toLocaleString('fr-MA')} MAD</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold uppercase opacity-50 mb-1">Fret (Shipping)</p>
                          <p className="text-sm font-black tabular-nums">{results.fret.toLocaleString('fr-MA')} MAD</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold uppercase opacity-50 mb-1">Assurance 0.5%</p>
                          <p className="text-sm font-black tabular-nums">{results.assurance.toLocaleString('fr-MA')} MAD</p>
                        </div>
                     </div>
                  </div>
                </div>

                {/* Details List */}
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 border border-slate-200 dark:border-slate-800">
                   <div className="flex justify-between items-center mb-10">
                      <div>
                        <h4 className="text-xl font-black uppercase tracking-tight">Détails de la Déclaration</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">N° Document: {invoiceId || 'N/A'}</p>
                      </div>
                      <div className="text-right">
                         <p className="text-[8px] font-black uppercase text-slate-400">Cours de Change</p>
                         <p className="text-xs font-black">1 {results.currency} = {results.exchangeRate.toFixed(4)} MAD</p>
                      </div>
                   </div>

                   <div className="space-y-4">
                      {items.length > 0 ? items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                           <div className="flex-1">
                              <p className="font-bold text-sm truncate">{item.description}</p>
                              <div className="flex gap-4 mt-1">
                                <span className="text-[10px] font-bold text-slate-400">HS: {item.hsCode || '---'}</span>
                                <span className="text-[10px] font-bold text-slate-400">Poids: {item.weight || 0}kg</span>
                              </div>
                           </div>
                           <div className="text-right">
                              <p className="text-sm font-black">{(item.price * results.exchangeRate).toLocaleString('fr-MA')} MAD</p>
                              <p className="text-[9px] font-bold text-slate-400">{item.qty} x {item.price} {results.currency}</p>
                           </div>
                        </div>
                      )) : (
                        <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase italic">Aucun article listé</div>
                      )}
                   </div>

                   <div className="mt-12 grid grid-cols-2 gap-8 border-t border-slate-100 dark:border-slate-800 pt-8">
                      <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/20">
                         <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Aconage & Manutention</p>
                         <p className="text-lg font-black">{results.aconage.toLocaleString('fr-MA')} MAD</p>
                         <p className="text-[8px] text-slate-400 mt-1 italic">*Estimation forfaitaire ADII</p>
                      </div>
                      <div className="p-6 rounded-3xl bg-morocco-green/5 border border-morocco-green/10">
                         <p className="text-[9px] font-black text-morocco-green uppercase mb-2">Total Valeur VAD</p>
                         <p className="text-lg font-black text-morocco-green">{results.totalVAD.toLocaleString('fr-MA')} MAD</p>
                         <p className="text-[8px] text-morocco-green/60 mt-1 italic">VAD = (FOB + Fret + Assur. + Acon.)</p>
                      </div>
                   </div>
                </div>

                {/* Footer Signature Area for Print */}
                <div className="pt-12 border-t border-slate-100 dark:border-slate-800 flex justify-between items-end opacity-0 print:opacity-100 h-24">
                   <div className="text-[9px] font-bold text-slate-400 uppercase">Généré le: {new Date().toLocaleDateString('fr-FR')}</div>
                   <div className="w-48 border-b-2 border-slate-200"></div>
                   <div className="text-[9px] font-bold text-slate-400 uppercase">Cachet & Signature</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[500px] flex flex-col items-center justify-center text-center p-12 bg-white/40 dark:bg-slate-900/40 rounded-[3rem] border-2 border-dashed border-slate-300 dark:border-slate-800">
               <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-8">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
               </div>
               <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white mb-2">Prêt pour le Calcul</h3>
               <p className="text-slate-500 text-sm max-w-sm">Téléchargez votre facture PDF ou Image pour extraire automatiquement les montants et calculer la VAD.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
