import React, { useState } from 'react';
import { Sliders, Plus, Trash2, Check, Sparkles } from 'lucide-react';
import { useToast } from '../ToastProvider';

export const FiltersView: React.FC = () => {
  const toast = useToast();
  const [filters, setFilters] = useState([]);

  return (
    <div className="space-y-6">
      <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[#00D68F]" />
            <span>Storefront Catalog Search Filters</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure faceted search filter rules for customers exploring your online store catalog.
          </p>
        </div>

        <button
          onClick={() => toast.info('New filter preset added')}
          className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Filter Preset</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filters.map((f) => (
          <div key={f.id} className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl flex items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 bg-[#181B26] px-2 py-0.5 rounded-md border border-[#2E3548]">
                {f.type}
              </span>
              <h3 className="font-bold text-white text-sm mt-1">{f.name}</h3>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{f.rule}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilters(filters.map(item => item.id === f.id ? { ...item, isActive: !item.isActive } : item))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  f.isActive ? 'bg-[#00D68F]/20 text-[#00D68F] border border-[#00D68F]/30' : 'bg-slate-700/40 text-slate-400'
                }`}
              >
                {f.isActive ? 'Active' : 'Disabled'}
              </button>

              <button
                onClick={() => setFilters(filters.filter(item => item.id !== f.id))}
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
