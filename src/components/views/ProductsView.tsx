import React, { useState, useEffect } from 'react';
import { Product, ProductSubTab, ProductType, MerchantProfile } from '../../types';
import { buildProductDbPayload, mapApiProduct, postCatalogJson, upsertProductToSupabase } from '../../utils/catalogPayload';
import { resolveActiveStoreSlug } from '../../lib/activeStore';
import {
  Boxes,
  Clock,
  Warehouse,
  History,
  Sliders,
  FileText,
  Layers,
  Plus,
  Search,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Package,
  Ticket,
  FileCode2,
  Lock,
  ChevronRight,
  Sparkles,
  FolderTree
} from 'lucide-react';

import { ProductTypeModal } from '../products/ProductTypeModal';
import { SingleProductForm } from '../products/SingleProductForm';
import { InventoryView } from '../products/InventoryView';
import { PreorderView } from '../products/PreorderView';
import { StockChangesView } from '../products/StockChangesView';
import { FiltersView } from '../products/FiltersView';
import { CustomFieldsView } from '../products/CustomFieldsView';
import { OptionsLibraryView } from '../products/OptionsLibraryView';
import { CategoriesView } from '../products/CategoriesView';

interface ProductsViewProps {
  products: Product[];
  onUpdateProducts: (products: Product[]) => void;
  activeSubTab?: ProductSubTab;
  onSelectSubTab?: (tab: ProductSubTab) => void;
  onOpenSubscriptionModal?: () => void;
  merchant?: MerchantProfile;
  platformSettings?: any;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  products,
  onUpdateProducts,
  activeSubTab = 'all_products',
  onSelectSubTab,
  onOpenSubscriptionModal,
  merchant,
  platformSettings,
}) => {
  // Active merchant's store slug: prop (route/session) > logged-in session > legacy data.
  const activeStoreSlug = resolveActiveStoreSlug((merchant as any)?.storeSlug || (merchant as any)?.store_slug);

  // Local state for product tab, views, search, filter
  const [selectedProductTypeTab, setSelectedProductTypeTab] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'price-desc' | 'price-asc' | 'stock-desc'>('latest');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [toastNotification, setToastNotification] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  // Modals & Forms State
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isFormViewActive, setIsFormViewActive] = useState(false);

  // Sub-navigation bar tabs
  const subNavItems: { id: ProductSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'all_products', label: 'All products', icon: Boxes },
    { id: 'categories', label: 'Categories', icon: FolderTree },
    { id: 'preorder_campaigns', label: 'Preorder campaigns', icon: Clock },
    { id: 'inventory', label: 'Inventory', icon: Warehouse },
    { id: 'stock_changes', label: 'Stock changes', icon: History },
    { id: 'filters', label: 'Filters', icon: Sliders },
    { id: 'custom_fields', label: 'Custom fields', icon: FileText },
    { id: 'options_library', label: 'Options library', icon: Layers },
  ];

  // Product Type Filter Tabs
  const typeFilterTabs = [
    { id: 'all', label: 'All' },
    { id: 'single', label: 'Single product' },
    { id: 'voucher', label: 'Voucher' },
    { id: 'grouped', label: 'Grouped product' },
    { id: 'digital', label: 'Digital files' },
    { id: 'bundle', label: 'Dynamic Bundle' },
  ];

  // 3. Initial Data Fetch: Directly fetch existing items from Supabase products table
  // for the ACTIVE merchant's store_slug on page load
  useEffect(() => {
    let isMounted = true;
    const fetchExistingProducts = async () => {
      // 1. Direct Supabase load scoped to the active store slug
      try {
        const { supabase } = await import('../../lib/supabase');
        if (supabase) {
          const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('store_slug', activeStoreSlug);

          if (error) {
            console.error('[ProductsView] Supabase initial products load error:', error.message);
          } else if (isMounted && Array.isArray(data) && data.length > 0) {
            onUpdateProducts(data.map((p: any) => mapApiProduct(p)));
            return;
          }
        }
      } catch (sbErr) {
        console.error('[ProductsView] Direct Supabase fetch exception:', sbErr);
      }

    };

    fetchExistingProducts();
    return () => {
      isMounted = false;
    };
  }, [activeStoreSlug]);

  // Filter & Sort Products logic
  const filteredProducts = products.filter((p) => {
    // Type Filter
    if (selectedProductTypeTab !== 'all') {
      const pType = p.type || 'single';
      if (pType !== selectedProductTypeTab) return false;
    }

    // Category Filter
    if (filterCategory !== 'all' && p.category !== filterCategory) {
      return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchCat = p.category.toLowerCase().includes(q);
      return matchTitle || matchSku || matchCat;
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === 'price-desc') return b.priceBDT - a.priceBDT;
    if (sortBy === 'price-asc') return a.priceBDT - b.priceBDT;
    if (sortBy === 'stock-desc') return b.stock - a.stock;
    return b.id.localeCompare(a.id); // 'latest'
  });

  const handleSaveProduct = async (savedProduct: Product) => {
    try {
      // 1. Prepare productData and fallback schema payload structure
      const anyProd = savedProduct as any;
      const productData = {
        id: savedProduct.id,
        name: savedProduct.title || anyProd.name || 'Untitled Product',
        title: savedProduct.title || anyProd.name || 'Untitled Product',
        price: Number(savedProduct.priceBDT ?? anyProd.price) || 0,
        stock: Number(savedProduct.stock ?? anyProd.quantity ?? anyProd.stock_quantity) || 0,
        quantity: Number(savedProduct.stock ?? anyProd.quantity ?? anyProd.stock_quantity) || 0,
        category: savedProduct.category || 'General',
        image: savedProduct.image || anyProd.imageUrl || anyProd.image_url || '',
        imageUrl: savedProduct.image || anyProd.imageUrl || anyProd.image_url || '',
        store_slug: activeStoreSlug
      };

      const payload: Record<string, any> = {
        name: productData.name,
        price: Number(productData.price) || 0,
        stock: Number(productData.stock || productData.quantity) || 0,
        stock_quantity: Number(productData.stock || productData.quantity) || 0,
        category: productData.category || 'General',
        image: productData.image || productData.imageUrl || '',
        image_url: productData.image || productData.imageUrl || '',
        store_slug: activeStoreSlug
      };

      // 2. Persist via Express API (MongoDB + file payload)
      let apiErrorMsg: string | null = null;
      try {
        const apiRes = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const apiData = await apiRes.json().catch(() => null);
        if (!apiRes.ok || apiData?.ok === false) {
          apiErrorMsg = apiData?.error || `HTTP ${apiRes.status}`;
        }
      } catch (apiErr: any) {
        apiErrorMsg = apiErr?.message || 'API request failed';
      }

      if (apiErrorMsg) {
        console.warn('[ProductsView] API save warning:', apiErrorMsg);
      }

      // 3. Direct Supabase insert (kept as secondary persistence)
      let supabaseErrorMsg: string | null = null;
      let inserted = false;
      try {
        const { supabase } = await import('../../lib/supabase');
        if (supabase) {
          const { data, error } = await supabase.from('products').insert([payload]).select();
          if (error) {
            console.error('[ProductsView] Supabase insert error:', error.message, error);
            supabaseErrorMsg = error.message;
          } else {
            inserted = true;
            if (data && data[0]) {
              payload.id = (data[0] as any).id;
            }
          }
        }
      } catch (e: any) {
        console.error('[ProductsView] Supabase exception:', e);
        supabaseErrorMsg = e?.message || 'Supabase exception';
      }

      if (supabaseErrorMsg) {
        console.warn('[ProductsView] Supabase persistence notice:', supabaseErrorMsg);
      }

      // 3. Update UI State after persistence
      const updatedProduct = mapApiProduct({
        ...savedProduct,
        ...productData,
        ...payload,
        stock: payload.stock_quantity,
        priceBDT: payload.price,
      });

      const mergedList = products.some(p => p.id === updatedProduct.id)
        ? products.map(p => (p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p))
        : [updatedProduct, ...products];
      onUpdateProducts(mergedList);

      setToastNotification({
        type: 'success',
        message: `Product "${payload.name}" saved successfully!`
      });

      setIsFormViewActive(false);
      setEditingProduct(null);
    } catch (e: any) {
      console.error('[ProductsView] Network save product error:', e);
      setToastNotification({
        type: 'error',
        message: `Error saving product: ${e?.message || 'Unknown error'}`
      });
      alert(`Error saving product: ${e?.message || 'Unknown network error'}`);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('Are you sure you want to delete this product listing?')) {
      const updatedList = products.filter(p => p.id !== id);
      onUpdateProducts(updatedList);
      try {
        const { supabase } = await import('../../lib/supabase');
        if (supabase) {
          await supabase.from('products').delete().eq('id', id);
        }
      } catch (sbErr) {
        console.warn('Supabase product direct delete warning:', sbErr);
      }
    }
  };

  const handleSelectProductTypeFromModal = (type: ProductType) => {
    if (type === 'single') {
      setEditingProduct(null);
      setIsFormViewActive(true);
    }
  };

  const handleSubTabChange = (tab: ProductSubTab) => {
    if (onSelectSubTab) onSelectSubTab(tab);
    setIsFormViewActive(false);
  };

  // If in Create / Edit Single Product Form mode
  if (isFormViewActive) {
    return (
      <SingleProductForm
        initialData={editingProduct}
        onSave={handleSaveProduct}
        onCancel={() => {
          setIsFormViewActive(false);
          setEditingProduct(null);
        }}
        merchant={merchant}
        platformSettings={platformSettings}
        onOpenSubscriptionModal={onOpenSubscriptionModal}
      />
    );
  }

  return (
    <div className="space-y-6">

      {/* Toast / Alert Feedback Banner */}
      {toastNotification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 border shadow-xl animate-in fade-in duration-200 ${
          toastNotification.type === 'error'
            ? 'bg-rose-950/60 border-rose-500/40 text-rose-200'
            : toastNotification.type === 'warning'
            ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
            : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
        }`}>
          <div className="flex items-center gap-2.5 text-xs font-bold">
            {toastNotification.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
            {toastNotification.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />}
            {toastNotification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
            <span>{toastNotification.message}</span>
          </div>
          <button
            onClick={() => setToastNotification(null)}
            className="p-1.5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Sub-navigation Bar under Products */}
      <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none shadow-md">
        {subNavItems.map((sub) => {
          const SubIcon = sub.icon;
          const isActive = activeSubTab === sub.id;

          return (
            <button
              key={sub.id}
              onClick={() => handleSubTabChange(sub.id)}
              className={`
                flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer
                ${isActive
                  ? 'bg-[#00D68F] text-slate-950 shadow-md shadow-[#00D68F]/20'
                  : 'text-slate-300 hover:text-white hover:bg-[#282E3F]'
                }
              `}
            >
              <SubIcon className="w-4 h-4 shrink-0" />
              <span>{sub.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render sub-views if sub-tab is not 'all_products' */}
      {activeSubTab === 'categories' && <CategoriesView products={products} storeSlug={merchant?.storeSlug || 'default'} onOpenSubscriptionModal={onOpenSubscriptionModal} />}
      {activeSubTab === 'inventory' && <InventoryView products={products} onUpdateProducts={onUpdateProducts} />}
      {activeSubTab === 'preorder_campaigns' && <PreorderView products={products} />}
      {activeSubTab === 'stock_changes' && <StockChangesView />}
      {activeSubTab === 'filters' && <FiltersView />}
      {activeSubTab === 'custom_fields' && <CustomFieldsView />}
      {activeSubTab === 'options_library' && <OptionsLibraryView />}

      {/* Primary Products List View ('all_products') */}
      {activeSubTab === 'all_products' && (
        <>
          {/* Header & Product Type Tabs */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Boxes className="w-6 h-6 text-[#00D68F]" />
                  <span>Products Management</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Manage inventory items, pricing, multi-warehouse stock, and storefront visibility.
                </p>
              </div>

              <button
                onClick={() => setIsTypeModalOpen(true)}
                className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-[#00D68F]/20 transition"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>+ Create Product</span>
              </button>
            </div>

            {/* Product Type Tabs */}
            <div className="flex items-center gap-2 border-b border-[#2E3548] overflow-x-auto pb-1 scrollbar-none">
              {typeFilterTabs.map((tab) => {
                const isActive = selectedProductTypeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedProductTypeTab(tab.id)}
                    className={`
                      px-3.5 py-2 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer
                      ${isActive
                        ? 'border-[#00D68F] text-[#00D68F]'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                      }
                    `}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Top Controls: Search, View Toggle, Filter, Sort */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product name, SKU code, or category..."
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#00D68F]"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter Icon Button */}
                <button
                  onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                  className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    filterCategory !== 'all'
                      ? 'bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40'
                      : 'bg-[#181B26] border-[#2E3548] text-slate-300 hover:text-white'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Filter</span>
                </button>

                {/* Sort Dropdown */}
                <div className="relative flex items-center gap-1.5 bg-[#181B26] border border-[#2E3548] rounded-xl px-2.5 py-1.5 text-xs text-slate-300 font-bold">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="latest">Sort: Latest Added</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="stock-desc">Stock: High to Low</option>
                  </select>
                </div>

                {/* View Toggle (List vs Grid) */}
                <div className="bg-[#181B26] border border-[#2E3548] p-1 rounded-xl flex items-center gap-1">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                      viewMode === 'list' ? 'bg-[#00D68F] text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="List View"
                  >
                    <List className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                      viewMode === 'grid' ? 'bg-[#00D68F] text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Filter Panel */}
            {isFilterPanelOpen && (
              <div className="bg-[#181B26] border border-[#2E3548] p-4 rounded-xl flex items-center gap-4 text-xs">
                <span className="font-bold text-slate-300">Filter by Category:</span>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-[#202533] border border-[#2E3548] rounded-lg px-3 py-1.5 text-white font-semibold focus:outline-none focus:border-[#00D68F]"
                >
                  <option value="all">All Categories</option>
                  <option value="Ethnic Wear">Ethnic Wear</option>
                  <option value="Sarees">Sarees</option>
                  <option value="Womenswear">Womenswear</option>
                  <option value="Footwear">Footwear</option>
                  <option value="Home & Crafts">Home & Crafts</option>
                </select>

                {filterCategory !== 'all' && (
                  <button
                    onClick={() => setFilterCategory('all')}
                    className="text-slate-400 hover:text-white text-xs underline"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Data Table View */}
          {viewMode === 'list' && (
            <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
                    <tr>
                      <th className="p-4">Product Details</th>
                      <th className="p-4">SKU Code</th>
                      <th className="p-4">Stock Quantity</th>
                      <th className="p-4">Price (৳ BDT)</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Date</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2E3548]">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                          No products found matching your search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-[#252B3B] transition">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <img
                                src={p.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'}
                                alt={p.title}
                                className="w-12 h-12 object-cover rounded-xl border border-[#3A435E] bg-[#181B26]"
                              />
                              <div>
                                <div className="font-bold text-white text-sm hover:text-[#00D68F] transition cursor-pointer">
                                  {p.title}
                                </div>
                                {p.titleBn && (
                                  <div className="text-[11px] text-emerald-400 font-semibold">
                                    {p.titleBn}
                                  </div>
                                )}
                                {p.titleAr && (
                                  <div className="text-[11px] text-slate-400 font-semibold" dir="rtl">
                                    {p.titleAr}
                                  </div>
                                )}
                                <span className="inline-block mt-0.5 text-[10px] text-slate-400 bg-[#181B26] px-2 py-0.5 rounded border border-[#2E3548]">
                                  {p.category}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-4 font-mono text-slate-300 font-bold">
                            {p.sku}
                          </td>

                          <td className="p-4">
                            {p.stock === 0 ? (
                              <span className="inline-flex items-center gap-1 bg-rose-500/20 text-rose-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-rose-500/30">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Out of stock</span>
                              </span>
                            ) : p.stock < 10 ? (
                              <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-full border border-amber-500/30">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Low stock ({p.stock})</span>
                              </span>
                            ) : (
                              <span className="font-extrabold text-[#00D68F]">
                                {p.stock} pcs
                              </span>
                            )}
                          </td>

                          <td className="p-4 font-black text-white text-sm">
                            ৳{p.priceBDT.toLocaleString()}
                            {p.compareAtPriceBDT && p.compareAtPriceBDT > p.priceBDT && (
                              <div className="text-[10px] text-slate-500 line-through font-normal">
                                ৳{p.compareAtPriceBDT.toLocaleString()}
                              </div>
                            )}
                          </td>

                          <td className="p-4">
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                              p.status === 'Active' || p.status === 'Published'
                                ? 'bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/30'
                                : p.status === 'Draft'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-slate-700/50 text-slate-400 border-slate-600'
                            }`}>
                              {p.status}
                            </span>
                          </td>

                          <td className="p-4 text-slate-400 text-[11px]">
                            {p.createdAt || '2026-02-01'}
                          </td>

                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingProduct(p);
                                  setIsFormViewActive(true);
                                }}
                                className="p-2 text-slate-300 hover:text-[#00D68F] hover:bg-[#181B26] rounded-xl border border-[#2E3548] transition cursor-pointer"
                                title="Edit Product"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDeleteProduct(p.id)}
                                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl border border-[#2E3548] transition cursor-pointer"
                                title="Delete Product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredProducts.map((p) => (
                <div
                  key={p.id}
                  className="bg-[#202533] border border-[#2E3548] hover:border-[#00D68F]/50 rounded-2xl p-4 transition-all space-y-3 group relative shadow-lg"
                >
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-[#181B26]">
                    <img src={p.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />

                    <span className={`absolute top-2 left-2 text-[9px] font-black px-2 py-0.5 rounded-full ${
                      p.status === 'Active' ? 'bg-[#00D68F] text-slate-950' : 'bg-slate-700 text-slate-300'
                    }`}>
                      {p.status}
                    </span>

                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => {
                          setEditingProduct(p);
                          setIsFormViewActive(true);
                        }}
                        className="p-2 bg-[#00D68F] text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-lg"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-2 bg-red-500/90 text-white font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer shadow-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{p.category}</div>
                    <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-[#00D68F] transition">
                      {p.title}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-400">{p.sku}</p>

                    <div className="mt-3 flex items-center justify-between border-t border-[#2E3548] pt-2">
                      <span className="text-base font-black text-[#00D68F]">
                        ৳{p.priceBDT.toLocaleString()}
                      </span>
                      <span className="text-[11px] font-bold text-slate-300">
                        Stock: {p.stock}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </>
      )}

      {/* Product Type Selection Modal */}
      <ProductTypeModal
        isOpen={isTypeModalOpen}
        onClose={() => setIsTypeModalOpen(false)}
        onSelectType={handleSelectProductTypeFromModal}
        onOpenSubscriptionModal={onOpenSubscriptionModal}
        merchant={merchant}
      />

    </div>
  );
};
