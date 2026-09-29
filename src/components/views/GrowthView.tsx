import React, { useState } from 'react';
import { TrendingUp, Sparkles, Search, MessageSquare, Zap, Globe, Check } from 'lucide-react';

import { MerchantProfile } from '../../types';
import { useToast } from '../ToastProvider';

interface GrowthViewProps {
  merchant?: MerchantProfile;
  onSwitchToBilling?: () => void;
}

export const GrowthView: React.FC<GrowthViewProps> = ({
  merchant,
  onSwitchToBilling
}) => {
  const toast = useToast();
  const isFreeTier = merchant?.subscriptionPlan === 'free_trial';

  const [seoOptimized, setSeoOptimized] = useState(true);
  const [cartRecoveryEnabled, setCartRecoveryEnabled] = useState(true);
  const [pixelId, setPixelId] = useState('');
  const [messageTemplate, setMessageTemplate] = useState("Hi {{name}}! You left items in your cart at {{storeName}}. Use coupon code '{{couponCode}}' to get 10% OFF + Free Home Delivery!");
  const [whatsappApiKey, setWhatsappApiKey] = useState('');
  const [whatsappInstanceId, setWhatsappInstanceId] = useState('');
  const [tiktokPixelId, setTiktokPixelId] = useState('');
  const [ga4Id, setGa4Id] = useState('');
  const [recoveredSales, setRecoveredSales] = useState(0);
  const [captionPrompt, setCaptionPrompt] = useState('');
  const [generatedCaption, setGeneratedCaption] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);

  const handleSaveWhatsApp = () => {
    // Logic to save WhatsApp settings would go here
    toast.success('WhatsApp settings saved successfully!');
  };

  const generateCaption = async () => {
    if (isFreeTier) {
      onSwitchToBilling?.();
      return;
    }

    if (!captionPrompt) {
      toast.warning('Please enter what you want the post to be about.');
      return;
    }

    setIsGeneratingCaption(true);
    try {
      const response = await fetch('/api/ai/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Generate a professional, catchy social media promotional caption and hashtags for an e-commerce store.
          The post is about: ${captionPrompt}.
          Make it engaging and include relevant emojis.`,
          systemInstruction: 'You are an expert social media manager for luxury and modern e-commerce brands.'
        }),
      });

      const data = await response.json();
      if (data.text) {
        setGeneratedCaption(data.text);
      }
    } catch (error) {
      console.error('AI Caption Error:', error);
      toast.error('Failed to generate AI caption.', { description: 'Please try again in a moment.' });
    } finally {
      setIsGeneratingCaption(false);
    }
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
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCaption);
                    toast.success('Caption copied to clipboard!');
                  }}
                  className="absolute top-2 right-2 text-[10px] text-[#D4AF37] font-bold opacity-0 group-hover:opacity-100 transition cursor-pointer"
                >
                  Copy
                </button>
              </div>
            )}

            <button 
              onClick={generateCaption}
              disabled={isGeneratingCaption}
              className="w-full py-2 bg-[#D4AF37] text-slate-950 font-bold text-xs rounded-xl hover:bg-[#C49F27] transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 relative overflow-hidden"
            >
              {isFreeTier && (
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

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={cartRecoveryEnabled}
                onChange={(e) => setCartRecoveryEnabled(e.target.checked)}
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
            </div>
            <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="WhatsApp API Key" value={whatsappApiKey} onChange={(e) => setWhatsappApiKey(e.target.value)} className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none" />
                <input type="text" placeholder="Phone Instance ID" value={whatsappInstanceId} onChange={(e) => setWhatsappInstanceId(e.target.value)} className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:border-[#D4AF37] focus:outline-none" />
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-[#2E3548]">
            <span>Recovered Sales This Month:</span>
            <span className="text-white font-extrabold text-sm">৳{recoveredSales.toLocaleString()} BDT</span>
          </div>

          <button 
            onClick={handleSaveWhatsApp}
            className="w-full py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl hover:bg-emerald-400 transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Save WhatsApp Settings
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
            
            <button className="w-full py-2 bg-[#D4AF37] text-slate-950 font-bold text-xs rounded-xl hover:bg-[#00E699] transition cursor-pointer">
              Save Pixel & SEO Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
