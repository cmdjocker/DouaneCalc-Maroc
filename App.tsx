
import React, { useState, useEffect, useCallback } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { extractInvoiceData, getExchangeRate } from './services/geminiService';
import { InvoiceData, CustomsResult, RegimeResult, HSCodeBreakdown } from './types';
import { InvoiceSummary } from './components/InvoiceSummary';
import { CustomsReport } from './components/CustomsReport';

const REGIME_LABELS: Record<string, string> = {
  '010': 'Mise à la consommation directe',
  '023': 'ATPA sans paiement',
  '312': 'AT d\'emballages et contenants importés pleins',
  '311': 'AT d\'emballages et contenants importés vides',
  '022': 'ATPA avec paiement',
  '040': 'MAC en suite d\'ATPA'
};

const ACONAGE_TOTAL_MAD = 2300;

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [results, setResults] = useState<CustomsResult | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number>(10.5);

  const calculateCustoms = useCallback((data: InvoiceData, rate: number) => {
    const totalFobMAD = data.subtotal * rate;
    const totalFretMAD = data.fret * rate;
    const isCFR = data.incoterm?.toUpperCase() === 'CFR';
    const totalWeightBrut = data.totalWeightBrut;
    
    const globalFretRatio = totalWeightBrut > 0 ? totalFretMAD / totalWeightBrut : 0;
    const globalAconageRatio = totalWeightBrut > 0 ? ACONAGE_TOTAL_MAD / totalWeightBrut : 0;
    
    const weight023Total = data.items
      .filter(i => i.regime === '023')
      .reduce((s, i) => s + (i.weightNet || 0), 0);
    const fretRatioFor023_CFR = weight023Total > 0 ? totalFretMAD / weight023Total : 0;

    const regimesFound = Array.from(new Set(data.items.map(i => i.regime)));

    const breakdown: RegimeResult[] = regimesFound.map((regime): RegimeResult => {
      const regimeItems = data.items.filter(item => item.regime === regime);
      const hsGroups: Record<string, typeof regimeItems> = {};
      
      regimeItems.forEach(item => {
        const key = item.hsCode || 'UNKNOWN';
        if (!hsGroups[key]) hsGroups[key] = [];
        hsGroups[key].push(item);
      });

      const hsCodeBreakdown: HSCodeBreakdown[] = Object.entries(hsGroups).map(([hsCode, items]) => {
        const fobHS = items.reduce((sum, i) => sum + i.totalPrice, 0) * rate;
        const netWeightHS = items.reduce((sum, i) => sum + (i.weightNet || 0), 0);
        
        let weightHS = 0;
        if (regime === '023') {
          weightHS = netWeightHS;
        } else if (regime === '312') {
          const c = items.reduce((sum, i) => sum + (i.packagingCaisses || 0), 0);
          const p = items.reduce((sum, i) => sum + (i.packagingPalettes || 0), 0);
          weightHS = (c * 2) + (p * 25);
        } else {
          weightHS = netWeightHS;
        }

        let fretHSValueForVAD = 0;
        let displayFretHS = 0;

        if (isCFR) {
          if (regime === '023') {
            fretHSValueForVAD = fretRatioFor023_CFR * weightHS;
            displayFretHS = fretHSValueForVAD;
          } else {
            fretHSValueForVAD = 0;
            displayFretHS = globalFretRatio * weightHS;
          }
        } else {
          fretHSValueForVAD = globalFretRatio * weightHS;
          displayFretHS = fretHSValueForVAD;
        }

        const aconageHS = weightHS * globalAconageRatio;
        const assuranceHS = (fobHS + fretHSValueForVAD) * 0.005;

        return {
          hsCode,
          description: items[0].description,
          weightBrut: weightHS,
          weightNet: netWeightHS,
          fobValueMAD: fobHS,
          fretValueMAD: displayFretHS,
          assuranceValueMAD: assuranceHS,
          aconageValueMAD: aconageHS,
          totalVAD: fobHS + fretHSValueForVAD + assuranceHS + aconageHS
        };
      });

      const weightRegime = hsCodeBreakdown.reduce((s, h) => s + h.weightBrut, 0);
      const fobRegime = hsCodeBreakdown.reduce((s, h) => s + h.fobValueMAD, 0);
      const aconageRegime = hsCodeBreakdown.reduce((s, h) => s + h.aconageValueMAD, 0);
      const assuranceRegime = hsCodeBreakdown.reduce((s, h) => s + h.assuranceValueMAD, 0);
      
      let fretRegimeForVAD = 0;
      if (regime === '023' && isCFR) {
        fretRegimeForVAD = totalFretMAD;
      } else if (isCFR) {
        fretRegimeForVAD = 0;
      } else {
        fretRegimeForVAD = globalFretRatio * weightRegime;
      }

      return {
        regime,
        regimeLibelle: REGIME_LABELS[regime] || 'Régime Spécifique',
        fobValueMAD: fobRegime,
        fretValueMAD: fretRegimeForVAD, 
        assuranceValueMAD: assuranceRegime,
        aconageValueMAD: aconageRegime,
        weightBrut: weightRegime,
        totalVAD: hsCodeBreakdown.reduce((s, h) => s + h.totalVAD, 0),
        hsCodeBreakdown
      };
    });

    setResults({
      exchangeRate: rate,
      incoterm: data.incoterm,
      totalFobMAD,
      totalFretMAD: totalFretMAD,
      totalAssuranceMAD: breakdown.reduce((s, r) => s + r.assuranceValueMAD, 0),
      totalAconageMAD: breakdown.reduce((s, r) => s + r.aconageValueMAD, 0),
      totalWeightBrut: totalWeightBrut,
      totalVAD: breakdown.reduce((s, r) => s + r.totalVAD, 0),
      breakdown
    });
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setInvoice(null);
    setResults(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const data = await extractInvoiceData(base64, file.type);
        const rate = await getExchangeRate(data.currency);
        setExchangeRate(rate);
        setInvoice(data);
        calculateCustoms(data, rate);
      } catch (err: any) {
        console.error("Analysis error:", err);
        // Show the specific error message to help the user debug
        setError(`Erreur: ${err.message || "L'analyse a échoué. Vérifiez votre clé API et la qualité du document."}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      setExchangeRate(val);
      if (invoice) {
        calculateCustoms(invoice, val);
      }
    }
  };

  const handleDownloadPDF = async () => {
    const element = document.getElementById('pdf-content');
    if (!element || isGenerating) return;
    
    setIsGenerating(true);
    document.body.classList.add('generating-pdf');

    try {
      // @ts-ignore
      const html2pdfLib = window.html2pdf;
      if (!html2pdfLib) {
        throw new Error("PDF library not loaded");
      }

      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Rapport_VAD_Unique_${invoice?.invoiceNumber || 'Doc'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true, 
          letterRendering: true,
          backgroundColor: '#ffffff',
          scrollY: 0
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'avoid-all' }
      };
      
      await html2pdfLib().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Erreur lors de la génération du PDF.");
    } finally {
      document.body.classList.remove('generating-pdf');
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-10 no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-morocco-red rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg">D</div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">DouaneCalc <span className="text-morocco-red">Maroc</span></h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Expert VAD • Poids Brut & Aconage</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 print:block print:w-full">
        <div className="lg:col-span-4 space-y-6 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest mb-4 text-slate-400">Importer Facture</h2>
            <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 hover:border-morocco-red transition-all group cursor-pointer text-center bg-slate-50 dark:bg-slate-800/20">
              <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="space-y-4">
                <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-2xl shadow-sm flex items-center justify-center mx-auto transition-transform group-hover:scale-110">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-morocco-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-700 dark:text-slate-300">Scanner le document</p>
                  <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">Traitement HS Code & Poids</p>
                </div>
              </div>
            </div>
          </div>

          {invoice && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-widest mb-4 text-slate-400">Paramètres de Calcul</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Cours du jour (1 {invoice.currency} = ? MAD)</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.0001"
                      value={exchangeRate} 
                      onChange={handleRateChange}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-morocco-red outline-none transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">MAD</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(loading || isGenerating) && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 shadow-sm text-center space-y-4 border border-morocco-red/20">
              <div className="w-10 h-10 border-4 border-morocco-red border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs font-black uppercase tracking-widest text-morocco-red tracking-widest">
                {loading ? "Analyse IA en cours..." : "Formatage Page Unique..."}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 rounded-2xl p-6 text-red-600 dark:text-red-400 text-xs font-bold leading-relaxed break-words">
              {error}
            </div>
          )}

          {invoice && <InvoiceSummary data={invoice} />}
        </div>

        <div className="lg:col-span-8 print:w-full print:block">
          {!results && !loading && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white/40 dark:bg-slate-900/40 rounded-[2.5rem] border border-dashed border-slate-300 dark:border-slate-800">
               <h3 className="text-xl font-black mb-2 uppercase tracking-tight text-slate-900 dark:text-white">Rapport Douanier</h3>
               <p className="text-slate-500 text-sm max-w-md leading-relaxed mb-6">
                 Séparez automatiquement vos articles par code S.H. pour les régimes 023 et 312 avec calcul spécifique du Fret, de l'Assurance et de l'Aconage.
               </p>
               <div className="grid grid-cols-2 gap-4 w-full max-w-lg text-left">
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                     <p className="text-[9px] font-black text-morocco-red uppercase mb-1">CFR 023</p>
                     <p className="text-[10px] text-slate-500">Concentration totale du Fret sur la marchandise.</p>
                  </div>
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                     <p className="text-[9px] font-black text-morocco-green uppercase mb-1">Détail 312</p>
                     <p className="text-[10px] text-slate-500">Calcul par code S.H séparé pour chaque emballage.</p>
                  </div>
               </div>
            </div>
          )}

          {results && invoice && (
            <div className="space-y-6">
              <div className="flex justify-end no-print">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-3 px-8 py-4 bg-morocco-red text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {isGenerating ? "Traitement..." : "Télécharger Rapport Page Unique"}
                </button>
              </div>
              <CustomsReport invoice={invoice} results={results} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
