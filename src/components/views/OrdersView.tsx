import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Order, OrderItem } from '../../types';
import {
  ShoppingBag,
  Search,
  Filter,
  Truck,
  CheckCircle2,
  Send,
  PhoneCall,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  AlertCircle,
  Download,
  ArrowUpDown,
  Tag,
  Phone,
  MessageSquare,
  Globe,
  Smartphone,
  CreditCard,
  Building2,
  Check,
  RefreshCw,
  Copy,
  ExternalLink,
  SlidersHorizontal,
  PackageCheck,
  Printer,
  FileText,
  Calendar,
  Clock,
  DollarSign,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Shield
} from 'lucide-react';

const getOrderToken = (ord: any) => {
  if (ord?.orderToken) return ord.orderToken;
  const cleanId = String(ord?.orderNumber || ord?.id || '72200789').replace(/[^a-zA-Z0-9]/g, '');
  let sum = 0;
  for (let i = 0; i < cleanId.length; i++) sum += cleanId.charCodeAt(i);
  const hex = (sum * 9973).toString(16).toUpperCase();
  return `TRK-${cleanId.slice(-4).toUpperCase()}${hex.slice(-4)}`;
};

const generateQRCodeSVG = (text: string, size = 64) => {
  let rects = '';
  const modulesCount = 21;

  const drawFinder = (sr: number, sc: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (isOuter || isInner) {
          rects += `<rect x="${(sc + c) * 2}" y="${(sr + r) * 2}" width="2" height="2" fill="black"/>`;
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, modulesCount - 7);
  drawFinder(modulesCount - 7, 0);

  for (let i = 0; i < modulesCount; i++) {
    if (i % 2 === 0) {
      rects += `<rect x="${i * 2}" y="24" width="2" height="2" fill="black"/>`;
      rects += `<rect x="24" y="${i * 2}" width="2" height="2" fill="black"/>`;
    }
  }

  return `<svg viewBox="0 0 42 42" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
};

interface OrdersViewProps {
  orders: Order[];
  onUpdateOrders: (orders: Order[]) => void;
  merchantId?: string;
}

export type OrderSubMenu = 'all' | 'manual' | 'abandoned';

export type StatusTab =
  | 'All'
  | 'New'
  | 'Preparing'
  | 'Ready'
  | 'In delivery'
  | 'Completed'
  | 'Cancelled'
  | 'Processing reverse'
  | 'Partially Reversed'
  | 'Reversed';

const STATUS_TABS: StatusTab[] = [
  'All',
  'New',
  'Preparing',
  'Ready',
  'In delivery',
  'Completed',
  'Cancelled',
  'Processing reverse',
  'Partially Reversed',
  'Reversed'
];

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  onUpdateOrders,
  merchantId,
}) => {
  const channelRef = useRef<any>(null);
  // Live polling effect for orders sync from Supabase
  useEffect(() => {
    if (!merchantId) return;
    const fetchLiveOrders = async () => {
      try {
        const res = await fetch(`/api/orders/${merchantId}`);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          onUpdateOrders(data);
        }
      } catch (err) {
        console.warn('Error fetching live orders:', err);
      }
    };
    fetchLiveOrders();
    const timer = setInterval(fetchLiveOrders, 4000);
    return () => clearInterval(timer);
  }, [merchantId]);
  // Sub-menu state
  const [subMenu, setSubMenu] = useState<OrderSubMenu>('all');

  // Active Status Tab state
  const [statusTab, setStatusTab] = useState<StatusTab>('All');

  // Controls state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount_high' | 'amount_low'>('newest');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterSource, setFilterSource] = useState<string>('All');
  const [filterPlatform, setFilterPlatform] = useState<string>('All');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('All');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<string>('All');
  const [filterCourier, setFilterCourier] = useState<string>('All');

  // Interactions state
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [activeMenu, setActiveMenu] = useState<{ id: string; type: 'payment' | 'status' } | null>(null);

  // Bulk Actions & Modal states
  const [isActionsDropdownOpen, setIsActionsDropdownOpen] = useState(false);
  const [bulkActionModal, setBulkActionModal] = useState<'change_status' | 'change_payment' | 'invoices' | 'summary' | 'shipping_label' | 'pickup' | null>(null);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<Order['status']>('Preparing');
  const [bulkTargetPaymentStatus, setBulkTargetPaymentStatus] = useState<Order['paymentStatus']>('Paid');
  const [pickupDate, setPickupDate] = useState('2026-07-28');
  const [pickupSlot, setPickupSlot] = useState('10:00 AM - 01:00 PM');
  const [pickupCourier, setPickupCourier] = useState('Steadfast Courier');

  // Modal / Action states
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedOrderForCourier, setSelectedOrderForCourier] = useState<Order | null>(null);
  const [dispatchCourier, setDispatchCourier] = useState('Steadfast Courier');
  const [newTagInput, setNewTagInput] = useState<{ [orderId: string]: string }>({});
  const [isBookingCourier, setIsBookingCourier] = useState<{ [orderId: string]: boolean }>({});

  const handleBooking = async (ord: Order) => {
    setIsBookingCourier(prev => ({ ...prev, [ord.id]: true }));
    try {
      let merchantSettings: any = {};
      try {
        const stored = localStorage.getItem('zid_merchant_settings') || localStorage.getItem('merchantSettings');
        if (stored) merchantSettings = JSON.parse(stored);
      } catch (e) {}

      const res = await fetch('/api/courier/steadfast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            invoice_id: ord.orderNumber || ord.id,
            customer_name: ord.customerName,
            customer_phone: ord.customerPhone,
            shipping_address: `${ord.address || ''}, ${ord.customerCity || ''}`,
            cod_amount: ord.totalBDT || 0,
            customer_note: (ord as any).customerNote || (ord as any).notes || 'Handle with care',
            ...ord
          },
          merchantConfig: merchantSettings
        })
      });

      const data = await res.json();
      if (data.success) {
        const trackingCode = data.tracking_code || `STF-${Math.floor(100000 + Math.random() * 900000)}`;
        const updated = orders.map(o => {
          if (o.id === ord.id) {
            return {
              ...o,
              status: 'In delivery' as const,
              fulfillmentStatus: 'In Transit' as const,
              courierName: 'Steadfast Courier',
              trackingCode: trackingCode,
            };
          }
          return o;
        });
        onUpdateOrders(updated);
        alert(`Booked Successfully! Tracking ID: ${trackingCode}`);
      } else {
        alert('Booking failed: ' + (typeof data.message === 'object' ? JSON.stringify(data.message) : (data.message || data.error || 'Unknown error')));
      }
    } catch (error: any) {
      alert('Booking failed: ' + (error?.message || 'Network error'));
    } finally {
      setIsBookingCourier(prev => ({ ...prev, [ord.id]: false }));
    }
  };

  // Steadfast Fraud Check State & Logic
  const [fraudCheckCache, setFraudCheckCache] = useState<{ [phone: string]: any }>({});
  const [loadingFraudCheck, setLoadingFraudCheck] = useState<{ [phone: string]: boolean }>({});

  const fetchFraudCheck = async (phone: string) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!cleanPhone || fraudCheckCache[cleanPhone] || loadingFraudCheck[cleanPhone]) return;

    setLoadingFraudCheck(prev => ({ ...prev, [cleanPhone]: true }));
    try {
      let merchantSettings: any = {};
      try {
        const stored = localStorage.getItem('zid_merchant_settings') || localStorage.getItem('merchantSettings');
        if (stored) merchantSettings = JSON.parse(stored);
      } catch (e) {}

      const res = await fetch('/api/courier/steadfast/fraud-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, merchantConfig: merchantSettings })
      });
      const data = await res.json();
      if (data.success) {
        setFraudCheckCache(prev => ({ ...prev, [cleanPhone]: data }));
      }
    } catch (err) {
      console.warn('Fraud check fetch error:', err);
    } finally {
      setLoadingFraudCheck(prev => ({ ...prev, [cleanPhone]: false }));
    }
  };

  useEffect(() => {
    orders.forEach(o => {
      if (o.customerPhone) {
        fetchFraudCheck(o.customerPhone);
      }
    });
  }, [orders]);

  const renderFraudBadge = (phone: string) => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const data = fraudCheckCache[cleanPhone];
    const isLoading = loadingFraudCheck[cleanPhone];

    if (isLoading) {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-medium text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700 animate-pulse mt-0.5">
          <span>Checking Fraud DB...</span>
        </span>
      );
    }

    if (!data) {
      return (
        <button
          onClick={(e) => { e.stopPropagation(); fetchFraudCheck(phone); }}
          className="inline-flex items-center gap-1 text-[9px] text-slate-400 hover:text-emerald-400 bg-slate-800/60 hover:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 transition cursor-pointer mt-0.5"
          title="Check delivery success rate with Steadfast"
        >
          <ShieldAlert className="w-2.5 h-2.5" />
          <span>Check Reliability</span>
        </button>
      );
    }

    if (data.risk_level === 'low') {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded mt-0.5" title={`${data.total_delivered}/${data.total_orders} Delivered`}>
          <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
          <span>{data.risk_label}</span>
        </span>
      );
    } else if (data.risk_level === 'medium') {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded mt-0.5" title={`${data.total_delivered}/${data.total_orders} Delivered`}>
          <ShieldAlert className="w-2.5 h-2.5 text-amber-400" />
          <span>{data.risk_label}</span>
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-1.5 py-0.5 rounded mt-0.5" title={`${data.total_returned}/${data.total_orders} Returns/Cancelled`}>
          <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
          <span>{data.risk_label}</span>
        </span>
      );
    }
  };

  // Form for Manual Order
  const [manualForm, setManualForm] = useState({
    customerName: '',
    customerPhone: '',
    customerCity: '',
    deliveryZone: 'Inside Dhaka' as 'Inside Dhaka' | 'Outside Dhaka' | 'Sub Dhaka',
    address: '',
    itemTitle: '',
    quantity: 0,
    unitPriceBDT: 0,
    paymentMethod: 'COD' as any,
    courierName: '',
  });

  // Calculate status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: 0 };
    STATUS_TABS.forEach(st => { if (st !== 'All') counts[st] = 0; });

    orders.forEach((ord) => {
      counts['All'] += 1;
      const st = ord.status || (ord.fulfillmentStatus === 'Delivered' ? 'Completed' : 'New');
      if (counts[st] !== undefined) {
        counts[st] += 1;
      }
    });

    return counts;
  }, [orders]);

  // Filter logic
  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      // 1. Sub-menu filter
      if (subMenu === 'manual') {
        const src = ord.source || 'Store';
        if (src !== 'Manual' && src !== 'POS') return false;
      }

      // 2. Status Tab filter
      const ordStatus = ord.status || (ord.fulfillmentStatus === 'Delivered' ? 'Completed' : 'New');
      if (statusTab !== 'All' && ordStatus !== statusTab) {
        return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNumber = ord.orderNumber.toLowerCase().includes(q);
        const matchesName = ord.customerName.toLowerCase().includes(q);
        const matchesPhone = ord.customerPhone.includes(q);
        const matchesAddress = ord.address.toLowerCase().includes(q);
        const matchesItem = ord.items.some(it => it.productName.toLowerCase().includes(q));
        const matchesTag = ord.tags?.some(t => t.toLowerCase().includes(q));

        if (!matchesNumber && !matchesName && !matchesPhone && !matchesAddress && !matchesItem && !matchesTag) {
          return false;
        }
      }

      // 4. Modal filters
      if (filterSource !== 'All' && (ord.source || 'Store') !== filterSource) return false;
      if (filterPlatform !== 'All' && (ord.platform || 'Mobile web') !== filterPlatform) return false;
      if (filterPaymentMethod !== 'All' && ord.paymentMethod !== filterPaymentMethod) return false;
      if (filterPaymentStatus !== 'All' && ord.paymentStatus !== filterPaymentStatus) return false;
      if (filterCourier !== 'All' && (ord.courierName || 'Unassigned') !== filterCourier) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') return b.id.localeCompare(a.id);
      if (sortBy === 'oldest') return a.id.localeCompare(b.id);
      if (sortBy === 'amount_high') return b.totalBDT - a.totalBDT;
      if (sortBy === 'amount_low') return a.totalBDT - b.totalBDT;
      return 0;
    });
  }, [orders, subMenu, statusTab, searchQuery, filterSource, filterPlatform, filterPaymentMethod, filterPaymentStatus, filterCourier, sortBy]);

  // Bulk actions handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedOrderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const toggleExpandRow = (id: string) => {
    setExpandedOrderIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkUpdateStatus = (newStatus: Order['status']) => {
    const updated = orders.map(ord => {
      if (selectedOrderIds.includes(ord.id)) {
        return {
          ...ord,
          status: newStatus,
          fulfillmentStatus: newStatus === 'Completed' ? ('Delivered' as const) : newStatus === 'In delivery' ? ('In Transit' as const) : ord.fulfillmentStatus
        };
      }
      return ord;
    });
    onUpdateOrders(updated);
    setSelectedOrderIds([]);
    setBulkActionModal(null);
  };

  const handleBulkUpdatePaymentStatus = (newPaymentStatus: Order['paymentStatus']) => {
    const updated = orders.map(ord => {
      if (selectedOrderIds.includes(ord.id)) {
        return {
          ...ord,
          paymentStatus: newPaymentStatus
        };
      }
      return ord;
    });
    onUpdateOrders(updated);
    setSelectedOrderIds([]);
    setBulkActionModal(null);
  };

  const handleQuickUpdatePaymentStatus = (orderId: string, newPaymentStatus: Order['paymentStatus']) => {
    const updated = orders.map(ord => {
      if (ord.id === orderId) {
        return {
          ...ord,
          paymentStatus: newPaymentStatus
        };
      }
      return ord;
    });
    onUpdateOrders(updated);
  };

  const handleQuickUpdateStatus = (orderId: string, newStatus: Order['status']) => {
    const updated = orders.map(ord => {
      if (ord.id === orderId) {
        return {
          ...ord,
          status: newStatus,
          fulfillmentStatus: newStatus === 'Completed' ? ('Delivered' as const) : newStatus === 'In delivery' ? ('In Transit' as const) : ord.fulfillmentStatus
        };
      }
      return ord;
    });
    onUpdateOrders(updated);
  };

  const handleDuplicateSelectedOrders = () => {
    const selected = orders.filter(o => selectedOrderIds.includes(o.id));
    if (selected.length === 0) return;

    const duplicated: Order[] = selected.map(o => ({
      ...o,
      id: `ord-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      orderNumber: `${o.orderNumber}-COPY`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'New' as const,
      tags: [...(o.tags || []), 'Duplicated'],
    }));

    onUpdateOrders([...duplicated, ...orders]);
    setSelectedOrderIds([]);
    setIsActionsDropdownOpen(false);
  };

  const handleExportCSV = (ordersToExport: Order[]) => {
    const headers = ['Order #', 'Source', 'Customer Name', 'Phone', 'Platform', 'Payment Method', 'Payment Status', 'Courier', 'Status', 'Total BDT', 'Created At'];
    const rows = ordersToExport.map(o => [
      o.orderNumber,
      o.source || 'Store',
      `"${o.customerName}"`,
      o.customerPhone,
      o.platform || 'Mobile web',
      o.paymentMethod,
      o.paymentStatus,
      o.courierName || 'Unassigned',
      o.status || 'New',
      o.totalBDT,
      o.createdAt
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Zid_Orders_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportDetailedCSV = (ordersToExport: Order[]) => {
    const headers = [
      'Order #', 'Customer Name', 'Phone', 'Address', 'City', 'Delivery Zone',
      'Item Name', 'Variant', 'Quantity', 'Unit Price BDT', 'Total Item BDT',
      'Payment Method', 'Payment Status', 'Order Status', 'Courier', 'Created At'
    ];
    const rows: string[][] = [];
    ordersToExport.forEach(o => {
      o.items.forEach(item => {
        rows.push([
          o.orderNumber,
          `"${o.customerName}"`,
          o.customerPhone,
          `"${o.address}"`,
          o.customerCity,
          o.deliveryZone,
          `"${item.productName}"`,
          item.variant,
          item.quantity.toString(),
          item.unitPriceBDT.toString(),
          (item.quantity * item.unitPriceBDT).toString(),
          o.paymentMethod,
          o.paymentStatus,
          o.status || 'New',
          o.courierName || 'Unassigned',
          o.createdAt
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Zid_Detailed_Orders_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleScheduleBulkPickup = () => {
    const updated = orders.map(ord => {
      if (selectedOrderIds.includes(ord.id)) {
        return {
          ...ord,
          status: 'In delivery' as const,
          fulfillmentStatus: 'In Transit' as const,
          courierName: pickupCourier,
          trackingCode: `SF-BD-${Math.floor(100000 + Math.random() * 900000)}`,
        };
      }
      return ord;
    });
    onUpdateOrders(updated);
    setSelectedOrderIds([]);
    setBulkActionModal(null);
  };

  const handleAddTag = (orderId: string) => {
    const tag = newTagInput[orderId]?.trim();
    if (!tag) return;

    const updated = orders.map(ord => {
      if (ord.id === orderId) {
        const existing = ord.tags || [];
        if (!existing.includes(tag)) {
          return { ...ord, tags: [...existing, tag] };
        }
      }
      return ord;
    });
    onUpdateOrders(updated);
    setNewTagInput({ ...newTagInput, [orderId]: '' });
  };

  const handleRemoveTag = (orderId: string, tagToRemove: string) => {
    const updated = orders.map(ord => {
      if (ord.id === orderId) {
        return { ...ord, tags: (ord.tags || []).filter(t => t !== tagToRemove) };
      }
      return ord;
    });
    onUpdateOrders(updated);
  };

  const handleCreateManualOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const newOrd: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: `#72200${Math.floor(800 + Math.random() * 199)}`,
      source: 'Manual',
      customerName: manualForm.customerName,
      customerPhone: manualForm.customerPhone,
      customerCity: manualForm.customerCity,
      deliveryZone: manualForm.deliveryZone,
      address: manualForm.address,
      platform: 'POS',
      totalBDT: manualForm.quantity * manualForm.unitPriceBDT,
      paymentMethod: manualForm.paymentMethod,
      paymentStatus: manualForm.paymentMethod === 'COD' ? 'Unpaid' : 'Paid',
      fulfillmentStatus: 'Unfulfilled',
      status: 'New',
      courierName: manualForm.courierName,
      trackingCode: `SF-BD-${Math.floor(100000 + Math.random() * 900000)}`,
      tags: ['Manual Order', 'POS'],
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      items: [
        {
          id: `item-${Date.now()}`,
          productName: manualForm.itemTitle,
          variant: 'Standard',
          quantity: manualForm.quantity,
          unitPriceBDT: manualForm.unitPriceBDT,
          image: '',
        },
      ],
    };

    onUpdateOrders([newOrd, ...orders]);
    setIsManualModalOpen(false);
  };

  // Payment & Order Status Options Configuration
  const PAYMENT_STATUS_OPTIONS: { label: Order['paymentStatus']; color: string; bg: string }[] = [
    { label: 'Paid', color: 'text-[#00D68F]', bg: 'bg-[#00D68F]' },
    { label: 'Partially paid', color: 'text-blue-400', bg: 'bg-blue-400' },
    { label: 'Unpaid', color: 'text-amber-400', bg: 'bg-amber-400' },
    { label: 'Voided', color: 'text-rose-400', bg: 'bg-rose-400' },
  ];

  const ORDER_STATUS_OPTIONS: { label: NonNullable<Order['status']>; color: string; bg: string }[] = [
    { label: 'New', color: 'text-blue-400', bg: 'bg-blue-400' },
    { label: 'Preparing', color: 'text-amber-400', bg: 'bg-amber-400' },
    { label: 'Ready', color: 'text-purple-400', bg: 'bg-purple-400' },
    { label: 'In delivery', color: 'text-cyan-400', bg: 'bg-cyan-400' },
    { label: 'Completed', color: 'text-[#00D68F]', bg: 'bg-[#00D68F]' },
    { label: 'Cancelled', color: 'text-rose-400', bg: 'bg-rose-400' },
  ];

  // Inline Payment Status Dropdown Helper
  const renderPaymentStatusDropdown = (ord: Order) => {
    const current = ord.paymentStatus || 'Unpaid';
    const isOpen = activeMenu?.id === ord.id && activeMenu?.type === 'payment';

    const getStyle = (status: Order['paymentStatus']) => {
      switch (status) {
        case 'Paid':
          return 'bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40 hover:bg-[#00D68F]/30';
        case 'Partially paid':
          return 'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30';
        case 'Unpaid':
          return 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30';
        case 'Voided':
          return 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30';
        default:
          return 'bg-slate-500/20 text-slate-300 border-slate-500/40 hover:bg-slate-500/30';
      }
    };

    return (
      <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setActiveMenu(isOpen ? null : { id: ord.id, type: 'payment' })}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition cursor-pointer inline-flex items-center gap-1.5 shadow-md ${getStyle(current)}`}
        >
          <span>{current}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-1.5 w-44 bg-[#1D212E] border border-[#2E3548] rounded-xl shadow-2xl z-[100] py-1 divide-y divide-[#2E3548]">
            <div className="px-3 py-1.5 text-[9px] font-black uppercase text-slate-400 tracking-wider">
              Payment Status
            </div>
            <div className="py-1">
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    handleQuickUpdatePaymentStatus(ord.id, opt.label);
                    setActiveMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center justify-between hover:bg-[#252B3B] transition cursor-pointer ${opt.color}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${opt.bg}`} />
                    <span>{opt.label}</span>
                  </div>
                  {current === opt.label && <Check className="w-3.5 h-3.5 text-[#00D68F]" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Inline Order Status Dropdown Helper
  const renderOrderStatusDropdown = (ord: Order) => {
    const current = ord.status || 'New';
    const isOpen = activeMenu?.id === ord.id && activeMenu?.type === 'status';

    const getStyle = (status: Order['status']) => {
      switch (status) {
        case 'New':
          return 'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30';
        case 'Preparing':
          return 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30';
        case 'Ready':
          return 'bg-purple-500/20 text-purple-400 border-purple-500/40 hover:bg-purple-500/30';
        case 'In delivery':
          return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30';
        case 'Completed':
          return 'bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40 hover:bg-[#00D68F]/30';
        case 'Cancelled':
          return 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30';
        case 'Processing reverse':
          return 'bg-orange-500/20 text-orange-400 border-orange-500/40 hover:bg-orange-500/30';
        case 'Partially Reversed':
          return 'bg-pink-500/20 text-pink-400 border-pink-500/40 hover:bg-pink-500/30';
        case 'Reversed':
          return 'bg-slate-500/20 text-slate-300 border-slate-500/40 hover:bg-slate-500/30';
        default:
          return 'bg-blue-500/20 text-blue-400 border-blue-500/40 hover:bg-blue-500/30';
      }
    };

    return (
      <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setActiveMenu(isOpen ? null : { id: ord.id, type: 'status' })}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border transition cursor-pointer inline-flex items-center gap-1.5 shadow-md ${getStyle(current)}`}
        >
          <span>{current}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-1.5 w-44 bg-[#1D212E] border border-[#2E3548] rounded-xl shadow-2xl z-[100] py-1 divide-y divide-[#2E3548]">
            <div className="px-3 py-1.5 text-[9px] font-black uppercase text-slate-400 tracking-wider">
              Order Status
            </div>
            <div className="py-1">
              {ORDER_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    handleQuickUpdateStatus(ord.id, opt.label);
                    setActiveMenu(null);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-bold flex items-center justify-between hover:bg-[#252B3B] transition cursor-pointer ${opt.color}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${opt.bg}`} />
                    <span>{opt.label}</span>
                  </div>
                  {current === opt.label && <Check className="w-3.5 h-3.5 text-[#00D68F]" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedOrders = useMemo(() => {
    return orders.filter(o => selectedOrderIds.includes(o.id));
  }, [orders, selectedOrderIds]);

  return (
    <div className="space-y-6 relative">
      {/* Click outside backdrop overlay for inline status dropdowns */}
      {activeMenu && (
        <div
          className="fixed inset-0 z-[40] bg-transparent"
          onClick={() => setActiveMenu(null)}
        />
      )}
      {/* 1. Header & Orders Sub-menu */}
      <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-[#00D68F] uppercase bg-[#00D68F]/10 px-2.5 py-0.5 rounded border border-[#00D68F]/20">
              Orders Management
            </span>
          </div>
          <h1 className="text-2xl font-black text-white">Store Orders & Fulfillment</h1>
        </div>

        {/* Create Order Button */}
        <button
          onClick={() => setIsManualModalOpen(true)}
          className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#00D68F]/20 transition"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Create Order (+)</span>
        </button>
      </div>

      {/* Orders Sub-menu Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2E3548] pb-3">
        <button
          onClick={() => setSubMenu('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
            subMenu === 'all'
              ? 'bg-[#00D68F] text-slate-950 shadow-md'
              : 'bg-[#202533] text-slate-300 border border-[#2E3548] hover:border-slate-500'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>All orders</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-950/20">{orders.length}</span>
        </button>

        <button
          onClick={() => setSubMenu('manual')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
            subMenu === 'manual'
              ? 'bg-[#00D68F] text-slate-950 shadow-md'
              : 'bg-[#202533] text-slate-300 border border-[#2E3548] hover:border-slate-500'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Manual orders</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-950/20">
            {orders.filter(o => o.source === 'Manual' || o.source === 'POS').length}
          </span>
        </button>

        <button
          onClick={() => setSubMenu('abandoned')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
            subMenu === 'abandoned'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-[#202533] text-slate-300 border border-[#2E3548] hover:border-slate-500'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          <span>Abandoned carts</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-slate-950/20">0</span>
        </button>
      </div>

      {subMenu !== 'abandoned' ? (
        <>
          {/* 2. Status Tabs Horizontal Scrollable Bar */}
          <div className="bg-[#202533] border border-[#2E3548] p-2 rounded-2xl overflow-x-auto scrollbar-thin">
            <div className="flex items-center gap-1.5 min-w-max">
              {STATUS_TABS.map((tab) => {
                const count = statusCounts[tab] || 0;
                const isActive = statusTab === tab;
                return (
                  <button
                    key={tab}
                    onClick={() => setStatusTab(tab)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-[#00D68F] text-slate-950 font-extrabold shadow-sm'
                        : 'text-slate-300 hover:bg-[#181B26] hover:text-white'
                    }`}
                  >
                    <span>{tab}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-slate-950/20 text-slate-950' : 'bg-[#181B26] text-slate-400 border border-[#2E3548]'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Top Controls Bar (Search, Filter, Sort, Export, Create) */}
          <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Order #, Customer Name, Phone, Address or Item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-[#00D68F] focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Controls Right */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filter Button */}
              <button
                onClick={() => setIsFilterModalOpen(!isFilterModalOpen)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 cursor-pointer ${
                  (filterSource !== 'All' || filterPlatform !== 'All' || filterPaymentMethod !== 'All' || filterPaymentStatus !== 'All' || filterCourier !== 'All')
                    ? 'bg-[#00D68F]/15 text-[#00D68F] border-[#00D68F]/40'
                    : 'bg-[#181B26] text-slate-300 border-[#2E3548] hover:border-slate-500'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filter</span>
                {(filterSource !== 'All' || filterPlatform !== 'All' || filterPaymentMethod !== 'All' || filterPaymentStatus !== 'All' || filterCourier !== 'All') && (
                  <span className="w-2 h-2 rounded-full bg-[#00D68F]" />
                )}
              </button>

              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-[#181B26] text-slate-300 border border-[#2E3548] rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#00D68F] cursor-pointer appearance-none pr-8"
                >
                  <option value="newest">Sort: Newest First</option>
                  <option value="oldest">Sort: Oldest First</option>
                  <option value="amount_high">Sort: Amount (High to Low)</option>
                  <option value="amount_low">Sort: Amount (Low to High)</option>
                </select>
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Export Orders Button */}
              <button
                onClick={() => handleExportCSV(filteredOrders)}
                className="bg-[#181B26] hover:bg-[#252B3B] text-slate-300 border border-[#2E3548] hover:border-slate-500 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export orders</span>
              </button>
            </div>
          </div>

          {/* Active Filters Bar */}
          {(filterSource !== 'All' || filterPlatform !== 'All' || filterPaymentMethod !== 'All' || filterPaymentStatus !== 'All' || filterCourier !== 'All') && (
            <div className="bg-[#181B26] border border-[#2E3548] px-4 py-2 rounded-xl flex items-center justify-between text-xs text-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-semibold">Active Filters:</span>
                {filterSource !== 'All' && <span className="bg-[#202533] px-2 py-0.5 rounded text-[11px] font-bold border border-[#2E3548]">Source: {filterSource}</span>}
                {filterPlatform !== 'All' && <span className="bg-[#202533] px-2 py-0.5 rounded text-[11px] font-bold border border-[#2E3548]">Platform: {filterPlatform}</span>}
                {filterPaymentMethod !== 'All' && <span className="bg-[#202533] px-2 py-0.5 rounded text-[11px] font-bold border border-[#2E3548]">Payment: {filterPaymentMethod}</span>}
                {filterPaymentStatus !== 'All' && <span className="bg-[#202533] px-2 py-0.5 rounded text-[11px] font-bold border border-[#2E3548]">Pay Status: {filterPaymentStatus}</span>}
                {filterCourier !== 'All' && <span className="bg-[#202533] px-2 py-0.5 rounded text-[11px] font-bold border border-[#2E3548]">Courier: {filterCourier}</span>}
              </div>

              <button
                onClick={() => {
                  setFilterSource('All');
                  setFilterPlatform('All');
                  setFilterPaymentMethod('All');
                  setFilterPaymentStatus('All');
                  setFilterCourier('All');
                }}
                className="text-xs text-rose-400 hover:underline font-bold cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          )}

          {/* Bulk Selection Sticky Toolbar with Zid Actions Dropdown */}
          {selectedOrderIds.length > 0 && (
            <div className="bg-[#00D68F]/10 border border-[#00D68F]/40 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2 text-xs text-white font-bold">
                <PackageCheck className="w-4 h-4 text-[#00D68F]" />
                <span>{selectedOrderIds.length} Orders Selected</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Actions Dropdown Button */}
                <div className="relative inline-block text-left">
                  <button
                    onClick={() => setIsActionsDropdownOpen(!isActionsDropdownOpen)}
                    className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 cursor-pointer shadow-md transition"
                  >
                    <span>Actions</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isActionsDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isActionsDropdownOpen && (
                    <div
                      className="absolute right-0 mt-2 w-72 bg-[#1D212E] border border-[#2E3548] rounded-xl shadow-2xl z-50 py-1 divide-y divide-[#2E3548] text-xs"
                    >
                      <div className="py-1">
                        <button
                          onClick={() => { setBulkActionModal('change_status'); setIsActionsDropdownOpen(false); }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-[#00D68F]" />
                          <span>Change order status</span>
                        </button>

                        <button
                          onClick={() => { setBulkActionModal('change_payment'); setIsActionsDropdownOpen(false); }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                          <span>Change payment status</span>
                        </button>
                      </div>

                      <div className="py-1">
                        <button
                          onClick={() => { setBulkActionModal('invoices'); setIsActionsDropdownOpen(false); }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <FileText className="w-3.5 h-3.5 text-purple-400" />
                          <span>Show invoices</span>
                        </button>

                        <button
                          onClick={() => { setBulkActionModal('summary'); setIsActionsDropdownOpen(false); }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                          <span>View orders summaries</span>
                        </button>

                        <button
                          onClick={() => { setBulkActionModal('shipping_label'); setIsActionsDropdownOpen(false); }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Printer className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Print shipping label</span>
                        </button>
                      </div>

                      <div className="py-1">
                        <button
                          onClick={() => {
                            handleExportCSV(orders.filter(o => selectedOrderIds.includes(o.id)));
                            setIsActionsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Export selected orders</span>
                        </button>

                        <button
                          onClick={() => {
                            handleExportDetailedCSV(orders.filter(o => selectedOrderIds.includes(o.id)));
                            setIsActionsDropdownOpen(false);
                          }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Export selected (detailed orders report)</span>
                        </button>
                      </div>

                      <div className="py-1">
                        <button
                          onClick={() => { setBulkActionModal('pickup'); setIsActionsDropdownOpen(false); }}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Truck className="w-3.5 h-3.5 text-orange-400" />
                          <span>Schedule a pickup time to collect shipment</span>
                        </button>

                        <button
                          onClick={() => handleDuplicateSelectedOrders()}
                          className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-[#252B3B] hover:text-[#00D68F] font-semibold flex items-center gap-2.5 cursor-pointer transition"
                        >
                          <Copy className="w-3.5 h-3.5 text-pink-400" />
                          <span>Duplicate order</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedOrderIds([])}
                  className="text-xs text-slate-400 hover:text-white underline font-semibold px-2 cursor-pointer"
                >
                  Deselect All
                </button>
              </div>
            </div>
          )}

          {/* 4. Data Table with 11 Specified Columns */}
          <div className="bg-[#202533] border border-[#2E3548] rounded-2xl shadow-lg">
            <div className="overflow-x-auto min-h-[360px] pb-24">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
                  <tr>
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                        onChange={handleSelectAll}
                        className="rounded accent-[#00D68F] cursor-pointer"
                      />
                    </th>
                    <th className="p-3.5">Order Number & Source</th>
                    <th className="p-3.5">Customer</th>
                    <th className="p-3.5">Platform</th>
                    <th className="p-3.5">Payment Method</th>
                    <th className="p-3.5">Shipping Courier</th>
                    <th className="p-3.5">Payment Status</th>
                    <th className="p-3.5">Total Amount</th>
                    <th className="p-3.5">Order Status</th>
                    <th className="p-3.5">Tags & Created Date</th>
                    <th className="p-3.5 text-right">Details</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#2E3548]">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400">
                        <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="font-bold text-white text-sm">No orders found matching your active filters.</p>
                        <p className="text-xs text-slate-500 mt-1">Try clearing search keywords or resetting status tab filters.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((ord) => {
                      const isSelected = selectedOrderIds.includes(ord.id);
                      const isExpanded = expandedOrderIds.includes(ord.id);
                      const sourceName = ord.source || 'Store';
                      const platformName = ord.platform || 'Mobile web';
                      const courierName = ord.courierName || 'Steadfast Courier';

                      return (
                        <React.Fragment key={ord.id}>
                          <tr className={`transition hover:bg-[#252B3B] ${isSelected ? 'bg-[#00D68F]/5' : ''}`}>
                            {/* Checkbox */}
                            <td className="p-3.5 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleSelectRow(ord.id)}
                                className="rounded accent-[#00D68F] cursor-pointer"
                              />
                            </td>

                            {/* Order Number & Source */}
                            <td className="p-3.5">
                              <div className="font-mono font-black text-white text-xs flex items-center gap-1.5">
                                <span>{ord.orderNumber}</span>
                              </div>
                              <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase ${
                                sourceName === 'Store'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : sourceName === 'Manual' || sourceName === 'POS'
                                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              }`}>
                                {sourceName}
                              </span>
                            </td>

                            {/* Customer */}
                            <td className="p-3.5">
                              <div className="font-bold text-white text-xs">{ord.customerName}</div>
                              <div className="text-[11px] text-slate-400 font-mono mt-0.5">{ord.customerPhone}</div>
                              {renderFraudBadge(ord.customerPhone)}
                            </td>

                            {/* Platform */}
                            <td className="p-3.5 text-slate-300">
                              <div className="flex items-center gap-1 text-[11px]">
                                {platformName.includes('Mobile') ? <Smartphone className="w-3 h-3 text-slate-400" /> : <Globe className="w-3 h-3 text-slate-400" />}
                                <span>{platformName}</span>
                              </div>
                            </td>

                            {/* Payment Method */}
                            <td className="p-3.5">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                                <CreditCard className="w-3.5 h-3.5 text-[#00D68F]" />
                                <span>{ord.paymentMethod}</span>
                              </div>
                              {ord.transactionId && (
                                <div className="text-[10px] text-pink-400 font-mono">Trx: {ord.transactionId}</div>
                              )}
                            </td>

                            {/* Shipping Courier */}
                            <td className="p-3.5">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                                <Truck className="w-3.5 h-3.5 text-slate-400" />
                                <span>{courierName}</span>
                              </div>
                              {ord.trackingCode ? (
                                <div className="inline-flex items-center gap-1 text-[10px] text-[#00D68F] font-mono font-bold bg-[#00D68F]/10 border border-[#00D68F]/20 px-1.5 py-0.5 rounded mt-1">
                                  <span>TRK: {ord.trackingCode}</span>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleBooking(ord)}
                                  disabled={isBookingCourier[ord.id]}
                                  className="mt-1.5 flex items-center gap-1 text-[10px] font-bold bg-[#00D68F]/10 text-[#00D68F] hover:bg-[#00D68F] hover:text-slate-950 border border-[#00D68F]/30 px-2 py-0.5 rounded transition cursor-pointer disabled:opacity-50"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>{isBookingCourier[ord.id] ? 'Sending...' : 'Send to Courier'}</span>
                                </button>
                              )}
                            </td>

                            {/* Payment Status Inline Interactive Dropdown */}
                            <td className="p-3.5">
                              {renderPaymentStatusDropdown(ord)}
                            </td>

                            {/* Total Amount */}
                            <td className="p-3.5 font-extrabold text-[#00D68F] text-xs">
                              ৳{ord.totalBDT.toLocaleString()} BDT
                            </td>

                            {/* Order Status Inline Interactive Dropdown */}
                            <td className="p-3.5">
                              {renderOrderStatusDropdown(ord)}
                            </td>

                            {/* Tags & Created Date */}
                            <td className="p-3.5">
                              <div className="flex flex-wrap items-center gap-1 mb-1">
                                {ord.tags && ord.tags.length > 0 ? (
                                  ord.tags.map(t => (
                                    <span key={t} className="text-[9px] font-bold bg-[#181B26] text-slate-300 border border-[#2E3548] px-1.5 py-0.2 rounded">
                                      {t}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-slate-500 italic">No tags</span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">{ord.createdAt}</div>
                            </td>

                            {/* Expand Row Details */}
                            <td className="p-3.5 text-right">
                              <button
                                onClick={() => toggleExpandRow(ord.id)}
                                className="p-1.5 bg-[#181B26] hover:bg-[#282E3F] text-slate-300 hover:text-white rounded-lg border border-[#2E3548] transition cursor-pointer inline-flex items-center gap-1 text-[11px] font-semibold"
                              >
                                <span>{isExpanded ? 'Hide' : 'Expand'}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Row Content Panel */}
                          {isExpanded && (
                            <tr className="bg-[#181B26]/80 border-b border-[#2E3548]">
                              <td colSpan={11} className="p-4">
                                <div className="bg-[#202533] border border-[#2E3548] rounded-xl p-4 space-y-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2E3548] pb-3">
                                    <div className="flex items-center gap-3">
                                      <span className="text-xs font-mono font-bold text-[#00D68F] bg-[#00D68F]/10 px-2.5 py-1 rounded border border-[#00D68F]/20">
                                        Order Details: {ord.orderNumber}
                                      </span>
                                      <span className="text-xs text-slate-400">Created {ord.createdAt}</span>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleBooking(ord)}
                                        disabled={isBookingCourier[ord.id]}
                                        className="bg-[#00D68F] text-slate-950 hover:bg-[#00E699] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                      >
                                        <Send className="w-3.5 h-3.5" />
                                        <span>{isBookingCourier[ord.id] ? 'Sending...' : 'Send to Courier'}</span>
                                      </button>

                                      <a
                                        href={`https://wa.me/${ord.customerPhone.replace(/[^0-9]/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-emerald-600/30"
                                      >
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        <span>WhatsApp Customer</span>
                                      </a>

                                      <button
                                        onClick={() => setSelectedOrderForCourier(ord)}
                                        className="bg-[#181B26] text-slate-300 border border-[#2E3548] px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:text-white cursor-pointer"
                                      >
                                        <Truck className="w-3.5 h-3.5" />
                                        <span>Courier Dispatch</span>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    {/* Items List */}
                                    <div className="lg:col-span-2 space-y-2">
                                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Purchased Items ({ord.items.length})</h4>
                                      <div className="space-y-2">
                                        {ord.items.map((it) => (
                                          <div key={it.id} className="flex items-center gap-3 bg-[#181B26] p-2.5 rounded-xl border border-[#2E3548]">
                                            <img src={it.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'} alt={it.productName} className="w-12 h-12 rounded-lg object-cover" />
                                            <div className="flex-1 min-w-0">
                                              <div className="font-bold text-white text-xs truncate">{it.productName}</div>
                                              <div className="text-[11px] text-slate-400">Variant: {it.variant}</div>
                                            </div>
                                            <div className="text-right">
                                              <div className="font-mono text-xs text-[#00D68F] font-bold">৳{it.unitPriceBDT.toLocaleString()} x {it.quantity}</div>
                                              <div className="text-[11px] text-slate-300 font-bold">Subtotal: ৳{(it.unitPriceBDT * it.quantity).toLocaleString()} BDT</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Customer & Shipping Info + Tag Editor */}
                                    <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548] space-y-3 text-xs">
                                      <div>
                                        <div className="text-slate-400 text-[10px] font-bold uppercase mb-1">Customer & Address</div>
                                        <div className="font-bold text-white">{ord.customerName}</div>
                                        <div className="text-slate-300">{ord.customerPhone}</div>
                                        <div className="text-slate-400 text-[11px] mt-1">{ord.address}, {ord.customerCity} ({ord.deliveryZone})</div>
                                      </div>

                                      <div className="border-t border-[#2E3548] pt-2">
                                        {/* Steadfast Delivery Reliability Report */}
                                       {fraudCheckCache[ord.customerPhone.replace(/[^0-9]/g, '')] && (
                                         <div className="border-t border-[#2E3548] pt-2 space-y-1.5">
                                           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                                             <span className="flex items-center gap-1">
                                               <ShieldCheck className="w-3.5 h-3.5 text-[#00D68F]" />
                                               Steadfast Reliability Report
                                             </span>
                                           </div>
                                           {(() => {
                                             const fc = fraudCheckCache[ord.customerPhone.replace(/[^0-9]/g, '')];
                                             return (
                                               <div className="bg-[#12141D] p-2 rounded-lg border border-[#2E3548] space-y-1.5 text-[11px]">
                                                 <div className="flex items-center justify-between font-bold">
                                                   <span className="text-slate-400 text-[10px]">Status:</span>
                                                   <span className={fc.risk_level === 'low' ? 'text-emerald-400 font-mono font-extrabold text-[10px]' : fc.risk_level === 'medium' ? 'text-amber-400 font-mono font-extrabold text-[10px]' : 'text-rose-400 font-mono font-extrabold text-[10px]'}>
                                                     {fc.risk_label}
                                                   </span>
                                                 </div>

                                                 <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                   <div
                                                     className={`h-full transition-all duration-500 ${fc.risk_level === 'low' ? 'bg-emerald-500' : fc.risk_level === 'medium' ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                     style={{ width: `${fc.success_rate}%` }}
                                                   />
                                                 </div>

                                                 <div className="grid grid-cols-3 gap-1 text-center text-[9px] pt-1">
                                                   <div className="bg-[#181B26] p-1 rounded border border-[#2E3548]">
                                                     <div className="text-slate-400">Total</div>
                                                     <div className="font-mono font-bold text-white">{fc.total_orders}</div>
                                                   </div>
                                                   <div className="bg-[#181B26] p-1 rounded border border-emerald-500/20">
                                                     <div className="text-emerald-400">Delivered</div>
                                                     <div className="font-mono font-bold text-emerald-400">{fc.total_delivered}</div>
                                                   </div>
                                                   <div className="bg-[#181B26] p-1 rounded border border-rose-500/20">
                                                     <div className="text-rose-400">Returned</div>
                                                     <div className="font-mono font-bold text-rose-400">{fc.total_returned}</div>
                                                   </div>
                                                 </div>
                                               </div>
                                             );
                                           })()}
                                         </div>
                                       )}

                                       <div className="text-slate-400 text-[10px] font-bold uppercase mb-1">Change Order Status</div>
                                        <select
                                          value={ord.status || 'New'}
                                          onChange={(e) => handleQuickUpdateStatus(ord.id, e.target.value as any)}
                                          className="w-full bg-[#202533] text-white border border-[#2E3548] rounded-lg p-1.5 text-xs font-bold cursor-pointer"
                                        >
                                          {STATUS_TABS.filter(s => s !== 'All').map(s => (
                                            <option key={s} value={s}>{s}</option>
                                          ))}
                                        </select>
                                      </div>

                                      <div className="border-t border-[#2E3548] pt-2">
                                        <div className="text-slate-400 text-[10px] font-bold uppercase mb-1">Tags Manager</div>
                                        <div className="flex flex-wrap gap-1 mb-2">
                                          {ord.tags?.map(t => (
                                            <span key={t} className="bg-[#202533] text-slate-200 text-[10px] font-bold px-2 py-0.5 rounded border border-[#2E3548] flex items-center gap-1">
                                              <span>{t}</span>
                                              <X className="w-3 h-3 text-rose-400 cursor-pointer" onClick={() => handleRemoveTag(ord.id, t)} />
                                            </span>
                                          ))}
                                        </div>

                                        <div className="flex items-center gap-1">
                                          <input
                                            type="text"
                                            placeholder="Add tag..."
                                            value={newTagInput[ord.id] || ''}
                                            onChange={(e) => setNewTagInput({ ...newTagInput, [ord.id]: e.target.value })}
                                            className="bg-[#202533] border border-[#2E3548] rounded-lg px-2 py-1 text-xs text-white flex-1"
                                          />
                                          <button
                                            onClick={() => handleAddTag(ord.id)}
                                            className="bg-[#00D68F] text-slate-950 px-2 py-1 rounded-lg font-bold text-xs cursor-pointer"
                                          >
                                            Add
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Abandoned Carts Sub-menu View */
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#2E3548] pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                <span>Abandoned Shopping Carts (Automated Recovery)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Shoppers who entered checkout details but left before completing payment. Send automated WhatsApp discount reminders.
              </p>
            </div>

            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              3 Active Carts
            </span>
          </div>

          <div className="space-y-3">
            {[
              { id: 'AC-991', name: 'Farhana Rahman', phone: '+8801722883344', item: 'Handcrafted Muslin Saree', price: 5650, leftTime: '2 hours ago', stage: 'Left at bKash screen' },
              { id: 'AC-992', name: 'Tanvir Hossain', phone: '+8801811445566', item: 'Jamdani Silk Panjabi', price: 3200, leftTime: '5 hours ago', stage: 'Left at Address step' },
              { id: 'AC-993', name: 'Nabila Chowdhury', phone: '+8801900889900', item: 'Handmade Leather Shoes', price: 4120, leftTime: 'Yesterday', stage: 'Left at COD confirmation' },
            ].map(cart => (
              <div key={cart.id} className="bg-[#181B26] p-4 rounded-xl border border-[#2E3548] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">{cart.id}</span>
                    <span className="text-xs font-bold text-slate-200">{cart.name}</span>
                    <span className="text-[11px] text-slate-400 font-mono">({cart.phone})</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">Item: {cart.item} (৳{cart.price.toLocaleString()} BDT)</p>
                  <p className="text-[11px] text-amber-400 mt-0.5 font-semibold">{cart.stage} • Left {cart.leftTime}</p>
                </div>

                <a
                  href={`https://wa.me/${cart.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi ${cart.name}! You left your ${cart.item} in cart at My Store. Use code 'RECOVER10' for 10% OFF!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shrink-0 shadow-md transition"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Send WhatsApp Recovery Coupon</span>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Action Sub-Modals */}
      {bulkActionModal === 'change_status' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-[#00D68F]" />
                <span>Bulk Change Order Status ({selectedOrderIds.length} orders)</span>
              </h3>
              <button onClick={() => setBulkActionModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-300 font-semibold">Select Target Status:</label>
              <select
                value={bulkTargetStatus}
                onChange={(e) => setBulkTargetStatus(e.target.value as Order['status'])}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold"
              >
                <option value="New">New</option>
                <option value="Preparing">Preparing</option>
                <option value="Ready">Ready</option>
                <option value="In delivery">In delivery</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2E3548] pt-4">
              <button
                onClick={() => setBulkActionModal(null)}
                className="px-4 py-2 bg-[#202533] text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBulkUpdateStatus(bulkTargetStatus)}
                className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer shadow-md"
              >
                Apply Status Change
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkActionModal === 'change_payment' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <span>Bulk Change Payment Status ({selectedOrderIds.length} orders)</span>
              </h3>
              <button onClick={() => setBulkActionModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block text-slate-300 font-semibold">Select Target Payment Status:</label>
              <select
                value={bulkTargetPaymentStatus}
                onChange={(e) => setBulkTargetPaymentStatus(e.target.value as Order['paymentStatus'])}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold"
              >
                <option value="Paid">Paid</option>
                <option value="Partially paid">Partially paid</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Voided">Voided</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2E3548] pt-4">
              <button
                onClick={() => setBulkActionModal(null)}
                className="px-4 py-2 bg-[#202533] text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleBulkUpdatePaymentStatus(bulkTargetPaymentStatus)}
                className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer shadow-md"
              >
                Apply Payment Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices Modal */}
      {bulkActionModal === 'invoices' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 printable-invoice-modal">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3 no-print">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-400" />
                  <span>Selected Orders Tax Invoices ({selectedOrders.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Official printable commercial tax invoice copies for selected orders</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) {
                      alert('Please allow popups for this website to print invoices.');
                      return;
                    }

                    const invoicesHtml = selectedOrders.map(ord => `
                      <div class="invoice-box">
                        <div class="header">
                          <div style="display: flex; align-items: center; gap: 14px;">
                            <div>${generateQRCodeSVG(getOrderToken(ord), 60)}</div>
                            <div>
                              <h2>Zid Store / My Store</h2>
                              <p>GST / BIN: 00399120-BD • Tax Registered Merchant</p>
                              <p>Order Token: <b>${getOrderToken(ord)}</b></p>
                            </div>
                          </div>
                          <div class="right">
                            <span class="tax-badge">TAX INVOICE</span>
                            <p class="order-num">${ord.orderNumber}</p>
                            <p class="date">${ord.createdAt}</p>
                          </div>
                        </div>

                        <div class="meta-box">
                          <div>
                            <span class="label">Billed To Customer:</span>
                            <p class="customer-name">${ord.customerName}</p>
                            <p class="phone">${ord.customerPhone}</p>
                            <p class="address">${ord.address}, ${ord.customerCity}</p>
                          </div>
                          <div class="right">
                            <span class="label">Payment & Delivery:</span>
                            <p>Method: ${ord.paymentMethod}</p>
                            <p class="status">Status: ${ord.paymentStatus}</p>
                            <p>Courier: ${ord.courierName || 'Steadfast'}</p>
                          </div>
                        </div>

                        <table>
                          <thead>
                            <tr>
                              <th>Item Description</th>
                              <th>Variant</th>
                              <th class="center">Qty</th>
                              <th class="right">Unit Price</th>
                              <th class="right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${ord.items.map((it: any) => `
                              <tr>
                                <td><b>${it.productName}</b></td>
                                <td>${it.variant}</td>
                                <td class="center">${it.quantity}</td>
                                <td class="right">৳${it.unitPriceBDT.toLocaleString()}</td>
                                <td class="right"><b>৳${(it.quantity * it.unitPriceBDT).toLocaleString()}</b></td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>

                        <div class="footer">
                          <span class="thank-you">Thank you for shopping with My Store Zid Store!</span>
                          <div class="right">
                            <span class="grand-label">Grand Total BDT:</span>
                            <span class="grand-total">৳${ord.totalBDT.toLocaleString()} BDT</span>
                          </div>
                        </div>
                      </div>
                    `).join('<div class="page-break"></div>');

                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <title>Tax Invoices - Zid Store</title>
                          <style>
                            body {
                              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                              color: #111827;
                              background: #ffffff;
                              margin: 0;
                              padding: 20px;
                            }
                            .invoice-box {
                              background: #ffffff;
                              border: 1px solid #e2e8f0;
                              border-radius: 12px;
                              padding: 24px;
                              margin-bottom: 30px;
                              box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                            }
                            .header {
                              display: flex;
                              justify-content: space-between;
                              align-items: flex-start;
                              border-bottom: 2px solid #0f172a;
                              padding-bottom: 16px;
                              margin-bottom: 16px;
                            }
                            .header h2 {
                              margin: 0 0 4px 0;
                              font-size: 20px;
                              font-weight: 900;
                              text-transform: uppercase;
                            }
                            .header p {
                              margin: 2px 0;
                              font-size: 12px;
                              color: #4b5563;
                            }
                            .right {
                              text-align: right;
                            }
                            .tax-badge {
                              background: #0f172a;
                              color: #ffffff;
                              font-family: monospace;
                              font-size: 11px;
                              font-weight: bold;
                              padding: 4px 8px;
                              border-radius: 6px;
                            }
                            .order-num {
                              font-size: 14px;
                              font-weight: bold;
                              font-family: monospace;
                              margin: 6px 0 2px 0;
                            }
                            .date {
                              font-size: 11px;
                              color: #6b7280;
                              margin: 0;
                            }
                            .meta-box {
                              display: flex;
                              justify-content: space-between;
                              background: #f8fafc;
                              border: 1px solid #e2e8f0;
                              border-radius: 8px;
                              padding: 12px;
                              font-size: 12px;
                              margin-bottom: 16px;
                            }
                            .label {
                              font-size: 10px;
                              font-weight: bold;
                              color: #64748b;
                              text-transform: uppercase;
                              display: block;
                              margin-bottom: 4px;
                            }
                            .customer-name {
                              font-weight: bold;
                              font-size: 13px;
                              margin: 0 0 2px 0;
                            }
                            .phone, .address {
                              margin: 0;
                              color: #475569;
                            }
                            .status {
                              color: #059669;
                              font-weight: bold;
                            }
                            table {
                              width: 100%;
                              border-collapse: collapse;
                              font-size: 12px;
                              margin-bottom: 16px;
                            }
                            th {
                              border-bottom: 2px solid #0f172a;
                              padding: 8px;
                              text-align: left;
                              font-size: 10px;
                              text-transform: uppercase;
                              color: #475569;
                            }
                            td {
                              padding: 10px 8px;
                              border-bottom: 1px solid #e2e8f0;
                            }
                            .center { text-align: center; }
                            .right { text-align: right; }
                            .footer {
                              border-top: 2px solid #0f172a;
                              padding-top: 12px;
                              display: flex;
                              justify-content: space-between;
                              align-items: center;
                              font-size: 12px;
                            }
                            .thank-you {
                              font-style: italic;
                              color: #64748b;
                            }
                            .grand-label {
                              font-weight: bold;
                              color: #64748b;
                              margin-right: 8px;
                            }
                            .grand-total {
                              font-size: 16px;
                              font-weight: 900;
                              font-family: monospace;
                            }
                            .page-break {
                              page-break-after: always;
                              break-after: page;
                            }
                            @media print {
                              body { padding: 0; }
                              .invoice-box { border: none; box-shadow: none; padding: 0; margin-bottom: 40px; }
                            }
                          </style>
                        </head>
                        <body>
                          ${invoicesHtml}
                          <script>
                            window.onload = function() {
                              window.print();
                              setTimeout(function() { window.close(); }, 500);
                            };
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }}
                  className="bg-[#00D68F] text-slate-950 px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Invoices</span>
                </button>
                <button onClick={() => setBulkActionModal(null)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {selectedOrders.map(ord => (
                <div key={ord.id} className="bg-white text-slate-900 rounded-2xl p-6 border border-slate-300 shadow-md space-y-4 invoice-item-box">
                  <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                      <div dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(getOrderToken(ord), 60) }} />
                      <div>
                        <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Zid Store / My Store</h4>
                        <p className="text-xs text-slate-600 font-medium">GST / BIN: 00399120-BD • Tax Registered Merchant</p>
                        <p className="text-xs font-mono font-bold text-slate-700 mt-0.5">Token: {getOrderToken(ord)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 bg-slate-900 text-white font-mono text-xs font-bold rounded-lg uppercase">TAX INVOICE</span>
                      <p className="text-sm font-mono font-bold text-slate-900 mt-1">{ord.orderNumber}</p>
                      <p className="text-xs text-slate-500">{ord.createdAt}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <p className="font-bold text-slate-400 uppercase text-[10px]">Billed To Customer:</p>
                      <p className="font-bold text-slate-900 text-sm">{ord.customerName}</p>
                      <p className="text-slate-600 font-mono">{ord.customerPhone}</p>
                      <p className="text-slate-600">{ord.address}, {ord.customerCity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-400 uppercase text-[10px]">Payment & Delivery:</p>
                      <p className="font-bold text-slate-900">Method: {ord.paymentMethod}</p>
                      <p className="font-bold text-emerald-600">Status: {ord.paymentStatus}</p>
                      <p className="text-slate-600">Courier: {ord.courierName || 'Steadfast'}</p>
                    </div>
                  </div>

                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-900 text-slate-600 font-bold uppercase text-[10px]">
                        <th className="py-2">Item Description</th>
                        <th className="py-2">Variant</th>
                        <th className="py-2 text-center">Qty</th>
                        <th className="py-2 text-right">Unit Price</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-medium">
                      {ord.items.map(it => (
                        <tr key={it.id}>
                          <td className="py-2.5 font-bold text-slate-900">{it.productName}</td>
                          <td className="py-2.5 text-slate-600">{it.variant}</td>
                          <td className="py-2.5 text-center font-mono">{it.quantity}</td>
                          <td className="py-2.5 text-right font-mono">৳{it.unitPriceBDT.toLocaleString()}</td>
                          <td className="py-2.5 text-right font-mono font-bold">৳{(it.quantity * it.unitPriceBDT).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-center text-xs">
                    <span className="text-slate-500 italic">Thank you for shopping with My Store Zid Store!</span>
                    <div className="text-right">
                      <span className="text-slate-500 font-bold mr-2">Grand Total BDT:</span>
                      <span className="text-base font-black text-slate-900 font-mono">৳{ord.totalBDT.toLocaleString()} BDT</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Orders Summaries Modal */}
      {bulkActionModal === 'summary' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                <span>Selected Orders Analytics Summary</span>
              </h3>
              <button onClick={() => setBulkActionModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548]">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Total Selected Orders</p>
                <p className="text-2xl font-black text-white font-mono mt-1">{selectedOrders.length}</p>
              </div>

              <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548]">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Total Revenue (BDT)</p>
                <p className="text-2xl font-black text-[#00D68F] font-mono mt-1">
                  ৳{selectedOrders.reduce((sum, o) => sum + o.totalBDT, 0).toLocaleString()}
                </p>
              </div>

              <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548]">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Average Order Value</p>
                <p className="text-lg font-black text-amber-400 font-mono mt-1">
                  ৳{Math.round(selectedOrders.reduce((sum, o) => sum + o.totalBDT, 0) / (selectedOrders.length || 1)).toLocaleString()} BDT
                </p>
              </div>

              <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548]">
                <p className="text-slate-400 font-bold uppercase text-[10px]">Paid vs Unpaid</p>
                <p className="text-xs font-bold text-white mt-1">
                  <span className="text-[#00D68F]">{selectedOrders.filter(o => o.paymentStatus === 'Paid').length} Paid</span> /{' '}
                  <span className="text-amber-400">{selectedOrders.filter(o => o.paymentStatus !== 'Paid').length} Pending</span>
                </p>
              </div>
            </div>

            <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548] space-y-2 text-xs">
              <p className="text-slate-300 font-bold uppercase text-[10px]">Ordered Items Breakdown:</p>
              <div className="max-h-40 overflow-y-auto divide-y divide-[#2E3548]">
                {Object.entries(
                  selectedOrders.flatMap(o => o.items).reduce((acc, it) => {
                    acc[it.productName] = (acc[it.productName] || 0) + it.quantity;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([name, qty]) => (
                  <div key={name} className="py-1.5 flex justify-between items-center">
                    <span className="text-white font-semibold truncate pr-2">{name}</span>
                    <span className="font-mono text-[#00D68F] font-bold bg-[#202533] px-2 py-0.5 rounded">{qty} pcs</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end border-t border-[#2E3548] pt-3">
              <button
                onClick={() => setBulkActionModal(null)}
                className="px-5 py-2 bg-[#00D68F] text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping Label Modal */}
      {bulkActionModal === 'shipping_label' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 printable-invoice-modal">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3 no-print">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Printer className="w-5 h-5 text-cyan-400" />
                  <span>Print Thermal Shipping Labels ({selectedOrders.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Ready for courier dispatch packaging affixing</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) {
                      alert('Please allow popups for this website to print shipping labels.');
                      return;
                    }

                    const labelsHtml = selectedOrders.map(ord => `
                      <div class="label-box">
                        <div class="header">
                          <span class="courier">${ord.courierName || 'Steadfast Express'}</span>
                          <span class="cod">COD ৳${ord.totalBDT.toLocaleString()} BDT</span>
                        </div>

                        <div class="recipient">
                          <span class="label">Recipient / Delivery Address:</span>
                          <p class="name">${ord.customerName}</p>
                          <p class="phone">${ord.customerPhone}</p>
                          <p class="address">${ord.address}, ${ord.customerCity} (${ord.deliveryZone})</p>
                        </div>

                        <div class="barcode-box" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                          <div style="text-align: left; flex: 1;">
                            <div class="barcode" style="font-size: 16px;">|||||| |||||||| |||||||</div>
                            <p class="tracking">${ord.trackingCode || `TRACK-${ord.orderNumber}`}</p>
                          </div>
                          <div style="text-align: center;">
                            ${generateQRCodeSVG(getOrderToken(ord), 52)}
                            <p style="font-family: monospace; font-size: 8px; font-weight: bold; margin: 2px 0 0 0;">${getOrderToken(ord)}</p>
                          </div>
                        </div>

                        <div class="footer">
                          <span>Sender: Zid My Store Store</span>
                          <span>Order: ${ord.orderNumber}</span>
                        </div>
                      </div>
                    `).join('<div class="page-break"></div>');

                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <title>Thermal Shipping Labels - Zid Store</title>
                          <style>
                            body {
                              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                              background: #ffffff;
                              color: #0f172a;
                              margin: 0;
                              padding: 20px;
                            }
                            .label-box {
                              width: 100%;
                              max-width: 400px;
                              border: 2px solid #000000;
                              border-radius: 12px;
                              padding: 16px;
                              margin: 0 auto 24px auto;
                              background: #ffffff;
                              box-sizing: border-box;
                            }
                            .header {
                              display: flex;
                              justify-content: space-between;
                              align-items: center;
                              border-bottom: 2px solid #000000;
                              padding-bottom: 8px;
                              margin-bottom: 12px;
                            }
                            .courier {
                              font-weight: 900;
                              font-size: 14px;
                              text-transform: uppercase;
                            }
                            .cod {
                              font-family: monospace;
                              font-weight: bold;
                              font-size: 11px;
                              background: #000000;
                              color: #ffffff;
                              padding: 3px 6px;
                              border-radius: 4px;
                            }
                            .recipient {
                              font-size: 12px;
                              margin-bottom: 12px;
                            }
                            .label {
                              font-size: 9px;
                              font-weight: bold;
                              text-transform: uppercase;
                              color: #4b5563;
                              display: block;
                              margin-bottom: 2px;
                            }
                            .name {
                              font-weight: 900;
                              font-size: 14px;
                              margin: 0 0 2px 0;
                            }
                            .phone {
                              font-family: monospace;
                              font-weight: bold;
                              margin: 0 0 2px 0;
                            }
                            .address {
                              margin: 0;
                              color: #334155;
                            }
                            .barcode-box {
                              background: #f1f5f9;
                              border: 1px solid #cbd5e1;
                              border-radius: 6px;
                              padding: 10px;
                              text-align: center;
                              margin-bottom: 12px;
                            }
                            .barcode {
                              font-family: monospace;
                              font-size: 22px;
                              letter-spacing: 3px;
                              font-weight: 900;
                            }
                            .tracking {
                              font-family: monospace;
                              font-size: 10px;
                              font-weight: bold;
                              margin: 4px 0 0 0;
                            }
                            .footer {
                              display: flex;
                              justify-content: space-between;
                              font-size: 9px;
                              font-weight: bold;
                              color: #475569;
                              border-top: 1px solid #cbd5e1;
                              padding-top: 8px;
                            }
                            .page-break {
                              page-break-after: always;
                              break-after: page;
                            }
                            @media print {
                              body { padding: 0; }
                              .label-box { border: 2px solid #000; box-shadow: none; margin-bottom: 30px; }
                            }
                          </style>
                        </head>
                        <body>
                          ${labelsHtml}
                          <script>
                            window.onload = function() {
                              window.print();
                              setTimeout(function() { window.close(); }, 500);
                            };
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }}
                  className="bg-[#00D68F] text-slate-950 px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Labels</span>
                </button>
                <button onClick={() => setBulkActionModal(null)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedOrders.map(ord => (
                <div key={ord.id} className="bg-white text-slate-900 rounded-xl p-4 border-2 border-slate-900 font-sans space-y-3 invoice-item-box">
                  <div className="flex justify-between items-center border-b-2 border-slate-900 pb-2">
                    <span className="font-black text-sm uppercase tracking-wider">{ord.courierName || 'Steadfast Express'}</span>
                    <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                      COD ৳{ord.totalBDT.toLocaleString()} BDT
                    </span>
                  </div>

                  <div className="text-xs space-y-1">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Recipient / Delivery Address:</p>
                    <p className="font-black text-sm text-slate-900">{ord.customerName}</p>
                    <p className="font-mono font-bold text-slate-900">{ord.customerPhone}</p>
                    <p className="text-slate-700 font-medium">{ord.address}, {ord.customerCity} ({ord.deliveryZone})</p>
                  </div>

                  {/* Simulated Barcode & QR Token */}
                  <div className="bg-slate-100 p-2 text-center rounded border border-slate-300 flex items-center justify-between gap-3">
                    <div className="flex-1 text-left">
                      <div className="h-7 bg-slate-900 flex items-center justify-center gap-1 px-2">
                        <div className="w-full h-full bg-[repeating-linear-gradient(90deg,#fff,#fff_2px,#000_2px,#000_5px)]"></div>
                      </div>
                      <p className="font-mono text-[10px] font-bold text-slate-800 mt-1">{ord.trackingCode || `TRACK-${ord.orderNumber}`}</p>
                    </div>
                    <div className="text-center">
                      <div dangerouslySetInnerHTML={{ __html: generateQRCodeSVG(getOrderToken(ord), 52) }} />
                      <p className="font-mono text-[9px] font-bold text-slate-900 mt-0.5">{getOrderToken(ord)}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 border-t border-slate-300 pt-1.5">
                    <span>Sender: Zid My Store Store</span>
                    <span>Order: {ord.orderNumber}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pickup Scheduler Modal */}
      {bulkActionModal === 'pickup' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-400" />
                <span>Schedule Pickup Time ({selectedOrderIds.length} orders)</span>
              </h3>
              <button onClick={() => setBulkActionModal(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Courier Partner</label>
                <select
                  value={pickupCourier}
                  onChange={(e) => setPickupCourier(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-bold"
                >
                  <option value="Steadfast Courier">Steadfast Courier (Doorstep Pickup)</option>
                  <option value="Pathao Courier">Pathao Logistics</option>
                  <option value="RedX Logistics">RedX Express</option>
                  <option value="SMSA Courier">SMSA Courier</option>
                  <option value="Paperfly">Paperfly</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Pickup Date</label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Preferred Time Slot</label>
                <select
                  value={pickupSlot}
                  onChange={(e) => setPickupSlot(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-semibold"
                >
                  <option value="10:00 AM - 01:00 PM">Morning (10:00 AM - 01:00 PM)</option>
                  <option value="02:00 PM - 05:00 PM">Afternoon (02:00 PM - 05:00 PM)</option>
                  <option value="06:00 PM - 09:00 PM">Evening (06:00 PM - 09:00 PM)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2E3548] pt-4">
              <button
                onClick={() => setBulkActionModal(null)}
                className="px-4 py-2 bg-[#202533] text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleBulkPickup}
                className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer shadow-md"
              >
                Schedule & Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Modal */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#00D68F]" />
                <span>Filter Store Orders</span>
              </h3>
              <button onClick={() => setIsFilterModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Order Source</label>
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                >
                  <option value="All">All Sources</option>
                  <option value="Store">Store</option>
                  <option value="Manual">Manual</option>
                  <option value="POS">POS</option>
                  <option value="WhatsApp">WhatsApp</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Platform</label>
                <select
                  value={filterPlatform}
                  onChange={(e) => setFilterPlatform(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                >
                  <option value="All">All Platforms</option>
                  <option value="Mobile web">Mobile web</option>
                  <option value="iOS App">iOS App</option>
                  <option value="Android App">Android App</option>
                  <option value="Desktop Web">Desktop Web</option>
                  <option value="POS">POS</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Payment Method</label>
                <select
                  value={filterPaymentMethod}
                  onChange={(e) => setFilterPaymentMethod(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                >
                  <option value="All">All Payment Methods</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="COD">COD</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Payment Status</label>
                <select
                  value={filterPaymentStatus}
                  onChange={(e) => setFilterPaymentStatus(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                >
                  <option value="All">All Statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Partially paid">Partially paid</option>
                  <option value="Unpaid">Unpaid</option>
                  <option value="Voided">Voided</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Shipping Courier</label>
                <select
                  value={filterCourier}
                  onChange={(e) => setFilterCourier(e.target.value)}
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                >
                  <option value="All">All Couriers</option>
                  <option value="Steadfast Courier">Steadfast Courier</option>
                  <option value="SMSA Courier">SMSA Courier</option>
                  <option value="Pathao Courier">Pathao Courier</option>
                  <option value="RedX Logistics">RedX Logistics</option>
                  <option value="Paperfly">Paperfly</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[#2E3548] pt-3">
              <button
                onClick={() => {
                  setFilterSource('All');
                  setFilterPlatform('All');
                  setFilterPaymentMethod('All');
                  setFilterPaymentStatus('All');
                  setFilterCourier('All');
                  setIsFilterModalOpen(false);
                }}
                className="px-4 py-2 bg-[#202533] text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Reset
              </button>
              <button
                onClick={() => setIsFilterModalOpen(false)}
                className="px-5 py-2 bg-[#00D68F] text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Order Creation Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#00D68F]" />
                <span>Create Manual Order (+)</span>
              </h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualOrder} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Customer Full Name *</label>
                <input
                  type="text"
                  required
                  value={manualForm.customerName}
                  onChange={(e) => setManualForm({ ...manualForm, customerName: e.target.value })}
                  placeholder="e.g. Saima Chowdhury"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Customer Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={manualForm.customerPhone}
                    onChange={(e) => setManualForm({ ...manualForm, customerPhone: e.target.value })}
                    placeholder="+8801700112233"
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">City / Division</label>
                  <select
                    value={manualForm.customerCity}
                    onChange={(e) => setManualForm({ ...manualForm, customerCity: e.target.value })}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Dhaka">Dhaka</option>
                    <option value="Chittagong">Chittagong</option>
                    <option value="Sylhet">Sylhet</option>
                    <option value="Rajshahi">Rajshahi</option>
                    <option value="Khulna">Khulna</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Delivery Address *</label>
                <input
                  type="text"
                  required
                  value={manualForm.address}
                  onChange={(e) => setManualForm({ ...manualForm, address: e.target.value })}
                  placeholder="House 14, Road 5, Sector 3, Uttara, Dhaka"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Item Title</label>
                  <input
                    type="text"
                    required
                    value={manualForm.itemTitle}
                    onChange={(e) => setManualForm({ ...manualForm, itemTitle: e.target.value })}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Unit Price (BDT)</label>
                  <input
                    type="number"
                    required
                    value={manualForm.unitPriceBDT}
                    onChange={(e) => setManualForm({ ...manualForm, unitPriceBDT: Number(e.target.value) })}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payment Method</label>
                  <select
                    value={manualForm.paymentMethod}
                    onChange={(e) => setManualForm({ ...manualForm, paymentMethod: e.target.value as any })}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white font-bold"
                  >
                    <option value="COD">COD (Cash on Delivery)</option>
                    <option value="bKash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Courier Partner</label>
                  <select
                    value={manualForm.courierName}
                    onChange={(e) => setManualForm({ ...manualForm, courierName: e.target.value })}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                  >
                    <option value="Steadfast Courier">Steadfast Courier</option>
                    <option value="SMSA Courier">SMSA Courier</option>
                    <option value="Pathao Courier">Pathao Courier</option>
                    <option value="RedX Logistics">RedX Logistics</option>
                    <option value="Paperfly">Paperfly</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-[#2E3548] flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 bg-[#202533] text-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 rounded-xl font-extrabold cursor-pointer"
                >
                  Create Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Courier Dispatch Drawer / Modal */}
      {selectedOrderForCourier && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-lg space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-[#2E3548] pb-3">
              <div>
                <span className="text-xs font-mono font-bold text-[#00D68F]">{selectedOrderForCourier.orderNumber}</span>
                <h3 className="text-base font-bold text-white">{selectedOrderForCourier.customerName}</h3>
              </div>
              <button onClick={() => setSelectedOrderForCourier(null)} className="p-1 text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#181B26] p-3.5 rounded-xl border border-[#2E3548] space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Shipping Address:</span>
                <span className="text-white font-semibold text-right">{selectedOrderForCourier.address}, {selectedOrderForCourier.customerCity}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Total Collectable BDT:</span>
                <span className="font-extrabold text-[#00D68F]">৳{selectedOrderForCourier.totalBDT.toLocaleString()} BDT</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="block text-xs font-bold text-slate-300">Select Logistics Courier API:</label>
              <select
                value={dispatchCourier}
                onChange={(e) => setDispatchCourier(e.target.value)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-white text-xs font-bold"
              >
                <option value="Steadfast Courier">Steadfast Courier (24h Home Delivery)</option>
                <option value="SMSA Courier">SMSA Courier Express</option>
                <option value="Pathao Courier">Pathao Courier (Urban)</option>
                <option value="RedX Logistics">RedX Express (Next Day)</option>
                <option value="Paperfly">Paperfly GO</option>
              </select>

              <button
                onClick={async () => {
                  const targetOrd = selectedOrderForCourier;
                  setSelectedOrderForCourier(null);
                  if (targetOrd) {
                    await handleBooking(targetOrd);
                  }
                }}
                disabled={Boolean(selectedOrderForCourier && isBookingCourier[selectedOrderForCourier.id])}
                className="w-full bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-extrabold py-3 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#00D68F]/20 disabled:opacity-50"
              >
                <Truck className="w-4 h-4" />
                <span>{selectedOrderForCourier && isBookingCourier[selectedOrderForCourier.id] ? 'Booking Courier...' : `1-Click Book via ${dispatchCourier} API`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
