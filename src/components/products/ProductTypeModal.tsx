import React, { useState } from 'react';
import { ProductType, MerchantProfile } from '../../types';
import {  isProAccessGranted, peekSubscriptionStatus } from '../../lib/subscriptionStatusCache';
import {
  Package,
  Boxes,
  Ticket,
  FileCode2,
  Layers,
  Lock,
  Sparkles,
  X,
  ChevronRight,
  Crown,
  CheckCircle2
} from 'lucide-react';

interface ProductTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: ProductType) => void;
  onOpenSubscriptionModal?: () => void;
  merchant?: MerchantProfile;
}

interface TypeOption {
  type: ProductType;
  title: string;
  description: string;
  icon: React.ElementType;
  isLocked: boolean;
  badge?: string;
  gradient: string;
}

export const ProductTypeModal: React.FC<ProductTypeModalProps> = ({
  isOpen,
  onClose,
  onSelectType,
  onOpenSubscriptionModal,
  merchant,
}) => {
  const [lockedAlertOption, setLockedAlertOption] = useState<TypeOption | null>(null);

  // ── Pro access, resolved WITHOUT waiting for a request ─────────────────────
  //
  // The badge used to depend solely on `merchant.subscriptionPlan`, which is
  // `undefined` until the merchant profile hydrates. That produced the reported
  // flicker: every Pro card painted a locked "Unlock" badge for a frame, then
  // flipped to "PRO UNLOCKED" once the profile arrived — and flipped back
  // whenever the profile was rewritten, e.g. by one of the other store fetches.
  //
  // Three signals are consulted, in order of authority, and ALL of them are
  // available synchronously on the first render:
  //   1. the cached MongoDB status (already resolved by App/Header),
  //   2. the local profile's plan id,
  //   3. — nothing is invented; an unknown store stays locked.
  // So an approved Pro store renders "PRO UNLOCKED" immediately and stays that
  // way, because every consumer now reads the same cached value.
  const cachedStatus = peekSubscriptionStatus(merchant?.email, merchant?.storeSlug || merchant?.storeName);
  const isProPlanActive = isProAccessGranted(
    cachedStatus?.planId ?? merchant?.subscriptionPlan,
    cachedStatus?.status
  );

  if (!isOpen) return null;

  const typeOptions: TypeOption[] = [
    {
      type: 'single',
      title: 'Single product',
      description: 'Standard physical or digital product with size, color variants, pricing, and multi-warehouse inventory.',
      icon: Package,
      isLocked: false,
      badge: 'UNLOCKED / FREE',
      gradient: 'from-[#00D68F]/20 to-[#00D68F]/5 border-[#00D68F]/40 text-[#00D68F]',
    },
    {
      type: 'grouped',
      title: 'Grouped product',
      description: 'Bundle multiple standalone products into a single curated collection or outfit set.',
      icon: Boxes,
      isLocked: !isProPlanActive,
      badge: isProPlanActive ? 'PRO UNLOCKED' : 'PRO PLAN',
      gradient: 'from-amber-500/10 to-amber-500/5 border-amber-500/30 text-amber-400',
    },
    {
      type: 'voucher',
      title: 'Voucher & Gift Card',
      description: 'Issue redeemable store vouchers, promotional gift cards, and electronic balance codes.',
      icon: Ticket,
      isLocked: !isProPlanActive,
      badge: isProPlanActive ? 'PRO UNLOCKED' : 'PRO PLAN',
      gradient: 'from-purple-500/10 to-purple-500/5 border-purple-500/30 text-purple-400',
    },
    {
      type: 'digital',
      title: 'Digital files',
      description: 'Sell downloadable software, PDF e-books, course materials, licenses, and digital assets.',
      icon: FileCode2,
      isLocked: !isProPlanActive,
      badge: isProPlanActive ? 'PRO UNLOCKED' : 'PRO PLAN',
      gradient: 'from-blue-500/10 to-blue-500/5 border-blue-500/30 text-blue-400',
    },
    {
      type: 'bundle',
      title: 'Dynamic Bundle',
      description: 'Interactive mix-and-match product bundles with step-by-step custom selection for customers.',
      icon: Layers,
      isLocked: !isProPlanActive,
      badge: isProPlanActive ? 'PRO UNLOCKED' : 'PRO PLAN',
      gradient: 'from-pink-500/10 to-pink-500/5 border-pink-500/30 text-pink-400',
    },
  ];

  const handleOptionClick = (option: TypeOption) => {
    if (option.isLocked) {
      setLockedAlertOption(option);
    } else {
      onSelectType(option.type);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl relative my-8">
        
        {/* Header */}
        <div className="p-5 sm:p-6 bg-[#202533] border-b border-[#2E3548] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#00D68F]" />
              <h2 className="text-lg sm:text-xl font-bold text-white">Select Product Type</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Choose the catalog type that fits your item model before adding details.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-[#181B26] hover:bg-[#282E3F] rounded-xl transition border border-[#2E3548]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options List */}
        <div className="p-5 sm:p-6 space-y-3 max-h-[70vh] overflow-y-auto">
          {typeOptions.map((opt) => {
            const Icon = opt.icon;

            return (
              <div
                key={opt.type}
                onClick={() => handleOptionClick(opt)}
                className={`
                  p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group relative overflow-hidden
                  ${opt.isLocked 
                    ? 'bg-[#181B26] border-[#2A3042] hover:border-amber-500/50 hover:bg-[#202533]' 
                    : 'bg-[#202533] border-[#00D68F]/40 hover:border-[#00D68F] hover:shadow-lg hover:shadow-[#00D68F]/10'
                  }
                `}
              >
                <div className="flex items-start gap-3.5">
                  <div className={`p-3 rounded-xl border ${opt.gradient} shrink-0`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-sm sm:text-base group-hover:text-[#00D68F] transition">
                        {opt.title}
                      </h3>

                      {opt.isLocked ? (
                        <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-amber-500/30">
                          <Lock className="w-3 h-3" />
                          <span>{opt.badge}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-[#00D68F]/20 text-[#00D68F] text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-[#00D68F]/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{opt.badge}</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end sm:shrink-0">
                  {opt.isLocked ? (
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 group-hover:bg-amber-500/20 transition">
                      <Crown className="w-3.5 h-3.5" />
                      <span>Unlock</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs font-bold text-[#00D68F] bg-[#00D68F]/10 px-3 py-1.5 rounded-lg border border-[#00D68F]/30 group-hover:bg-[#00D68F] group-hover:text-slate-950 transition">
                      <span>Create</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#181B26] border-t border-[#2E3548] flex items-center justify-between text-xs text-slate-400">
          <span>Need help choosing a product type?</span>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Subscription Paywall Alert Popup when clicking locked product type */}
      {lockedAlertOption && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-amber-500/40 rounded-2xl p-6 w-full max-w-md text-center space-y-4 shadow-2xl relative">
            <button
              onClick={() => setLockedAlertOption(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white bg-[#181B26] rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 p-0.5 mx-auto shadow-lg shadow-amber-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#181B26] rounded-[14px] flex items-center justify-center">
                <Crown className="w-7 h-7 text-amber-400" />
              </div>
            </div>

            <div>
              <span className="bg-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-500/30">
                PRO FEATURE LOCKED
              </span>
              <h3 className="text-lg font-bold text-white mt-2">
                Unlock {lockedAlertOption.title}
              </h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {lockedAlertOption.description}
              </p>
            </div>

            <div className="bg-[#202533] border border-[#2E3548] p-3 rounded-xl text-left text-xs text-slate-300 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-bold">
                <Sparkles className="w-4 h-4 text-[#00D68F]" />
                <span>Zid SaaS Pro Plan includes:</span>
              </div>
              <ul className="text-[11px] text-slate-400 space-y-1 pl-6 list-disc">
                <li>Unlimited Grouped & Bundled Products</li>
                <li>Digital File Sales & Auto Voucher Generation</li>
                <li>Zero Transaction Fees & Priority Dhaka Support</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={() => {
                  setLockedAlertOption(null);
                  onClose();
                  if (onOpenSubscriptionModal) {
                    onOpenSubscriptionModal();
                  }
                }}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4" />
                <span>Upgrade to Zid SaaS Pro Plan</span>
              </button>

              <button
                onClick={() => setLockedAlertOption(null)}
                className="w-full py-2 bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold rounded-xl text-xs cursor-pointer"
              >
                Continue with Single Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
