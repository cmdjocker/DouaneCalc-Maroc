
import React from 'react';
import { InvoiceData } from '../types';

interface Props {
  data: InvoiceData;
}

export const InvoiceSummary: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span className="w-1.5 h-6 bg-morocco-red rounded-full"></span>
        Extracted Details
      </h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-slate-500 dark:text-slate-400">Invoice #</p>
          <p className="font-semibold">{data.invoiceNumber}</p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Currency</p>
          <p className="font-semibold">{data.currency}</p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Subtotal (FOB)</p>
          <p className="font-semibold">{data.subtotal.toLocaleString()} {data.currency}</p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Transport</p>
          <p className="font-semibold">{data.transportMethod}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-bold uppercase text-slate-400 mb-2">Items List</p>
        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
          {data.items.map((item, i) => (
            <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex-1 pr-4">
                <p className="font-medium text-sm truncate">{item.description}</p>
                <p className="text-xs text-slate-400">Qty: {item.quantity} × {item.unitPrice} {data.currency}</p>
              </div>
              <p className="font-bold text-sm whitespace-nowrap">{item.totalPrice.toLocaleString()} {data.currency}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
