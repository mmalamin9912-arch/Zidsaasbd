import React, { useState } from 'react';
import { BankAccount, MobileBankingConfig, CodConfig, PaymentGatewayConfig } from '../../types';
import {  useToast } from '../ToastProvider';
import {
  CreditCard, 
  Building2, 
  Smartphone, 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  Eye, 
  EyeOff, 
  Link as LinkIcon, 
  QrCode, 
  SmartphoneNfc,
  Sparkles,
  Info,
  Copy,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface PaymentsViewProps {
  bankAccounts: BankAccount[];
  mobileBanking: MobileBankingConfig[];
  codConfig: CodConfig;
  gatewayConfig: PaymentGatewayConfig;
  onUpdateBankAccounts: (accounts: BankAccount[]) => void;
  onUpdateMobileBanking: (configs: MobileBankingConfig[]) => void;
  onUpdateCodConfig: (config: CodConfig) => void;
  onUpdateGatewayConfig: (config: PaymentGatewayConfig) => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  bankAccounts,
  mobileBanking,
  codConfig,
  gatewayConfig,
  onUpdateBankAccounts,
  onUpdateMobileBanking,
  onUpdateCodConfig,
  onUpdateGatewayConfig,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'banks' | 'mobile' | 'cod' | 'links' | 'gateways' | 'simulator'>('mobile');

  // Bank Form Modal State
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [newBank, setNewBank] = useState<Partial<BankAccount>>({
    bankName: 'Dutch-Bangla Bank Limited (DBBL)',
    accountHolder: '',
    accountNumber: '',
    routingNumber: '',
    swiftCode: '',
    branchName: '',
    isVisibleAtCheckout: true,
    isPrimary: false,
  });

  // Mobile Editing State
  const [mobileConfigs, setMobileConfigs] = useState<MobileBankingConfig[]>(mobileBanking);

  React.useEffect(() => {
    setMobileConfigs(mobileBanking);
  }, [mobileBanking]);

  // COD State
  const [codForm, setCodForm] = useState<CodConfig>(codConfig);

  // Payment Link Generator State
  const [linkAmount, setLinkAmount] = useState('');
  const [linkNote, setLinkNote] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Gateway state
  const [gwForm, setGwForm] = useState<PaymentGatewayConfig>(gatewayConfig);

  React.useEffect(() => {
    setGwForm(gatewayConfig);
  }, [gatewayConfig]);

  const handleSaveGateway = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateGatewayConfig(gwForm);
  };

  // Checkout Preview Simulator State
  const [simSelectedMethod, setSimSelectedMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'bank' | 'cod' | 'gateway'>('bkash');
  const [simCity, setSimCity] = useState<'Dhaka' | 'Chittagong' | 'Sylhet'>('Dhaka');
  const [simAdvProvider, setSimAdvProvider] = useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const [simTxId, setSimTxId] = useState('');

  const handleAddBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBank.accountHolder || !newBank.accountNumber) return;

    const accountToAdd: BankAccount = {
      id: `bank-${Date.now()}`,
      bankName: newBank.bankName || 'Dutch-Bangla Bank',
      accountHolder: newBank.accountHolder || '',
      accountNumber: newBank.accountNumber || '',
      routingNumber: newBank.routingNumber || '',
      swiftCode: newBank.swiftCode || '',
      branchName: newBank.branchName || 'Main Branch',
      isVisibleAtCheckout: newBank.isVisibleAtCheckout ?? true,
      isPrimary: bankAccounts.length === 0 ? true : (newBank.isPrimary ?? false),
    };

    const updated = [...bankAccounts, accountToAdd];
    onUpdateBankAccounts(updated);
    setIsBankModalOpen(false);
    setNewBank({
      bankName: 'Dutch-Bangla Bank Limited (DBBL)',
      accountHolder: '',
      accountNumber: '',
      routingNumber: '',
      swiftCode: '',
      branchName: '',
      isVisibleAtCheckout: true,
      isPrimary: false,
    });
  };

  const handleToggleBankVisibility = (id: string) => {
    const updated = bankAccounts.map((b) => 
      b.id === id ? { ...b, isVisibleAtCheckout: !b.isVisibleAtCheckout } : b
    );
    onUpdateBankAccounts(updated);
  };

  const handleDeleteBank = (id: string) => {
    const updated = bankAccounts.filter((b) => b.id !== id);
    onUpdateBankAccounts(updated);
  };

  const handleToggleMobile = (id: string) => {
    const updated = mobileConfigs.map((m) =>
      m.id === id ? { ...m, isEnabled: !m.isEnabled } : m
    );
    setMobileConfigs(updated);
    // Auto-update parent on toggle for immediate feedback
    onUpdateMobileBanking(updated);
  };

  const handleUpdateMobileField = (id: string, field: keyof MobileBankingConfig, val: any) => {
    const updated = mobileConfigs.map((m) =>
      m.id === id ? { ...m, [field]: val } : m
    );
    setMobileConfigs(updated);
  };

  const handleSaveMobileSettings = () => {
    onUpdateMobileBanking(mobileConfigs);
  };

  const handleSaveCod = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCodConfig(codForm);
    toast.success('Cash on Delivery (COD) settings saved successfully!');
  };

  const handleGenerateLink = (e: React.FormEvent) => {
    e.preventDefault();
    const storeUrl = window.location.origin;
    const link = `${storeUrl}/pay?amt=${linkAmount}&note=${encodeURIComponent(linkNote)}`;
    setGeneratedLink(link);
  };

  return (
    <div className="space-y-6">
      {/* Title & Concept Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#202533] border border-[#2E3548] p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#00D68F]/20 text-[#00D68F] text-xs font-bold px-2.5 py-0.5 rounded-full border border-[#00D68F]/30 uppercase">
              Direct Merchant Controls
            </span>
            <span className="text-xs text-slate-400">• No Escrow / 0% Platform Fees</span>
          </div>
          <h1 className="text-xl font-bold text-white mt-1">Merchant Payment Accounts Setup</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure your own Bank accounts, bKash, Nagad, Rocket numbers, and Cash on Delivery rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('simulator')}
            className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Simulate Customer Checkout</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#2E3548] pb-2">
        <button
          onClick={() => setActiveTab('mobile')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'mobile'
              ? 'bg-[#00D68F] text-slate-950'
              : 'bg-[#202533] text-slate-300 hover:text-white border border-[#2E3548]'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>bKash / Nagad / Rocket</span>
        </button>

        <button
          onClick={() => setActiveTab('banks')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'banks'
              ? 'bg-[#00D68F] text-slate-950'
              : 'bg-[#202533] text-slate-300 hover:text-white border border-[#2E3548]'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Bank Accounts ({bankAccounts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cod')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'cod'
              ? 'bg-[#00D68F] text-slate-950'
              : 'bg-[#202533] text-slate-300 hover:text-white border border-[#2E3548]'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Cash on Delivery (COD)</span>
        </button>

        <button
          onClick={() => setActiveTab('links')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'links'
              ? 'bg-[#00D68F] text-slate-950'
              : 'bg-[#202533] text-slate-300 hover:text-white border border-[#2E3548]'
          }`}
        >
          <LinkIcon className="w-4 h-4" />
          <span>Instant Payment Links</span>
        </button>

        <button
          onClick={() => setActiveTab('gateways')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'gateways'
              ? 'bg-[#00D68F] text-slate-950'
              : 'bg-[#202533] text-slate-300 hover:text-white border border-[#2E3548]'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment Gateways</span>
        </button>

        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'simulator'
              ? 'bg-indigo-600 text-white'
              : 'bg-[#202533] text-slate-300 hover:text-white border border-[#2E3548]'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Checkout Preview Simulator</span>
        </button>
      </div>

      {/* TAB 1: Mobile Banking (bKash, Nagad, Rocket) */}
      {activeTab === 'mobile' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {mobileConfigs.map((mb) => {
              const isBkash = mb.provider === 'bkash';
              const isNagad = mb.provider === 'nagad';
              const isRocket = mb.provider === 'rocket';

              return (
                <div
                  key={mb.id}
                  className={`bg-[#202533] border rounded-2xl p-5 flex flex-col justify-between transition ${
                    mb.isEnabled ? 'border-[#00D68F]/50 shadow-md' : 'border-[#2E3548] opacity-90'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-xs text-white ${
                          isBkash ? 'bg-pink-600' : isNagad ? 'bg-orange-600' : 'bg-purple-600'
                        }`}>
                          {mb.provider.toUpperCase()}
                        </span>
                        <span className="text-xs font-bold text-white">
                          {isBkash ? 'bKash Direct' : isNagad ? 'Nagad Direct' : 'Rocket Direct'}
                        </span>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mb.isEnabled}
                          onChange={() => handleToggleMobile(mb.id)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D68F]"></div>
                      </label>
                    </div>

                    {/* Controls */}
                    <div className="space-y-3 text-xs">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-slate-400">Account Type</label>
                          {!mb.isEnabled && <span className="text-[10px] text-amber-400">(Configurable while off)</span>}
                        </div>
                        <select
                          value={mb.accountType}
                          onChange={(e) => handleUpdateMobileField(mb.id, 'accountType', e.target.value)}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-[#00D68F]"
                        >
                          <option value="Personal">Personal Number</option>
                          <option value="Agent">Agent Number</option>
                          <option value="Merchant">Merchant Account</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Merchant Mobile Number</label>
                        <input
                          type="text"
                          value={mb.number}
                          onChange={(e) => handleUpdateMobileField(mb.id, 'number', e.target.value)}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-[#00D68F]"
                          placeholder="01711223344"
                        />
                      </div>

                      {mb.accountType === 'Merchant' && (
                        <div>
                          <label className="block text-slate-400 mb-1">
                            {isBkash ? 'bKash' : isNagad ? 'Nagad' : 'Rocket'} Merchant API Secret Key
                          </label>
                          <input
                            type="password"
                            value={mb.merchantApiKey || ''}
                            onChange={(e) => handleUpdateMobileField(mb.id, 'merchantApiKey', e.target.value)}
                            className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-[#00D68F]"
                            placeholder={`${mb.provider}_live_sec_xxx`}
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-slate-400 mb-1">Customer Cash-out / Charge Fee (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={mb.chargePercentage}
                          onChange={(e) => handleUpdateMobileField(mb.id, 'chargePercentage', parseFloat(e.target.value) || 0)}
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-semibold focus:outline-none focus:border-[#00D68F]"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Checkout Instruction Note</label>
                        <textarea
                          rows={2}
                          value={mb.instructions}
                          onChange={(e) => handleUpdateMobileField(mb.id, 'instructions', e.target.value)}
                          placeholder="e.g. Please send the money to the number above and provide the TrxID for verification."
                          className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl p-2 text-slate-200 text-xs focus:outline-none focus:border-[#00D68F]"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-400 text-xs">Require Transaction ID (TrxID)</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mb.requireTrxId}
                            onChange={(e) => handleUpdateMobileField(mb.id, 'requireTrxId', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D68F]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="text-slate-400 text-xs">Allow Advance Delivery Payment</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={mb.canPayAdvanceCharge}
                            onChange={(e) => handleUpdateMobileField(mb.id, 'canPayAdvanceCharge', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D68F]"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#2E3548] flex justify-between items-center text-[11px] text-slate-400">
                    <span>Direct Deposit to: <strong className="text-white">{mb.number}</strong></span>
                    <span className={mb.isEnabled ? 'text-[#00D68F] font-bold' : 'text-slate-500'}>
                      {mb.isEnabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-4 border-t border-[#2E3548]">
            <button
              onClick={handleSaveMobileSettings}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black px-8 py-3 rounded-xl text-sm transition shadow-lg shadow-[#00D68F]/20 flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Save Payment Settings</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: Bank Accounts Setup */}
      {activeTab === 'banks' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-white">Merchant Bank Accounts (Direct Settlement)</h3>
            <button
              onClick={() => setIsBankModalOpen(true)}
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add New Bank Account</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bankAccounts.map((account) => (
              <div
                key={account.id}
                className="bg-[#202533] border border-[#2E3548] rounded-2xl p-5 relative space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-xs text-[#00D68F] font-bold uppercase tracking-wider bg-[#00D68F]/10 px-2 py-0.5 rounded border border-[#00D68F]/20">
                      {account.bankName}
                    </span>
                    <h4 className="text-lg font-bold text-white mt-1">{account.accountHolder}</h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleBankVisibility(account.id)}
                      className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 ${
                        account.isVisibleAtCheckout 
                          ? 'border-[#00D68F]/40 bg-[#00D68F]/10 text-[#00D68F]' 
                          : 'border-slate-600 bg-[#181B26] text-slate-400'
                      }`}
                      title="Toggle visibility at customer storefront checkout"
                    >
                      {account.isVisibleAtCheckout ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      onClick={() => handleDeleteBank(account.id)}
                      className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="bg-[#181B26] p-3 rounded-xl border border-[#2E3548] space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Account Number:</span>
                    <span className="font-mono font-bold text-white">{account.accountNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Routing Number:</span>
                    <span className="font-mono text-slate-200">{account.routingNumber || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Swift Code:</span>
                    <span className="font-mono text-slate-200">{account.swiftCode || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Branch Name:</span>
                    <span className="text-slate-200">{account.branchName}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs pt-1">
                  <span className="text-slate-400">Checkout Status:</span>
                  <span className={account.isVisibleAtCheckout ? 'text-[#00D68F] font-bold' : 'text-slate-500'}>
                    {account.isVisibleAtCheckout ? 'Visible to Customers at Checkout' : 'Hidden from Checkout'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Bank Modal */}
          {isBankModalOpen && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-lg space-y-4">
                <h3 className="text-lg font-bold text-white">Add Merchant Bank Account</h3>

                <form onSubmit={handleAddBank} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 mb-1">Bank Name</label>
                    <select
                      value={newBank.bankName}
                      onChange={(e) => setNewBank({ ...newBank, bankName: e.target.value })}
                      className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white"
                    >
                      <option>Dutch-Bangla Bank Limited (DBBL)</option>
                      <option>Eastern Bank PLC (EBL)</option>
                      <option>BRAC Bank PLC</option>
                      <option>The City Bank Limited</option>
                      <option>Islami Bank Bangladesh PLC</option>
                      <option>Prime Bank PLC</option>
                      <option>Mutual Trust Bank PLC</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1">Account Holder Name *</label>
                    <input
                      type="text"
                      required
                      value={newBank.accountHolder}
                      onChange={(e) => setNewBank({ ...newBank, accountHolder: e.target.value })}
                      placeholder="e.g. My Store Enterprise"
                      className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1">Account Number *</label>
                      <input
                        type="text"
                        required
                        value={newBank.accountNumber}
                        onChange={(e) => setNewBank({ ...newBank, accountNumber: e.target.value })}
                        placeholder="210.120.xxxxx"
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">Routing Number</label>
                      <input
                        type="text"
                        value={newBank.routingNumber}
                        onChange={(e) => setNewBank({ ...newBank, routingNumber: e.target.value })}
                        placeholder="090271421"
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 mb-1">Swift Code</label>
                      <input
                        type="text"
                        value={newBank.swiftCode}
                        onChange={(e) => setNewBank({ ...newBank, swiftCode: e.target.value })}
                        placeholder="DBBLBDDH"
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 mb-1">Branch Name</label>
                      <input
                        type="text"
                        value={newBank.branchName}
                        onChange={(e) => setNewBank({ ...newBank, branchName: e.target.value })}
                        placeholder="Gulshan 1 Branch, Dhaka"
                        className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsBankModalOpen(false)}
                      className="px-4 py-2 bg-[#282E3F] text-slate-300 rounded-xl font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-[#00D68F] text-slate-950 rounded-xl font-bold hover:bg-[#00E699]"
                    >
                      Save Account
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Cash on Delivery (COD) Rules */}
      {activeTab === 'cod' && (
        <form onSubmit={handleSaveCod} className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-[#2E3548]">
            <div>
              <h3 className="text-base font-bold text-white">Cash on Delivery (COD) Configuration</h3>
              <p className="text-xs text-slate-400">Configure delivery fees and limits for Bangladeshi regions</p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={codForm.isEnabled}
                onChange={(e) => setCodForm({ ...codForm, isEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#181B26] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00D68F]"></div>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Inside Dhaka Delivery Fee (৳ BDT)</label>
              <input
                type="number"
                value={codForm.insideDhakaFee}
                onChange={(e) => setCodForm({ ...codForm, insideDhakaFee: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                placeholder="e.g. 60"
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Outside Dhaka Delivery Fee (৳ BDT)</label>
              <input
                type="number"
                value={codForm.outsideDhakaFee}
                onChange={(e) => setCodForm({ ...codForm, outsideDhakaFee: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                placeholder="e.g. 120"
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Sub-Dhaka / Dhaka Suburbs Fee (৳ BDT)</label>
              <input
                type="number"
                value={codForm.subDhakaFee}
                onChange={(e) => setCodForm({ ...codForm, subDhakaFee: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                placeholder="e.g. 80"
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Free Shipping Threshold (৳ BDT Order Value)</label>
              <input
                type="number"
                value={codForm.freeShippingThreshold}
                onChange={(e) => setCodForm({ ...codForm, freeShippingThreshold: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                placeholder="e.g. 2000"
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-[#00D68F] font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
              />
            </div>

            <div className="bg-[#181B26] border border-[#2E3548] p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">Advance Delivery Charge</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={codForm.requestAdvanceDeliveryCharge}
                    onChange={(e) => setCodForm({ ...codForm, requestAdvanceDeliveryCharge: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#202533] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00D68F]"></div>
                </label>
              </div>
              {codForm.requestAdvanceDeliveryCharge && (
                <div>
                  <label className="block text-slate-400 mb-1 text-[10px]">Advance Amount (৳)</label>
                  <input
                    type="number"
                    value={codForm.advanceDeliveryChargeAmount}
                    onChange={(e) => setCodForm({ ...codForm, advanceDeliveryChargeAmount: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                    placeholder="e.g. 150"
                    className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Max COD Order Value Limit (৳ BDT)</label>
              <input
                type="number"
                value={codForm.maxOrderLimit}
                onChange={(e) => setCodForm({ ...codForm, maxOrderLimit: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                placeholder="e.g. 10000"
                className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white font-bold placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-semibold text-xs">Customer COD Instruction Note</label>
            <textarea
              rows={3}
              value={codForm.notes}
              onChange={(e) => setCodForm({ ...codForm, notes: e.target.value })}
              placeholder="e.g. Cash on delivery option is available. Please pay the delivery person when your order is delivered."
              className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl p-3 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-[#00D68F]"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs cursor-pointer shadow-md"
            >
              Save COD Rules
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: Instant Payment Links Generator */}
      {activeTab === 'links' && (
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-[#00D68F]" />
              Social Commerce Payment Link Generator
            </h3>
            <p className="text-xs text-slate-400">Generate direct custom payment links for Facebook Page & Instagram DM customers.</p>
          </div>

          <form onSubmit={handleGenerateLink} className="space-y-4 max-w-xl">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Payment Amount (৳ BDT)</label>
                <input
                  type="number"
                  required
                  value={linkAmount}
                  onChange={(e) => setLinkAmount(e.target.value)}
                  placeholder="e.g. 1500"
                  className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white font-bold text-sm focus:outline-none focus:border-[#00D68F]"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Note / Order Ref</label>
                <input
                  type="text"
                  required
                  value={linkNote}
                  onChange={(e) => setLinkNote(e.target.value)}
                  placeholder="e.g. Invoice #2034 / Custom Order"
                  className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#00D68F]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 fill-slate-950" />
              <span>Generate Direct Payment Link</span>
            </button>
          </form>

          {generatedLink && (
            <div className="bg-[#181B26] border border-[#00D68F]/40 p-4 rounded-xl space-y-2">
              <span className="text-[10px] text-[#00D68F] font-bold uppercase tracking-wider">Shareable Customer Link</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedLink}
                  className="w-full bg-[#202533] text-white font-mono text-xs px-3 py-2 rounded-lg border border-[#2E3548]"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedLink);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="bg-[#282E3F] hover:bg-[#32394E] text-white px-4 py-2 rounded-lg text-xs font-bold shrink-0 cursor-pointer"
                >
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Payment Gateways (SSLCommerz / Shurjopay) */}
      {activeTab === "gateways" && (
        <form onSubmit={handleSaveGateway} className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-[#2E3548]">
            <div>
              <h3 className="text-base font-bold text-white">Payment Gateways (Visa / Mastercard)</h3>
              <p className="text-xs text-slate-400">Configure your SSLCommerz or Shurjopay merchant accounts.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${gwForm.isEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-400"}`}>
                {gwForm.isEnabled ? "Active" : "Inactive"}
              </span>
              <button
                type="button"
                onClick={() => setGwForm({ ...gwForm, isEnabled: !gwForm.isEnabled })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${gwForm.isEnabled ? "bg-[#00D68F]" : "bg-[#2E3548]"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${gwForm.isEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="space-y-4">
                <div>
                  <label className="block text-slate-300 mb-1.5 text-xs font-semibold uppercase tracking-wider">Select Gateway Provider</label>
                  <select 
                    value={gwForm.gateway}
                    onChange={(e) => setGwForm({ ...gwForm, gateway: e.target.value as any })}
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#00D68F]"
                  >
                    <option value="SSLCommerz">SSLCommerz (Recommended)</option>
                    <option value="Shurjopay">Shurjopay</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1.5 text-xs font-semibold uppercase tracking-wider">Store ID / Merchant ID *</label>
                  <input 
                    type="text" 
                    required
                    value={gwForm.storeId}
                    onChange={(e) => setGwForm({ ...gwForm, storeId: e.target.value })}
                    placeholder="e.g. zid_store_test_001"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#00D68F]" 
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1.5 text-xs font-semibold uppercase tracking-wider">Store Password / Merchant Password *</label>
                  <input 
                    type="password" 
                    required
                    value={gwForm.storePassword || ""}
                    onChange={(e) => setGwForm({ ...gwForm, storePassword: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#00D68F]" 
                  />
                </div>
             </div>

             <div className="bg-[#181B26] rounded-2xl p-5 border border-[#2E3548] flex flex-col justify-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white mb-1">Gateway Integration</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    By enabling this gateway, you can accept Visa, Mastercard, and Amex payments directly on your storefront. 
                    Ensure you have a valid merchant account with {gwForm.gateway}.
                  </p>
                </div>
                <div className="pt-2">
                  <a href="#" className="text-[#00D68F] text-[11px] font-bold flex items-center gap-1 hover:underline">
                    Learn how to get API credentials <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
             </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-[#2E3548]">
            <button
              type="submit"
              className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-black px-8 py-3 rounded-xl text-sm transition shadow-lg shadow-[#00D68F]/20 flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Save Gateway Credentials</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 6: Checkout Preview Simulator */}
      {activeTab === 'simulator' && (() => {
        const simShippingFee = simCity === 'Dhaka' ? Number(codForm.insideDhakaFee || 80) : Number(codForm.outsideDhakaFee || 150);
        const simSubtotal = 3200;
        const simBaseTotal = simSubtotal + simShippingFee;

        const advanceMethods = mobileConfigs.filter(m => m.isEnabled && m.canPayAdvanceCharge && m.number);
        const isAdvanceRequired = simSelectedMethod === 'cod' && (advanceMethods.length > 0 || codForm.requestAdvanceDeliveryCharge);
        const advanceFee = Number(codForm.advanceDeliveryChargeAmount) || simShippingFee;
        const advCfg = advanceMethods.find(m => m.provider === simAdvProvider) || advanceMethods[0] || mobileConfigs[0];
        const advChargePercent = advCfg?.chargePercentage || 0;
        const advCashOutFee = Math.round(advanceFee * (advChargePercent / 100));
        const totalAdvUpfront = advanceFee + advCashOutFee;
        const remainingCodBalance = Math.max(0, simBaseTotal - advanceFee);

        return (
          <div className="bg-[#1D212E] border border-indigo-500/40 rounded-2xl p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#2E3548] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Live Customer Checkout Simulator</h3>
                  <p className="text-xs text-slate-400">Test how end customers experience your dynamic payment rules & cash-out fees in real-time.</p>
                </div>
              </div>

              {/* City Selection Controls for Simulator */}
              <div className="flex items-center gap-2 bg-[#181B26] p-1.5 rounded-xl border border-[#2E3548]">
                <span className="text-[11px] font-bold text-slate-400 pl-2">City:</span>
                <select
                  value={simCity}
                  onChange={(e) => setSimCity(e.target.value as any)}
                  className="bg-[#202533] text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-[#3A435E] focus:outline-none"
                >
                  <option value="Dhaka">Dhaka (Inside - ৳{codForm.insideDhakaFee || 80})</option>
                  <option value="Chittagong">Chittagong (Outside - ৳{codForm.outsideDhakaFee || 150})</option>
                  <option value="Sylhet">Sylhet (Outside - ৳{codForm.outsideDhakaFee || 150})</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Payment Choice Selection */}
              <div className="space-y-4">
                <label className="block text-xs font-bold text-slate-300 uppercase">1. Customer Selects Payment Method:</label>
                
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSimSelectedMethod('bkash')}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      simSelectedMethod === 'bkash'
                        ? 'border-pink-500 bg-pink-500/10 text-white'
                        : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:bg-[#252C3D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-pink-600 text-white font-black text-xs rounded">bKash</span>
                      <div>
                        <div className="text-xs font-bold text-white">bKash Mobile Payment</div>
                        <div className="text-[11px] text-slate-400">Direct deposit to {mobileConfigs.find(m => m.provider === 'bkash')?.number || 'Not Configured'}</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-pink-400">+{mobileConfigs.find(m => m.provider === 'bkash')?.chargePercentage || 1.5}% fee</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimSelectedMethod('nagad')}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      simSelectedMethod === 'nagad'
                        ? 'border-orange-500 bg-orange-500/10 text-white'
                        : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:bg-[#252C3D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-orange-600 text-white font-black text-xs rounded">Nagad</span>
                      <div>
                        <div className="text-xs font-bold text-white">Nagad Direct</div>
                        <div className="text-[11px] text-slate-400">Direct deposit to {mobileConfigs.find(m => m.provider === 'nagad')?.number || 'Not Configured'}</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-orange-400">+{mobileConfigs.find(m => m.provider === 'nagad')?.chargePercentage || 1.0}% fee</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimSelectedMethod('rocket')}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      simSelectedMethod === 'rocket'
                        ? 'border-purple-500 bg-purple-500/10 text-white'
                        : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:bg-[#252C3D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 bg-purple-600 text-white font-black text-xs rounded">Rocket</span>
                      <div>
                        <div className="text-xs font-bold text-white">Rocket Direct</div>
                        <div className="text-[11px] text-slate-400">Direct deposit to {mobileConfigs.find(m => m.provider === 'rocket')?.number || 'Not Configured'}</div>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-purple-400">+{mobileConfigs.find(m => m.provider === 'rocket')?.chargePercentage || 1.0}% fee</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimSelectedMethod('bank')}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      simSelectedMethod === 'bank'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:bg-[#252C3D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-blue-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Direct Bank Transfer</div>
                        <div className="text-[11px] text-slate-400">{bankAccounts[0]?.bankName || 'Dutch-Bangla Bank PLC'}</div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimSelectedMethod('cod')}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      simSelectedMethod === 'cod'
                        ? 'border-[#00D68F] bg-[#00D68F]/10 text-white'
                        : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:bg-[#252C3D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-[#00D68F]" />
                      <div>
                        <div className="text-xs font-bold text-white">Cash on Delivery (COD)</div>
                        <div className="text-[11px] text-slate-400">
                          {isAdvanceRequired ? 'Mandatory Advance Delivery Fee' : 'Standard Cash on Delivery'}
                        </div>
                      </div>
                    </div>
                    {isAdvanceRequired && (
                      <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
                        Advance Fee
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSimSelectedMethod('gateway')}
                    className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition cursor-pointer ${
                      simSelectedMethod === 'gateway'
                        ? 'border-indigo-500 bg-indigo-500/10 text-white'
                        : 'border-[#2E3548] bg-[#202533] text-slate-400 hover:bg-[#252C3D]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-indigo-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Online Payment (Card/NetBanking)</div>
                        <div className="text-[11px] text-slate-400">{gatewayConfig.isEnabled ? `Powered by ${gatewayConfig.gateway}` : 'Gateway Not Configured'}</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Live Instructions Box */}
              <div className="bg-[#181B26] border border-[#2E3548] p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#2E3548] pb-2">
                  <span className="text-xs font-bold text-[#00D68F] uppercase tracking-wider">2. Customer Screen Display</span>
                  <span className="text-[10px] font-mono text-slate-400">Storefront Live Preview</span>
                </div>

                {simSelectedMethod === 'gateway' && (
                  <div className="space-y-3 text-xs">
                    <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 text-indigo-100 space-y-2">
                      <div className="flex items-center gap-2">
                         <Sparkles className="w-4 h-4 text-indigo-400" />
                         <span className="font-bold">Instant Gateway Checkout</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">
                        Customer will be redirected to <strong>{gatewayConfig.gateway}</strong> secure payment portal.
                      </p>
                      <div className="flex gap-2 pt-1">
                        <div className="h-6 w-10 bg-white/10 rounded border border-white/10 flex items-center justify-center text-[8px] font-bold text-white">VISA</div>
                        <div className="h-6 w-10 bg-white/10 rounded border border-white/10 flex items-center justify-center text-[8px] font-bold text-white">MC</div>
                        <div className="h-6 w-10 bg-white/10 rounded border border-white/10 flex items-center justify-center text-[8px] font-bold text-white">bKash</div>
                      </div>
                    </div>
                  </div>
                )}

                {['bkash', 'nagad', 'rocket'].includes(simSelectedMethod) && (() => {
                  const cfg = mobileConfigs.find(m => m.provider === simSelectedMethod);
                  if (!cfg) return <div className="text-xs text-slate-500">Method configuration not found or disabled.</div>;
                  const chargePercent = cfg.chargePercentage || 0;
                  const cashOutFee = Math.round(simBaseTotal * (chargePercent / 100));
                  const totalPayable = simBaseTotal + cashOutFee;
                  const isBk = simSelectedMethod === 'bkash';
                  const isNg = simSelectedMethod === 'nagad';
                  const bgBrandClass = isBk ? 'bg-pink-500/10 border-pink-500/30 text-pink-200' : isNg ? 'bg-orange-500/10 border-orange-500/30 text-orange-200' : 'bg-purple-500/10 border-purple-500/30 text-purple-200';

                  return (
                    <div className="space-y-3 text-xs">
                      <div className={`p-3.5 rounded-xl border ${bgBrandClass} space-y-2`}>
                        <div className="flex items-center justify-between">
                          <strong className="text-white text-xs uppercase">{cfg.displayName} ({cfg.accountType})</strong>
                          <span className="font-mono text-xs font-black text-white bg-black/40 px-2 py-0.5 rounded">
                            {cfg.number || 'Not Configured'}
                          </span>
                        </div>

                        {/* Calculated Breakdown */}
                        <div className="bg-black/30 p-2.5 rounded-lg text-slate-300 text-[11px] space-y-1 font-mono">
                          <div className="flex justify-between">
                            <span>Test Order Subtotal:</span>
                            <span className="text-white">৳{simSubtotal.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Shipping Fee ({simCity}):</span>
                            <span className="text-white">৳{simShippingFee}</span>
                          </div>
                          {chargePercent > 0 && (
                            <div className="flex justify-between text-amber-400 font-bold">
                              <span>Cash-out Fee ({chargePercent}%):</span>
                              <span>+৳{cashOutFee}</span>
                            </div>
                          )}
                          <div className="border-t border-white/10 pt-1 flex justify-between font-bold text-white text-xs">
                            <span>Total Payable Amount:</span>
                            <span className="text-[#00D68F]">৳{totalPayable.toLocaleString()} BDT</span>
                          </div>
                        </div>

                        {cfg.instructions && (
                          <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
                            <strong>Note:</strong> {cfg.instructions}
                          </p>
                        )}
                      </div>

                      {cfg.requireTrxId && (
                        <div className="space-y-1">
                          <label className="block text-slate-400 text-[11px]">Customer Enters {simSelectedMethod.toUpperCase()} Transaction ID:</label>
                          <input
                            type="text"
                            placeholder={`e.g. ${isBk ? 'BK' : isNg ? 'NG' : 'RO'}8X991029`}
                            value={simTxId}
                            onChange={(e) => setSimTxId(e.target.value)}
                            className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#00D68F]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {simSelectedMethod === 'cod' && (
                  <div className="space-y-3 text-xs">
                    {isAdvanceRequired ? (
                      <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-amber-400 font-bold">
                          <ShieldCheck className="w-4 h-4 shrink-0" />
                          <span>Mandatory Advance Delivery Charge Required</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Customer must pay <strong className="text-white">৳{advanceFee} Delivery Charge</strong> upfront via Mobile Banking before COD order is placed.
                        </p>

                        {/* Advance Provider Selector */}
                        {advanceMethods.length > 0 && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Select Provider for Advance Payment:</label>
                            <div className="flex gap-2">
                              {advanceMethods.map((m) => (
                                <button
                                  key={m.id}
                                  type="button"
                                  onClick={() => setSimAdvProvider(m.provider as any)}
                                  className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                                    advCfg?.provider === m.provider
                                      ? 'bg-amber-500 text-slate-950 font-black'
                                      : 'bg-[#202533] text-slate-300 border border-[#3A435E]'
                                  }`}
                                >
                                  {m.displayName}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {advCfg && (
                          <div className="bg-black/30 p-2.5 rounded-lg border border-white/10 space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Send Money Number:</span>
                              <span className="font-mono font-bold text-amber-300">{advCfg.number || 'Not Set'}</span>
                            </div>

                            <div className="text-[11px] space-y-1 font-mono text-slate-300 border-t border-white/10 pt-1.5">
                              <div className="flex justify-between">
                                <span>Advance Delivery Fee:</span>
                                <span>৳{advanceFee}</span>
                              </div>
                              {advChargePercent > 0 && (
                                <div className="flex justify-between text-amber-400">
                                  <span>Cash-out Fee ({advChargePercent}%):</span>
                                  <span>+৳{advCashOutFee}</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold text-amber-300 text-xs border-t border-white/10 pt-1">
                                <span>Total Upfront Payable:</span>
                                <span>৳{totalAdvUpfront} BDT</span>
                              </div>
                              <div className="flex justify-between font-bold text-[#00D68F] text-xs pt-0.5">
                                <span>Remaining COD Balance (Delivery):</span>
                                <span>৳{remainingCodBalance.toLocaleString()} BDT</span>
                              </div>
                            </div>

                            {advCfg.instructions && (
                              <p className="text-[10px] text-slate-400 italic pt-1">
                                Note: {advCfg.instructions}
                              </p>
                            )}
                          </div>
                        )}

                        <div>
                          <label className="block text-slate-400 text-[11px] mb-1">Customer Enters Advance Payment TrxID:</label>
                          <input
                            type="text"
                            placeholder="e.g. BK8X991029"
                            value={simTxId}
                            onChange={(e) => setSimTxId(e.target.value)}
                            className="w-full bg-[#202533] border border-[#3A435E] rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#202533] p-3.5 rounded-xl border border-[#2E3548] space-y-2">
                        <div className="font-bold text-white text-xs">Standard Cash on Delivery</div>
                        <p className="text-[11px] text-slate-300">{codForm.notes || 'Customer will pay total amount in cash upon package delivery.'}</p>
                        <div className="font-mono text-xs text-[#00D68F] font-bold pt-1">
                          Total COD Amount Due on Delivery: ৳{simBaseTotal.toLocaleString()} BDT
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {simSelectedMethod === 'bank' && (
                  <div className="space-y-2 text-xs">
                    <div className="bg-[#202533] p-3 rounded-xl border border-[#2E3548] space-y-1">
                      <div className="font-bold text-white">{bankAccounts[0]?.bankName || 'Dutch-Bangla Bank PLC'}</div>
                      <div className="text-slate-400">Account Name: <span className="text-white font-semibold">{bankAccounts[0]?.accountHolder || 'Zid Merchant'}</span></div>
                      <div className="text-slate-400">Account Number: <span className="text-[#00D68F] font-mono font-bold">{bankAccounts[0]?.accountNumber || '15211029384910'}</span></div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => toast.success(`Simulated order submitted via ${simSelectedMethod.toUpperCase()}!`)}
                  className="w-full py-3 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-lg"
                >
                  Place Test Order (৳{
                    ['bkash', 'nagad', 'rocket'].includes(simSelectedMethod)
                      ? (simBaseTotal + Math.round(simBaseTotal * ((mobileConfigs.find(m => m.provider === simSelectedMethod)?.chargePercentage || 0) / 100))).toLocaleString()
                      : isAdvanceRequired
                      ? `${totalAdvUpfront} Upfront (৳${remainingCodBalance.toLocaleString()} COD)`
                      : simBaseTotal.toLocaleString()
                  } BDT)
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
