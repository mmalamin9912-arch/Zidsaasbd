import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Tag, X } from 'lucide-react';
import { VariantOptionPreset } from '../../types';
import { AddOptionTemplateModal } from './AddOptionTemplateModal';

export const OptionsLibraryView: React.FC = () => {
  const [options, setOptions] = useState<VariantOptionPreset[]>([
    { id: 'opt-1', title: 'Clothing Sizes (BD Standard)', values: ['S', 'M', 'L', 'XL', '2XL', '3XL'], type: 'Pill Buttons' },
    { id: 'opt-2', title: 'Color Palette Swatches', values: ['Royal Navy', 'Crimson Red', 'Emerald Green', 'Heritage Gold', 'Pure White'], type: 'Color Swatches' },
    { id: 'opt-3', title: 'Fabric & Embroidery Types', values: ['Jamdani Silk', 'Katan Cotton', 'Rajshahi Pure Silk', 'Dhakai Muslin'], type: 'Dropdown List' },
    { id: 'opt-4', title: 'Footwear Sizes (EU)', values: ['EU 39', 'EU 40', 'EU 41', 'EU 42', 'EU 43', 'EU 44'], type: 'Pill Buttons' },
  ]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newValueMap, setNewValueMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch option templates from API on mount
  useEffect(() => {
    let isMounted = true;
    const fetchOptionTemplates = async () => {
      try {
        const res = await fetch('/api/option-templates?store_slug=' + (window.location.href.split('/')[4] || 'bd'));
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.templates)) {
            setOptions(data.templates as VariantOptionPreset[]);
          }
        }
      } catch (err) {
        console.warn('[OptionsLibrary] Failed to fetch templates:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchOptionTemplates();
    return () => { isMounted = false; };
  }, []);

  const handleAddTemplate = (template: VariantOptionPreset) => {
    setOptions([...options, template]);
    // Sync to API via POST
    fetch('/api/option-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    }).catch(err => console.error('[OptionsLibrary] API save error:', err));
  };

  const handleAddValueToPreset = (presetId: string) => {
    const val = newValueMap[presetId]?.trim();
    if (!val) return;

    setOptions(options.map(opt =>
      opt.id === presetId
        ? { ...opt, values: [...opt.values, val] }
        : opt
    ));

    setNewValueMap({ ...newValueMap, [presetId]: '' });

    // Sync to API via PUT
    const template = options.find(o => o.id === presetId);
    if (template) {
      fetch(`/api/option-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...template, values: [...template.values, val] }),
      }).catch(err => console.error('[OptionsLibrary] API update error:', err));
    }
  };

  const handleRemoveValueFromPreset = (presetId: string, valueIndex: number) => {
    setOptions(options.map(opt =>
      opt.id === presetId
        ? { ...opt, values: opt.values.filter((_, i) => i !== valueIndex) }
        : opt
    ));

    // Sync to API via PUT
    const template = options.find(o => o.id === presetId);
    if (template) {
      fetch(`/api/option-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...template, values: template.values.filter((_, i) => i !== valueIndex) }),
      }).catch(err => console.error('[OptionsLibrary] API update error:', err));
    }
  };

  const handleRemovePreset = (presetId: string) => {
    setOptions(options.filter(o => o.id !== presetId));

    // Sync to API via DELETE
    const template = options.find(o => o.id === presetId);
    if (template) {
      fetch(`/api/option-templates/${template.id}`, {
        method: 'DELETE',
      }).catch(err => console.error('[OptionsLibrary] API delete error:', err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-[#00D68F]" />
            <span>Preset Variant Options Library</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Reusable variant option templates (Sizes, Color Swatches, Materials) to instantly assign across new product listings.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Add Option Template</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((opt) => (
          <div key={opt.id} className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">{opt.title}</h3>
              <span className="text-[10px] font-extrabold uppercase text-[#00D68F] bg-[#00D68F]/20 px-2 py-0.5 rounded-full border border-[#00D68F]/30">
                {opt.type}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {opt.values.map((v, idx) => (
                  <span key={idx} className="group relative text-xs font-semibold bg-[#181B26] text-slate-200 px-2.5 py-1 rounded-lg border border-[#2E3548] flex items-center gap-1.5">
                    {v}
                    <button
                      onClick={() => handleRemoveValueFromPreset(opt.id, idx)}
                      className="text-slate-500 hover:text-red-400 cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newValueMap[opt.id] || ''}
                  onChange={(e) => setNewValueMap({ ...newValueMap, [opt.id]: e.target.value })}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddValueToPreset(opt.id)}
                  placeholder="Add value..."
                  className="flex-1 bg-[#181B26] border border-[#2E3548] rounded-lg px-2.5 py-1.5 text-white text-[11px] focus:outline-none focus:border-[#00D68F]"
                />
                <button
                  onClick={() => handleAddValueToPreset(opt.id)}
                  className="bg-[#2E3548] hover:bg-slate-700 text-white px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-[#2E3548] flex justify-end">
              <button
                onClick={() => handleRemovePreset(opt.id)}
                className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Preset</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      <AddOptionTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleAddTemplate}
      />
    </div>
  );
};
