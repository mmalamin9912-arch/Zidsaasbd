import React, { useState, useEffect, useCallback } from 'react';
import { Wallet as WalletIcon, X, CreditCard, Send, Clock2, TrendingUp, Banknote, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '../ToastProvider';
import { fetchVendorWallet, fetchPayoutRequests, requestPayout, type VendorWallet, type PayoutRequest } from '../../lib/marketplaceApi';
import { toNumber } from '../../utils/orderUtils';
import type { MerchantProfile } from '../../types';

const bdt = (value: number) => `৳${Math.round(Number(value || 0)).toLocaleString('en-US')}`;

const PAYOUT_METHODS: { value: string; label: string; hint: string }[] = [
  { value: 'bKash', label: 'bKash', hint: 'Mobile number / TrxID' },
  { value: 'Nagad', label: 'Nagad', hint: 'Mobile number / TrxID' },
  { value: 'Bank Transfer', label: 'Bank Transfer', hint: 'Account & routing number' },
];

interface WalletViewProps {
  merchant: MerchantProfile;
}

export const WalletView: React.FC<WalletViewProps> = ({ merchant }: WalletViewProps) => {
  const toast = useToast();
  const vendorRef = String(merchant?.id || merchant?.storeId || merchant?.storeCode || merchant?.storeSlug || '').trim();
  const storeSlug = String(merchant?.storeSlug || '').trim();

  const [wallet, setWallet] = useState<VendorWallet | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request payout form state
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [form, setForm] = useState({
    method: 'bKash' as string,
    amountBDT: 0,
    accountName: '',
    accountNumber: '',
    bankName: '',
    notes: '',
  });

  const load = useCallback(async () => {
    if (!vendorRef) {
      setLoading(false);
      setWallet(null);
      setPayoutRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [walletRes, payoutRes] = await Promise.all([
        fetchVendorWallet({ vendorId: vendorRef, storeSlug }),
        fetchPayoutRequests({ vendorId: vendorRef, storeSlug, status: 'pending' }),
      ]);
      if (walletRes.ok) setWallet(walletRes.wallet ?? null);
      else setError(walletRes.error || 'The wallet could not be read.');
      if (payoutRes.ok) setPayoutRequests(payoutRes.requests);
      else setError(payoutRes.error || 'Payout requests could not be read.');
    } catch (err: any) {
      setError(err?.message || 'Could not load wallet.');
    } finally {
      setLoading(false);
    }
  }, [vendorRef, storeSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const available = toNumber(wallet?.available_bdt, 0);
  const pending = toNumber(wallet?.pending_payout_bdt, 0);
  const lifetime = toNumber(wallet?.lifetime_credit_bdt, 0);
  const lifetimePaid = toNumber(wallet?.lifetime_paid_bdt, 0);
  const pendingCount = payoutRequests.filter((r) => r.status === 'pending').length;

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorRef) return;
    const amount = Number(form.amountBDT);
    if (!(amount > 0)) {
      toast.error('Enter a withdrawal amount greater than zero.');
      return;
    }
    setRequestBusy(true);
    try {
      const res = await requestPayout({
        vendorId: vendorRef,
        storeSlug,
        amountBDT: amount,
        method: form.method,
        accountName: form.accountName || undefined,
        accountNumber: form.accountNumber || undefined,
        bankName: form.bankName || undefined,
        notes: form.notes || undefined,
      });
      if (res.ok && res.request) {
        setRequestOpen(false);
        setForm({ method: 'bKash', amountBDT: 0, accountName: '', accountNumber: '', bankName: '', notes: '' });
        toast.success(`Payout request ৳${amount.toLocaleString()} submitted.`);
        void load();
      } else {
        toast.error(res.error || 'The payout request could not be created.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'The payout request could not be created.');
    } finally {
      setRequestBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#1C1814] p-6 rounded-3xl border border-[#3E342B]/40 flex items-center justify-center min-h-[300px]">
        <div className="text-slate-400 text-xs">Loading wallet…</div>
      </div>
    );
  }

  const noWallet = !wallet || wallet.is_new;

  return (
    <div className="space-y-6 select-none bg-[#1C1814] p-4 sm:p-6 rounded-3xl border border-[#3E342B]/40 shadow-inner">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-[#E6C587]">Vendor Wallet &amp; Payouts</h2>
          <p className="text-xs text-slate-400 mt-1">Settled earnings and withdrawal requests for {merchant?.storeName || 'your store'}.</p>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">Vendor</div>
          <div className="font-semibold text-white">{merchant?.storeName || 'My Store'}</div>
          {merchant?.storeSlug && (
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{merchant.storeSlug}</div>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 px-4 py-3 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-2 -top-2 w-12 h-12 bg-[#D4AF37]/10 rounded-full blur"></div>
          <div className="flex justify-between items-start text-slate-400 text-xs mb-2">
            <span>Total Earnings</span>
            <TrendingUp className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div className="text-3xl font-black text-[#E6C587]">{bdt(lifetime)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Lifetime settled credit</p>
        </div>

        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-2 -top-2 w-12 h-12 bg-[#00D68F]/10 rounded-full blur"></div>
          <div className="flex justify-between items-start text-slate-400 text-xs mb-2">
            <span>Available Balance</span>
            <Banknote className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div className="text-3xl font-black text-[#00D68F]">{bdt(available)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Ready to withdraw</p>
        </div>

        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-2 -top-2 w-12 h-12 bg-amber-500/10 rounded-full blur"></div>
          <div className="flex justify-between items-start text-slate-400 text-xs mb-2">
            <span>Pending Payouts</span>
            <Clock2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-black text-amber-400">{bdt(pending)}</div>
          <p className="text-[11px] text-slate-400 mt-1">{pendingCount} request{pendingCount !== 1 ? 's' : ''} awaiting review</p>
        </div>

        <div className="bg-[#221D19] border border-[#3E342B] p-5 rounded-2xl relative overflow-hidden">
          <div className="absolute -right-2 -top-2 w-12 h-12 bg-indigo-500/10 rounded-full blur"></div>
          <div className="flex justify-between items-start text-slate-400 text-xs mb-2">
            <span>Paid Out</span>
            <CheckCircle className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-black text-indigo-400">{bdt(lifetimePaid)}</div>
          <p className="text-[11px] text-slate-400 mt-1">Already disbursed</p>
        </div>
      </div>

      {/* Notice */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-300">উত্তোলনের নোটিস</p>
            <p className="text-[12px] leading-relaxed">
              এডমিন ভেরিফিকেশনের পর ৭ থেকে ১০ কার্যদিবসের মধ্যে আপনার উত্তোলিত টাকা নির্ধারিত অ্যাকাউন্টে পৌঁছে যাবে।
            </p>
          </div>
        </div>
      </div>

      {/* Wallet actions */}
      <div className="bg-[#221D19] border border-[#3E342B] p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Request Payout</h3>
            <p className="text-xs text-slate-400">Withdraw settled earnings to bKash, Nagad or a bank account.</p>
          </div>
          <button
            onClick={() => setRequestOpen(true)}
            disabled={!available || available <= 0}
            className="flex items-center gap-2 bg-[#D4AF37] hover:bg-[#FCF6BA] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>{requestOpen ? 'Requested' : 'Request Payout'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 text-xs text-slate-300">
          <div className="flex items-center justify-between p-3 bg-[#181B26] rounded-xl border border-[#2E3548]">
            <span>Minimum withdrawal</span>
            <span className="font-mono text-white">৳500</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-[#181B26] rounded-xl border border-[#2E3548]">
            <span>Review threshold</span>
            <span className="font-mono text-white">৳50,000+ requests need admin review</span>
          </div>
        </div>

        {/* Request Payout Modal */}
        {requestOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
              <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-[#D4AF37]" />
                  <span>Request Payout</span>
                </h3>
                <button onClick={() => setRequestOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRequestPayout} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payout Method</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-bold"
                  >
                    {PAYOUT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label} — {m.hint}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Amount (BDT)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">৳</span>
                    <input
                      type="number"
                      value={form.amountBDT}
                      onChange={(e) => setForm({ ...form, amountBDT: Number(e.target.value) || 0 })}
                      min="500"
                      placeholder="e.g. 1000"
                      className="w-full pl-8 bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Available: {bdt(available)}</p>
                </div>

                {form.method === 'Bank Transfer' && (
                  <>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Account Holder Name</label>
                      <input
                        value={form.accountName}
                        onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                        placeholder="e.g. Rahim Ahmed"
                        className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Account Number</label>
                      <input
                        value={form.accountNumber}
                        onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                        placeholder="e.g. 12345678901"
                        className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Bank Name</label>
                      <input
                        value={form.bankName}
                        onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        placeholder="e.g. Dutch-Bangla Bank"
                        className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Notes (optional)</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    placeholder="Any reference for this withdrawal…"
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#2E3548]">
                  <button
                    type="button"
                    onClick={() => setRequestOpen(false)}
                    className="px-4 py-2 bg-[#202533] text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={requestBusy || !form.amountBDT || form.amountBDT < 500}
                    className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer"
                  >
                    {requestBusy ? 'Submitting…' : 'Submit Request'}
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Payout requests table */}
      <div className="bg-[#221D19] border border-[#3E342B] rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#3E342B] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" />
            <h3 className="text-base font-bold text-white">Payout Requests</h3>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
              pendingCount > 0 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
            }`}
          >
            {pendingCount} Pending
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#3E342B]">
              <tr>
                <th className="p-3.5">Reference</th>
                <th className="p-3.5">Method</th>
                <th className="p-3.5">Amount</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Requested</th>
                <th className="p-3.5 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3E342B]">
              {payoutRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-slate-500">
                    <div className="w-10 h-10 bg-[#181B26] rounded-full flex items-center justify-center mx-auto mb-3 text-slate-600">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <p className="font-bold uppercase text-[10px] tracking-widest">No payout requests yet</p>
                  </td>
                </tr>
              ) : (
                payoutRequests.map((req) => {
                  const statusVariant: Record<string, { bg: string; text: string; border: string }> = {
                    pending: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
                    approved: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
                    paid: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
                    rejected: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
                    cancelled: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
                  };
                  const v = statusVariant[req.status] || statusVariant.pending;
                  return (
                    <tr key={req.id || req.request_number} className="hover:bg-[#181B26]/50 transition">
                      <td className="p-3.5">
                        <div className="font-mono font-bold text-white text-xs">{req.request_number}</div>
                      </td>
                      <td className="p-3.5 text-slate-200 capitalize">{req.method || '—'}</td>
                      <td className="p-3.5 font-extrabold text-[#00D68F] text-xs">৳{toNumber(req.amount_bdt)}</td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded font-black uppercase text-[9px] border ${v.bg} ${v.text} ${v.border}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400 text-[11px] font-mono">
                        {req.requested_at ? new Date(req.requested_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3.5 text-right">
                        {req.payout_reference && (
                          <div className="text-[11px] text-[#D4AF37] font-mono font-bold mb-1">Ref: {req.payout_reference}</div>
                        )}
                        {req.account_number && (
                          <div className="text-[10px] text-slate-500 truncate max-w-[140px]">{req.account_number}</div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {noWallet && (
          <div className="p-5 text-center text-slate-400 text-xs">
            No settled earnings yet. Orders delivered and paid out settle here automatically.
          </div>
        )}
      </div>
    </div>
  );
};


export default WalletView;
