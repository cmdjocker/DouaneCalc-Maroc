
import React from 'react';
import { InvoiceData, CustomsResult, RegimeResult } from '../types';

interface CustomsReportProps {
  invoice: InvoiceData;
  results: CustomsResult;
}

const formatMADPrecision = (val: number) => val.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMADRounded = (val: number) => Math.round(val).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatKG = (val: number) => val.toLocaleString('fr-MA', { maximumFractionDigits: 2 });

const HSCodeCard: React.FC<{ hs: any, isCFR: boolean, regime: string }> = ({ hs, isCFR, regime }) => (
  <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
    <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-50 dark:border-slate-800">
      <div className="flex items-center gap-1">
        <span className="w-6 h-6 rounded-lg bg-morocco-red/10 flex items-center justify-center text-morocco-red text-[8px] font-black">HS</span>
        <span className="font-black text-xs text-slate-900 dark:text-white">{hs.hsCode}</span>
      </div>
      <div className="text-right">
        <p className="text-[7px] text-slate-400 font-bold uppercase">VAD</p>
        <p className="font-black text-morocco-green text-xs">{formatMADRounded(hs.totalVAD)} MAD</p>
      </div>
    </div>
    
    <div className="grid grid-cols-3 gap-2">
      <div className="space-y-0.5">
        <p className="text-[7px] text-slate-400 font-bold uppercase">Poids Brut</p>
        <p className="text-[10px] font-black">{formatKG(hs.weightBrut)} KG</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-[7px] text-slate-400 font-bold uppercase">FOB (MAD)</p>
        <p className="text-[10px] font-black">{formatMADPrecision(hs.fobValueMAD)}</p>
      </div>
      <div className="space-y-0.5">
        <p className="text-[7px] text-slate-400 font-bold uppercase">Fret S.H</p>
        <p className="text-[10px] font-black">{formatMADPrecision(hs.fretValueMAD)}</p>
      </div>
    </div>
    
    <div className="mt-1 pt-1 border-t border-slate-50 dark:border-slate-800 flex justify-between overflow-hidden">
      <span className="text-[7px] text-slate-400 font-bold uppercase">Description</span>
      <span className="text-[8px] font-bold text-slate-500 truncate max-w-[120px]">{hs.description}</span>
    </div>
  </div>
);

const RegimeBlock: React.FC<{ result: RegimeResult, isCFR: boolean, colorClass: string }> = ({ result, isCFR, colorClass }) => {
  const fretSummary = result.hsCodeBreakdown?.reduce((s, h) => s + h.fretValueMAD, 0) || 0;
  
  return (
    <div className={`p-4 rounded-3xl border ${colorClass} bg-white dark:bg-slate-900 shadow-sm`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`w-2 h-2 rounded-full ${result.regime === '023' ? 'bg-morocco-red' : 'bg-morocco-green'}`}></span>
            <h4 className="font-black text-sm text-slate-900 dark:text-white uppercase tracking-tight">Régime {result.regime}</h4>
          </div>
          <p className="text-[8px] font-bold text-slate-500 uppercase leading-none">{result.regimeLibelle}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] text-slate-400 font-bold uppercase mb-0.5">Poids Régime</p>
          <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{formatKG(result.weightBrut)} KG</p>
        </div>
      </div>

      <div className="mb-2 p-2 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[7px] text-slate-400 font-black uppercase mb-0.5">Fret {result.regime}</p>
          <p className="text-[10px] font-black">{formatMADPrecision(fretSummary)}</p>
        </div>
        <div className="text-center border-x border-slate-200 dark:border-slate-700/50 px-1">
          <p className="text-[7px] text-slate-400 font-black uppercase mb-0.5">Assurance</p>
          <p className="text-[10px] font-black">{formatMADPrecision(result.assuranceValueMAD)}</p>
        </div>
        <div className="text-center">
          <p className="text-[7px] text-slate-400 font-black uppercase mb-0.5">Aconage</p>
          <p className="text-[10px] font-black">{formatMADPrecision(result.aconageValueMAD)}</p>
        </div>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
        {result.hsCodeBreakdown?.map((hs, idx) => (
          <HSCodeCard key={idx} hs={hs} isCFR={isCFR} regime={result.regime} />
        ))}
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <span className="text-[8px] font-black text-slate-400 uppercase">Total VAD Régime {result.regime}</span>
        <div className="text-right">
          <span className="text-sm font-black text-slate-900 dark:text-white">{formatMADRounded(result.totalVAD)}</span>
          <span className="text-[8px] font-bold text-slate-400 uppercase ml-1">MAD</span>
        </div>
      </div>
    </div>
  );
};

export const CustomsReport: React.FC<CustomsReportProps> = ({ invoice, results }) => {
  const isCFR = results.incoterm?.toUpperCase() === 'CFR';

  return (
    <div id="pdf-content" className="space-y-4 mx-auto max-w-full print:p-0">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="flex justify-between items-start mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-1 leading-none">CERTIFICAT VAD</h2>
            <div className="flex gap-2 items-center">
              <span className="px-2 py-0.5 bg-slate-900 text-white text-[9px] font-black rounded uppercase tracking-wider">
                {results.incoterm || 'FOB'}
              </span>
              <p className="text-slate-400 font-bold uppercase text-[8px] tracking-widest">Calcul Douane Maroc</p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-bold uppercase text-slate-500 text-left border border-slate-100 p-2 rounded-lg bg-slate-50/50">
               <div>Facture: <span className="text-slate-900 font-black">{invoice.invoiceNumber}</span></div>
               <div>Date: <span className="text-slate-900 font-black">{invoice.date || 'N/A'}</span></div>
               <div>Transport: <span className="text-slate-900 font-black">{invoice.transportMethod}</span></div>
               <div>Subtotal: <span className="text-slate-900 font-black">{invoice.subtotal.toLocaleString()} {invoice.currency}</span></div>
            </div>
            <div className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-right">
              <p className="text-[7px] uppercase font-black tracking-widest mb-0.5">Cours Appliqué</p>
              <p className="text-xs font-black tabular-nums">1 {invoice.currency} = {results.exchangeRate.toFixed(4)} MAD</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-4">
          {results.breakdown.map((r) => (
            <RegimeBlock 
              key={r.regime}
              result={r} 
              isCFR={isCFR}
              colorClass={r.regime === '023' ? "border-morocco-red/10" : "border-morocco-green/10"}
            />
          ))}
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
           <div className="relative z-10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="text-center sm:text-left">
                 <span className="text-[8px] font-black uppercase tracking-[0.4em] text-morocco-red mb-1 block leading-none">Total Valeur CIF à Déclarer</span>
                 <p className="text-3xl font-black tracking-tighter leading-none">
                   {formatMADRounded(results.totalVAD)}
                   <span className="text-xs font-normal opacity-40 uppercase tracking-widest ml-2">MAD</span>
                 </p>
              </div>
              <div className="grid grid-cols-4 gap-4 w-full sm:w-auto text-center">
                <div className="space-y-0.5">
                  <p className="text-[7px] text-slate-500 font-bold uppercase">Poids Brut</p>
                  <p className="text-xs font-black">{formatKG(results.totalWeightBrut)} KG</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[7px] text-slate-500 font-bold uppercase">Fret Global</p>
                  <p className="text-xs font-black">{formatMADRounded(results.totalFretMAD)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[7px] text-slate-500 font-bold uppercase">Aconage</p>
                  <p className="text-xs font-black">{formatMADRounded(results.totalAconageMAD)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[7px] text-slate-500 font-bold uppercase">Assurance</p>
                  <p className="text-xs font-black">{formatMADRounded(results.totalAssuranceMAD)}</p>
                </div>
              </div>
           </div>
        </div>
        
        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
           <p className="text-[8px] text-slate-400 italic font-medium leading-none">
             Généré automatiquement par DouaneCalc Maroc Pro • {new Date().toLocaleDateString('fr-FR')}
           </p>
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-morocco-green rounded-full"></div>
              <span className="text-[8px] font-black uppercase tracking-tighter">Certifié BADR</span>
           </div>
        </div>
      </div>
    </div>
  );
};
