
import React, { useState, useCallback } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { extractInvoiceData, getExchangeRate } from './services/geminiService';
import { InvoiceData, CustomsResult, RegimeResult, HSCodeBreakdown } from './types';
import { InvoiceSummary } from './components/InvoiceSummary';
import { CustomsReport } from './components/CustomsReport';

const REGIME_LABELS: Record<string, string> = {
  '010': 'Mise à la consommation directe',
  '023': 'ATPA sans paiement',
  '312': 'AT d\'emballages importés pleins',
  '311': 'AT d\'emballages importés vides',
  '022': 'ATPA avec paiement',
  '040': 'MAC en suite d\'ATPA'
};

const ACONAGE_FIXED_MAD = 2300; // Fixed estimate for port handling

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
    const isCFR = data.incoterm?.toUpperCase() === 'CFR' || data.incoterm?.toUpperCase() === 'CIF';
    const totalWeightBrut = data.totalWeightBrut || 1;
    
    const globalFretRatio = totalFretMAD / totalWeightBrut;
    const globalAconageRatio = ACONAGE_FIXED_MAD / totalWeightBrut;
    
    const weight023Total = data.items
      .filter(i => i.regime === '023')
      .reduce((s, i) => s + (i.weightNet || 0), 0) || 1;
    
    const fretRatioFor023_CFR = totalFretMAD / weight023Total;

    const regimesFound = Array.from(new Set(data.items.map(i => i.regime)));

    const breakdown: RegimeResult[] = regimesFound.map((regime): RegimeResult => {
      const regimeItems = data.items.filter(item => item.regime === regime);
      const hsGroups: Record<string, typeof regimeItems> = {};
      
      regimeItems.forEach(item => {
        const key = item.hsCode || 'VARIOUS';
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
          weightHS = (c * 2) + (p * 25); // Standard ADII weight estimates for packaging
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
        const assuranceHS = (fobHS + fretHSValueForVAD) * 0.005; // 0.5% standard

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
      
      let fretRegimeForVAD = hsCodeBreakdown.reduce((s, h) => s + h.fretValueMAD, 0);

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
        setError(err.message || "L'analyse a échoué. Vérifiez la qualité de l'image.");
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
      if (invoice) calculateCustoms(invoice, val);
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
      const opt = {
        margin: [5, 5, 5, 5],
        filename: `Rapport_VAD_${invoice?.invoiceNumber || 'Douane'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await html2pdfLib().set(opt).from(element).save();
    } catch (err) {
      console.error("PDF Error:", err);
      alert("Erreur lors de la création du PDF.");
    } finally {
      document.body.classList.remove('generating-pdf');
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-10 no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-morocco-red rounded-lg flex items-center justify-center text-white font-bold shadow-lg">D</div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">DouaneCalc Maroc</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Calcul VAD • Régimes 023/312</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 print:block">
        <div className="lg:col-span-4 space-y-6 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <h2 className="text-xs font-black uppercase tracking-widest mb-4 text-slate-400">Importer Facture</h2>
            <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 hover:border-morocco-red transition-all group cursor-pointer text-center bg-slate-50 dark:bg-slate-800/20">
              <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
              <div className="space-y-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300 group-hover:text-morocco-red mx-auto transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-xs font-black text-slate-500 uppercase">Scanner PDF / Image</p>
              </div>
            </div>
          </div>

          {invoice && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Cours de Change (1 {invoice.currency} = ? MAD)</label>
              <input 
                type="number" 
                step="0.001"
                value={exchangeRate} 
                onChange={handleRateChange}
                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-morocco-red outline-none"
              />
            </div>
          )}

          {loading && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-10 shadow-sm text-center border border-morocco-red/10">
              <div className="w-8 h-8 border-4 border-morocco-red border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-[10px] font-black uppercase text-morocco-red">Analyse Intelligente...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl p-6 text-red-600 dark:text-red-400 text-xs font-bold leading-relaxed">
              {error}
            </div>
          )}

          {invoice && <InvoiceSummary data={invoice} />}
        </div>

        <div className="lg:col-span-8">
          {!results && !loading && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12 bg-white/40 dark:bg-slate-900/40 rounded-[2.5rem] border border-dashed border-slate-300 dark:border-slate-800">
               <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                 </svg>
               </div>
               <h3 className="text-lg font-black uppercase text-slate-900 dark:text-white mb-2">Prêt pour l'import</h3>
               <p className="text-slate-500 text-sm max-w-sm">
                 Déposez votre facture. L'IA calculera automatiquement la VAD marocaine en séparant les articles et les emballages.
               </p>
            </div>
          )}

          {results && invoice && (
            <div className="space-y-6">
              <div className="flex justify-end no-print">
                <button
                  onClick={handleDownloadPDF}
                  disabled={isGenerating}
                  className="flex items-center gap-3 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-xl disabled:opacity-50"
                >
                  {isGenerating ? "Génération..." : "Imprimer Rapport A4"}
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
