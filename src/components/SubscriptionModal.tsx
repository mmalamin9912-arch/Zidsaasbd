import React, { useState } from 'react';
import { MerchantProfile, SubscriptionPlan, SubscriptionRequest, AdminPaymentGatewayConfig } from '../types';
import { subscriptionPlans } from '../data/initialData';
import { calculateRemainingDays, getPlanDisplayName, isPaidSubscriptionActive } from '../utils/subscriptionUtils';
import SafeImage from './SafeImage';
import {
  X,
  Check,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Building2,
  FileText,
  Copy,
  ArrowRight,
  Download,
  Clock,
  AlertCircle,
  QrCode
} from 'lucide-react';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  merchant: MerchantProfile;
  pendingRequests?: SubscriptionRequest[];
  onConfirmSubscription: (planId: string, paymentMethod: string, txId: string) => void;
  adminPaymentConfig: AdminPaymentGatewayConfig;
  initialPlanId?: string;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  merchant,
  pendingRequests = [],
  onConfirmSubscription,
  adminPaymentConfig,
  initialPlanId,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(initialPlanId || 'pro_6m');
  const [step, setStep] = useState<'select' | 'payment' | 'invoice'>(initialPlanId && initialPlanId !== 'free_trial' ? 'payment' : 'select');
  const [adminPaymentMethod, setAdminPaymentMethod] = useState<string>('');
  const [transactionId, setTransactionId] = useState('');

  // Auto-select first active payment method
  React.useEffect(() => {
    if (isOpen) {
      if (initialPlanId) {
        setSelectedPlanId(initialPlanId);
        setStep(initialPlanId !== 'free_trial' ? 'payment' : 'select');
      } else {
        setSelectedPlanId('pro_6m');
        setStep('select');
      }
      setTransactionId('');
      setIsSubmitting(false);
    }
  }, [isOpen, initialPlanId]);

  React.useEffect(() => {
    if (step === 'payment' && !adminPaymentMethod) {
      if (adminPaymentConfig.bkashActive) setAdminPaymentMethod('bkash_admin');
      else if (adminPaymentConfig.nagadActive) setAdminPaymentMethod('nagad_admin');
      else if (adminPaymentConfig.rocketActive) setAdminPaymentMethod('rocket_admin');
      else if (adminPaymentConfig.bankActive) setAdminPaymentMethod('bank_admin');
      else if (adminPaymentConfig.qrActive) setAdminPaymentMethod('qr_admin');
      else if (adminPaymentConfig.customGateways?.length > 0) setAdminPaymentMethod(adminPaymentConfig.customGateways[0].id);
    }
  }, [step, adminPaymentConfig]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentPlan = subscriptionPlans.find((p) => p.id === selectedPlanId) || subscriptionPlans[1];

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCompletePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setStep('invoice');
      onConfirmSubscription(selectedPlanId, adminPaymentMethod, transactionId);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-[#1D212E] border border-[#2E3548] rounded-2xl shadow-2xl overflow-hidden my-8">

        {/* Modal Top Header */}
        <div className="p-4 bg-gradient-to-r from-[#202535] via-[#282E40] to-[#202535] border-b border-[#2E3548] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                Subscription Plans
                <span className="text-[9px] bg-[#D4AF37]/20 text-[#D4AF37] px-1.5 py-0 rounded-full border border-[#D4AF37]/30 font-semibold">
                  0% Commission
                </span>
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-[60] p-1.5 text-slate-400 hover:text-white bg-[#282D3F] hover:bg-[#32394E] rounded-full transition border border-[#2E3548] cursor-pointer shadow-lg"
            title="Close Modal"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="p-4">
          {/* STEP 1: Plan Selection */}
          {step === 'select' && (
            <div className="space-y-4">
              {/* Header Info */}
              {(() => {
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

                if (pendingRequest) {
                  return (
                    <div className="bg-[#2B2314] border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                        <div>
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
                            Status: PENDING_APPROVAL
                          </span>
                          <p className="text-xs font-bold text-white">
                            Requested {pendingRequest.planName} (TrxID: {pendingRequest.transactionId}) — Awaiting Admin Approval
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="bg-[#202533] border border-[#2E3548] rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className={`w-4 h-4 ${isPaid ? 'text-[#00D68F]' : 'text-amber-400'} shrink-0`} />
                      <div>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${isPaid ? 'text-[#00D68F]' : 'text-amber-400'}`}>
                          {isPaid ? 'Current Active Subscription' : 'Trial Status'}
                        </span>
                        <p className="text-xs font-bold text-white">
                          {isPaid ? (
                            <>
                              {getPlanDisplayName(merchant?.subscriptionPlan)} — <span className="text-[#00D68F]">{paidDaysRemaining} Days Left</span>
                              {merchant?.subscriptionExpiry && (
                                <span className="text-slate-400 font-normal text-[11px] ml-1.5">(Exp: {merchant.subscriptionExpiry})</span>
                              )}
                            </>
                          ) : (
                            <>{trialDaysRemaining} Days Left (Trial)</>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Plans Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {subscriptionPlans.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`
                        relative bg-[#202533] rounded-xl p-3 border cursor-pointer transition-all duration-200 flex flex-col justify-between
                        ${isSelected
                          ? 'border-[#D4AF37] ring-1 ring-[#D4AF37]/20 bg-gradient-to-b from-[#202533] to-[#252C3E]'
                          : 'border-[#2E3548] hover:border-slate-500 hover:bg-[#252B3B]'
                        }
                      `}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-white text-xs">{plan.name}</h3>
                          {isSelected && <Check className="w-3 h-3 text-[#D4AF37] stroke-[3]" />}
                        </div>

                      {/* Price Block */}
                        <div className="mb-2 pb-2 border-b border-[#2E3548]">
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-extrabold text-white">৳{plan.price.toLocaleString()}</span>
                            <span className="text-slate-400 text-[9px]">/ {plan.durationDays}d</span>
                          </div>
                        </div>

                        {/* Features List */}
                        <ul className="space-y-1 text-[10px] text-slate-300 mb-3">
                          {plan.features.slice(0, 3).map((feat, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <Check className="w-3 h-3 text-[#D4AF37] shrink-0 mt-0.5" />
                              <span className="truncate">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Action Footer */}
              <div className="pt-2 border-t border-[#2E3548] flex items-center justify-end gap-2">
                <button
                  onClick={() => setStep('payment')}
                  className="bg-gradient-to-r from-[#D4AF37] to-[#00B377] hover:from-[#FCF6BA] text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-[#D4AF37]/20 cursor-pointer"
                >
                  <span>Select Plan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Admin Payment Instructions & TxID Submission */}
          {step === 'payment' && (
            <div className="space-y-6">
              {/* Plan Summary Bar */}
              <div className="bg-[#202533] border border-[#2E3548] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">Selected SaaS Renewal Plan</span>
                  <h4 className="text-base font-bold text-white">{currentPlan.name} ({currentPlan.durationDays} Days)</h4>
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-[#D4AF37]">৳{currentPlan.price.toLocaleString()} BDT</div>
                </div>
              </div>

              {/* Payment Method Selector for Zid Admin */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
                  Select Admin Payment Gateway
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                      <span>Nagad Merchant</span>
                    </button>
                  )}

                  {adminPaymentConfig.rocketActive && (
                    <button
                      type="button"
                      onClick={() => setAdminPaymentMethod('rocket_admin')}
                      className={`p-3 rounded-xl border font-bold text-[10px] flex flex-col items-center justify-center gap-2 transition ${
                        adminPaymentMethod === 'rocket_admin'
                          ? 'border-violet-500 bg-violet-500/10 text-violet-400'
                          : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="px-2 py-0.5 rounded bg-violet-500 text-white font-black text-[8px]">Rocket</span>
                      <span>Rocket Payment</span>
                    </button>
                  )}

                  {adminPaymentConfig.bankActive && (
                    <button
                      type="button"
                      onClick={() => setAdminPaymentMethod('bank_admin')}
                      className={`p-3 rounded-xl border font-bold text-[10px] flex flex-col items-center justify-center gap-2 transition ${
                        adminPaymentMethod === 'bank_admin'
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:text-white'
                      }`}
                    >
                      <Building2 className="w-5 h-5 text-blue-400" />
                      <span>Bank Transfer</span>
                    </button>
                  )}

                  {adminPaymentConfig.qrActive && (
                    <button
                      type="button"
                      onClick={() => setAdminPaymentMethod('qr_admin')}
                      className={`p-3 rounded-xl border font-bold text-[10px] flex flex-col items-center justify-center gap-2 transition ${
                        adminPaymentMethod === 'qr_admin'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                          : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:text-white'
                      }`}
                    >
                      <QrCode className="w-5 h-5 text-emerald-400" />
                      <span>{adminPaymentConfig.qrTitle || 'QR Payment'}</span>
                    </button>
                  )}

                  {adminPaymentConfig.customGateways?.map(gateway => gateway.isActive && (
                    <button
                      key={gateway.id}
                      type="button"
                      onClick={() => setAdminPaymentMethod(gateway.id)}
                      className={`p-3 rounded-xl border font-bold text-[10px] flex flex-col items-center justify-center gap-2 transition ${
                        adminPaymentMethod === gateway.id
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:text-white'
                      }`}
                    >
                      {gateway.logoUrl ? (
                        <SafeImage src={gateway.logoUrl} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <CreditCard className="w-5 h-5 text-indigo-400" />
                      )}
                      <span>{gateway.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Details Card */}
              <div className="bg-[#181B26] border border-[#2E3548] rounded-2xl p-5 space-y-4">
                <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#D4AF37]" />
                  Zid Platform Admin Account Details
                </h5>

                {adminPaymentMethod === 'bkash_admin' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      1. Go to your bKash Mobile App or dial <span className="text-pink-400 font-bold">*247#</span>.<br />
                      2. Choose <span className="font-bold text-white">Payment</span> option.<br />
                      3. Enter Zid SaaS Admin Merchant Number:
                    </p>

                    <div className="flex items-center justify-between bg-[#202533] p-3 rounded-xl border border-[#2E3548]">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase">bKash Admin ({adminPaymentConfig.bkashType})</span>
                        <div className="text-base font-mono font-bold text-pink-400">{adminPaymentConfig.bkashNumber}</div>
                      </div>
                      <button
                        onClick={() => handleCopy(adminPaymentConfig.bkashNumber, 'bkash')}
                        className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-[#3A435E]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedField === 'bkash' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {adminPaymentMethod === 'nagad_admin' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      1. Open Nagad App or dial <span className="text-orange-400 font-bold">*167#</span>.<br />
                      2. Select <span className="font-bold text-white">Merchant Pay</span>.<br />
                      3. Enter Zid SaaS Nagad Account:
                    </p>

                    <div className="flex items-center justify-between bg-[#202533] p-3 rounded-xl border border-[#2E3548]">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase">Nagad Admin ({adminPaymentConfig.nagadType})</span>
                        <div className="text-base font-mono font-bold text-orange-400">{adminPaymentConfig.nagadNumber}</div>
                      </div>
                      <button
                        onClick={() => handleCopy(adminPaymentConfig.nagadNumber, 'nagad')}
                        className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-[#3A435E]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedField === 'nagad' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {adminPaymentMethod === 'bank_admin' && (
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2 bg-[#202533] p-3 rounded-xl border border-[#2E3548]">
                      <div>
                        <span className="text-slate-400 text-[10px]">Bank Name</span>
                        <div className="font-bold text-white">{adminPaymentConfig.bankName}</div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px]">Account Name</span>
                        <div className="font-bold text-white">{adminPaymentConfig.accountName}</div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px]">Account Number</span>
                        <div className="font-mono font-bold text-[#D4AF37]">{adminPaymentConfig.accountNumber}</div>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px]">Branch / Routing</span>
                        <div className="font-bold text-white">{adminPaymentConfig.branchName} / {adminPaymentConfig.routingNumber}</div>
                      </div>
                    </div>
                  </div>
                )}

                {adminPaymentMethod === 'rocket_admin' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      1. Open Rocket App or dial <span className="text-violet-400 font-bold">*322#</span>.<br />
                      2. Select <span className="font-bold text-white">Merchant Pay</span>.<br />
                      3. Enter Zid SaaS Rocket Account:
                    </p>

                    <div className="flex items-center justify-between bg-[#202533] p-3 rounded-xl border border-[#2E3548]">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase">Rocket Admin ({adminPaymentConfig.rocketType})</span>
                        <div className="text-base font-mono font-bold text-violet-400">{adminPaymentConfig.rocketNumber}</div>
                      </div>
                      <button
                        onClick={() => handleCopy(adminPaymentConfig.rocketNumber, 'rocket')}
                        className="bg-[#282E3F] hover:bg-[#32394E] text-slate-200 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 border border-[#3A435E]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedField === 'rocket' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {adminPaymentMethod === 'qr_admin' && (
                  <div className="space-y-4 text-center">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Scan the QR code below to pay <span className="text-white font-bold">৳{currentPlan.price.toLocaleString()} BDT</span> to Zid Admin.
                    </p>

                    {adminPaymentConfig.qrImageUrl ? (
                      <div className="mx-auto w-48 h-48 p-2 bg-white rounded-2xl shadow-xl">
                        <SafeImage src={adminPaymentConfig.qrImageUrl} alt="QR Code" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="mx-auto w-48 h-48 bg-[#202533] border border-dashed border-[#3A435E] rounded-2xl flex items-center justify-center text-slate-500 text-xs italic">
                        QR Code not available
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 uppercase font-black">
                      {adminPaymentConfig.qrTitle || 'Bangla QR Payment'}
                    </div>
                  </div>
                )}

                {/* Custom Gateway Details */}
                {adminPaymentConfig.customGateways?.map(gateway => adminPaymentMethod === gateway.id && (
                  <div key={gateway.id} className="space-y-4">
                    <div className="bg-[#202533] p-4 rounded-xl border border-[#2E3548]">
                      <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {gateway.details}
                      </p>
                    </div>

                    {gateway.qrCodeUrl && (
                      <div className="space-y-3 text-center">
                        <div className="mx-auto w-40 h-40 p-2 bg-white rounded-xl shadow-lg">
                          <SafeImage src={gateway.qrCodeUrl} alt="Custom QR" className="w-full h-full object-contain" />
                        </div>
                        <p className="text-[10px] text-slate-500 uppercase font-black">Scan to Pay</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Form Submission */}
              <form onSubmit={handleCompletePayment} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-200 mb-1">
                    Enter Payment Transaction ID (TrxID / Reference Number) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g., BK9X882910 or DBBL-TRX-10293"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-4 py-3 text-sm text-white font-mono focus:border-[#D4AF37] focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Our automated SaaS engine verifies transaction IDs instantly to renew your subscription.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#2E3548]">
                  <button
                    type="button"
                    onClick={() => setStep('select')}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Back to Plan Selection
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !transactionId.trim()}
                    className="bg-gradient-to-r from-[#D4AF37] to-[#00B377] hover:from-[#FCF6BA] disabled:opacity-50 text-slate-950 font-bold px-6 py-3 rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-[#D4AF37]/20 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <span>Submitting Request...</span>
                    ) : (
                      <>
                        <span>Submit bKash Payment for Verification ({currentPlan.durationDays} Days)</span>
                        <Check className="w-4 h-4 stroke-[3]" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: Invoice Preview & Confirmation */}
          {step === 'invoice' && (
            <div className="space-y-6 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div>
                <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-3 py-1 rounded-full border border-amber-500/40 uppercase inline-block mb-2">
                  Status: PENDING_APPROVAL
                </span>
                <h3 className="text-xl font-extrabold text-white">Payment Request Submitted!</h3>
                <p className="text-xs text-slate-300 mt-1 max-w-lg mx-auto">
                  Your payment verification request for <strong className="text-[#D4AF37]">{currentPlan.name}</strong> has been submitted. It is awaiting Super Admin verification. The plan duration and expiry date will be activated once approved.
                </p>
              </div>

              {/* Generated Invoice Box */}
              <div id="invoice-to-print" className="printable-invoice-modal bg-[#181B26] border border-[#2E3548] rounded-2xl p-6 text-left max-w-lg mx-auto space-y-4">
                <div className="flex justify-between items-start border-b border-[#2E3548] pb-3">
                  <div>
                    <span className="text-xs font-bold text-[#D4AF37] uppercase">ZID SAAS PAYMENT RECEIPT</span>
                    <div className="text-sm font-bold text-white font-mono">REQ-BD-{Date.now().toString().slice(-6)}</div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div>Date: {new Date().toISOString().split('T')[0]}</div>
                    <div className="text-amber-400 font-bold">Status: PENDING APPROVAL</div>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span>Merchant Store:</span>
                    <span className="font-semibold text-white">{merchant?.storeName || ''}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Requested Plan:</span>
                    <span className="font-semibold text-white">{currentPlan.name} ({currentPlan.durationDays} Days)</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Transaction ID:</span>
                    <span className="font-mono font-semibold text-pink-400">{transactionId}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>SaaS Fee (0% Order Commission):</span>
                    <span className="font-semibold text-white">৳{currentPlan.price.toLocaleString()} BDT</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#2E3548] flex justify-between items-center text-sm font-extrabold text-white">
                  <span>Amount Submitted:</span>
                  <span className="text-[#D4AF37]">৳{currentPlan.price.toLocaleString()} BDT</span>
                </div>
              </div>

              <div className="no-print flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="w-full sm:w-auto bg-[#282E3F] hover:bg-[#32394E] text-slate-200 font-semibold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-[#3A435E] cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#D4AF37]" />
                  <span>Download Request Receipt</span>
                </button>

                <button
                  onClick={onClose}
                  className="w-full sm:w-auto bg-[#D4AF37] text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs hover:bg-[#FCF6BA] transition cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
