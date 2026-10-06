import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Customer, CustomerSubTab } from '../../types';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  ArrowUpDown, 
  ChevronDown, 
  ChevronUp, 
  MoreVertical, 
  Check, 
  X, 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  User, 
  Calendar as CalendarIcon, 
  Wallet, 
  Star, 
  Ticket, 
  HelpCircle, 
  Bell, 
  Edit2, 
  Trash2, 
  Ban, 
  UserCheck, 
  Sparkles, 
  Download, 
  RefreshCw, 
  Gift, 
  ShoppingBag, 
  Award, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Globe,
  Tag,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';

interface CustomersViewProps {
  customers: Customer[];
  onUpdateCustomers?: (updated: Customer[]) => void;
  activeSubTab?: CustomerSubTab;
  onSelectSubTab?: (subTab: CustomerSubTab) => void;
}

const BANGLADESH_DISTRICTS = [
  'Dhaka',
  'Chittagong',
  'Sylhet',
  'Rajshahi',
  'Khulna',
  'Barisal',
  'Rangpur',
  'Mymensingh',
  'Comilla',
  'Narayanganj',
  'Gazipur',
  'Bogra',
  'Cox\'s Bazar',
  'Feni',
  'Brahmanbaria',
  'Tangail',
  'Noakhali',
  'Pabna',
  'Jessore',
  'Kushtia',
  'Dinajpur',
  'Faridpur'
];

const COUNTRIES = [
  'Bangladesh',
  'India',
  'United Arab Emirates',
  'Saudi Arabia',
  'United Kingdom',
  'United States',
  'Malaysia',
  'Qatar'
];

export const CustomersView: React.FC<CustomersViewProps> = ({ 
  customers,
  onUpdateCustomers,
  activeSubTab = 'all_customers',
  onSelectSubTab
}) => {
  // Navigation subtabs list
  const subTabsList: { id: CustomerSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'all_customers', label: 'All customers', icon: Users },
    { id: 'customer_wallet', label: 'Customer wallet', icon: Wallet },
    { id: 'groups', label: 'Groups', icon: UserCheck },
    { id: 'customer_tickets', label: 'Customer Tickets', icon: Ticket },
    { id: 'reviews', label: 'Reviews', icon: Star },
    { id: 'questions', label: 'Questions', icon: HelpCircle },
    { id: 'stock_notifications', label: 'Stock notifications', icon: Bell },
  ];

  // List & Form State
  const [viewMode, setViewMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Steadfast Fraud Check Cache for Customers
  const [fraudCheckCache, setFraudCheckCache] = useState<{ [phone: string]: any }>({});
  // ATTEMPTED (success or failure) and IN-FLIGHT phones, as refs.
  //
  // The old effect keyed on the raw `customers` array identity and guarded with
  // `!fraudCheckCache[cleanPhone]` read from a stale closure. Because the cache
  // was only written when `data.success === true`, every failed check (bad
  // credentials, outage) stayed "uncached" — and since App hands down a FRESH
  // customers array whenever its identity effect re-runs, each such change
  // re-fired a POST to /api/courier/steadfast/fraud-check for every uncached
  // phone. Endless loop, no user action involved. Marking a phone attempted in
  // `finally` — regardless of outcome — makes this strictly ONCE per phone.
  const fraudAttemptedRef = useRef<Set<string>>(new Set());
  const fraudPendingRef = useRef<Set<string>>(new Set());

  /**
   * One fraud-check request for one phone. Stable identity (useCallback with
   * no reactive deps) so the effect below can list it as a dependency without
   * re-running. Deduplicates via the pending/attempted refs above, so repeated
   * effect runs or duplicate phone numbers in the list can never queue a
   * second request for the same phone.
   */
  const fetchFraudCheck = useCallback(async (phone: string) => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return;
    if (fraudPendingRef.current.has(cleanPhone) || fraudAttemptedRef.current.has(cleanPhone)) return;
    fraudPendingRef.current.add(cleanPhone);
    try {
      const res = await fetch('/api/courier/steadfast/fraud-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone })
      });
      const data = await res.json();
      if (data?.success) {
        setFraudCheckCache(prev => ({ ...prev, [cleanPhone]: data }));
      }
    } catch {
      // Transient failure — still marked attempted below so it can never
      // become a background retry loop. A merchant can remount to retry.
    } finally {
      fraudPendingRef.current.delete(cleanPhone);
      fraudAttemptedRef.current.add(cleanPhone);
    }
  }, []);

  // Signature of the SET OF (normalized) PHONES, never the `customers` array
  // identity: a fresh-but-identical array from the parent must not re-trigger
  // anything. Only a genuinely new/removed phone changes this key, and each key
  // change fetches only phones not yet attempted.
  const fraudCheckPhoneKey = useMemo(
    () => customers.map((c) => (c.phone || '').replace(/[^0-9]/g, '')).filter(Boolean).join('|'),
    [customers]
  );
  useEffect(() => {
    if (!fraudCheckPhoneKey) return;
    fraudCheckPhoneKey.split('|').forEach((phone) => {
      void fetchFraudCheck(phone);
    });
  }, [fraudCheckPhoneKey, fetchFraudCheck]);

  // Status Filter Tabs ('All', 'Active', 'Banned')
  const [statusTab, setStatusTab] = useState<'All' | 'Active' | 'Banned'>('All');

  // Search, Filter & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'Individual' | 'Company'>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [filterCity, setFilterCity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'joined' | 'orders' | 'spent' | 'loyalty' | 'name'>('joined');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Selection state for batch operations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Wallet Modal
  const [walletModalCustomer, setWalletModalCustomer] = useState<Customer | null>(null);
  const [walletAmount, setWalletAmount] = useState<number>(100);
  const [walletAction, setWalletAction] = useState<'add' | 'deduct'>('add');
  const [walletNote, setWalletNote] = useState('Store cashback promotional credit');

  // Form Field States for Add/Edit Customer
  const [formType, setFormType] = useState<'Individual' | 'Company'>('Individual');
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCountryCode, setFormCountryCode] = useState<'+880' | '+966'>('+880');
  const [formMobileNumber, setFormMobileNumber] = useState('');
  const [formGender, setFormGender] = useState<'Male' | 'Female' | 'Other' | ''>('');
  const [formCountry, setFormCountry] = useState('Bangladesh');
  const [formCity, setFormCity] = useState('Dhaka');
  const [formCustomCity, setFormCustomCity] = useState('');
  const [formDob, setFormDob] = useState('');
  const [formChannel, setFormChannel] = useState<'Store' | 'Mobile App' | 'POS' | 'WhatsApp'>('Store');
  const [formGroup, setFormGroup] = useState<'VIP' | 'Regular' | 'New' | 'Wholesale'>('Regular');
  const [formInitialWallet, setFormInitialWallet] = useState<number>(0);
  const [formStatus, setFormStatus] = useState<'Active' | 'Banned'>('Active');

  // Interactive Calendar Popover State
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarYear, setCalendarYear] = useState<number>(1995);
  const [calendarMonth, setCalendarMonth] = useState<number>(3); // 0-indexed (April)
  const calendarRef = useRef<HTMLDivElement>(null);

  // Sync calendar with formDob when opening
  useEffect(() => {
    if (formDob) {
      const parts = formDob.split('-');
      if (parts.length === 3) {
        setCalendarYear(parseInt(parts[0], 10));
        setCalendarMonth(parseInt(parts[1], 10) - 1);
      }
    } else {
      setCalendarYear(1995);
      setCalendarMonth(3);
    }
  }, [formDob, isCalendarOpen]);

  // Close popovers on outside click
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
      setActiveMenuId(null);
      setIsSortDropdownOpen(false);
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Open Create Form Reset
  const handleOpenCreateForm = () => {
    setEditingCustomer(null);
    setFormType('Individual');
    setFormName('');
    setFormEmail('');
    setFormCountryCode('+880');
    setFormMobileNumber('');
    setFormGender('');
    setFormCountry('Bangladesh');
    setFormCity('Dhaka');
    setFormCustomCity('');
    setFormDob('');
    setFormChannel('Store');
    setFormGroup('New');
    setFormInitialWallet(0);
    setFormStatus('Active');
    setViewMode('create');
    setActiveMenuId(null);
  };

  // Open Edit Form Populate
  const handleOpenEditForm = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormType(customer.customerType || 'Individual');
    setFormName(customer.name);
    setFormEmail(customer.email || '');
    
    // Detect country code and strip prefix if exists
    let rawMobile = customer.phone || '';
    if (rawMobile.startsWith('+966')) {
      setFormCountryCode('+966');
      rawMobile = rawMobile.replace('+966', '').trim();
    } else if (rawMobile.startsWith('966')) {
      setFormCountryCode('+966');
      rawMobile = rawMobile.slice(3).trim();
    } else if (rawMobile.startsWith('+880')) {
      setFormCountryCode('+880');
      rawMobile = rawMobile.replace('+880', '').trim();
    } else if (rawMobile.startsWith('880')) {
      setFormCountryCode('+880');
      rawMobile = rawMobile.slice(3).trim();
    } else {
      setFormCountryCode('+880');
    }
    setFormMobileNumber(rawMobile);
    
    setFormGender(customer.gender || '');
    setFormCountry(customer.country || 'Bangladesh');
    if (BANGLADESH_DISTRICTS.includes(customer.city)) {
      setFormCity(customer.city);
      setFormCustomCity('');
    } else {
      setFormCity('Other');
      setFormCustomCity(customer.city);
    }
    setFormDob(customer.dob || '');
    setFormChannel(customer.channel || 'Store');
    setFormGroup(customer.group || 'Regular');
    setFormInitialWallet(customer.walletBalanceBDT || 0);
    setFormStatus(customer.status || 'Active');
    setViewMode('edit');
    setActiveMenuId(null);
  };

  // Save Customer Submit Handler
  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    // Format phone number with selected country code (+880 or +966)
    let cleanMobile = formMobileNumber.trim().replace(/^0+/, '');
    const prefix = formCountryCode;
    const formattedPhone = cleanMobile ? `${prefix}${cleanMobile}` : (prefix === '+966' ? '+966500000000' : '+8801700000000');
    const finalCity = formCity === 'Other' ? (formCustomCity.trim() || 'Dhaka') : formCity;

    if (editingCustomer && onUpdateCustomers) {
      // Update existing
      const updated = customers.map(c => {
        if (c.id === editingCustomer.id) {
          return {
            ...c,
            name: formName.trim(),
            customerType: formType,
            phone: formattedPhone,
            email: formEmail.trim(),
            gender: formGender,
            country: formCountry,
            city: finalCity,
            channel: formChannel,
            group: formGroup,
            status: formStatus,
            dob: formDob,
          };
        }
        return c;
      });
      onUpdateCustomers(updated);
    } else if (onUpdateCustomers) {
      // Create New
      const newCustomer: Customer = {
        id: `cust-${Date.now()}`,
        name: formName.trim(),
        customerType: formType,
        phone: formattedPhone,
        email: formEmail.trim(),
        gender: formGender,
        country: formCountry,
        city: finalCity,
        channel: formChannel,
        totalOrders: 0,
        loyaltyPoints: 50, // Welcome points
        totalSpentBDT: 0,
        walletBalanceBDT: formInitialWallet || 0,
        status: formStatus,
        dob: formDob,
        group: formGroup,
        joinedDate: new Date().toISOString().split('T')[0],
      };
      onUpdateCustomers([newCustomer, ...customers]);
    }

    setViewMode('list');
  };

  // Toggle Ban/Active Status
  const handleToggleCustomerStatus = (customer: Customer) => {
    if (!onUpdateCustomers) return;
    const nextStatus = customer.status === 'Active' ? 'Banned' : 'Active';
    const updated = customers.map(c => c.id === customer.id ? { ...c, status: nextStatus } : c);
    onUpdateCustomers(updated);
  };

  // Delete Customer
  const handleDeleteCustomer = (id: string) => {
    if (!onUpdateCustomers) return;
    if (window.confirm('Are you sure you want to remove this customer record?')) {
      onUpdateCustomers(customers.filter(c => c.id !== id));
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  // Wallet Transaction Submit
  const handleWalletSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalCustomer || !onUpdateCustomers || walletAmount <= 0) return;

    const updated = customers.map(c => {
      if (c.id === walletModalCustomer.id) {
        const current = c.walletBalanceBDT || 0;
        const newBalance = walletAction === 'add' 
          ? current + walletAmount 
          : Math.max(0, current - walletAmount);
        return { ...c, walletBalanceBDT: newBalance };
      }
      return c;
    });

    onUpdateCustomers(updated);
    setWalletModalCustomer(null);
  };

  // Bulk Selection Handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredCustomers.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Filter & Search Logic
  const filteredCustomers = customers.filter(c => {
    // Status tab filter
    if (statusTab === 'Active' && c.status !== 'Active') return false;
    if (statusTab === 'Banned' && c.status !== 'Banned') return false;

    // Type filter
    if (filterType !== 'all' && c.customerType !== filterType) return false;

    // Channel filter
    if (filterChannel !== 'all' && c.channel !== filterChannel) return false;

    // City filter
    if (filterCity !== 'all' && c.city !== filterCity) return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchPhone = c.phone.includes(q);
      const matchEmail = (c.email || '').toLowerCase().includes(q);
      const matchCity = c.city.toLowerCase().includes(q);
      return matchName || matchPhone || matchEmail || matchCity;
    }

    return true;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'joined') {
      comparison = (a.joinedDate || '').localeCompare(b.joinedDate || '');
    } else if (sortBy === 'orders') {
      comparison = a.totalOrders - b.totalOrders;
    } else if (sortBy === 'spent') {
      comparison = a.totalSpentBDT - b.totalSpentBDT;
    } else if (sortBy === 'loyalty') {
      comparison = a.loyaltyPoints - b.loyaltyPoints;
    } else if (sortBy === 'name') {
      comparison = a.name.localeCompare(b.name);
    }
    return sortOrder === 'desc' ? -comparison : comparison;
  });

  // Calendar Helpers
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();

  const handleSelectCalendarDate = (day: number) => {
    const formattedMonth = String(calendarMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    setFormDob(`${calendarYear}-${formattedMonth}-${formattedDay}`);
    setIsCalendarOpen(false);
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // -----------------------------------------------------------------
  // RENDER VIEW: CREATE / EDIT CUSTOMER FORM
  // -----------------------------------------------------------------
  if (viewMode === 'create' || viewMode === 'edit') {
    return (
      <form onSubmit={handleSaveCustomer} className="space-y-6">
        
        {/* Top Header Bar */}
        <div className="bg-[#202533] border border-[#2E3548] p-4 sm:p-5 rounded-2xl flex items-center justify-between gap-4 sticky top-0 z-30 shadow-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="p-2 text-slate-400 hover:text-white bg-[#181B26] hover:bg-[#282E3F] rounded-xl transition border border-[#2E3548] cursor-pointer"
              title="Back to Customers List"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{viewMode === 'edit' ? 'Edit customer information' : 'Add a new customer'}</span>
                <span className="text-[10px] bg-[#00D68F]/20 text-[#00D68F] font-black px-2 py-0.5 rounded-full border border-[#00D68F]/30 uppercase">
                  ZID BD DIRECTORY
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Register individual buyers or corporate accounts with Bangladesh mobile phone numbers and district location.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="px-4 py-2 bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-1.5"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{viewMode === 'edit' ? 'Save Changes' : 'Create'}</span>
            </button>
          </div>
        </div>

        {/* Form Body Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Form Fields (2 Cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Customer Type Selector */}
            <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
              <label className="block text-xs font-bold text-white uppercase tracking-wider">
                Customer Type *
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label 
                  onClick={() => setFormType('Individual')}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${
                    formType === 'Individual'
                      ? 'bg-[#00D68F]/10 border-[#00D68F] text-white shadow-md'
                      : 'bg-[#181B26] border-[#2E3548] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="customerType"
                    checked={formType === 'Individual'}
                    onChange={() => setFormType('Individual')}
                    className="accent-[#00D68F] w-4 h-4"
                  />
                  <div className="flex items-center gap-2.5">
                    <User className={`w-5 h-5 ${formType === 'Individual' ? 'text-[#00D68F]' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs font-bold text-white">Individual</p>
                      <p className="text-[10px] text-slate-400">Retail retail buyer profile</p>
                    </div>
                  </div>
                </label>

                <label 
                  onClick={() => setFormType('Company')}
                  className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${
                    formType === 'Company'
                      ? 'bg-purple-500/10 border-purple-500 text-white shadow-md'
                      : 'bg-[#181B26] border-[#2E3548] text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="customerType"
                    checked={formType === 'Company'}
                    onChange={() => setFormType('Company')}
                    className="accent-purple-500 w-4 h-4"
                  />
                  <div className="flex items-center gap-2.5">
                    <Building2 className={`w-5 h-5 ${formType === 'Company' ? 'text-purple-400' : 'text-slate-400'}`} />
                    <div>
                      <p className="text-xs font-bold text-white">Company</p>
                      <p className="text-[10px] text-slate-400">Corporate or Wholesale B2B buyer</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* 2-Column Responsive Input Grid */}
            <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-5 shadow-xl">
              <h2 className="text-sm font-bold text-white border-b border-[#2E3548] pb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#00D68F]" />
                <span>Contact & Personal Information</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                
                {/* Field 1: Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={formType === 'Company' ? 'Company Name (e.g., Abrar Tech Ltd.)' : 'Full Name (e.g., Saima Chowdhury)'}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
                  />
                </div>

                {/* Field 2: Email Optional */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Email</span>
                    <span className="text-[10px] text-slate-500 font-normal">Optional</span>
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="e.g., customer@domain.com"
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
                  />
                </div>

                {/* Field 3: Mobile (Bangladesh +880 & Saudi Arabia +966 support) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-200">
                      Mobile Number ({formCountryCode === '+880' ? 'Bangladesh +880' : 'Saudi Arabia +966'}) *
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={formCountryCode}
                      onChange={(e) => setFormCountryCode(e.target.value as '+880' | '+966')}
                      className="bg-[#282E3F] border border-[#00D68F]/30 rounded-xl px-2.5 py-2.5 text-xs font-bold text-[#00D68F] focus:outline-none cursor-pointer"
                    >
                      <option value="+880">🇧🇩 +880</option>
                      <option value="+966">🇸🇦 +966</option>
                    </select>
                    <input
                      type="tel"
                      required
                      value={formMobileNumber}
                      onChange={(e) => setFormMobileNumber(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={formCountryCode === '+880' ? '1755112233' : '501234567'}
                      maxLength={11}
                      className="flex-1 bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500 font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {formCountryCode === '+880' ? 'Format: 10 digits (e.g. 1755112233)' : 'Format: 9 digits (e.g. 501234567)'}
                  </p>
                </div>

                {/* Field 4: Gender Optional */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Gender</span>
                    <span className="text-[10px] text-slate-500 font-normal">Optional</span>
                  </label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value as any)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                  >
                    <option value="">Select Gender (Optional)</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Field 5: Country Dropdown (Default: Bangladesh) */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    Country
                  </label>
                  <select
                    value={formCountry}
                    onChange={(e) => setFormCountry(e.target.value)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                  >
                    {COUNTRIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {/* Field 6: City Dropdown (Defaulted for Bangladesh districts) */}
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1.5">
                    City / District
                  </label>
                  <select
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                  >
                    {BANGLADESH_DISTRICTS.map(district => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                    <option value="Other">Custom City / Outside District...</option>
                  </select>

                  {formCity === 'Other' && (
                    <input
                      type="text"
                      required
                      value={formCustomCity}
                      onChange={(e) => setFormCustomCity(e.target.value)}
                      placeholder="Type custom city name..."
                      className="w-full mt-2 bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#00D68F]"
                    />
                  )}
                </div>

              </div>

              {/* Full-width Field: Date of Birth (Optional) with Interactive Calendar Date Picker Widget */}
              <div className="pt-2 border-t border-[#2E3548]/60 relative" ref={calendarRef}>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-200">
                    <CalendarIcon className="w-4 h-4 text-[#00D68F]" />
                    <span>Date of Birth</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">Optional</span>
                </label>

                <div className="flex items-center gap-2">
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCalendarOpen(!isCalendarOpen);
                    }}
                    className="flex-1 bg-[#181B26] border border-[#2E3548] hover:border-[#00D68F] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-white flex items-center justify-between cursor-pointer transition"
                  >
                    <span className={formDob ? 'text-white' : 'text-slate-500 font-sans font-normal'}>
                      {formDob || 'YYYY-MM-DD (Click to open calendar picker)'}
                    </span>
                    <CalendarIcon className="w-4 h-4 text-slate-400" />
                  </div>

                  {formDob && (
                    <button
                      type="button"
                      onClick={() => setFormDob('')}
                      className="p-2 bg-[#282E3F] hover:bg-red-600/30 text-slate-400 hover:text-red-400 rounded-xl transition cursor-pointer"
                      title="Clear Date"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Interactive Calendar DatePicker Popover Widget */}
                {isCalendarOpen && (
                  <div 
                    className="absolute left-0 top-full mt-2 z-50 bg-[#1D212E] border border-[#2E3548] rounded-2xl p-4 w-72 shadow-2xl space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header Month/Year Selector */}
                    <div className="flex items-center justify-between border-b border-[#2E3548] pb-2">
                      <button
                        type="button"
                        onClick={handlePrevMonth}
                        className="p-1 hover:bg-[#282E3F] text-slate-300 hover:text-white rounded-lg transition"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-1">
                        <select
                          value={calendarMonth}
                          onChange={(e) => setCalendarMonth(parseInt(e.target.value, 10))}
                          className="bg-[#181B26] border border-[#2E3548] rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none"
                        >
                          {monthNames.map((m, idx) => (
                            <option key={m} value={idx}>{m}</option>
                          ))}
                        </select>

                        <select
                          value={calendarYear}
                          onChange={(e) => setCalendarYear(parseInt(e.target.value, 10))}
                          className="bg-[#181B26] border border-[#2E3548] rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none"
                        >
                          {Array.from({ length: 80 }, (_, i) => 2026 - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={handleNextMonth}
                        className="p-1 hover:bg-[#282E3F] text-slate-300 hover:text-white rounded-lg transition"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-500 uppercase">
                      <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1 text-center text-xs">
                      {/* Empty padding cells */}
                      {Array.from({ length: firstDayIndex }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}

                      {/* Days */}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const formattedMonth = String(calendarMonth + 1).padStart(2, '0');
                        const formattedDay = String(day).padStart(2, '0');
                        const dateStr = `${calendarYear}-${formattedMonth}-${formattedDay}`;
                        const isSelected = formDob === dateStr;

                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => handleSelectCalendarDate(day)}
                            className={`p-1.5 rounded-lg font-semibold transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#00D68F] text-slate-950 font-extrabold shadow-md'
                                : 'text-slate-200 hover:bg-[#282E3F] hover:text-white'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>

                    {/* Preset buttons */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#2E3548] text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setFormDob(today);
                          setIsCalendarOpen(false);
                        }}
                        className="text-[#00D68F] font-bold hover:underline"
                      >
                        Select Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCalendarOpen(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* Right Column: Customer Group & Settings */}
          <div className="space-y-6">
            
            {/* Customer Group & Segment */}
            <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-white border-b border-[#2E3548] pb-2 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[#00D68F]" />
                <span>Segmentation & Group</span>
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Customer Group
                </label>
                <select
                  value={formGroup}
                  onChange={(e) => setFormGroup(e.target.value as any)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                >
                  <option value="New">New Buyer</option>
                  <option value="Regular">Regular Customer</option>
                  <option value="VIP">VIP Gold Tier</option>
                  <option value="Wholesale">Wholesale / Corporate B2B</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Registration Channel
                </label>
                <select
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as any)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                >
                  <option value="Store">Web Storefront</option>
                  <option value="Mobile App">Mobile App (iOS/Android)</option>
                  <option value="POS">POS Retail Terminal</option>
                  <option value="WhatsApp">WhatsApp Order Desk</option>
                </select>
              </div>
            </div>

            {/* Wallet Initial Balance & Account Status */}
            <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-white border-b border-[#2E3548] pb-2 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#00D68F]" />
                <span>Store Wallet & Account Status</span>
              </h3>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Initial Store Wallet Balance (BDT)
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-xs font-bold text-slate-400">৳</span>
                  <input
                    type="number"
                    min={0}
                    value={formInitialWallet}
                    onChange={(e) => setFormInitialWallet(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-8 pr-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Welcome promotional cashback credit issued to buyer wallet.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Account Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormStatus('Active')}
                    className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      formStatus === 'Active'
                        ? 'bg-[#00D68F]/20 border-[#00D68F] text-[#00D68F]'
                        : 'bg-[#181B26] border-[#2E3548] text-slate-400 hover:text-white'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStatus('Banned')}
                    className={`py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      formStatus === 'Banned'
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-[#181B26] border-[#2E3548] text-slate-400 hover:text-white'
                    }`}
                  >
                    Banned
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>

      </form>
    );
  }

  // -----------------------------------------------------------------
  // RENDER SECONDARY SUB-VIEWS (Wallet, Groups, Tickets, Reviews, Q&A)
  // -----------------------------------------------------------------
  if (activeSubTab !== 'all_customers') {
    return (
      <div className="space-y-6">
        {/* Module Subtabs Navigation Header Bar */}
        <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl overflow-x-auto shadow-xl">
          <div className="flex items-center gap-1.5 min-w-max">
            {subTabsList.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectSubTab?.(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-[#00D68F] text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-[#181B26]'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-view: Customer Wallet */}
        {activeSubTab === 'customer_wallet' && (
          <div className="space-y-6">
            <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-pink-400" />
                  <span>Customer Store Wallet & Cashback</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Total wallet credit issued across all customer accounts. Customers can use wallet funds during checkout.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="bg-[#181B26] border border-[#2E3548] px-4 py-2 rounded-xl text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Total Active Wallet Liability</p>
                  <p className="text-sm font-extrabold text-pink-400 font-mono">
                    ৳{customers.reduce((acc, c) => acc + (c.walletBalanceBDT || 0), 0).toLocaleString()} BDT
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
                  <tr>
                    <th className="p-3.5 pl-5">Customer Name</th>
                    <th className="p-3.5">Mobile Number</th>
                    <th className="p-3.5">City</th>
                    <th className="p-3.5 font-right">Wallet Balance</th>
                    <th className="p-3.5 text-right pr-5">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2E3548]">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-[#252B3B] transition">
                      <td className="p-3.5 pl-5 font-bold text-white">{c.name}</td>
                      <td className="p-3.5 font-mono text-slate-300">{c.phone}</td>
                      <td className="p-3.5 text-slate-300">{c.city}</td>
                      <td className="p-3.5 font-mono font-bold text-pink-400 text-sm">
                        ৳{(c.walletBalanceBDT || 0).toLocaleString()} BDT
                      </td>
                      <td className="p-3.5 text-right pr-5">
                        <button
                          type="button"
                          onClick={() => {
                            setWalletModalCustomer(c);
                            setWalletAction('add');
                            setWalletAmount(200);
                          }}
                          className="px-3 py-1.5 bg-[#00D68F]/20 hover:bg-[#00D68F]/30 text-[#00D68F] font-bold rounded-lg text-xs transition cursor-pointer border border-[#00D68F]/30"
                        >
                          + Credit Wallet
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sub-view: Groups */}
        {activeSubTab === 'groups' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { title: 'VIP Gold Tier', count: customers.filter(c => c.group === 'VIP').length, perk: '10% Automatic Cashback on all bKash checkout orders', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
              { title: 'Regular Customer', count: customers.filter(c => c.group === 'Regular').length, perk: 'Standard delivery discounts and loyalty points earning', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
              { title: 'New Buyer', count: customers.filter(c => c.group === 'New').length, perk: 'Welcome 50 Loyalty points and first-order free shipping coupon', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
              { title: 'Wholesale B2B', count: customers.filter(c => c.group === 'Wholesale').length, perk: 'Bulk pricing tier and custom bank transfer payment invoice', color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
            ].map((grp, idx) => (
              <div key={idx} className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${grp.color}`}>
                    {grp.title}
                  </span>
                  <span className="text-lg font-black text-white">{grp.count} Buyers</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed pt-2 border-t border-[#2E3548]">{grp.perk}</p>
              </div>
            ))}
          </div>
        )}

        {/* Sub-view: Customer Tickets */}
        {activeSubTab === 'customer_tickets' && (
          <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Ticket className="w-5 h-5 text-indigo-400" />
              <span>Customer Support Tickets Queue</span>
            </h2>
            <div className="space-y-3">
              <div className="bg-[#181B26] border border-[#2E3548] p-8 rounded-xl text-center text-slate-400">
                No active support tickets found.
              </div>
            </div>
          </div>
        )}

        {/* Sub-view: Reviews */}
        {activeSubTab === 'reviews' && (
          <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              <span>Verified Buyer Reviews & Ratings</span>
            </h2>
            <div className="space-y-3">
              <div className="bg-[#181B26] border border-[#2E3548] p-8 rounded-xl text-center text-slate-400">
                No reviews found.
              </div>
            </div>
          </div>
        )}

        {/* Sub-view: Questions */}
        {activeSubTab === 'questions' && (
          <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-400" />
              <span>Pre-sale Product Page Buyer Questions</span>
            </h2>
            <div className="bg-[#181B26] border border-[#2E3548] p-8 rounded-xl text-center text-slate-400">
              No questions found.
            </div>
          </div>
        )}

        {/* Sub-view: Stock notifications */}
        {activeSubTab === 'stock_notifications' && (
          <div className="bg-[#202533] border border-[#2E3548] p-6 rounded-2xl space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-purple-400" />
              <span>Back-In-Stock Alert Subscriptions</span>
            </h2>
            <div className="bg-[#181B26] border border-[#2E3548] p-8 rounded-xl text-center text-slate-400">
              No stock notifications found.
            </div>
          </div>
        )}

      </div>
    );
  }

  // -----------------------------------------------------------------
  // RENDER PRIMARY VIEW: CUSTOMERS LIST VIEW
  // -----------------------------------------------------------------
  return (
    <div className="space-y-6">
      
      {/* Module Navigation Subtabs Header Bar */}
      <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl overflow-x-auto shadow-xl">
        <div className="flex items-center gap-1.5 min-w-max">
          {subTabsList.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectSubTab?.(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-[#00D68F] text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-[#181B26]'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Requirement 2: Top Bar with Search bar, Filter icon, Sort button, and "+ Create" button */}
      <div className="bg-[#202533] border border-[#2E3548] p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, mobile (+880), email or city..."
            className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-10 pr-9 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter, Sort & "+ Create" Button Group */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          
          {/* Filter Icon Button */}
          <button
            type="button"
            onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
            className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
              filterType !== 'all' || filterChannel !== 'all' || filterCity !== 'all'
                ? 'bg-[#00D68F]/20 border-[#00D68F] text-[#00D68F]'
                : 'bg-[#181B26] border-[#2E3548] text-slate-300 hover:text-white hover:bg-[#282E3F]'
            }`}
            title="Filter Customers"
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filter</span>
            {(filterType !== 'all' || filterChannel !== 'all' || filterCity !== 'all') && (
              <span className="w-2 h-2 rounded-full bg-[#00D68F] animate-pulse" />
            )}
          </button>

          {/* Sort Button Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSortDropdownOpen(!isSortDropdownOpen);
              }}
              className="p-2.5 bg-[#181B26] hover:bg-[#282E3F] border border-[#2E3548] rounded-xl text-xs font-bold text-slate-300 hover:text-white flex items-center gap-2 transition cursor-pointer"
            >
              <ArrowUpDown className="w-4 h-4 text-[#00D68F]" />
              <span className="hidden sm:inline">Sort</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isSortDropdownOpen && (
              <div 
                className="absolute right-0 top-full mt-2 z-40 bg-[#1D212E] border border-[#2E3548] rounded-xl shadow-2xl py-2 w-48 text-xs font-semibold text-slate-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-1 text-[10px] text-slate-500 uppercase font-bold tracking-wider border-b border-[#2E3548]">
                  Sort By
                </div>
                {[
                  { id: 'joined', label: 'Joined Date' },
                  { id: 'orders', label: 'Total Orders Count' },
                  { id: 'spent', label: 'Total Spent BDT' },
                  { id: 'loyalty', label: 'Loyalty Points' },
                  { id: 'name', label: 'Customer Name' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (sortBy === s.id) {
                        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      } else {
                        setSortBy(s.id as any);
                        setSortOrder('desc');
                      }
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[#282E3F] cursor-pointer ${
                      sortBy === s.id ? 'text-[#00D68F] font-bold bg-[#00D68F]/10' : ''
                    }`}
                  >
                    <span>{s.label}</span>
                    {sortBy === s.id && (
                      <span className="text-[10px] font-mono">{sortOrder === 'desc' ? 'High-Low' : 'Low-High'}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Requirement 2: "+ Create" Button */}
          <button
            type="button"
            onClick={handleOpenCreateForm}
            className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Create</span>
          </button>

        </div>

      </div>

      {/* Filter Drawer / Popover Controls */}
      {isFilterDrawerOpen && (
        <div className="bg-[#202533] border border-[#00D68F]/30 p-4 sm:p-5 rounded-2xl space-y-4 shadow-2xl animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-4 h-4 text-[#00D68F]" />
              <span>Advanced Directory Filters</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setFilterType('all');
                setFilterChannel('all');
                setFilterCity('all');
              }}
              className="text-[11px] text-[#00D68F] font-bold hover:underline"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            {/* Filter by Customer Type */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Customer Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
              >
                <option value="all">All Types (Individual & Company)</option>
                <option value="Individual">Individual Buyers</option>
                <option value="Company">Company / Wholesale B2B</option>
              </select>
            </div>

            {/* Filter by Channel */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">Channel</label>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
              >
                <option value="all">All Registration Channels</option>
                <option value="Store">Web Storefront</option>
                <option value="Mobile App">Mobile App</option>
                <option value="POS">POS Retail Terminal</option>
                <option value="WhatsApp">WhatsApp</option>
              </select>
            </div>

            {/* Filter by District City */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">City / District</label>
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
              >
                <option value="all">All Cities & Districts</option>
                {BANGLADESH_DISTRICTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

          </div>
        </div>
      )}

      {/* Requirement 2: Status Tabs "All", "Active", "Banned" with dynamic count badges */}
      <div className="bg-[#202533] border border-[#2E3548] p-2 rounded-2xl flex items-center gap-2 shadow-lg w-fit">
        {[
          { id: 'All', count: customers.length },
          { id: 'Active', count: customers.filter(c => c.status === 'Active').length },
          { id: 'Banned', count: customers.filter(c => c.status === 'Banned').length },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              statusTab === tab.id
                ? 'bg-[#00D68F] text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-[#181B26]'
            }`}
          >
            <span>{tab.id}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              statusTab === tab.id ? 'bg-slate-950 text-[#00D68F]' : 'bg-[#181B26] text-slate-300 border border-[#2E3548]'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Batch Actions Bar (when rows are selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-[#00D68F]/10 border border-[#00D68F]/40 p-3.5 rounded-2xl flex items-center justify-between text-xs text-white shadow-xl animate-in fade-in">
          <span className="font-bold text-[#00D68F] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{selectedIds.length} customer records selected</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onUpdateCustomers) {
                  const updated = customers.map(c => selectedIds.includes(c.id) ? { ...c, status: 'Active' as const } : c);
                  onUpdateCustomers(updated);
                  setSelectedIds([]);
                }
              }}
              className="px-3 py-1.5 bg-[#00D68F] text-slate-950 font-bold rounded-lg hover:bg-[#00E699] transition"
            >
              Activate Selected
            </button>
            <button
              type="button"
              onClick={() => {
                if (onUpdateCustomers) {
                  const updated = customers.map(c => selectedIds.includes(c.id) ? { ...c, status: 'Banned' as const } : c);
                  onUpdateCustomers(updated);
                  setSelectedIds([]);
                }
              }}
              className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500 transition"
            >
              Ban Selected
            </button>
          </div>
        </div>
      )}

      {/* Requirement 2 Table View */}
      <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
              <tr>
                {/* Column 1: Checkbox */}
                <th className="p-3.5 pl-5 w-10">
                  <input
                    type="checkbox"
                    checked={filteredCustomers.length > 0 && selectedIds.length === filteredCustomers.length}
                    onChange={handleSelectAll}
                    className="accent-[#00D68F] rounded cursor-pointer w-4 h-4"
                  />
                </th>

                {/* Column 2: Name & Customer Type (Individual / Company) */}
                <th className="p-3.5">Name & Customer Type</th>

                {/* Column 3: Mobile & Email */}
                <th className="p-3.5">Mobile & Email</th>

                {/* Column 4: City & Country (Defaulted for Bangladesh) */}
                <th className="p-3.5">City & Country</th>

                {/* Column 5: Channel (Store / Mobile App) */}
                <th className="p-3.5">Channel</th>

                {/* Column 6: Total orders count & Loyalty Points */}
                <th className="p-3.5">Orders & Loyalty Points</th>

                {/* Actions */}
                <th className="p-3.5 text-right pr-5">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#2E3548]">
              {filteredCustomers.map((c) => {
                const isSelected = selectedIds.includes(c.id);

                return (
                  <tr 
                    key={c.id} 
                    className={`hover:bg-[#252B3B] transition ${
                      isSelected ? 'bg-[#00D68F]/5' : ''
                    }`}
                  >
                    {/* Checkbox Column */}
                    <td className="p-3.5 pl-5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(c.id)}
                        className="accent-[#00D68F] rounded cursor-pointer w-4 h-4"
                      />
                    </td>

                    {/* Name & Customer Type Column */}
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs">{c.name}</span>
                          
                          {/* Type Badge: Individual / Company */}
                          {c.customerType === 'Company' ? (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-purple-500/20 text-purple-300 font-extrabold px-2 py-0.5 rounded-md border border-purple-500/30">
                              <Building2 className="w-3 h-3" />
                              <span>Company</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] bg-blue-500/20 text-blue-300 font-extrabold px-2 py-0.5 rounded-md border border-blue-500/30">
                              <User className="w-3 h-3" />
                              <span>Individual</span>
                            </span>
                          )}

                          {c.status === 'Banned' && (
                            <span className="text-[9px] bg-red-500/20 text-red-400 font-extrabold px-2 py-0.5 rounded-md border border-red-500/30">
                              Banned
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {c.group && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              c.group === 'VIP' 
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                                : c.group === 'Wholesale'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {c.group}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">
                            Joined {c.joinedDate || '2026-01-01'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Mobile & Email Column */}
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold font-mono text-white text-xs">
                          <Phone className="w-3.5 h-3.5 text-[#00D68F] shrink-0" />
                          <span>{c.phone}</span>
                        </div>
                        {(() => {
                          const fc = fraudCheckCache[(c.phone || '').replace(/[^0-9]/g, '')];
                          if (!fc) return null;
                          return (
                            <div className="mt-0.5">
                              {fc.risk_level === 'low' ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>{fc.risk_label}</span>
                                </span>
                              ) : fc.risk_level === 'medium' ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                  <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
                                  <span>{fc.risk_label}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded">
                                  <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
                                  <span>{fc.risk_label}</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className={c.email ? 'text-slate-200' : 'text-slate-500 italic'}>
                            {c.email || 'No email registered'}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* City & Country Column */}
                    <td className="p-3.5">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-bold text-white text-xs">
                          <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span>{c.city}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold">
                          <Globe className="w-3 h-3 text-slate-500" />
                          <span>{c.country || 'Bangladesh'} 🇧🇩</span>
                        </div>
                      </div>
                    </td>

                    {/* Channel Column */}
                    <td className="p-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        c.channel === 'Mobile App' 
                          ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                          : c.channel === 'WhatsApp'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-[#181B26] text-slate-200 border-[#2E3548]'
                      }`}>
                        {c.channel || 'Store'}
                      </span>
                    </td>

                    {/* Total Orders & Loyalty Points Column */}
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs bg-[#181B26] px-2 py-0.5 rounded-md border border-[#2E3548]">
                            {c.totalOrders} Orders
                          </span>
                          <span className="font-bold text-amber-400 text-xs flex items-center gap-0.5 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                            <Star className="w-3 h-3 fill-amber-400" />
                            <span>{c.loyaltyPoints || 0} pts</span>
                          </span>
                        </div>

                        <div className="text-[11px] font-extrabold text-[#00D68F] font-mono">
                          ৳{(c.totalSpentBDT || 0).toLocaleString()} BDT spent
                        </div>
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="p-3.5 text-right relative pr-5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === c.id ? null : c.id);
                        }}
                        className="p-1.5 hover:bg-[#282E3F] text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Popover Row Actions */}
                      {activeMenuId === c.id && (
                        <div 
                          className="absolute right-4 top-10 z-40 bg-[#1D212E] border border-[#2E3548] rounded-xl shadow-2xl py-1.5 w-48 text-left text-xs font-semibold text-slate-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenEditForm(c)}
                            className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition text-blue-400"
                          >
                            <Edit2 className="w-4 h-4" />
                            <span>Edit details</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              setWalletModalCustomer(c);
                              setWalletAction('add');
                              setWalletAmount(200);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition text-pink-400"
                          >
                            <Wallet className="w-4 h-4" />
                            <span>Manage Wallet Credit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleToggleCustomerStatus(c);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition text-amber-400"
                          >
                            <Ban className="w-4 h-4" />
                            <span>{c.status === 'Active' ? 'Ban Customer' : 'Unban Customer'}</span>
                          </button>

                          <div className="h-px bg-[#2E3548] my-1" />

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              handleDeleteCustomer(c.id);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition text-red-400 hover:text-red-300"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete record</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 space-y-3">
                    <Users className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-sm font-bold text-white">No customer records found.</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Try resetting search or filter terms, or click "+ Create" to add a new customer.
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenCreateForm}
                      className="px-4 py-2 bg-[#00D68F] text-slate-950 font-bold text-xs rounded-xl hover:bg-[#00E699] transition cursor-pointer"
                    >
                      + Add New Customer
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wallet Credit Modal */}
      {walletModalCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <form onSubmit={handleWalletSubmit} className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2.5 text-pink-400">
                <Wallet className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Manage Customer Wallet</h3>
              </div>
              <button
                type="button"
                onClick={() => setWalletModalCustomer(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-300 font-bold">{walletModalCustomer.name}</p>
              <p className="text-[11px] text-slate-400">Current Balance: ৳{(walletModalCustomer.walletBalanceBDT || 0).toLocaleString()} BDT</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWalletAction('add')}
                    className={`py-2 rounded-xl text-xs font-bold cursor-pointer transition border ${
                      walletAction === 'add' ? 'bg-[#00D68F]/20 border-[#00D68F] text-[#00D68F]' : 'bg-[#181B26] border-[#2E3548] text-slate-400'
                    }`}
                  >
                    + Add Cashback
                  </button>
                  <button
                    type="button"
                    onClick={() => setWalletAction('deduct')}
                    className={`py-2 rounded-xl text-xs font-bold cursor-pointer transition border ${
                      walletAction === 'deduct' ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-[#181B26] border-[#2E3548] text-slate-400'
                    }`}
                  >
                    - Deduct Funds
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">Amount (BDT)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(Math.max(1, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">Transaction Reason</label>
                <input
                  type="text"
                  value={walletNote}
                  onChange={(e) => setWalletNote(e.target.value)}
                  placeholder="e.g., Refund or promo reward"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D68F]"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWalletModalCustomer(null)}
                className="px-4 py-2 bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-lg"
              >
                Confirm Transaction
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
