import React from 'react';
import { MerchantProfile, SubscriptionRequest, InvoiceRecord } from '../../types';
import { subscriptionPlans, initialInvoices } from '../../data/initialData';
import { calculateRemainingDays, getPlanDisplayName, isPaidSubscriptionActive } from '../../utils/subscriptionUtils';
import { 
  TrendingUp, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Download, 
  FileText, 
  Calendar, 
  ShieldCheck, 
  ArrowUpRight,
  AlertCircle,
  X 
} from 'lucide-react';

interface BillingViewProps {
  merchant: MerchantProfile;
  pendingRequests?: SubscriptionRequest[];
  onOpenSubscriptionModal: () => void;
  onBack: () => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  merchant,
  pendingRequests = [],
  onOpenSubscriptionModal,
  onBack,
}) => {
  const pendingRequest = pendingRequests?.find(
    r => r.status === 'pending' && (
      (r.email && merchant?.email && r.email.toLowerCase() === merchant.email.toLowerCase()) ||
      (r.storeName && merchant?.storeName && r.storeName.toLowerCase() === merchant.storeName.toLowerCase())
    )
  );

  const isPaid = isPaidSubscriptionActive(merchant);
  const paidDaysRemaining = merchant?.subscriptionExpiry ? calculateRemainingDays(merchant.subscriptionExpiry) : 0;
  const trialEndsAtDate = merchant?.trialEndsAt ? new Date(merchant.trialEndsAt) : null;
  const trialDaysRemaining = trialEndsAtDate 
    ? Math.max(0, Math.ceil((trialEndsAtDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : (merchant?.trialDaysRemaining ?? 0);

  /**
   * The plans that are actually sellable.
   *
   * `subscriptionPlans` is the seeded catalogue, but a legacy tenant renewal row
   * could previously be merged into it — which is how zero-value cards such as
   * `mmalamin9912@gmail.com` / `0 BDT / 30d` and `sub-1790184996113` appeared in
   * this grid. The server now filters those out; this is the last line of
   * defence in the UI so a cached or stale payload cannot reintroduce them.
   *
   * Deduplicated by id as well, so the same plan cannot render twice.
   */
  const visiblePlans = React.useMemo(() => {
    const seen = new Set<string>();
    return (subscriptionPlans || []).filter(plan => {
      const id = String(plan?.id || '').trim().toLowerCase();
      const price = Number(plan?.price ?? 0);
      const durationDays = Number(plan?.durationDays ?? 0);
      // A sellable plan needs an identity, a price and a duration.
      if (!id || !Number.isFinite(price) || price <= 0) return false;
      if (!Number.isFinite(durationDays) || durationDays <= 0) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Billing & Subscription</h1>
        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-[#202533] hover:bg-[#2E3548] text-white px-4 py-2 rounded-xl text-sm font-bold border border-[#3A435E] cursor-pointer transition"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>
      <div className="space-y-6">
        {/* Pending Request Alert Notice */}
        {pendingRequest && (
          <div className="bg-gradient-to-r from-[#2A2213] via-[#382F1D] to-[#2A2213] border-2 border-amber-500/50 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-amber-500/40 uppercase flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    Status: PENDING_APPROVAL
                  </span>
                  <span className="text-xs text-amber-200/80 font-mono">
                    TrxID: {pendingRequest.transactionId}
                  </span>
                </div>

                <h2 className="text-xl font-bold text-white mt-1">Payment Verification Pending Admin Approval</h2>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Your payment request for <strong className="text-amber-300">{pendingRequest.planName}</strong> (৳{pendingRequest.amountBDT?.toLocaleString()} BDT via {pendingRequest.paymentMethod}) was submitted on {pendingRequest.requestedAt}. Once approved by the Super Admin, your plan and relative expiration date will automatically activate.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenSubscriptionModal}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-extrabold px-6 py-3 rounded-xl text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 shrink-0"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>View Submitted Request</span>
            </button>
          </div>
        )}

        {/* SaaS Status Banner */}
        <div className="bg-gradient-to-r from-[#1D2230] via-[#242A3C] to-[#1D2230] border border-[#2E3548] p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#00D68F]/20 border border-[#00D68F]/40 flex items-center justify-center text-[#00D68F] shrink-0">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-[#00D68F]/20 text-[#00D68F] text-xs font-bold px-2.5 py-0.5 rounded-full border border-[#00D68F]/30 uppercase">
                  {isPaid ? getPlanDisplayName(merchant?.subscriptionPlan) : '30-Day Free Trial'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Store ID: {merchant?.storeSlug || 'store'}-bd
                </span>
              </div>

              <h1 className="text-xl font-bold text-white mt-1">
                {isPaid ? 'Active Merchant Subscription' : 'SaaS Plan Growth & Subscription Status'}
              </h1>
              <p className="text-xs text-slate-300 mt-0.5">
                {isPaid ? (
                  <>
                    Your subscription has <strong className="text-[#00D68F]">{paidDaysRemaining} Days</strong> remaining
                    {merchant?.subscriptionExpiry && ` (Valid until ${merchant.subscriptionExpiry})`}. Pure SaaS Model — 0% order fees.
                  </>
                ) : (
                  <>
                    Your free trial has <strong className="text-[#00D68F]">{trialDaysRemaining} Days</strong> remaining. Pure SaaS Model — 0% order fees.
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onOpenSubscriptionModal}
            className="bg-gradient-to-r from-[#00D68F] to-[#00B377] hover:from-[#00E699] text-slate-950 font-extrabold px-6 py-3 rounded-xl text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-lg shadow-[#00D68F]/20 shrink-0"
          >
            <Sparkles className="w-4 h-4 fill-slate-950" />
            <span>{isPaid ? 'Extend / Upgrade Subscription' : 'Renew / Upgrade Subscription (3/6/12 Months)'}</span>
          </button>
        </div>

      {/* AI Pro Features Highlight */}
      <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Zid AI Pro Suite</h2>
            <p className="text-[11px] text-slate-400">Unlock these exclusive AI features with any paid subscription</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { title: 'AI Description Generator', desc: 'Generate professional product copy instantly.' },
            { title: 'AI Magic Image Enhancer', desc: 'Optimize photo quality & lighting with AI.' },
            { title: 'AI Caption & Hashtag Writer', desc: 'Create viral social media posts for marketing.' },
            { title: 'AI Smart Pricing Suggest', desc: 'Get data-driven price recommendations.' },
          ].map((item, i) => (
            <div key={i} className="bg-[#181B26] border border-[#2E3548] p-3.5 rounded-xl space-y-1">
              <h4 className="text-xs font-bold text-[#D4AF37]">{item.title}</h4>
              <p className="text-[10px] text-slate-400 leading-tight">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription Pricing Cards Display */}
      <div>
        <h2 className="text-base font-bold text-white mb-3">Merchant Subscription Options (Standard SaaS)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visiblePlans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-[#202533] border rounded-2xl p-5 flex flex-col justify-between relative ${
                plan.isPopular ? 'border-[#00D68F] ring-1 ring-[#00D68F]/30' : 'border-[#2E3548]'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 right-4 bg-gradient-to-r from-[#00D68F] to-[#6366F1] text-slate-950 font-bold text-[9px] uppercase px-2.5 py-0.5 rounded-full">
                  {plan.badge}
                </div>
              )}

              <div>
                <h3 className="font-bold text-white text-base">{plan.name}</h3>
                <div className="my-3">
                  <div className="text-2xl font-black text-white">৳{plan.price.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ {plan.durationDays} Days</span></div>
                  <div className="text-[11px] text-slate-400 mt-1.5">
                    Approx. ৳{Math.round(plan.price / (plan.durationDays / 30)).toLocaleString()} BDT/mo
                  </div>
                </div>

                <ul className="space-y-1.5 text-xs text-slate-300 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00D68F] shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={onOpenSubscriptionModal}
                className="w-full py-2 bg-[#282E3F] hover:bg-[#32394E] text-white text-xs font-bold rounded-xl border border-[#3A435E] cursor-pointer"
              >
                Select Plan
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice History */}
      <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#00D68F]" />
          <span>Billing History & Downloadable Receipts</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548]">
              <tr>
                <th className="p-3">Invoice No</th>
                <th className="p-3">Date</th>
                <th className="p-3">Description</th>
                <th className="p-3">Amount BDT / USD</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2E3548]">
              {initialInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#252B3B]">
                  <td className="p-3 font-mono font-bold text-white">{inv.invoiceNumber}</td>
                  <td className="p-3 text-slate-400">{inv.date}</td>
                  <td className="p-3 text-slate-200">{inv.planName}</td>
                  <td className="p-3 font-bold text-[#00D68F]">৳{inv.amountBDT} (0 USD)</td>
                  <td className="p-3">
                    <span className="bg-[#00D68F]/20 text-[#00D68F] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {inv.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => window.print()}
                      className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 ml-auto cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
};
