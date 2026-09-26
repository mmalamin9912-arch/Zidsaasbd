import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../../types';
import { readZidStoreData, writeZidStoreData } from '../../lib/storeData';
import { upsertCategoryToSupabase, toSafeBigIntId } from '../../utils/catalogPayload';
import { readAndDownscaleImage } from '../../utils/imageUtils';
import SafeImage from '../SafeImage';
import { 
  FolderTree, 
  Plus, 
  Search, 
  ChevronRight, 
  ChevronDown, 
  MoreVertical, 
  GripVertical,
  Edit2, 
  Trash2, 
  Eye, 
  FolderPlus, 
  ArrowLeft, 
  Upload, 
  Sparkles, 
  Check, 
  X, 
  ExternalLink, 
  Copy, 
  Info, 
  Package, 
  ImageIcon,
  Lock,
  Layers,
  FileText
} from 'lucide-react';

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  imageAltText?: string;
  image?: string;
  coverImage?: string;
  description?: string;
  status: 'published' | 'hidden';
  productCount: number;
  slug: string;
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string;
  noIndex?: boolean;
}

interface CategoriesViewProps {
  products: Product[];
  storeSlug: string;
  onOpenSubscriptionModal?: () => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({ 
  products,
  storeSlug,
  onOpenSubscriptionModal 
}) => {
  // Master Category List with Multi-Level Hierarchy & LocalStorage persistence
  const [categories, setCategories] = useState<CategoryNode[]>(() => {
    const saved = localStorage.getItem(`zid_store_categories_v2:${storeSlug}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        // Fallback
      }
    }
    const storefrontCategories = readZidStoreData(storeSlug).categories;
    return Array.isArray(storefrontCategories) ? storefrontCategories as CategoryNode[] : [];
    return [
      {
        id: 'cat-home',
        parentId: null,
        name: 'Home Appliances',
        imageAltText: 'Home Appliances Category Banner',
        image: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=200&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
        description: 'High-quality kitchen and living room appliances for everyday convenient living.',
        status: 'published',
        productCount: 24,
        slug: 'home-appliances'
      },
      {
        id: 'cat-juicers',
        parentId: 'cat-home',
        name: 'Juicers & Blenders',
        imageAltText: 'Juicers and Blenders Subcategory',
        image: 'https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Smoothie blenders, cold press juicers and food processors.',
        status: 'published',
        productCount: 8,
        slug: 'juicers-blenders'
      },
      {
        id: 'cat-microwaves',
        parentId: 'cat-home',
        name: 'Ovens & Microwaves',
        imageAltText: 'Ovens and Microwaves',
        image: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Convection microwave ovens and baking grills.',
        status: 'published',
        productCount: 5,
        slug: 'ovens-microwaves'
      },
      {
        id: 'cat-fashion',
        parentId: null,
        name: 'Fashion & Apparel',
        imageAltText: 'Fashion and Clothing Category',
        image: 'https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=200&auto=format&fit=crop&q=80',
        coverImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80',
        description: 'Traditional and contemporary Bangladeshi heritage clothing.',
        status: 'published',
        productCount: 42,
        slug: 'fashion-apparel'
      },
      {
        id: 'cat-mens-fashion',
        parentId: 'cat-fashion',
        name: "Man's Fashion",
        imageAltText: "Man's Fashion Collection",
        image: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Panjabis, shirts, formal trousers and traditional waistcoats.',
        status: 'published',
        productCount: 18,
        slug: 'mens-fashion'
      },
      {
        id: 'cat-womens-fashion',
        parentId: 'cat-fashion',
        name: "Women's Fashion",
        imageAltText: "Women's Fashion Collection",
        image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Traditional sarees, salwar kameez sets, and designer lawn dresses.',
        status: 'published',
        productCount: 24,
        slug: 'womens-fashion'
      },
      {
        id: 'cat-jamdani',
        parentId: 'cat-womens-fashion',
        name: 'Jamdani Sarees',
        imageAltText: 'Handloom Jamdani Sarees',
        image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Authentic handcrafted Dhakai Jamdani cotton and silk sarees.',
        status: 'published',
        productCount: 12,
        slug: 'jamdani-sarees'
      },
      {
        id: 'cat-tech',
        parentId: null,
        name: 'Electronics & Gadgets',
        imageAltText: 'Electronics Category',
        image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Mobile accessories, smart wearables, audio headphones.',
        status: 'hidden',
        productCount: 15,
        slug: 'electronics-gadgets'
      },
      {
        id: 'cat-crafts',
        parentId: null,
        name: 'Handicrafts & Decor',
        imageAltText: 'Handicrafts and Home Decor',
        image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=200&auto=format&fit=crop&q=80',
        coverImage: '',
        description: 'Artisanal clay pottery, jute crafts and brass decor.',
        status: 'published',
        productCount: 7,
        slug: 'handicrafts-decor'
      }
    ];
  });

  useEffect(() => {
    const controller = new AbortController();
    const loadCategories = async () => {
      try {
        const response = await fetch(`/api/categories?store_slug=${encodeURIComponent(storeSlug)}`, {
          method: 'GET',
          signal: controller.signal,
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) return;
        const payload = await response.json();
        // A fresh serverless instance legitimately returns an empty list. Keep
        // locally persisted tenant data in that case instead of erasing it.
        if (Array.isArray(payload?.categories)) {
          setCategories((current) => payload.categories.length > 0 || current.length === 0 ? payload.categories : current);
        } else if (Array.isArray(payload)) {
          setCategories((current) => payload.length > 0 || current.length === 0 ? payload : current);
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') console.warn('Category API unavailable; using local tenant data.', error);
      }
    };
    void loadCategories();
    return () => controller.abort();
  }, [storeSlug]);

  // Persist reordered categories sequence to localStorage and direct Supabase upsert
  useEffect(() => {
    try {
      localStorage.setItem(`zid_store_categories_v2:${storeSlug}`, JSON.stringify(categories));
    } catch (error) {
      if (!(error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22))) {
        console.warn('Category local cache could not be written:', error);
      }
    }
    writeZidStoreData({ categories }, storeSlug);
    fetch(`/api/storefront?store_slug=${encodeURIComponent(storeSlug)}`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ patch: { categories } }),
    }).catch(() => undefined);
    fetch(`/api/categories?store_slug=${encodeURIComponent(storeSlug)}`, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }, body: JSON.stringify({ categories }),
    }).catch(() => undefined);

    // Upsert each category directly to Supabase table (best-effort background mirror)
    if (Array.isArray(categories)) {
      for (const cat of categories) {
        try {
          void upsertCategoryToSupabase(cat, storeSlug).catch((err) => {
            console.warn('Background category Supabase upsert non-blocking warning:', err);
          });
        } catch (catSyncErr) {
          console.warn('Category sync skipped (non-blocking):', catSyncErr);
        }
      }
    }
  }, [categories]);

  // Tree View State & Navigation Controls
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({
    'cat-home': true,
    'cat-fashion': true,
    'cat-womens-fashion': true
  });
  const [filterTab, setFilterTab] = useState<'all' | 'published' | 'hidden'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Form View State (List vs Create/Edit)
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingCategory, setEditingCategory] = useState<CategoryNode | null>(null);

  // Form Fields State
  const [formNameEn, setFormNameEn] = useState('');
  const [formAltText, setFormAltText] = useState('');
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formDescriptionEn, setFormDescriptionEn] = useState('');
  const [formImage, setFormImage] = useState<string>('');
  const [formCoverImage, setFormCoverImage] = useState<string>('');
  const [formStatus, setFormStatus] = useState<'published' | 'hidden'>('published');

  // SEO Customization State
  const [formMetaTitle, setFormMetaTitle] = useState('');
  const [formMetaDescription, setFormMetaDescription] = useState('');
  const [formCustomSlug, setFormCustomSlug] = useState('');
  const [formKeywords, setFormKeywords] = useState('');
  const [formNoIndex, setFormNoIndex] = useState(false);

  // Modals & Notifications
  const [deletingCategory, setDeletingCategory] = useState<CategoryNode | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Drag & Drop Reorder State
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);

  // Core Reorder Helper Function
  const reorderCategories = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setCategories(prev => {
      const sourceIdx = prev.findIndex(c => c.id === sourceId);
      const targetIdx = prev.findIndex(c => c.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return prev;

      const copy = [...prev];
      const targetItem = copy[targetIdx];
      const [movedItem] = copy.splice(sourceIdx, 1);

      const updatedMovedItem = {
        ...movedItem,
        parentId: targetItem.parentId
      };

      const newTargetIdx = copy.findIndex(c => c.id === targetId);
      if (newTargetIdx < 0) {
        copy.splice(targetIdx, 0, updatedMovedItem);
      } else {
        copy.splice(newTargetIdx, 0, updatedMovedItem);
      }
      return copy;
    });
  };

  // HTML5 Drag Handlers
  const handleCategoryDragStart = (e: React.DragEvent, id: string) => {
    e.stopPropagation();
    setDraggedCatId(id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    }
  };

  const handleCategoryDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedCatId && draggedCatId !== id && dragOverCatId !== id) {
      setDragOverCatId(id);
    }
  };

  const handleCategoryDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedCatId && targetId && draggedCatId !== targetId) {
      reorderCategories(draggedCatId, targetId);
    }
    setDraggedCatId(null);
    setDragOverCatId(null);
  };

  const handleCategoryDragEnd = () => {
    if (draggedCatId && dragOverCatId && draggedCatId !== dragOverCatId) {
      reorderCategories(draggedCatId, dragOverCatId);
    }
    setDraggedCatId(null);
    setDragOverCatId(null);
  };

  // Touch & Pointer Drag Handlers for Mobile Browsers
  const handleTouchStart = (e: React.TouchEvent | React.PointerEvent, id: string) => {
    setDraggedCatId(id);
  };

  const handleTouchMove = (e: React.TouchEvent | React.PointerEvent) => {
    if (!draggedCatId) return;
    const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.PointerEvent).clientX;
    const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as React.PointerEvent).clientY;
    if (clientX === undefined || clientY === undefined) return;

    const targetEl = document.elementFromPoint(clientX, clientY);
    if (targetEl) {
      const tr = targetEl.closest('tr[data-cat-id]');
      if (tr) {
        const targetId = tr.getAttribute('data-cat-id');
        if (targetId && targetId !== draggedCatId) {
          setDragOverCatId(targetId);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (draggedCatId && dragOverCatId && draggedCatId !== dragOverCatId) {
      reorderCategories(draggedCatId, dragOverCatId);
    }
    setDraggedCatId(null);
    setDragOverCatId(null);
  };

  // Image Upload File Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverImageInputRef = useRef<HTMLInputElement>(null);

  // Tree Collapse/Expand Handler
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Status Switch Toggle
  const handleToggleStatus = (id: string, currentStatus: 'published' | 'hidden') => {
    const nextStatus = currentStatus === 'published' ? 'hidden' : 'published';
    setCategories(prev => prev.map(cat => cat.id === id ? { ...cat, status: nextStatus } : cat));
  };

  // Open Create Form
  const handleOpenCreateForm = (preselectedParentId: string | null = null) => {
    setEditingCategory(null);
    setFormNameEn('');
    setFormAltText('');
    setFormParentId(preselectedParentId);
    setFormDescriptionEn('');
    setFormImage('');
    setFormCoverImage('');
    setFormStatus('published');
    setFormMetaTitle('');
    setFormMetaDescription('');
    setFormCustomSlug('');
    setFormKeywords('');
    setFormNoIndex(false);
    setViewMode('form');
    setActiveMenuId(null);
  };

  // Open Edit Form
  const handleOpenEditForm = (category: CategoryNode) => {
    setEditingCategory(category);
    setFormNameEn(category.name);
    setFormAltText(category.imageAltText || '');
    setFormParentId(category.parentId);
    setFormDescriptionEn(category.description || '');
    setFormImage(category.image || '');
    setFormCoverImage(category.coverImage || '');
    setFormStatus(category.status);
    setFormMetaTitle(category.metaTitle || category.name);
    setFormMetaDescription(category.metaDescription || category.description || '');
    setFormCustomSlug(category.slug || '');
    setFormKeywords(category.keywords || '');
    setFormNoIndex(!!category.noIndex);
    setViewMode('form');
    setActiveMenuId(null);
  };

  // Delete Category Handler
  const handleDeleteCategoryConfirm = async () => {
    if (!deletingCategory) return;
    const catId = deletingCategory.id;
    const cleanSlug = (storeSlug || 'bd').split(':')[0];

    try {
      await fetch(`/api/categories?id=${encodeURIComponent(catId)}&store_slug=${encodeURIComponent(cleanSlug)}`, {
        method: 'DELETE',
      });
    } catch (e) {
      console.warn('Delete category API warning:', e);
    }

    try {
      const { supabase } = await import('../../lib/supabase');
      if (supabase) {
        const safeNumericId = toSafeBigIntId(catId);
        if (safeNumericId !== null) {
          try {
            await supabase.from('categories').update({ parent_id: null }).eq('parent_id', safeNumericId);
          } catch (updateErr) {
            console.warn('Supabase category parent_id reset skipped (non-blocking):', updateErr);
          }
          try {
            await supabase.from('categories').delete().eq('id', safeNumericId);
          } catch (delErr) {
            console.warn('Supabase category direct delete skipped (non-blocking):', delErr);
          }
        }
      }
    } catch (sbErr) {
      console.warn('Supabase category direct delete warning (non-blocking):', sbErr);
    }

    // Remove category and assign children to null parent in UI state immediately
    setCategories(prev => 
      prev
        .filter(c => c.id !== catId)
        .map(c => c.parentId === catId ? { ...c, parentId: null } : c)
    );
    setDeletingCategory(null);
  };

  // Image File Upload Handlers
  //
  // Downscaled at the point of upload: a category cover read straight from the
  // device was several MB of base64, which is what produced the 413 on
  // /api/categories and the 400 from the Supabase mirror.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'image' | 'cover') => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const res = await readAndDownscaleImage(file);
    if (!res) return;
    if (target === 'image') setFormImage(res);
    else setFormCoverImage(res);
  };

  // Auto-generate or Custom Slug
  const activeSlug = formCustomSlug.trim() 
    ? formCustomSlug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') 
    : (formNameEn ? formNameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : 'new-category');
  const categoryPermalink = `https://store.zid.bd/categories/${activeSlug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(categoryPermalink);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Save Category Form Submit
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNameEn.trim()) return;

    if (editingCategory) {
      // Update
      setCategories(prev => prev.map(cat => {
        if (cat.id === editingCategory.id) {
          return {
            ...cat,
            name: formNameEn.trim(),
            imageAltText: formAltText.trim(),
            parentId: formParentId,
            description: formDescriptionEn.trim(),
            image: formImage || cat.image,
            coverImage: formCoverImage,
            status: formStatus,
            slug: activeSlug,
            metaTitle: formMetaTitle.trim() || formNameEn.trim(),
            metaDescription: formMetaDescription.trim() || formDescriptionEn.trim(),
            keywords: formKeywords.trim(),
            noIndex: formNoIndex,
          };
        }
        return cat;
      }));
    } else {
      // Create new
      const newCategory: CategoryNode = {
        id: `cat-${Date.now()}`,
        parentId: formParentId,
        name: formNameEn.trim(),
        imageAltText: formAltText.trim(),
        image: formImage || 'https://images.unsplash.com/photo-1544816155-12df9643f363?w=200&auto=format&fit=crop&q=80',
        coverImage: formCoverImage,
        description: formDescriptionEn.trim(),
        status: formStatus,
        productCount: 0,
        slug: activeSlug,
        metaTitle: formMetaTitle.trim() || formNameEn.trim(),
        metaDescription: formMetaDescription.trim() || formDescriptionEn.trim(),
        keywords: formKeywords.trim(),
        noIndex: formNoIndex,
      };
      setCategories(prev => [newCategory, ...prev]);
    }

    setViewMode('list');
  };

  // Filter Categories by status & search query
  const matchesSearch = (cat: CategoryNode) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return cat.name.toLowerCase().includes(q) || (cat.description && cat.description.toLowerCase().includes(q));
  };

  const matchesStatus = (cat: CategoryNode) => {
    if (filterTab === 'published') return cat.status === 'published';
    if (filterTab === 'hidden') return cat.status === 'hidden';
    return true;
  };

  // Get Children for a Parent
  const getChildren = (parentId: string | null) => {
    return categories.filter(c => c.parentId === parentId && matchesStatus(c) && matchesSearch(c));
  };

  // Recursive Tree Row Renderer
  const renderTreeRows = (parentId: string | null = null, depth: number = 0): React.ReactNode => {
    const nodes = getChildren(parentId);
    if (nodes.length === 0) return null;

    return nodes.map((cat, index) => {
      const children = categories.filter(c => c.parentId === cat.id);
      const hasChildren = children.length > 0;
      const isExpanded = !!expandedIds[cat.id];
      const isLastChild = index === nodes.length - 1;

      return (
        <React.Fragment key={cat.id}>
          <tr 
            data-cat-id={cat.id}
            onDragOver={(e) => handleCategoryDragOver(e, cat.id)}
            onDrop={(e) => handleCategoryDrop(e, cat.id)}
            className={`transition border-b border-[#2E3548]/60 group ${
              draggedCatId === cat.id ? 'opacity-30 bg-[#181B26]' : ''
            } ${
              dragOverCatId === cat.id ? 'bg-[#282E3F] border-t-2 border-t-[#00D68F]' : 'hover:bg-[#252B3B]'
            }`}
          >
            
            {/* 6-Dot Drag Handle on Far Left */}
            <td className="p-3.5 pl-4 w-10 text-center shrink-0">
              <div
                draggable
                onDragStart={(e) => handleCategoryDragStart(e, cat.id)}
                onDragEnd={handleCategoryDragEnd}
                onTouchStart={(e) => handleTouchStart(e, cat.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onPointerDown={(e) => handleTouchStart(e, cat.id)}
                onPointerMove={handleTouchMove}
                onPointerUp={handleTouchEnd}
                style={{ touchAction: 'none' }}
                className="p-1.5 rounded hover:bg-[#2E3548] text-slate-500 hover:text-slate-200 cursor-grab active:cursor-grabbing transition inline-flex items-center justify-center select-none"
                title="Drag handle to reorder category"
              >
                <GripVertical className="w-4 h-4" />
              </div>
            </td>

            {/* Category Name & Hierarchy Tree Column with Tree-line indicators (- |) */}
            <td className="p-3.5">
              <div 
                className="flex items-center gap-2"
                style={{ paddingLeft: `${depth * 20}px` }}
              >
                {/* Nested Tree-line indicator (- |) for sub-categories */}
                {depth > 0 && (
                  <div className="flex items-center text-slate-500 font-mono text-xs select-none shrink-0 mr-1">
                    <span className="text-slate-400 font-bold">
                      {isLastChild ? '└─ ' : '├─ '}
                    </span>
                  </div>
                )}

                {/* Expand / Collapse Button */}
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={() => toggleExpand(cat.id)}
                    className="p-1 hover:bg-[#282E3F] text-slate-400 hover:text-white rounded-md transition cursor-pointer shrink-0"
                    title={isExpanded ? "Collapse subcategories" : "Expand subcategories"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[#00D68F]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                ) : (
                  <span className="w-6 inline-block shrink-0" />
                )}

                {/* Category Thumbnail */}
                <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-[#181B26] border border-[#2E3548] shrink-0">
                  {cat.image ? (
                    <SafeImage src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      <FolderTree className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* Category Name & Depth Tag */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white truncate">{cat.name}</span>
                    {depth === 0 && (
                      <span className="text-[9px] bg-slate-800 text-slate-400 font-extrabold px-1.5 py-0.5 rounded border border-slate-700">
                        ROOT
                      </span>
                    )}
                  </div>
                  {cat.description && (
                    <p className="text-[10px] text-slate-400 truncate max-w-xs">{cat.description}</p>
                  )}
                </div>
              </div>
            </td>

            {/* Product Count Column */}
            <td className="p-3.5 font-extrabold text-xs text-slate-200">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#181B26] border border-[#2E3548] rounded-lg">
                <Package className="w-3.5 h-3.5 text-[#00D68F]" />
                <span>
                  {(() => {
                    const catNameLower = cat.name.toLowerCase();
                    return products.filter(p => {
                      const status = (p.status || 'active').toLowerCase();
                      if (status !== 'active' && status !== 'published') return false;
                      const pCatLower = (p.category || '').toLowerCase();
                      const pCatId = p.categoryId || p.category_id;
                      if (pCatId && cat.id && pCatId === cat.id) return true;
                      if (pCatLower === catNameLower) return true;
                      if (catNameLower === 'home' && (!pCatLower || pCatLower === 'home' || pCatLower === 'general')) return true;
                      return false;
                    }).length;
                  })()} Products
                </span>
              </span>
            </td>

            {/* Status Switch Column - active/inactive green toggle */}
            <td className="p-3.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleStatus(cat.id, cat.status)}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer focus:outline-none ${
                    cat.status === 'published' ? 'bg-[#00D68F]' : 'bg-slate-700'
                  }`}
                  title={`Click to toggle status: currently ${cat.status === 'published' ? 'Active' : 'Inactive'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ${
                      cat.status === 'published' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-xs font-bold ${
                  cat.status === 'published' ? 'text-[#00D68F]' : 'text-slate-400'
                }`}>
                  {cat.status === 'published' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </td>

            {/* Action Menu Column on Far Right (3-dot action menu icon ⋮) */}
            <td className="p-3.5 text-right relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuId(activeMenuId === cat.id ? null : cat.id);
                }}
                className="p-1.5 hover:bg-[#282E3F] text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                title="Category options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Three-Dot Popover Action Menu */}
              {activeMenuId === cat.id && (
                <div 
                  className="absolute right-4 top-10 z-40 bg-[#1D212E] border border-[#2E3548] rounded-xl shadow-2xl py-1.5 w-48 text-left text-xs font-semibold text-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenCreateForm(cat.id)}
                    className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition text-[#00D68F]"
                  >
                    <FolderPlus className="w-4 h-4" />
                    <span>Add subcategory</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditForm(cat)}
                    className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition"
                  >
                    <Edit2 className="w-4 h-4 text-blue-400" />
                    <span>Edit information</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuId(null);
                      alert(`Managing products under category "${cat.name}"`);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition"
                  >
                    <Package className="w-4 h-4 text-purple-400" />
                    <span>Manage products</span>
                  </button>

                  <a
                    href={`https://store.zid.bd/categories/${cat.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setActiveMenuId(null)}
                    className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition"
                  >
                    <Eye className="w-4 h-4 text-amber-400" />
                    <span>Preview in store</span>
                  </a>

                  <div className="h-px bg-[#2E3548] my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setActiveMenuId(null);
                      setDeletingCategory(cat);
                    }}
                    className="w-full px-3.5 py-2 hover:bg-[#282E3F] flex items-center gap-2 text-left cursor-pointer transition text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete category</span>
                  </button>
                </div>
              )}
            </td>
          </tr>

          {/* Render Child Rows Recursively if Parent is Expanded */}
          {hasChildren && isExpanded && renderTreeRows(cat.id, depth + 1)}
        </React.Fragment>
      );
    });
  };

  // Close Popover when clicking outside
  React.useEffect(() => {
    const handleGlobalClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // -------------------------------------------------------------
  // RENDER VIEW MODE 1: CATEGORIES OVERVIEW PAGE
  // -------------------------------------------------------------
  if (viewMode === 'list') {
    return (
      <div className="space-y-6">
        
        {/* Header Bar */}
        <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-[#00D68F]" />
              <span>Categories</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Organize your catalog with structured nested hierarchy, image covers, and custom store permalinks.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCreateForm(null)}
            className="bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>+ Create</span>
          </button>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          
          {/* Filter Tabs: All, Published, Hidden */}
          <div className="flex items-center gap-1 bg-[#181B26] p-1 rounded-xl border border-[#2E3548]">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterTab === 'all'
                  ? 'bg-[#00D68F] text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({categories.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('published')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterTab === 'published'
                  ? 'bg-[#00D68F] text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Published ({categories.filter(c => c.status === 'published').length})
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('hidden')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterTab === 'hidden'
                  ? 'bg-[#00D68F] text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hidden ({categories.filter(c => c.status === 'hidden').length})
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search category by name..."
              className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500 font-semibold"
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
        </div>

        {/* Category Tree Table Card */}
        <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
                <tr>
                  <th className="p-3.5 pl-4 w-10 text-center"></th>
                  <th className="p-3.5">Category name</th>
                  <th className="p-3.5">Product count</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2E3548]">
                {renderTreeRows(null, 0)}

                {/* If no root categories exist or filter returns empty */}
                {getChildren(null).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400 space-y-3">
                      <FolderTree className="w-10 h-10 mx-auto text-slate-600" />
                      <p className="text-sm font-bold">No categories found matching criteria.</p>
                      <button
                        type="button"
                        onClick={() => handleOpenCreateForm(null)}
                        className="px-4 py-2 bg-[#00D68F] text-slate-950 font-bold text-xs rounded-xl hover:bg-[#00E699] transition"
                      >
                        Create First Category
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deletingCategory && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-[#1D212E] border border-[#2E3548] rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
              <div className="flex items-center gap-3 text-red-400">
                <Trash2 className="w-6 h-6 shrink-0" />
                <h3 className="text-base font-bold text-white">Delete Category</h3>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Are you sure you want to delete <span className="font-bold text-white">"{deletingCategory.name}"</span>? Any subcategories under it will be moved to root status.
              </p>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeletingCategory(null)}
                  className="px-4 py-2 bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCategoryConfirm}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition cursor-pointer shadow-lg"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER VIEW MODE 2: CREATE / EDIT CATEGORY FORM
  // -------------------------------------------------------------
  return (
    <form onSubmit={handleSaveCategory} className="space-y-6">
      
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/png, image/jpeg, image/jpg"
        onChange={(e) => handleImageUpload(e, 'image')}
        className="hidden"
      />
      <input
        type="file"
        ref={coverImageInputRef}
        accept="image/png, image/jpeg, image/jpg"
        onChange={(e) => handleImageUpload(e, 'cover')}
        className="hidden"
      />

      {/* Top Bar Navigation */}
      <div className="bg-[#202533] border border-[#2E3548] p-4 sm:p-5 rounded-2xl flex items-center justify-between gap-4 sticky top-0 z-30 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="p-2 text-slate-400 hover:text-white bg-[#181B26] hover:bg-[#282E3F] rounded-xl transition border border-[#2E3548] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{editingCategory ? 'Edit category' : 'Create category'}</span>
              <span className="text-[10px] bg-[#00D68F]/20 text-[#00D68F] font-black px-2 py-0.5 rounded-full border border-[#00D68F]/30 uppercase">
                ZID STORE CATALOG
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Configure category names, parent hierarchy, media covers, and permalinks.
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
            <span>Save Category</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Form Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card 1: Category Name Card */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-[#2E3548] pb-3">
              <FileText className="w-5 h-5 text-[#00D68F]" />
              <h2 className="text-base font-bold text-white">Category Identification</h2>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5">
                Category name (English) *
              </label>
              <input
                type="text"
                required
                value={formNameEn}
                onChange={(e) => setFormNameEn(e.target.value)}
                placeholder="Enter category name"
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Category image description (English)
              </label>
              <input
                type="text"
                value={formAltText}
                onChange={(e) => setFormAltText(e.target.value)}
                placeholder="Alt description for search engines and accessibility"
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Card 2: Image Upload Card (Side-by-side drag zones) */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#00D68F]" />
                <h2 className="text-base font-bold text-white">Category Media Assets</h2>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Formats: PNG, JPG, JPEG</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Dropzone 1: Category Image */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">Category image</label>
                <div 
                  onClick={() => imageInputRef.current?.click()}
                  className="relative group border-2 border-dashed border-[#2E3548] hover:border-[#00D68F] rounded-2xl p-4 bg-[#181B26] flex flex-col items-center justify-center min-h-[160px] text-center transition cursor-pointer"
                >
                  {formImage ? (
                    <>
                      <SafeImage src={formImage} alt="Category Avatar" className="w-full h-32 object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormImage('');
                        }}
                        className="absolute top-3 right-3 p-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded-lg cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2 py-3">
                      <Upload className="w-6 h-6 text-[#00D68F] mx-auto" />
                      <p className="text-xs font-bold text-slate-300">Click or drag image to upload</p>
                      <p className="text-[10px] text-slate-500">Square format 500 x 500 px</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dropzone 2: Category Cover Image */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">Category cover image</label>
                <div 
                  onClick={() => coverImageInputRef.current?.click()}
                  className="relative group border-2 border-dashed border-[#2E3548] hover:border-[#00D68F] rounded-2xl p-4 bg-[#181B26] flex flex-col items-center justify-center min-h-[160px] text-center transition cursor-pointer"
                >
                  {formCoverImage ? (
                    <>
                      <SafeImage src={formCoverImage} alt="Category Cover Banner" className="w-full h-32 object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormCoverImage('');
                        }}
                        className="absolute top-3 right-3 p-1.5 bg-red-600/80 hover:bg-red-700 text-white rounded-lg cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2 py-3">
                      <Upload className="w-6 h-6 text-purple-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-300">Click or drag cover banner</p>
                      <p className="text-[10px] text-slate-500">Wide banner 1200 x 400 px</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Card 3: Main Category Card (Parent Selector & Description) */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-[#2E3548] pb-3">
              <Layers className="w-5 h-5 text-[#00D68F]" />
              <h2 className="text-base font-bold text-white">Hierarchy & Description</h2>
            </div>

            {/* Parent Category Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5">
                Parent category
              </label>
              <select
                value={formParentId || ''}
                onChange={(e) => setFormParentId(e.target.value ? e.target.value : null)}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
              >
                <option value="">None (Top Level Root Category)</option>
                {categories
                  .filter(c => !editingCategory || c.id !== editingCategory.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? `└─ ${c.name}` : `📁 ${c.name}`}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                Assigning a parent places this category inside a dropdown menu on your storefront.
              </p>
            </div>

            {/* Category Description */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5">
                Category description (English)
              </label>
              <textarea
                rows={4}
                value={formDescriptionEn}
                onChange={(e) => setFormDescriptionEn(e.target.value)}
                placeholder="Enter rich detailed category description for buyers..."
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
              />
            </div>
          </div>

        </div>

        {/* Right Sidebar Column (1 Col) */}
        <div className="space-y-6">
          
          {/* Card 4: Unlocked SEO & Google SERP Optimization Card */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2 text-[#00D68F]">
                <Sparkles className="w-5 h-5 shrink-0" />
                <h3 className="text-sm font-bold text-white">SEO & Search Engine Optimization</h3>
              </div>
              <span className="text-[10px] bg-[#00D68F]/20 text-[#00D68F] font-bold px-2 py-0.5 rounded-full border border-[#00D68F]/30 uppercase">
                100% UNLOCKED
              </span>
            </div>

            {/* Meta Title */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-200">Meta Title</label>
                <span className={`text-[10px] font-mono ${
                  (formMetaTitle || formNameEn).length > 60 ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  {(formMetaTitle || formNameEn).length}/60 chars
                </span>
              </div>
              <input
                type="text"
                value={formMetaTitle}
                onChange={(e) => setFormMetaTitle(e.target.value)}
                placeholder={formNameEn ? `${formNameEn} - Buy Online in Bangladesh` : 'Category SEO Meta Title'}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D68F]"
              />
            </div>

            {/* Meta Description */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-200">Meta Description</label>
                <span className={`text-[10px] font-mono ${
                  (formMetaDescription || formDescriptionEn).length > 160 ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  {(formMetaDescription || formDescriptionEn).length}/160 chars
                </span>
              </div>
              <textarea
                rows={3}
                value={formMetaDescription}
                onChange={(e) => setFormMetaDescription(e.target.value)}
                placeholder={formDescriptionEn || 'Detailed snippet for Google search results...'}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-[#00D68F]"
              />
            </div>

            {/* Custom URL Slug */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">Custom URL Slug</label>
              <input
                type="text"
                value={formCustomSlug}
                onChange={(e) => setFormCustomSlug(e.target.value)}
                placeholder={formNameEn ? formNameEn.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-') : 'category-slug'}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D68F] font-mono"
              />
            </div>

            {/* Meta Keywords */}
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1">Meta Keywords (Comma separated)</label>
              <input
                type="text"
                value={formKeywords}
                onChange={(e) => setFormKeywords(e.target.value)}
                placeholder="e.g. online shopping, Dhaka saree, panjabi 2026"
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-[#00D68F]"
              />
            </div>

            {/* Indexing Checkbox */}
            <div className="pt-2 border-t border-[#2E3548]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!formNoIndex}
                  onChange={(e) => setFormNoIndex(!e.target.checked)}
                  className="rounded border-[#2E3548] bg-[#181B26] text-[#00D68F] focus:ring-0 accent-[#00D68F]"
                />
                <span className="text-xs text-slate-200 font-semibold">
                  Index in Search Engines (Google, Bing)
                </span>
              </label>
            </div>

            {/* Live Google Search Preview Card */}
            <div className="bg-[#181B26] border border-[#2E3548] p-3.5 rounded-xl space-y-1 font-sans">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Google Search Result Preview
              </span>
              <div className="text-[11px] text-emerald-400 truncate font-mono">
                https://store.zid.bd › categories › <span className="font-bold">{activeSlug}</span>
              </div>
              <div className="text-sm font-bold text-blue-400 hover:underline cursor-pointer truncate">
                {formMetaTitle || formNameEn || 'Category Name'} | Dhaka Craft Store
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-2 leading-tight">
                {formMetaDescription || formDescriptionEn || 'Shop the best authentic category items with fast delivery in Dhaka and all over Bangladesh.'}
              </p>
            </div>
          </div>

          {/* Card 5: Create Link Card (Auto Permalink) */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4 text-[#00D68F]" />
                <span>Category Permalink</span>
              </label>
              {copySuccess && (
                <span className="text-[10px] text-[#00D68F] font-bold animate-pulse">Copied!</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={categoryPermalink}
                className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="p-2 bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] rounded-xl transition cursor-pointer border border-[#00D68F]/30"
                title="Copy Permalink"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-400">
              This link directly opens the category filter page on your live storefront.
            </p>
          </div>

          {/* Visibility Status Card */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-3 shadow-xl">
            <h3 className="text-xs font-bold text-white border-b border-[#2E3548] pb-2">
              Visibility Status
            </h3>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-3 bg-[#181B26] border border-[#2E3548] rounded-xl cursor-pointer hover:border-slate-600 transition">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="categoryStatus"
                    checked={formStatus === 'published'}
                    onChange={() => setFormStatus('published')}
                    className="accent-[#00D68F]"
                  />
                  <div>
                    <p className="text-xs font-bold text-white">Published</p>
                    <p className="text-[10px] text-slate-400">Visible on storefront catalog</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-[#00D68F]" />
              </label>

              <label className="flex items-center justify-between p-3 bg-[#181B26] border border-[#2E3548] rounded-xl cursor-pointer hover:border-slate-600 transition">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="categoryStatus"
                    checked={formStatus === 'hidden'}
                    onChange={() => setFormStatus('hidden')}
                    className="accent-slate-500"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-300">Hidden</p>
                    <p className="text-[10px] text-slate-400">Hidden from storefront menus</p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-slate-500" />
              </label>
            </div>
          </div>

        </div>

      </div>

    </form>
  );
};
