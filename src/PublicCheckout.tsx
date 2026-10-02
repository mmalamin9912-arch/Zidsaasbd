import React, { useState } from 'react';
import { ArrowLeft, Check, Copy, ShieldCheck, Sparkles } from 'lucide-react';
import { subscriptionPlans } from './data/initialData';
import { AdminPaymentGatewayConfig, BillingCycle } from './types';
import { resolvePlanPricing } from './lib/planPricing';

interface PublicCheckoutProps {
  planId: string;
  adminPaymentConfig: AdminPaymentGatewayConfig;
  onPaymentSuccess: (txId: string, billingCycle: BillingCycle) => void;
  onCancel: () => void;
}

export const PublicCheckout: React.FC<PublicCheckoutProps> = ({
  planId,
  adminPaymentConfig,
  onPaymentSuccess,
  onCancel,
}) => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [adminPaymentMethod, setAdminPaymentMethod] = useState<string>('bkash_admin');
  const [transactionId, setTransactionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const plan = subscriptionPlans.find((p) => p.id === planId) || subscriptionPlans[1];
  // Amount, term label and the "send exactly ৳X" instruction all come from this
  // one resolve, so the quoted figure can never disagree with itself.
  const pricing = plan ? resolvePlanPricing(plan, billingCycle) : null;

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCompletePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) return;
    setIsSubmitting(true);
    
    // Simulate payment validation
    setTimeout(() => {
      setIsSubmitting(false);
      onPaymentSuccess(transactionId, billingCycle);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#12151F] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-[#181B26] border border-[#2E3548] rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-[#2E3548] flex items-center gap-4 bg-[#202533]">
          <button onClick={onCancel} className="p-2 hover:bg-[#2E3548] rounded-xl text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-bold text-white">Complete Your Subscription Payment</h2>
            <p className="text-xs text-slate-400">Step 1 of 2: Secure Payment</p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-[#202533] border border-[#2E3548] rounded-xl p-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="inline-flex items-center p-1 bg-[#181B26] border border-[#2E3548] rounded-xl">
                {(['monthly', 'yearly'] as BillingCycle[]).map((cycle) => (
                  <button
                    key={cycle}
                    type="button"
                    onClick={() => setBillingCycle(cycle)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      billingCycle === cycle ? 'bg-[#D4AF37] text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                  </button>
                ))}
              </div>
              {plan && resolvePlanPricing(plan, 'yearly').discountPercent > 0 && (
                <span className="text-[10px] font-bold text-[#00D68F] bg-[#00D68F]/10 border border-[#00D68F]/30 px-2 py-1 rounded-full">
                  Save {resolvePlanPricing(plan, 'yearly').discountPercent}% on Annual
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-400">Selected Plan</span>
              <h4 className="text-base font-bold text-white">
                {plan.name} ({billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} · {pricing?.durationDays} Days)
              </h4>
            </div>
            <div className="text-right">
              <div className="text-xl font-extrabold text-[#D4AF37]">৳{pricing?.price.toLocaleString()} BDT</div>
              {billingCycle === 'yearly' && (pricing?.savingsBDT ?? 0) > 0 && (
                <div className="text-[10px] text-[#00D68F] font-bold">Save ৳{pricing?.savingsBDT.toLocaleString()}</div>
              )}
            </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
              Select Payment Method
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {adminPaymentConfig.bkashActive && (
                <button
                  type="button"
                  onClick={() => setAdminPaymentMethod('bkash_admin')}
                  className={`p-3 rounded-xl border font-bold text-[10px] flex flex-col items-center justify-center gap-2 transition ${
                    adminPaymentMethod === 'bkash_admin'
                      ? 'border-pink-500 bg-pink-500/10 text-pink-400'
                      : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="px-2 py-0.5 rounded bg-pink-500 text-white font-black text-[8px]">bKash</span>
                  <span>bKash Payment</span>
                </button>
              )}
              {adminPaymentConfig.nagadActive && (
                <button
                  type="button"
                  onClick={() => setAdminPaymentMethod('nagad_admin')}
                  className={`p-3 rounded-xl border font-bold text-[10px] flex flex-col items-center justify-center gap-2 transition ${
                    adminPaymentMethod === 'nagad_admin'
                      ? 'border-orange-500 bg-orange-500/10 text-orange-400'
                      : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="px-2 py-0.5 rounded bg-orange-500 text-white font-black text-[8px]">Nagad</span>
                  <span>Nagad</span>
                </button>
              )}
            </div>
          </div>

          <form onSubmit={handleCompletePayment} className="bg-[#202533] border border-[#2E3548] rounded-xl p-5 space-y-4">
            <h5 className="font-bold text-sm text-white">Instruction</h5>
            
            <div className="text-sm text-slate-400 space-y-2">
              <p>1. Send exactly <strong className="text-white">৳{pricing?.price.toLocaleString()}</strong> via {adminPaymentMethod.split('_')[0].toUpperCase()} to our official Merchant Number.</p>
              <div className="flex items-center gap-2 bg-[#181B26] p-2 rounded-lg border border-[#3A435E] max-w-sm">
                <span className="font-mono text-[#D4AF37] font-bold text-lg flex-1">
                  {adminPaymentMethod === 'bkash_admin' ? adminPaymentConfig.bkashNumber : adminPaymentConfig.nagadNumber}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(adminPaymentMethod === 'bkash_admin' ? adminPaymentConfig.bkashNumber : adminPaymentConfig.nagadNumber, 'number')}
                  className="p-1.5 rounded bg-[#2E3548] text-white hover:bg-[#3A435E] transition"
                >
                  {copiedField === 'number' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p>2. Enter your Transaction ID (TrxID) below to verify.</p>
            </div>

            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">Transaction ID (TrxID)</label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="e.g., 9F8A7B6C5D"
                className="w-full bg-[#181B26] border border-[#3A435E] text-white px-3 py-2 rounded-lg focus:outline-none focus:border-[#D4AF37]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !transactionId.trim()}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 px-4 py-3 rounded-xl font-bold transition disabled:opacity-50"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{isSubmitting ? 'Verifying Payment...' : 'Verify Payment & Continue to Setup'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
