import React, { useCallback, useEffect, useState } from 'react';
import { TrendingUp, Sparkles, Search, MessageSquare, Zap, Globe, Check } from 'lucide-react';

import { MerchantProfile } from '../../types';
import { useToast } from '../ToastProvider';
import { useEntitlements } from '../../lib/planEntitlements';
import {
  EMPTY_GROWTH_CONFIG,
  SECRET_PLACEHOLDER,
  formatCaptionForClipboard,
  generateCaption,
  loadGrowthConfig,
  loadRecoveredSales,
  saveGrowthConfig,
} from '../../lib/growthToolsApi';

interface GrowthViewProps {
  merchant?: MerchantProfile;
  onSwitchToBilling?: () => void;
}

export const GrowthView: React.FC<GrowthViewProps> = ({
  merchant,
  onSwitchToBilling
}) => {
  const toast = useToast();
  // Growth-tool locks come from the ACTIVE PLAN's capability flags, so an admin
  // switching off the AI caption writer or WhatsApp cart recovery for a plan
  // locks the matching tool here immediately. Previously this was a single
  // `subscriptionPlan === 'free_trial'` check that ignored the plan's own flags.
  const entitlements = useEntitlements();
  const lockCaption = !entitlements.can('aiCaption');
  const lockCartRecovery = !entitlements.can('whatsappRecovery');
  const lockPixels = !(entitlements.can('metaPixels') && entitlements.can('googleAnalytics'));
  const storeSlug = merchant?.storeSlug || merchant?.store_slug || '';
  const storeName = merchant?.storeName || merchant?.name || '';

  const [seoOptimized, setSeoOptimized] = useState(true);
  const [cartRecoveryEnabled, setCartRecoveryEnabled] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [messageTemplate, setMessageTemplate] = useState(EMPTY_GROWTH_CONFIG.whatsappRecoveryTemplate);
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [tiktokPixelId, setTiktokPixelId] = useState('');
  const [ga4Id, setGa4Id] = useState('');
  const [recoveredSales, setRecoveredSales] = useState(0);
  const [captionPrompt, setCaptionPrompt] = useState('');
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingWhatsApp, setIsSavingWhatsApp] = useState(false);
  const [isSavingPixels, setIsSavingPixels] = useState(false);

  // ── Load persisted settings on mount ───────────────────────────────────────
  // Everything below used to be `useState('')` seeded from nothing, so a reload
  // silently discarded the merchant's configuration. It now comes from
  // MongoDB (`growthConfig`, mirrored into `store_settings` as `growth_tools`).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      const [config, sales] = await Promise.all([
        loadGrowthConfig(storeSlug),
        loadRecoveredSales(storeSlug),
      ]);
      if (cancelled) return;
      setSeoOptimized(config.seoOptimized);
      setCartRecoveryEnabled(config.whatsappRecoveryEnabled);
      setPixelId(config.fbPixelId);
      setTiktokPixelId(config.tiktokPixelId);
      setGa4Id(config.ga4MeasurementId);
      setMessageTemplate(config.whatsappRecoveryTemplate);
      setWhatsappApiKey(config.whatsappApiKey);
      setWhatsappInstanceId(config.whatsappInstanceId);
      setRecoveredSales(sales.recoveredSalesBDT);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  const handleSaveWhatsApp = async () => {
    setIsSavingWhatsApp(true);
    try {
      const saved = await saveGrowthConfig(
        {
          whatsappRecoveryEnabled: cartRecoveryEnabled,
          // Send a blank token as "clear the credential" — anything else,
          // including the '••' placeholder, is treated as "unchanged" server-side.
          whatsappApiKey: whatsappApiKey === SECRET_PLACEHOLDER ? '' : whatsappApiKey,
          whatsappInstanceId,
          whatsappRecoveryTemplate: messageTemplate,
          seoOptimized,
        },
        storeSlug
      );

      if (!saved) {
        toast.error('Could not save WhatsApp settings.', {
          description: 'Please check your connection and try again.',
        });
        return;
      }
      // Re-sync from the server so the redacted token is reflected back in the
      // field rather than leaving the real value sitting in component state.
      setWhatsappApiKey(saved.whatsappApiKey);
      setMessageTemplate(saved.whatsappRecoveryTemplate);
      toast.success('WhatsApp settings saved successfully!');
    } finally {
      setIsSavingWhatsApp(false);
    }
  };

  const handleSavePixels = async () => {
    setIsSavingPixels(true);
    try {
      const saved = await saveGrowthConfig(
        {
          fbPixelId: pixelId,
          tiktokPixelId,
          ga4MeasurementId: ga4Id,
          seoOptimized,
        },
        storeSlug
      );

      if (!saved) {
        toast.error('Could not save tracking pixels.', {
          description: 'Please check your connection and try again.',
        });
        return;
      }
      setPixelId(saved.fbPixelId);
      setTiktokPixelId(saved.tiktokPixelId);
      setGa4Id(saved.ga4MeasurementId);
      toast.success('Pixel & SEO settings saved — your storefront now loads them.');
    } finally {
      setIsSavingPixels(false);
    }
  };

  const handleGenerateCaption = useCallback(async () => {
    if (lockCaption) {
      onSwitchToBilling?.();
      return;
    }

    if (!captionPrompt.trim()) {
      toast.warning('Please enter what you want the post to be about.');
      return;
    }

    setIsGeneratingCaption(true);
    try {
      const result = await generateCaption({
        prompt: captionPrompt,
        storeName,
      });

      if (!result) {
        toast.error('Failed to generate AI caption.', { description: 'Please try again in a moment.' });
        return;
      }

      setGeneratedCaption(result.caption);
      setGeneratedHashtags(result.hashtags);

      // The backend answers 200 with flagged fallback copy when the AI provider
      // is unavailable — treating that as a success would show the merchant a
      // generic sentence as though it were their generated caption.
      if (result.fallback) {
        toast.warning('AI is temporarily unavailable — showing starter copy you can edit.');
      }
    } finally {
      setIsGeneratingCaption(false);
    }
  }, [captionPrompt, lockCaption, onSwitchToBilling, storeName, toast]);

  const copyCaption = () => {
    const text = formatCaptionForClipboard({
      caption: generatedCaption,
      hashtags: generatedHashtags,
      callToAction: '',
      fallback: false,
    });
    navigator.clipboard.writeText(text);
    toast.success('Caption copied to clipboard!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-[#D4AF37] uppercase bg-[#D4AF37]/10 px-2.5 py-0.5 rounded border border-[#D4AF37]/20">
              Zid Growth Engine & SEO
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">Store Growth & Conversion Optimization</h1>
          <p className="text-xs text-slate-400 mt-1">
            Boost customer retention with automated WhatsApp abandoned cart recovery, Google Search SEO indexing, and Meta Pixel conversion API.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* AI Social Media Caption Writer */}
        <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">AI Social Media Caption Writer</h3>
              <p className="text-xs text-slate-400">Generate professional promotional captions & hashtags</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">What is this post about?</label>
              <textarea
                placeholder="e.g. New Jamdani Saree collection launch, 20% discount on first purchase..."
                value={captionPrompt}
                onChange={(e) => setCaptionPrompt(e.target.value)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none h-20"
              />
            </div>

            {generatedCaption && (
              <div className="p-3 bg-[#181B26] border border-[#2E3548] rounded-xl text-xs text-slate-300 relative group">
                <p className="whitespace-pre-wrap">{generatedCaption}</p>
                {generatedHashtags.length > 0 && (
                  <p className="mt-2 text-[#D4AF37] font-semibold">{generatedHashtags.join(' ')}</p>
                )}
                <button
                  onClick={copyCaption}
                  className="absolute top-2 right-2 text-[10px] text-[#D4AF37] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer"
                >
                  Copy
                </button>
              </div>
            )}

            <button
              onClick={handleGenerateCaption}
              disabled={isGeneratingCaption}
              className="w-full py-2 bg-[#D4AF37] text-slate-950 font-bold text-xs rounded-xl hover:bg-[#C49F27] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 relative overflow-hidden"
            >
              {lockCaption && (
                <div className="absolute top-0 right-0 bg-slate-950 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg border-l border-b border-[#D4AF37]/30 uppercase tracking-tighter">
                  PRO
                </div>
              )}
              <Sparkles className={`w-4 h-4 ${isGeneratingCaption ? 'animate-spin' : ''}`} />
              {isGeneratingCaption ? 'Generating...' : 'Generate AI Caption'}
            </button>
          </div>
        </div>

        {/* Abandoned Cart WhatsApp Recovery */}
        <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-[#D4AF37] flex items-center justify-center font-bold">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">WhatsApp Abandoned Cart Auto-Recovery</h3>
                <p className="text-xs text-slate-400">Sends automatic WhatsApp discount reminder</p>
              </div>
            </div>

            {/* Disabled (not just hidden) when the active plan's
                `whatsappRecovery` flag is off, so the merchant can see the tool
                exists and understand it is plan-gated rather than missing. */}
            <label className={`relative inline-flex items-center ${lockCartRecovery ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={cartRecoveryEnabled}
                disabled={lockCartRecovery}
                onChange={(e) => {
                  if (lockCartRecovery) { onSwitchToBilling?.(); return; }
                  setCartRecoveryEnabled(e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37]"></div>
            </label>
          </div>

<div className="space-y-3">
            <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Automated WhatsApp Message Template:</label>
                <textarea
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none h-20"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Placeholders: {'{{name}} {{storeName}} {{itemName}} {{couponCode}} {{discount}} {{expiresAt}}'}
                </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="password"
                placeholder={whatsappApiKey === SECRET_PLACEHOLDER ? 'Saved (••••••) — type to replace' : 'WhatsApp API Key'}
                value={whatsappApiKey}
                onChange={(e) => setWhatsappApiKey(e.target.value)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none"
              />
              <input type="text" placeholder="Phone Instance ID" value={whatsappInstanceId} onChange={(e) => setWhatsappInstanceId(e.target.value)} className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-[#2E3548]">
            <span>Recovered Sales This Month:</span>
            <span className="text-white font-extrabold text-sm">৳{recoveredSales.toLocaleString()} BDT</span>
          </div>

          <button
            onClick={handleSaveWhatsApp}
            disabled={isSavingWhatsApp || isLoading}
            className="w-full py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-emerald-400 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Zap className="w-4 h-4" />
            {isSavingWhatsApp ? 'Saving...' : 'Save WhatsApp Settings'}
          </button>
        </div>

        {/* SEO & Meta Pixel Config */}
        <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Google SEO & Tracking Pixels</h3>
              <p className="text-xs text-slate-400">Meta, TikTok, and Google conversion tracking</p>
            </div>
          </div>

          <div className="space-y-3">
            <input type="text" placeholder="Meta / Facebook Pixel ID" value={pixelId} onChange={(e) => setPixelId(e.target.value)} className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none" />
            <input type="text" placeholder="TikTok Pixel ID" value={tiktokPixelId} onChange={(e) => setTiktokPixelId(e.target.value)} className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none" />
            <input type="text" placeholder="Google Analytics (GA4) Tracking ID" value={ga4Id} onChange={(e) => setGa4Id(e.target.value)} className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none" />

            <div className="flex items-center justify-between bg-[#181B26] p-3 rounded-xl border border-[#2E3548]">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-xs text-slate-200 font-semibold">Automatic XML Sitemap & Schema</span>
              </div>
              <span className="text-[10px] text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded font-bold">Active</span>
            </div>
            
            <button
              onClick={handleSavePixels}
              disabled={isSavingPixels || isLoading}
              className="w-full py-2 bg-[#D4AF37] text-slate-950 font-bold text-xs rounded-xl hover:bg-[#00E699] transition cursor-pointer disabled:opacity-50"
            >
              {isSavingPixels ? 'Saving...' : 'Save Pixel & SEO Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
