import React, { useState, useRef, useEffect } from 'react';
import { Product, WarehouseStock, ProductVariant, MerchantProfile } from '../../types';
import { buildCategoryDbPayload, buildProductDbPayload, newCatalogId, postCatalogJson, toCatalogSlug, upsertCategoryToSupabase } from '../../utils/catalogPayload';
import { buildDeliveryFeeFields } from '../../utils/deliveryCharges';
import { readZidStoreData } from '../../lib/storeData';
import { isProAccessGranted } from '../../lib/subscriptionStatusCache';
import SafeImage from '../SafeImage';
import { generateAiText, aiErrorMessage } from '../../lib/aiService';
import {
  ArrowLeft,
  Upload,
  ImageIcon,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Warehouse,
  Tag,
  Eye,
  Globe,
  Save,
  Check,
  Plus,
  Layers,
  Settings,
  RefreshCw,
  FolderPlus,
  Info,
  ExternalLink,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Calendar,
  Clock,
  FileText,
  Hash,
  CheckSquare,
  SlidersHorizontal,
  Image as LucideImage,
  FileUp,
  X,
  Truck,
  Loader2
} from 'lucide-react';

/**
 * Optimise an image for the storefront and return the URL to persist.
 *
 * WHAT IT ACTUALLY DOES
 * ---------------------
 * An uploaded file arrives as a `data:` URL, which can be several megabytes of
 * base64 embedded in every product document and every storefront response. This
 * downsamples it to a storefront-appropriate size and re-encodes it as WebP (with
 * a JPEG fallback), typically cutting the payload by 80-95% while looking
 * identical at display size.
 *
 * Runs entirely in the browser via canvas, so there is no upload round-trip and
 * no server dependency. It NEVER throws: any failure returns the original image,
 * because losing the merchant's photo would be far worse than saving a large one.
 *
 * A remote http(s) URL is returned untouched — those are already hosted.
 */
async function optimizeImageForStorefront(source: string): Promise<string> {
  if (!source) return source;
  // Only local/canvas-encodable images can be re-encoded.
  if (!/^data:image\//i.test(source) && !/^blob:/i.test(source)) return source;
  if (typeof document === 'undefined') return source;

  const MAX_EDGE = 1200;

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round((img.width || MAX_EDGE) * scale));
        const height = Math.max(1, Math.round((img.height || MAX_EDGE) * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(source);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // WebP first (much smaller at the same visual quality); a browser that
        // cannot encode it falls back to quality-tuned JPEG rather than
        // returning a PNG that could be LARGER than the original.
        let encoded = canvas.toDataURL('image/webp', 0.85);
        if (!encoded.startsWith('data:image/webp')) {
          encoded = canvas.toDataURL('image/jpeg', 0.85);
        }

        // Only accept the result if it is genuinely smaller.
        resolve(encoded && encoded.length < source.length ? encoded : source);
      } catch {
        resolve(source);
      }
    };
    img.onerror = () => resolve(source);
    img.src = source;
  });
}

interface SingleProductFormProps {
  initialData?: Product | null;
  // May be async. The form awaits it only until the DATABASE WRITE resolves;
  // any follow-up work the parent does afterwards (closing a modal, refreshing a
  // list) must not extend the "Saving…" spinner.
  onSave: (product: Product) => void | Promise<unknown>;
  onCancel: () => void;
  merchant?: MerchantProfile;
  platformSettings?: any;
  onOpenSubscriptionModal?: () => void;
  onToast?: (type: 'success' | 'error' | 'warning', message: string) => void;
}

/**
 * How long the Save button may stay in its "Saving…" state before it is forced
 * back to idle. This is a SAFETY NET, not a normal path: it exists so a request
 * that never settles (a dropped connection, a proxy that swallows the response)
 * cannot leave the merchant with a permanently disabled form and no way to
 * retry. Comfortably longer than a healthy round-trip.
 */
const SAVE_SPINNER_WATCHDOG_MS = 5000;

interface CustomizationField {
  id: string;
  type: 'dropdown' | 'multi_select' | 'text' | 'number' | 'date' | 'time' | 'upload_image' | 'upload_file';
  label: string;
  required: boolean;
  options?: string[];
}

interface CustomFieldItem {
  id: string;
  name: string;
  value: string;
}

const PRESET_PRODUCT_IMAGES = [
  {
    name: 'Red Jamdani Saree (Traditional)',
    url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=600&q=80',
    category: 'Sarees'
  },
  {
    name: 'Traditional Clay Pot & Vessels',
    url: 'https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?auto=format&fit=crop&w=600&q=80',
    category: 'Home & Crafts'
  },
  {
    name: 'Organic Jute Tote Bag (Natural)',
    url: 'https://images.unsplash.com/photo-1590736969955-71cb94801759?auto=format&fit=crop&w=600&q=80',
    category: 'Accessories'
  },
  {
    name: 'Brass Handcrafted Flower Vase',
    url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=600&q=80',
    category: 'Home & Crafts'
  },
  {
    name: 'Ethnic Womenswear Kurti Dress',
    url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=600&q=80',
    category: 'Womenswear'
  },
  {
    name: 'Premium Classic Leather Shoes',
    url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=600&q=80',
    category: 'Footwear'
  },
  {
    name: 'Handcrafted Bamboo Storage Basket',
    url: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?auto=format&fit=crop&w=600&q=80',
    category: 'Home & Crafts'
  },
  {
    name: 'Handmade Luxury Leather Wallet',
    url: 'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=600&q=80',
    category: 'Accessories'
  }
];

// Safely parse a number field value without corrupting typed digits.
// A controlled <input type="number"> can duplicate trailing digits when its raw
// string value is stored verbatim each keystroke (e.g. "33" renders as "330").
// Converting to a numeric value avoids that re-render glitch while still
// preserving in-progress states like "33.", "-" or "" so the field stays editable.
const toSafeNumberValue = (raw: string): string | number => {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || /^-?\d*\.$/.test(trimmed)) {
    return raw;
  }
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? raw : numeric;
};
export const SingleProductForm: React.FC<SingleProductFormProps> = ({
  initialData,
  onSave,
  onCancel,
  merchant,
  platformSettings,
  onOpenSubscriptionModal,
  onToast,
}) => {
  // 1. Basic Info State - English & Bengali Names
  const [title, setTitle] = useState(initialData?.title || '');
  const [titleBn, setTitleBn] = useState(initialData?.titleBn || '');

  // 2. Pricing State
  const [priceBDT, setPriceBDT] = useState<string | number>(initialData?.priceBDT ?? '');
  const [costPriceBDT, setCostPriceBDT] = useState<string | number>(initialData?.costPriceBDT ?? '');
  const [compareAtPriceBDT, setCompareAtPriceBDT] = useState<string | number>(initialData?.compareAtPriceBDT ?? '');

  // 3. SKU, Weight & Category State
  //
  // Auto-generated SKUs honour the merchant's configured prefix
  // (Settings -> Orders and products properties), falling back to `SKU-`.
  const skuPrefix = (merchant?.inventoryConfig?.skuPrefix || '').trim() || 'SKU-';
  const generateSku = () => `${skuPrefix}${Math.floor(10000 + Math.random() * 90000)}`;

  const [sku, setSku] = useState(initialData?.sku || '');

  // New products (no saved SKU yet) get an auto-generated prefixed one. Existing
  // products keep theirs. Only runs when the prefix is known, so it never
  // overwrites a SKU the merchant has already typed.
  useEffect(() => {
    if (!initialData?.sku && !sku) setSku(generateSku());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuPrefix]);
  const [weightKg, setWeightKg] = useState<number | string>(initialData?.weightKg ?? '');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb' | 'g'>('kg');
  const [category, setCategory] = useState(initialData?.category || '');
  const [barcode, setBarcode] = useState(initialData?.barcode || '');

  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    const targetSlug = merchant?.storeSlug || merchant?.id || 'default';

    const parseNames = (arr: any[]): string[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map((c: any) => (typeof c === 'string' ? c : c?.name || c?.title || '')).filter(Boolean);
    };

    let collected: string[] = [];

    // 1. Storage Key: zid_store_categories_v2
    const catsV2 = localStorage.getItem(`zid_store_categories_v2:${targetSlug}`);
    if (catsV2) {
      try {
        collected.push(...parseNames(JSON.parse(catsV2)));
      } catch (e) {
        console.error(e);
      }
    }

    // 2. Storage Key: zid_categories_
    const catsOld = localStorage.getItem(`zid_categories_${targetSlug}`);
    if (catsOld) {
      try {
        collected.push(...parseNames(JSON.parse(catsOld)));
      } catch (e) {
        console.error(e);
      }
    }

    // 3. StoreData JSON store
    const storeCats = readZidStoreData(targetSlug)?.categories;
    if (Array.isArray(storeCats)) {
      collected.push(...parseNames(storeCats));
    }

    if (initialData?.category) {
      collected.push(initialData.category);
    }

    const combinedLocal = Array.from(new Set(collected)).filter(Boolean);
    if (isMounted) {
      setCustomCategories(combinedLocal);
    }

    // 4. API Fetch
    const loadCategoriesFromApi = async () => {
      try {
        const res = await fetch(`/api/categories-by-slug/${encodeURIComponent(targetSlug)}`);
        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return;
        const data = await res.json();
        if (isMounted && Array.isArray(data) && data.length > 0) {
          const apiNames = parseNames(data);
          const finalCombined = Array.from(new Set([...apiNames, ...combinedLocal])).filter(Boolean);
          setCustomCategories(finalCombined);
        }
      } catch (err) {
        console.warn('Failed to fetch categories from API, using local data:', err);
      }
    };

    loadCategoriesFromApi();

    return () => {
      isMounted = false;
    };
  }, [merchant?.storeSlug, merchant?.id, initialData?.category]);

  // 4. Images & Media State
  const [image, setImage] = useState(initialData?.image || '');
  const [additionalImages, setAdditionalImages] = useState<string[]>(initialData?.additionalImages || []);
  const [videoUrl, setVideoUrl] = useState(initialData?.videoUrl || initialData?.youtubeUrl || '');

  // Image Selector Modal State
  const [showImageModal, setShowImageModal] = useState<boolean>(false);
  const [imageModalTarget, setImageModalTarget] = useState<'main' | 'additional'>('main');

  // File Input Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // 5. Inventories Stock State
  const [inventories, setInventories] = useState<WarehouseStock[]>(
    initialData?.warehouseStocks && initialData.warehouseStocks.length > 0
      ? initialData.warehouseStocks
      : [
          { id: 'inv-1', name: 'Default Store Location', location: 'Dhaka Main', stock: 0, unlimited: false },
          { id: 'inv-[#2]', name: 'Chittagong Regional Depot', location: 'CTG Branch', stock: 0, unlimited: false }
        ]
  );

  // Accordion Sections Open State
  const [openSection, setOpenSection] = useState<'advanced' | 'variants' | 'customization' | 'seo' | 'custom_fields' | null>('advanced');

  // Advanced Info State
  const [brand, setBrand] = useState(initialData?.brand || '');
  const [shortDescEn, setShortDescEn] = useState(initialData?.descriptionEn ? initialData.descriptionEn.substring(0, 150) : '');
  const [shortDescBn, setShortDescBn] = useState(initialData?.descriptionBn ? initialData.descriptionBn.substring(0, 150) : '');
  const [descriptionEn, setDescriptionEn] = useState(initialData?.descriptionEn || '');
  const [descriptionBn, setDescriptionBn] = useState(initialData?.descriptionBn || '');
  const [taxRatePercent, setTaxRatePercent] = useState<number | string>(initialData?.taxRatePercent ?? 0);
  const [minOrderQuantity, setMinOrderQuantity] = useState<number | string>(1);
  const [maxOrderQuantity, setMaxOrderQuantity] = useState<number | string>(initialData?.maxOrderQuantity ?? 99);
  const [selectedFilter, setSelectedFilter] = useState<string>('New Arrival');

  // Numeric Price Parsers for calculation
  const numSellingPrice = typeof priceBDT === 'number' ? priceBDT : parseFloat(priceBDT) || 0;
  const numCostPrice = typeof costPriceBDT === 'number' ? costPriceBDT : parseFloat(costPriceBDT) || 0;
  const numComparePrice = typeof compareAtPriceBDT === 'number' ? compareAtPriceBDT : parseFloat(compareAtPriceBDT) || 0;

  // Variants & Options State
  const [hasVariants, setHasVariants] = useState<boolean>((initialData?.variantsCount || 0) > 1);
  const [variants, setVariants] = useState<ProductVariant[]>(initialData?.variants || []);
  const [selectedOptionName, setSelectedOptionName] = useState<string>('Color');
  const [customOptionInput, setCustomOptionInput] = useState<string>('');
  const [isCreatingOption, setIsCreatingOption] = useState<boolean>(false);

  // AI States
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isEnhancingImage, setIsEnhancingImage] = useState(false);
  const [aiPricingData, setAiPricingData] = useState<any>(null);

  // Save state. The submit button flips to a spinner on the SAME tick as the
  // click, so the merchant gets instant feedback while the network round-trip
  // runs. `saveState` distinguishes Save Draft from Save & Publish.
  const [saveState, setSaveState] = useState<'idle' | 'draft' | 'publish'>('idle');
  const isSaving = saveState !== 'idle';
  const saveInFlightRef = useRef(false);

  // Unmount safety: the save promise can resolve after the form has already been
  // torn down (the parent closes it on success), which would otherwise be a
  // setState-on-unmounted-component warning.
  const isMountedRef = useRef(true);
  useEffect(() => () => { isMountedRef.current = false; }, []);

  // Starter is still paid, but only an explicitly active/non-trial plan unlocks
  // the PRO-labelled AI tools. This is derived synchronously from the merchant's
  // persisted plan and never starts as an artificial `free_trial` value.
  const isFreeTier = !isProAccessGranted(merchant?.subscriptionPlan, merchant?.subscription_status);

  const generateAiDescription = async () => {
    if (isFreeTier) {
      onOpenSubscriptionModal?.();
      return;
    }

    if (!title && !titleBn) {
      alert('Please enter a product title first.');
      return;
    }

    setIsGeneratingDescription(true);
    try {
      const productInfo = `Title: ${title || titleBn}. Category: ${category}. Short Description: ${shortDescEn || shortDescBn || 'N/A'}`;
      const promptEn = `Generate a catchy, SEO-friendly, professional e-commerce product description for: ${productInfo}. Return the entire response in English only. Focus on quality and benefits.`;
      const promptBn = `Generate a catchy, SEO-friendly, professional e-commerce product description for: ${productInfo}. Return the entire response ONLY in Bengali (বাংলা), using Bengali script. Do not include English prose. Focus on quality and benefits.`;

      // Client helper surfaces explicit errors for missing/invalid API key etc.
      const [resultEn, resultBn] = await Promise.all([
        generateAiText(promptEn, 'You are an expert e-commerce copywriter. Return ONLY the high-quality, persuasive description text, no extra commentary or filler.'),
        generateAiText(promptBn, 'You are an expert Bengali e-commerce copywriter. Return ONLY Bengali (বাংলা) text in Bengali script. Never use English prose.')
      ]);

      // Fail fast with a clear message if the API key is missing/invalid or the
      // service is unreachable — no silent canned-text fallback.
      const failed = [resultEn, resultBn].find(r => !r.ok);
      if (failed) {
        onToast?.('error', aiErrorMessage(failed));
        return;
      }

      if (resultEn.text) setDescriptionEn(resultEn.text);
      if (resultBn.text) setDescriptionBn(resultBn.text);

    } catch (error) {
      console.error('AI Generation Error:', error);
      onToast?.('error', 'Failed to generate AI description. Please try again.');
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  /**
   * "Magic Enhance" — produce an optimised image URL and KEEP it.
   *
   * Previously this only showed an alert, so the merchant believed the image had
   * been optimised while the original data-URL was what got saved. The enhanced
   * URL is now written back into the form's `image` state (and into the colour
   * variant when one is being edited), so whatever is in the field at submit time
   * — i.e. the optimised URL — is what reaches MongoDB.
   */
  const enhanceImageWithAi = async () => {
    if (isFreeTier) {
      onOpenSubscriptionModal?.();
      return;
    }

    if (!image) {
      alert('Please upload an image first.');
      return;
    }

    setIsEnhancingImage(true);
    try {
      const original = image;
      const optimized = await optimizeImageForStorefront(original);

      if (optimized && optimized !== original) {
        // Keep the ORIGINAL too, so the merchant can revert and so the stored
        // record shows what was actually uploaded.
        setImage(optimized);
        if (!aiEnhancedFrom) setAiEnhancedFrom(original);
      }

      alert(
        optimized
          ? 'Magic Enhance: your photo has been optimized for the storefront. The optimized image will be saved with this product.'
          : 'Magic Enhance could not optimize this image. The original will be saved.'
      );
    } finally {
      setIsEnhancingImage(false);
    }
  };

  const suggestPricing = async () => {
    if (isFreeTier) {
      onOpenSubscriptionModal?.();
      return;
    }

    if (!title || !priceBDT) {
      alert('Please enter title and price first.');
      return;
    }

    try {
      const response = await fetch('/api/ai/suggest-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: title,
          currentPrice: priceBDT,
          category: category,
          engagementData: { views: 120, conversions: 5 } // Simulated data
        }),
      });

      const data = await response.json().catch(() => null);
      setAiPricingData({
        suggestedPrice: Number(data?.suggestedPrice || data?.currentPrice || priceBDT) || Number(priceBDT) || 0,
        discountPercentage: Number(data?.discountPercentage) || 0,
        reasoning: data?.reasoning || 'AI pricing is temporarily unavailable; the current price remains unchanged.',
        fallback: true,
      });
    } catch (error) {
      console.warn('AI pricing unavailable; product save is unaffected:', error);
      setAiPricingData({
        suggestedPrice: Number(priceBDT) || 0,
        discountPercentage: 0,
        reasoning: 'AI pricing is temporarily unavailable; the current price remains unchanged.',
        fallback: true,
      });
    }
  };

  // Separate Data Arrays for Each Option Type
  const [colorOptions, setColorOptions] = useState<string[]>(['Red', 'Blue', 'Black', 'White', 'Navy', 'Emerald']);
  const [sizeOptions, setSizeOptions] = useState<string[]>(['S', 'M', 'L', 'XL', 'XXL']);
  const [weightOptions, setWeightOptions] = useState<string[]>(['0.5kg', '1kg', '2kg', '5kg']);
  const [customOptionsMap, setCustomOptionsMap] = useState<Record<string, string[]>>({});

  const [colorImages, setColorImages] = useState<Record<string, string>>(() => {
    return initialData?.colorImages || {};
  });

    const [deliveryRates, setDeliveryRates] = useState<{ zoneName: string; fee: number | string }[]>(() => {
    if (initialData?.deliveryRates && initialData.deliveryRates.length > 0) {
      return initialData.deliveryRates;
    }
    return [
      { zoneName: 'Inside City', fee: '' },
      { zoneName: 'Outside City', fee: '' }
    ];
  });
  const [deliveryValidationError, setDeliveryValidationError] = useState<string>('');
  // General form-level validation message (title / category / price), shown in
  // the header so the error is not only an interrupting alert().
  const [formError, setFormError] = useState<string>('');
  // Set when "Magic Enhance" replaced the uploaded image, so the original is kept
  // for reference and the merchant can tell what was optimised.
  const [aiEnhancedFrom, setAiEnhancedFrom] = useState<string>('');

  const [selectedColorValues, setSelectedColorValues] = useState<string[]>(() => {
    if (initialData?.variants) {
      const colors = new Set<string>();
      initialData.variants.forEach(v => {
        if (v.name.includes(':')) {
          const parts = v.name.split(',');
          parts.forEach(p => {
            if (p.toLowerCase().includes('color:')) {
              colors.add(p.split(':')[1].trim());
            }
          });
        } else {
          ['Red', 'Blue', 'Black', 'White', 'Navy', 'Emerald'].forEach(c => {
            if (v.name.includes(c)) colors.add(c);
          });
        }
      });
      if (colors.size > 0) return Array.from(colors);
    }
    return [];
  });

  const [selectedSizeValues, setSelectedSizeValues] = useState<string[]>(() => {
    if (initialData?.variants) {
      const sizes = new Set<string>();
      initialData.variants.forEach(v => {
        ['S', 'M', 'L', 'XL', 'XXL'].forEach(s => {
          if (v.name.includes(s)) sizes.add(s);
        });
      });
      if (sizes.size > 0) return Array.from(sizes);
    }
    return [];
  });

  const [selectedWeightValues, setSelectedWeightValues] = useState<string[]>(() => {
    if (initialData?.variants) {
      const weights = new Set<string>();
      initialData.variants.forEach(v => {
        ['0.5kg', '1kg', '2kg', '5kg'].forEach(w => {
          if (v.name.includes(w)) weights.add(w);
        });
      });
      if (weights.size > 0) return Array.from(weights);
    }
    return [];
  });

  const [selectedCustomValuesMap, setSelectedCustomValuesMap] = useState<Record<string, string[]>>({});

  const [newOptionInputValue, setNewOptionInputValue] = useState<string>('');

  const currentOptName = isCreatingOption ? customOptionInput : selectedOptionName;

  const getCurrentAvailableValues = () => {
    if (currentOptName === 'Color') return colorOptions;
    if (currentOptName === 'Size') return sizeOptions;
    if (currentOptName === 'Weight') return weightOptions;
    return customOptionsMap[currentOptName] || [];
  };

  const getCurrentSelectedValues = () => {
    if (currentOptName === 'Color') return selectedColorValues;
    if (currentOptName === 'Size') return selectedSizeValues;
    if (currentOptName === 'Weight') return selectedWeightValues;
    return selectedCustomValuesMap[currentOptName] || [];
  };

  const setCurrentSelectedValues = (newVals: string[]) => {
    if (currentOptName === 'Color') setSelectedColorValues(newVals);
    else if (currentOptName === 'Size') setSelectedSizeValues(newVals);
    else if (currentOptName === 'Weight') setSelectedWeightValues(newVals);
    else {
      setSelectedCustomValuesMap(prev => ({ ...prev, [currentOptName]: newVals }));
    }
  };

  const handleSelectAllValues = () => {
    const currentAvail = getCurrentAvailableValues();
    const currentSelected = getCurrentSelectedValues();
    if (currentSelected.length === currentAvail.length) {
      setCurrentSelectedValues([]);
    } else {
      setCurrentSelectedValues([...currentAvail]);
    }
  };

  const handleToggleValue = (val: string) => {
    const currentSelected = getCurrentSelectedValues();
    if (currentSelected.includes(val)) {
      setCurrentSelectedValues(currentSelected.filter(v => v !== val));
    } else {
      setCurrentSelectedValues([...currentSelected, val]);
    }
  };

  const handleAddNewValue = () => {
    if (!newOptionInputValue.trim()) return;
    const val = newOptionInputValue.trim();
    const currentAvail = getCurrentAvailableValues();
    const currentSelected = getCurrentSelectedValues();

    if (!currentAvail.includes(val)) {
      if (currentOptName === 'Color') {
        setColorOptions([...colorOptions, val]);
      } else if (currentOptName === 'Size') {
        setSizeOptions([...sizeOptions, val]);
      } else if (currentOptName === 'Weight') {
        setWeightOptions([...weightOptions, val]);
      } else {
        setCustomOptionsMap(prev => ({
          ...prev,
          [currentOptName]: [...(prev[currentOptName] || []), val]
        }));
      }
    }

    if (!currentSelected.includes(val)) {
      setCurrentSelectedValues([...currentSelected, val]);
    }
    setNewOptionInputValue('');
  };

  const handleConfirmOptionSelection = () => {
    const optName = currentOptName;
    const currentSelected = getCurrentSelectedValues();
    if (!optName || currentSelected.length === 0) return;

    // Generate new variants combinations
    const newVars: ProductVariant[] = currentSelected.map((val, idx) => ({
      id: `v-opt-${Date.now()}-${idx}`,
      name: `${optName}: ${val}`,
      sku: `${sku}-${val.toUpperCase().replace(/\s+/g, '')}`,
      priceBDT: numSellingPrice,
      stock: 0
    }));

    setVariants(newVars);
    setHasVariants(true);
    alert(`Successfully generated ${newVars.length} variants for option "${optName}".`);
  };

  const updateVariantPrice = (id: string, value: string) => {
    const val = value === '' ? 0 : Number(value);
    setVariants(variants.map(v => v.id === id ? { ...v, priceBDT: val } : v));
  };

  const updateVariantStock = (id: string, value: string) => {
    const val = value === '' ? 0 : Number(value);
    setVariants(variants.map(v => v.id === id ? { ...v, stock: val } : v));
  };

  const updateVariantImage = (id: string, imageSrc: string) => {
    setVariants(variants.map(v => {
      if (v.id === id) {
        // If it's a color variant, also save to colorImages for seamless storefront integration
        const parts = v.name.split(':');
        if (parts.length > 1) {
          const colorName = parts[1].trim();
          setColorImages(prev => ({ ...prev, [colorName]: imageSrc }));
        }
        return { ...v, image: imageSrc };
      }
      return v;
    }));
  };

  // Customization Dropdown & Fields State
  const [showAddCustomizationMenu, setShowAddCustomizationMenu] = useState<boolean>(false);
  const [customizationFields, setCustomizationFields] = useState<CustomizationField[]>([]);

  // Custom Fields State
  const [customFields, setCustomFields] = useState<CustomFieldItem[]>([
    { id: 'cf-1', name: 'Fabric Material', value: '100% Pure Jamdani Cotton' },
    { id: 'cf-2', name: 'Origin Region', value: 'Narayanganj, Bangladesh' }
  ]);
  const [newCfName, setNewCfName] = useState('');
  const [newCfValue, setNewCfValue] = useState('');

  // SEO State
  const [seoTitle, setSeoTitle] = useState(initialData?.seoTitle || title || '');
  const [seoDescription, setSeoDescription] = useState(initialData?.seoDescription || descriptionEn);
  const [seoSlug, setSeoSlug] = useState(initialData?.seoSlug || (title ? title.toLowerCase().replace(/\s+/g, '-') : 'product-item'));

  // Right Side Panel Settings
  const [status, setStatus] = useState<'Active' | 'Draft' | 'Out of Stock' | 'Published'>(initialData?.status || 'Active');
  const [templateStyle, setTemplateStyle] = useState<'standard' | 'minimalist' | 'featured' | 'luxury'>(initialData?.templateStyle || 'standard');
  const [requiresShipping, setRequiresShipping] = useState<boolean>(initialData?.requiresShipping !== false);
  const [isTaxExempt, setIsTaxExempt] = useState<boolean>(initialData?.isTaxExempt || false);
  const [hasDiscount, setHasDiscount] = useState<boolean>(initialData?.hasDiscount || numComparePrice > numSellingPrice);

  // Auto-calculated total stock
  const totalStock = inventories.reduce((sum, inv) => sum + (inv.unlimited ? 999 : (Number(inv.stock) || 0)), 0);

  // Calculated Profit Margin
  const profitBDT = numSellingPrice - numCostPrice;
  const marginPercent = numSellingPrice > 0 ? Math.round((profitBDT / numSellingPrice) * 100) : 0;

  // Handlers for Inventory Management
  const handleInventoryStockChange = (id: string, stock: number) => {
    setInventories(inventories.map(inv => inv.id === id ? { ...inv, stock: Math.max(0, stock) } : inv));
  };

  const handleInventoryNameChange = (id: string, name: string) => {
    setInventories(inventories.map(inv => inv.id === id ? { ...inv, name } : inv));
  };

  const handleInventoryUnlimitedToggle = (id: string) => {
    setInventories(inventories.map(inv => inv.id === id ? { ...inv, unlimited: !inv.unlimited } : inv));
  };

  const handleAddInventoryRow = () => {
    setInventories([
      ...inventories,
      {
        id: `inv-${Date.now()}`,
        name: `Warehouse Location ${inventories.length + 1}`,
        stock: 0,
        unlimited: false
      }
    ]);
  };

  const handleRemoveInventoryRow = (id: string) => {
    if (inventories.length <= 1) return;
    setInventories(inventories.filter(inv => inv.id !== id));
  };

  const handleGenerateSku = () => {
    setSku(generateSku());
  };

  // Device File Upload Handlers
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file: File = files[i];
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          if (!image) {
            setImage(result);
          } else {
            setAdditionalImages((prev) => [...prev, result]);
          }
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };



  // Add Customization Field
  const handleAddCustomizationField = (type: CustomizationField['type'], labelText: string) => {
    const newField: CustomizationField = {
      id: `cust-${Date.now()}`,
      type,
      label: labelText,
      required: false,
      options: type === 'dropdown' || type === 'multi_select' ? ['Option 1', 'Option 2'] : undefined
    };
    setCustomizationFields([...customizationFields, newField]);
    setShowAddCustomizationMenu(false);
  };

  // Add Custom Field
  const handleAddCustomField = () => {
    if (!newCfName.trim() || !newCfValue.trim()) return;
    setCustomFields([
      ...customFields,
      { id: `cf-${Date.now()}`, name: newCfName.trim(), value: newCfValue.trim() }
    ]);
    setNewCfName('');
    setNewCfValue('');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saveInFlightRef.current || isSaving) return;

    // ── Validation ──────────────────────────
    // Checked in the order the merchant filled the form, and reported on the
    // field itself rather than only via an alert, so the error is visible next
    // to the input that needs fixing.
    const cleanTitle = title.trim();
    const cleanTitleBn = titleBn.trim();
    if (!cleanTitle && !cleanTitleBn) {
      setFormError('A product title is required.');
      alert('Error: A product title is required.');
      return;
    }

    const cleanCategory = category.trim();
    if (!cleanCategory) {
      setFormError('Please choose or type a category before saving.');
      alert('Error: A category is required.');
      return;
    }

    const priceValue = Number(numSellingPrice);
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setFormError('Selling price must be a number greater than 0.');
      alert('Error: Selling price must be greater than 0 (৳).');
      return;
    }

    // A discount price must actually be a discount, otherwise the storefront
    // shows a crossed-out price that is higher than the real one.
    if (hasDiscount) {
      const compareValue = Number(numComparePrice);
      if (!Number.isFinite(compareValue) || compareValue <= priceValue) {
        setFormError('Compare-at price must be higher than the selling price.');
        alert('Error: The compare-at (original) price must be higher than the selling price.');
        return;
      }
    }

    // Validate delivery rates: MUST enter at least one location name and valid amount (৳)
    const validRates = deliveryRates.filter(r => r.zoneName.trim() !== '' && r.fee !== '' && !isNaN(Number(r.fee)));
    if (validRates.length === 0) {
      setDeliveryValidationError('At least one delivery zone and delivery fee amount (৳) are required.');
      alert('Error: At least one delivery zone and delivery fee amount (৳) are required.');
      return;
    }
    setDeliveryValidationError('');
    setFormError('');

    // Auto-save typed custom category to database API
    if (isCustomCategoryMode && category.trim()) {
      try {
        const newCat = buildCategoryDbPayload({
          id: newCatalogId(),
          name: category.trim(),
          slug: toCatalogSlug(category.trim(), 'category'),
          status: 'published',
          parentId: null,
        }, merchant);
        postCatalogJson('/api/categories', newCat).catch(err => console.error('Error syncing new category to backend:', err));
        void upsertCategoryToSupabase(newCat, merchant?.storeSlug || 'bd');
      } catch (err) {
        console.error('Error auto-saving new category:', err);
      }
    }

    const numericWeight = Number(weightKg) || 0.5;
    let finalWeightKg = numericWeight;
    if (weightUnit === 'g') finalWeightKg = numericWeight / 1000;
    if (weightUnit === 'lb') finalWeightKg = numericWeight * 0.453592;

    const savedProduct: Product = {
      id: initialData?.id || newCatalogId(),
      merchantId: initialData?.merchantId || (merchant?.id ?? merchant?.storeSlug ?? 'default'),
      storeSlug: merchant?.storeSlug || initialData?.storeSlug || '',
      title: cleanTitle || cleanTitleBn,
      titleBn: cleanTitleBn || cleanTitle,
      type: 'single',
      sku,
      barcode,
      category: cleanCategory,
      priceBDT: numSellingPrice,
      costPriceBDT: numCostPrice,
      compareAtPriceBDT: hasDiscount ? numComparePrice : undefined,
      weightKg: Math.round(finalWeightKg * 100) / 100,
      stock: totalStock,
      warehouseStocks: inventories,
      status,
      image: image || '',
      additionalImages,
      youtubeUrl: videoUrl,
      videoUrl: videoUrl,
      variantsCount: hasVariants ? variants.length : 1,
      variants: hasVariants ? variants : [],
      salesCount: initialData?.salesCount || 0,
      createdAt: initialData?.createdAt || new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      descriptionEn,
      descriptionBn,
      brand,
      taxRatePercent: Number(taxRatePercent) || 0,
      maxOrderQuantity: Number(maxOrderQuantity) || 99,
      customizationEnabled: customizationFields.length > 0,
      customizationLabel: customizationFields[0]?.label || 'Custom instructions',
      seoTitle,
      seoDescription,
      seoSlug,
      templateStyle,
      requiresShipping,
      isTaxExempt,
      hasDiscount,
      // Persist the charges in BOTH shapes: the explicit inside/outside pair that
      // the storefront and checkout read directly, and the original zone list
      // (which keeps custom zone names and any extra zones the merchant added).
      deliveryRates: validRates.map(r => ({ zoneName: r.zoneName.trim(), fee: Number(r.fee) })),
      ...buildDeliveryFeeFields(validRates),
      colorImages,
      selectedFilter,
    };

    // The button already shows its spinner (set synchronously by the click
    // handler). The spinner is cleared the MOMENT the database write resolves —
    // not when the parent's follow-up work finishes — so "Saving…" can never
    // outlive a save that has already landed.
    // Close the rapid double-submit window before the request starts.
    saveInFlightRef.current = true;
    setSaveState(status === 'Draft' ? 'draft' : 'publish');
    // Watchdog: a hung/lost request must not leave the form permanently
    // disabled with a spinning button and no way out for the merchant.
    const releaseWatchdog = window.setTimeout(() => {
      if (isMountedRef.current) setSaveState('idle');
    }, SAVE_SPINNER_WATCHDOG_MS);
    try {
      await Promise.resolve(onSave(buildProductDbPayload(savedProduct, merchant) as Product)).catch((err: any) => {
        // The parent owns user-facing error reporting; the form only guarantees
        // that a rejected save still releases the spinner.
        console.error('[SingleProductForm] Save failed:', err);
      });
    } finally {
      saveInFlightRef.current = false;
      window.clearTimeout(releaseWatchdog);
      if (isMountedRef.current) setSaveState('idle');
    }
  };

  // AI Feature Lock Logic
  const isFeatureLocked = (featureKey: 'aiContent' | 'aiWhatsApp' | 'aiBgRemover') => {
    const isProOnly = platformSettings?.[`${featureKey}ProOnly`];
    if (!isProOnly) return false;

    const currentPlan = merchant?.subscriptionPlan || 'free_trial';
    // 'free_trial' and 'starter_3m' are considered "Free/Basic" for this simulation
    const isProPlan = currentPlan !== 'free_trial' && currentPlan !== 'starter_3m';
    return !isProPlan;
  };

  const handleAiAction = (featureKey: 'aiContent' | 'aiWhatsApp' | 'aiBgRemover', action: () => void) => {
    if (isFeatureLocked(featureKey)) {
      if (onOpenSubscriptionModal) onOpenSubscriptionModal();
      else alert('Please upgrade your plan to unlock this Pro feature.');
      return;
    }
    action();
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-6">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*"
        multiple
        onChange={handleImageFileUpload}
        className="hidden"
      />

      {/* Top Sticky Header Bar */}
      <div className="bg-[#202533] border border-[#2E3548] p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-30 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-white bg-[#181B26] hover:bg-[#282E3F] rounded-xl transition border border-[#2E3548] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{initialData ? 'Edit Product' : 'Create Product'}</span>
              <span className="text-[10px] bg-[#00D68F]/20 text-[#00D68F] font-black px-2 py-0.5 rounded-full uppercase border border-[#00D68F]/30">
                MERCHANT CATALOG
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Configure product details, merchant pricing, inventory addresses, and media.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-[#282E3F] hover:bg-[#32394E] text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving}
            onClick={() => { setStatus('Draft'); setSaveState('draft'); }}
            className="px-4 py-2 bg-[#282E3F] hover:bg-[#32394E] text-amber-400 border border-amber-500/30 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saveState === 'draft' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{saveState === 'draft' ? 'Saving…' : 'Save Draft'}</span>
          </button>

          <button
            type="submit"
            disabled={isSaving}
            onClick={() => { setStatus('Active'); setSaveState('publish'); }}
            className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-lg flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saveState === 'publish' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4 stroke-[3]" />
            )}
            <span>{saveState === 'publish' ? 'Saving…' : 'Save & Publish'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Main Column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Card 1: Product Media & Images (Reorder: media uploads first) */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#00D68F]" />
                <h2 className="text-base font-bold text-white">Product Media & Images</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImageModalTarget('additional');
                  setShowImageModal(true);
                }}
                className="px-3 py-1.5 bg-[#282E3F] hover:bg-[#32394E] text-[#00D68F] font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-[#00D68F]/30"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Upload Photos</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Main Image (Upload Image) */}
              <div className="relative group border-2 border-dashed border-[#00D68F]/50 hover:border-[#00D68F] rounded-xl p-2 bg-[#181B26] flex flex-col items-center justify-center min-h-[110px] text-center transition">
                {image ? (
                  <>
                    <SafeImage src={image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'} alt="Main thumbnail" className="w-full h-24 object-cover rounded-lg" />
                    <span className="absolute bottom-3 left-3 bg-black/70 text-[#00D68F] font-black text-[9px] px-1.5 py-0.5 rounded">MAIN</span>
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={enhanceImageWithAi}
                        disabled={isEnhancingImage}
                        className="p-1.5 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 rounded-lg shadow-md cursor-pointer disabled:opacity-50 relative overflow-hidden"
                        title="Magic Enhance"
                      >
                        {isFreeTier && (
                          <div className="absolute top-0 right-0 bg-slate-950 text-white text-[6px] font-black px-1 py-0.2 rounded-bl-sm uppercase tracking-tighter leading-none">
                            P
                          </div>
                        )}
                        <Sparkles className={`w-3.5 h-3.5 ${isEnhancingImage ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImage('')}
                        className="p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-lg shadow-md cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div
                    onClick={() => {
                      setImageModalTarget('main');
                      setShowImageModal(true);
                    }}
                    className="space-y-1 cursor-pointer py-3 w-full"
                  >
                    <Upload className="w-5 h-5 text-[#00D68F] mx-auto" />
                    <span className="text-[11px] font-bold text-slate-300 block">Main Image *</span>
                    <span className="text-[10px] text-slate-500">Select photo</span>
                  </div>
                )}
              </div>

              {/* Additional Images */}
              {additionalImages.map((imgUrl, idx) => (
                <div key={idx} className="relative group border border-[#2E3548] rounded-xl p-2 bg-[#181B26] flex items-center justify-center h-28">
                  <SafeImage src={imgUrl || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'} alt={`Gallery ${idx}`} className="w-full h-full object-cover rounded-lg" />
                  <button
                    type="button"
                    onClick={() => setAdditionalImages(additionalImages.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 p-1 bg-red-500/80 hover:bg-red-600 text-white rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setImageModalTarget('additional');
                  setShowImageModal(true);
                }}
                className="border border-dashed border-[#2E3548] hover:border-slate-400 rounded-xl p-3 bg-[#181B26] flex flex-col items-center justify-center min-h-[110px] text-slate-400 hover:text-white transition cursor-pointer"
              >
                <Plus className="w-5 h-5 mb-1 text-slate-400" />
                <span className="text-[11px] font-semibold">Add Image</span>
              </button>
            </div>
          </div>

          {/* Card 1: Product Main Info & Names */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#00D68F]" />
                <h2 className="text-base font-bold text-white">Product Name</h2>
              </div>
            </div>

            {/* Product Name Section (Side-by-Side English & Bengali) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1.5">
                  Product Name (English) *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!seoSlug) setSeoSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                  }}
                  placeholder="Enter name"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-emerald-400 mb-1.5">
                  প্রোডাক্টের নাম (Bengali / বাংলা) *
                </label>
                <input
                  type="text"
                  value={titleBn}
                  onChange={(e) => setTitleBn(e.target.value)}
                  placeholder="Enter name"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none focus:border-[#00D68F] placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Pricing Section (2-Column Layout with ৳ symbol inside right side & helper text) */}
            <div className="pt-4 border-t border-[#2E3548] space-y-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-[#00D68F]" />
                  <span>Pricing</span>
                </label>
                {numSellingPrice > 0 && numCostPrice > 0 && (
                  <span className="text-[11px] bg-[#00D68F]/20 text-[#00D68F] font-black px-2.5 py-0.5 rounded-lg border border-[#00D68F]/30">
                    Profit: ৳{profitBDT.toLocaleString()} ({marginPercent}%)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Selling Price */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">
                      Selling price *
                    </label>
                    <button
                      type="button"
                      onClick={suggestPricing}
                      className="text-[11px] text-[#00D68F] font-bold hover:bg-[#00D68F]/20 bg-[#00D68F]/10 px-2.5 py-1 rounded-lg border border-[#00D68F]/30 flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap"
                    >
                      {isFreeTier && (
                        <span className="bg-slate-900 text-[#00D68F] text-[9px] font-black px-1.5 py-0.5 rounded border border-[#00D68F]/40 uppercase tracking-wider">PRO</span>
                      )}
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Smart Pricing</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      required
                      value={priceBDT}
                      onChange={(e) => setPriceBDT(toSafeNumberValue(e.target.value))}
                      placeholder="0.00"
                      className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-3.5 pr-8 py-2.5 text-sm font-extrabold text-[#00D68F] focus:outline-none focus:border-[#00D68F]"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                      ৳
                    </span>
                  </div>
                  {aiPricingData && (
                    <div className="mt-2 p-2 bg-[#00D68F]/10 border border-[#00D68F]/20 rounded-lg">
                      <p className="text-[10px] text-[#00D68F] font-bold">AI Suggestion: ৳{aiPricingData.suggestedPrice} (-{aiPricingData.discountPercentage}%)</p>
                      <p className="text-[9px] text-slate-400 leading-tight mt-0.5">{aiPricingData.reasoning}</p>
                    </div>
                  )}
                </div>

                {/* Cost Price */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Cost price
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      value={costPriceBDT}
                      onChange={(e) => setCostPriceBDT(toSafeNumberValue(e.target.value))}
                      placeholder="0.00"
                      className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-3.5 pr-8 py-2.5 text-sm font-bold text-slate-200 focus:outline-none focus:border-[#00D68F]"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
                      ৳
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                    To obtain your profit data accurately. It is not shown to the customer in the store
                  </p>
                </div>
              </div>
            </div>

            {/* SKU, Weight & Category Grid */}
            <div className="pt-4 border-t border-[#2E3548] space-y-4">
              {/* Categories Full-width Dropdown or Custom Input */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Categories *
                  </label>
                  {customCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsCustomCategoryMode(!isCustomCategoryMode)}
                      className="text-[10px] font-bold text-[#00D68F] hover:underline cursor-pointer"
                    >
                      {isCustomCategoryMode ? 'Select from list' : 'Type custom category'}
                    </button>
                  )}
                </div>
                {isCustomCategoryMode ? (
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Enter custom category name..."
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-[#00D68F]"
                  />
                ) : (
                  <select
                    required
                    value={category}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomCategoryMode(true);
                        setCategory('');
                      } else {
                        setCategory(e.target.value);
                      }
                    }}
                    className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                  >
                    <option value="" disabled>Select category</option>
                    {customCategories.length === 0 ? (
                      <option value="" disabled>No categories found - Create one first</option>
                    ) : (
                      customCategories.map((catName) => (
                        <option key={catName} value={catName}>{catName}</option>
                      ))
                    )}
                    <option value="__custom__">+ Type Custom Category...</option>
                  </select>
                )}
              </div>
              </div>

          </div>

          {/* Quantities and Inventory Section (Zid Layout) */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-[#00D68F]" />
                <div>
                  <h2 className="text-base font-bold text-white">Quantities and Inventory</h2>
                  <p className="text-[11px] text-slate-400">Manage store locations and stock limits</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-extrabold uppercase text-slate-400 block">Total Quantity</span>
                <span className="text-base font-black text-[#00D68F]">{totalStock} Units</span>
              </div>
            </div>

            {/* Purple Info Box at top */}
            <div className="bg-purple-900/30 border border-purple-500/30 p-3.5 rounded-xl flex items-center justify-between text-xs text-purple-200">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-purple-400 shrink-0" />
                <span>Inventories can be modified and added through</span>
              </div>
              <button
                type="button"
                onClick={() => alert('Opening Inventory Addresses Management Settings')}
                className="text-purple-300 font-bold underline hover:text-purple-100 transition cursor-pointer flex items-center gap-1 shrink-0"
              >
                <span>Inventory addresses</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {/* Inventory Table Header Row */}
            <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-[#181B26] rounded-xl text-xs font-bold text-slate-400 uppercase tracking-wider border border-[#2E3548]">
              <div className="col-span-5 sm:col-span-6">Inventory</div>
              <div className="col-span-4 sm:col-span-4 text-center sm:text-left">Available quantity</div>
              <div className="col-span-3 sm:col-span-2 text-right">Unlimited</div>
            </div>

            {/* Inventory Rows */}
            <div className="space-y-2.5">
              {inventories.map((inv) => (
                <div
                  key={inv.id}
                  className="grid grid-cols-12 gap-3 items-center bg-[#181B26] border border-[#2E3548] p-3 rounded-xl transition hover:border-slate-600"
                >
                  {/* Location Dropdown */}
                  <div className="col-span-5 sm:col-span-6">
                    <select
                      value={inv.name}
                      onChange={(e) => handleInventoryNameChange(inv.id, e.target.value)}
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-lg px-2.5 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] cursor-pointer"
                    >
                      <option value="Default Store Location">Default Store Location</option>
                      <option value="Main Warehouse - Dhaka">Main Warehouse - Dhaka</option>
                      <option value="Chittagong Regional Depot">Chittagong Regional Depot</option>
                      <option value="Sylhet Fulfillment Center">Sylhet Fulfillment Center</option>
                      <option value="Khulna Distribution Hub">Khulna Distribution Hub</option>
                      <option value={inv.name}>{inv.name}</option>
                    </select>
                  </div>

                  {/* Quantity Input Box */}
                  <div className="col-span-4 sm:col-span-4">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        disabled={inv.unlimited}
                        value={inv.unlimited ? '' : inv.stock}
                        onChange={(e) => handleInventoryStockChange(inv.id, Number(e.target.value))}
                        placeholder={inv.unlimited ? '∞' : '0'}
                        className={`w-full bg-[#202533] border border-[#2E3548] rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] ${
                          inv.unlimited ? 'opacity-50 cursor-not-allowed bg-slate-800 text-center font-mono' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Unlimited Toggle Switch & Delete */}
                  <div className="col-span-3 sm:col-span-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleInventoryUnlimitedToggle(inv.id)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                        inv.unlimited ? 'bg-[#00D68F]' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          inv.unlimited ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>

                    {inventories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveInventoryRow(inv.id)}
                        className="text-slate-500 hover:text-red-400 p-1 rounded-md transition cursor-pointer"
                        title="Remove Location"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* + Add New Inventory Button */}
            <button
              type="button"
              onClick={handleAddInventoryRow}
              className="w-full py-2.5 bg-[#181B26] hover:bg-[#282E3F] border border-dashed border-[#2E3548] hover:border-[#00D68F] text-[#00D68F] font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add new inventory</span>
            </button>
          </div>

          {/* SKU & Weight card - remaining detail fields placed below the primary order */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-[#2E3548] pb-3">
              <Hash className="w-5 h-5 text-[#00D68F]" />
              <h2 className="text-base font-bold text-white">SKU & Weight</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Product Code SKU */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Product code SKU *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSku}
                    className="text-[10px] text-[#00D68F] font-bold hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Auto</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="SKU-XXXX"
                  className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold text-slate-200 focus:outline-none focus:border-[#00D68F]"
                />
              </div>

              {/* Product Weight with Unit Dropdown (kg / lb / g choices) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Product weight
                </label>
                <div className="relative flex items-center bg-[#181B26] border border-[#2E3548] rounded-xl overflow-hidden focus-within:border-[#00D68F]">
                  <input
                    type="number"
                    step="any"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="0.5"
                    className="w-full bg-transparent px-3.5 py-2.5 text-xs font-bold text-slate-200 focus:outline-none"
                  />
                  <select
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lb' | 'g')}
                    className="bg-[#202533] text-slate-300 font-bold text-xs px-3 py-2.5 border-l border-[#2E3548] focus:outline-none cursor-pointer hover:bg-[#282E3F] transition"
                  >
                    <option value="kg">kg (Kilograms)</option>
                    <option value="lb">lb (Pounds)</option>
                    <option value="g">g (Grams)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Lower Accordion Cards Stack */}
          <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden divide-y divide-[#2E3548] shadow-xl">

            {/* Accordion 1: Advanced Information */}
            <div>
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'advanced' ? null : 'advanced')}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-xs text-white hover:bg-[#252B3B] transition cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-[#00D68F]" />
                    <span className="text-sm font-bold">Advanced information</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal pl-6">
                    Giving your product additional information, such as a short or detailed description, tax settings and weight.
                  </p>
                </div>
                {openSection === 'advanced' ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {openSection === 'advanced' && (
                <div className="p-4 sm:p-5 bg-[#181B26] space-y-5 text-xs border-t border-[#2E3548]">

                  {/* Top Tax Alert Banner */}
                  <div className="bg-amber-900/30 border border-amber-500/30 p-3.5 rounded-xl flex items-center justify-between text-xs text-amber-200">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>You can manage tax settings through</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => alert('Opening Tax Settings')}
                      className="text-purple-300 hover:text-purple-100 font-bold underline transition cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <span>tax settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Brand Name Input */}
                  <div>
                    <label className="block text-slate-300 font-bold mb-1.5">Brand Name</label>
                    <input
                      type="text"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      placeholder="e.g. Dhaka Heritage Crafts"
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-[#00D68F]"
                    />
                  </div>

                  {/* Short Description (English) with 250 Char Limit + Counter */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-slate-300 font-bold">Short Description (English)</label>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {shortDescEn.length} / 250 chars | {shortDescEn.trim() ? shortDescEn.trim().split(/\s+/).length : 0} words
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={250}
                      value={shortDescEn}
                      onChange={(e) => setShortDescEn(e.target.value)}
                      placeholder="Enter a brief summary for storefront card preview..."
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-xl p-3 text-white focus:outline-none focus:border-[#00D68F]"
                    />
                  </div>

                  {/* Short Description (Bengali) with 250 Char Limit + Counter */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-emerald-400 font-bold">সংক্ষিপ্ত বিবরণ (Bengali Short Description)</label>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {shortDescBn.length} / 250 chars | {shortDescBn.trim() ? shortDescBn.trim().split(/\s+/).length : 0} words
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      maxLength={250}
                      value={shortDescBn}
                      onChange={(e) => setShortDescBn(e.target.value)}
                      placeholder="সংক্ষিপ্ত বিবরণ বাংলায় লিখুন..."
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-xl p-3 text-white focus:outline-none focus:border-[#00D68F]"
                    />
                  </div>

                  {/* Detailed Description (English) with Rich Text Toolbar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-slate-300 font-bold">Detailed Description (English)</label>
                      <button
                        type="button"
                        disabled={isGeneratingDescription}
                        onClick={() => generateAiDescription()}
                        className="text-[10px] bg-[#00D68F] text-slate-950 font-black px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-[#00E699] transition disabled:opacity-50 cursor-pointer relative overflow-hidden"
                      >
                        {isFreeTier && (
                          <div className="absolute top-0 right-0 bg-slate-950 text-white text-[7px] font-black px-1 py-0.5 rounded-bl-md border-l border-b border-[#00D68F]/30 uppercase tracking-tighter">
                            PRO
                          </div>
                        )}
                        <Sparkles className={`w-3 h-3 ${isGeneratingDescription ? 'animate-spin' : ''}`} />
                        <span>{isGeneratingDescription ? 'Generating...' : 'AI Draft'}</span>
                      </button>
                    </div>
                    <div className="border border-[#2E3548] rounded-xl overflow-hidden bg-[#202533]">
                      {/* Rich Formatting Toolbar */}
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#282E3F] border-b border-[#2E3548] text-slate-300">
                        <select className="bg-[#181B26] text-xs font-bold px-2 py-1 rounded border border-[#2E3548] focus:outline-none">
                          <option>Normal Text</option>
                          <option>Heading 1</option>
                          <option>Heading 2</option>
                          <option>Heading 3</option>
                        </select>
                        <div className="h-4 w-px bg-slate-700 mx-1" />
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Underline"><Underline className="w-3.5 h-3.5" /></button>
                        <div className="h-4 w-px bg-slate-700 mx-1" />
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Bullet List"><List className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Numbered List"><ListOrdered className="w-3.5 h-3.5" /></button>
                        <div className="h-4 w-px bg-slate-700 mx-1" />
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Align Left"><AlignLeft className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Align Center"><AlignCenter className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer" title="Align Right"><AlignRight className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer ml-auto" title="Insert Link"><LinkIcon className="w-3.5 h-3.5 text-[#00D68F]" /></button>
                      </div>
                      <textarea
                        rows={4}
                        value={descriptionEn}
                        onChange={(e) => setDescriptionEn(e.target.value)}
                        className="w-full bg-transparent p-3 text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Detailed Description (Bengali) with Rich Text Toolbar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-emerald-400 font-bold">বিস্তারিত বিবরণ (Bengali Detailed Description)</label>
                      <button
                        type="button"
                        disabled={isGeneratingDescription}
                        onClick={() => generateAiDescription()}
                        className="text-[10px] bg-[#00D68F] text-slate-950 font-black px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-[#00E699] transition disabled:opacity-50 cursor-pointer relative overflow-hidden"
                      >
                        {isFreeTier && (
                          <div className="absolute top-0 right-0 bg-slate-950 text-white text-[7px] font-black px-1 py-0.5 rounded-bl-md border-l border-b border-[#00D68F]/30 uppercase tracking-tighter">
                            PRO
                          </div>
                        )}
                        <Sparkles className={`w-3 h-3 ${isGeneratingDescription ? 'animate-spin' : ''}`} />
                        <span>{isGeneratingDescription ? 'Generating...' : 'AI ড্রাফট'}</span>
                      </button>
                    </div>
                    <div className="border border-[#2E3548] rounded-xl overflow-hidden bg-[#202533]">
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-[#282E3F] border-b border-[#2E3548] text-slate-300">
                        <select className="bg-[#181B26] text-xs font-bold px-2 py-1 rounded border border-[#2E3548] focus:outline-none">
                          <option>সাধারণ লেখা (Normal)</option>
                          <option>শিরোনাম ১ (Heading 1)</option>
                          <option>শিরোনাম ২ (Heading 2)</option>
                        </select>
                        <div className="h-4 w-px bg-slate-700 mx-1" />
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer"><Bold className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer"><Italic className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer"><Underline className="w-3.5 h-3.5" /></button>
                        <div className="h-4 w-px bg-slate-700 mx-1" />
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer"><List className="w-3.5 h-3.5" /></button>
                        <button type="button" className="p-1 hover:bg-[#32394E] rounded cursor-pointer"><ListOrdered className="w-3.5 h-3.5" /></button>
                      </div>
                      <textarea
                        rows={4}
                        value={descriptionBn}
                        onChange={(e) => setDescriptionBn(e.target.value)}
                        placeholder="পণ্যের বিস্তারিত বিবরণ বাংলায় লিখুন..."
                        className="w-full bg-transparent p-3 text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Grid Form Inputs: Barcode, Min/Max Quantity, Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#2E3548]">
                    {/* Barcode */}
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Barcode</label>
                      <input
                        type="text"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        placeholder="Enter code"
                        className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-mono"
                      />
                    </div>

                    {/* Filters Dropdown */}
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Filters</label>
                      <select
                        value={selectedFilter}
                        onChange={(e) => setSelectedFilter(e.target.value)}
                        className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold cursor-pointer"
                      >
                        <option value="New Arrival">New Arrival (নতুন সংকলন)</option>
                        <option value="Bestseller">Bestseller (সেরা বিক্রি)</option>
                        <option value="Featured Collection">Featured Collection (বিশেষ পন্য)</option>
                        <option value="Clearance Sale">Clearance Sale (ডিসকাউন্ট অফার)</option>
                      </select>
                    </div>

                    {/* Minimum quantity per order */}
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Minimum quantity per order</label>
                      <input
                        type="number"
                        min="1"
                        value={minOrderQuantity}
                        onChange={(e) => setMinOrderQuantity(e.target.value)}
                        placeholder="Example: 1"
                        className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold"
                      />
                    </div>

                    {/* Maximum quantity per order */}
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Maximum quantity per order</label>
                      <input
                        type="number"
                        min="1"
                        value={maxOrderQuantity}
                        onChange={(e) => setMaxOrderQuantity(e.target.value)}
                        placeholder="Example: 99"
                        className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold"
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Accordion 2: Product Options (Variants Management) */}
            <div>
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'variants' ? null : 'variants')}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-xs text-white hover:bg-[#252B3B] transition cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-bold">Product options</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal pl-6">
                    Control sub-options for your product such as size, color, and...
                  </p>
                </div>
                {openSection === 'variants' ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {openSection === 'variants' && (
                <div className="p-4 sm:p-5 bg-[#181B26] space-y-5 text-xs border-t border-[#2E3548]">

                  {/* Option Name Dropdown */}
                  <div className="space-y-3">
                    <label className="block text-slate-300 font-bold">Option Name</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={isCreatingOption ? 'create_new' : selectedOptionName}
                        onChange={(e) => {
                          if (e.target.value === 'create_new') {
                            setIsCreatingOption(true);
                          } else {
                            setIsCreatingOption(false);
                            setSelectedOptionName(e.target.value);
                          }
                        }}
                        className="bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold cursor-pointer"
                      >
                        <option value="Color">Color</option>
                        <option value="Size">Size</option>
                        <option value="Volume">Volume</option>
                        <option value="Material">Material</option>
                        <option value="create_new">+ Create new option</option>
                      </select>

                      {isCreatingOption && (
                        <input
                          type="text"
                          placeholder="Type option name (e.g., Fabric)"
                          value={customOptionInput}
                          onChange={(e) => setCustomOptionInput(e.target.value)}
                          className="bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-white font-bold"
                        />
                      )}
                    </div>
                  </div>

                  {/* Option Values Multi-select Checkboxes */}
                  <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-[#2E3548] pb-2">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-200 font-bold">
                        <input
                          type="checkbox"
                          checked={getCurrentSelectedValues().length === getCurrentAvailableValues().length && getCurrentAvailableValues().length > 0}
                          onChange={handleSelectAllValues}
                          className="w-4 h-4 rounded accent-[#00D68F]"
                        />
                        <span>Select all values ({getCurrentSelectedValues().length}/{getCurrentAvailableValues().length})</span>
                      </label>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newOptionInputValue}
                          onChange={(e) => setNewOptionInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddNewValue();
                            }
                          }}
                          placeholder="New value..."
                          className="bg-[#181B26] border border-[#2E3548] px-2.5 py-1 text-xs rounded-lg text-white"
                        />
                        <button
                          type="button"
                          onClick={handleAddNewValue}
                          className="px-2.5 py-1 bg-[#00D68F] text-slate-950 font-bold rounded-lg text-xs hover:bg-[#00E699] transition cursor-pointer"
                        >
                          + Create new value
                        </button>
                      </div>
                    </div>

                    {/* Values Pills / Multi-select list */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {getCurrentAvailableValues().map((val) => {
                        const isChecked = getCurrentSelectedValues().includes(val);
                        return (
                          <label
                            key={val}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition ${
                              isChecked
                                ? 'bg-[#00D68F]/20 border-[#00D68F] text-[#00D68F]'
                                : 'bg-[#181B26] border-[#2E3548] text-slate-400 hover:text-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleValue(val)}
                              className="w-3.5 h-3.5 rounded accent-[#00D68F]"
                            />
                            <span>{val}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Color to Image Mapping Section */}
                  {selectedColorValues.length > 0 && (
                    <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-xl space-y-3">
                      <div className="text-slate-200 font-bold text-xs flex items-center gap-1.5 border-b border-[#2E3548] pb-2">
                        <ImageIcon className="w-4 h-4 text-[#00D68F]" />
                        <span>Map Images to Color Variants</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Assign an image URL to each selected color variant. Selecting a color on the storefront will immediately display this image.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedColorValues.map((color) => {
                          const currentUrl = colorImages[color] || '';
                          return (
                            <div key={color} className="p-3 bg-[#181B26] rounded-xl border border-[#2E3548] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.toLowerCase() }} />
                                  {color}
                                </span>
                                {currentUrl && (
                                  <SafeImage src={currentUrl} alt={color} className="w-8 h-8 object-cover rounded-md border border-[#2E3548]" />
                                )}
                              </div>
                              <div className="flex gap-1">
                                <input
                                  type="url"
                                  value={currentUrl}
                                  onChange={(e) => {
                                    setColorImages(prev => ({ ...prev, [color]: e.target.value }));
                                  }}
                                  placeholder="Paste Image URL"
                                  className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-white placeholder-slate-500 focus:outline-none focus:border-[#00D68F]"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const availableImages = [image, ...additionalImages].filter(Boolean);
                                    if (availableImages.length === 0) {
                                      alert('Please upload/add product images first in the Media section.');
                                      return;
                                    }
                                    const nextIdx = (availableImages.indexOf(currentUrl) + 1) % availableImages.length;
                                    setColorImages(prev => ({ ...prev, [color]: availableImages[nextIdx] }));
                                  }}
                                  className="px-2 py-1.5 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold rounded-xl border border-[#2E3548] text-[10px] transition cursor-pointer whitespace-nowrap"
                                >
                                  Pick Image
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons: Choose another option & Confirm */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => alert('Add additional option layer')}
                      className="px-3.5 py-2 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold rounded-xl border border-[#2E3548] text-xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#00D68F]" />
                      <span>Choose another option</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmOptionSelection}
                      className="px-5 py-2 bg-[#00D68F] hover:bg-[#00E699] text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer shadow-md"
                    >
                      Confirm
                    </button>
                  </div>

                  {/* Existing Variants Table */}
                  {hasVariants && variants.length > 0 && (
                    <div className="pt-3 border-t border-[#2E3548] space-y-2">
                      <div className="text-slate-300 font-bold text-xs">Generated Product Variants</div>
                      <div className="overflow-x-auto rounded-xl border border-[#2E3548]">
                        <table className="w-full text-left text-xs text-slate-300">
                          <thead className="bg-[#202533] text-slate-400 uppercase text-[10px] font-bold">
                            <tr>
                              <th className="p-2.5">Variant Name</th>
                              <th className="p-2.5">Variant SKU</th>
                              <th className="p-2.5">Price (৳)</th>
                              <th className="p-2.5">Available Stock</th>
                              <th className="p-2.5">Image mapping</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#2E3548] bg-[#181B26]">
                            {variants.map((v) => (
                              <tr key={v.id}>
                                <td className="p-2.5 font-bold text-white">{v.name}</td>
                                <td className="p-2.5 font-mono text-slate-400">{v.sku}</td>
                                <td className="p-2.5">
                                  <div className="relative w-28">
                                    <input
                                      type="number"
                                      min="0"
                                      value={v.priceBDT}
                                      onChange={(e) => updateVariantPrice(v.id, e.target.value)}
                                      className="w-full bg-[#202533] border border-[#2E3548] rounded-lg pl-3 pr-6 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">৳</span>
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <div className="relative w-24">
                                    <input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={v.stock === 0 ? '' : v.stock}
                                      onChange={(e) => updateVariantStock(v.id, e.target.value)}
                                      className="w-full bg-[#202533] border border-[#2E3548] rounded-lg px-2 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
                                    />
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  <div className="flex items-center gap-2">
                                    {v.image ? (
                                      <SafeImage src={v.image} alt={v.name} className="w-8 h-8 object-cover rounded-lg border border-[#2E3548]" />
                                    ) : (
                                      <div className="w-8 h-8 rounded-lg bg-[#202533] border border-[#2E3548] flex items-center justify-center text-slate-500">
                                        <ImageIcon className="w-4 h-4" />
                                      </div>
                                    )}
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const availableImages = [image, ...additionalImages].filter(Boolean);
                                          if (availableImages.length === 0) {
                                            alert('Please upload/add product images first in the Media section.');
                                            return;
                                          }
                                          const currentUrl = v.image || '';
                                          const nextIdx = (availableImages.indexOf(currentUrl) + 1) % availableImages.length;
                                          const nextImg = availableImages[nextIdx];
                                          updateVariantImage(v.id, nextImg);
                                        }}
                                        className="px-2 py-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold rounded-lg border border-[#2E3548] text-[10px] transition cursor-pointer whitespace-nowrap"
                                      >
                                        Pick
                                      </button>
                                      <label className="px-2 py-1 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold rounded-lg border border-[#2E3548] text-[10px] transition cursor-pointer text-center whitespace-nowrap">
                                        <span>Upload</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              const reader = new FileReader();
                                              reader.onload = (event) => {
                                                const result = event.target?.result as string;
                                                if (result) {
                                                  updateVariantImage(v.id, result);
                                                }
                                              };
                                              reader.readAsDataURL(file);
                                            }
                                          }}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Accordion 3: Product Customization */}
            <div>
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'customization' ? null : 'customization')}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-xs text-white hover:bg-[#252B3B] transition cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-bold">Product customization</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal pl-6">
                    Allow customer input fields for custom text, gift messages, or upload files.
                  </p>
                </div>
                {openSection === 'customization' ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {openSection === 'customization' && (
                <div className="p-4 sm:p-5 bg-[#181B26] space-y-4 text-xs border-t border-[#2E3548]">

                  {/* Customization Fields List / Empty State */}
                  {customizationFields.length === 0 ? (
                    <div className="bg-[#202533] border border-dashed border-[#2E3548] p-6 rounded-2xl text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                        <Tag className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-white text-sm">No customization fields yet</h4>
                      <p className="text-slate-400 text-xs max-w-sm mx-auto">
                        Allow customers to enter custom details like engraved names, delivery notes, or custom images on the storefront.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customizationFields.map((field) => (
                        <div key={field.id} className="bg-[#202533] border border-[#2E3548] p-3.5 rounded-xl flex items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                              {field.type.replace('_', ' ')}
                            </span>
                            <div className="font-bold text-white text-xs">{field.label}</div>
                          </div>

                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(e) => {
                                  setCustomizationFields(customizationFields.map(f => f.id === field.id ? { ...f, required: e.target.checked } : f));
                                }}
                                className="w-3.5 h-3.5 rounded accent-[#00D68F]"
                              />
                              <span>Required</span>
                            </label>

                            <button
                              type="button"
                              onClick={() => setCustomizationFields(customizationFields.filter(f => f.id !== field.id))}
                              className="p-1 text-slate-400 hover:text-red-400 transition cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* + Add Customization Dropdown Button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowAddCustomizationMenu(!showAddCustomizationMenu)}
                      className="px-4 py-2.5 bg-[#202533] hover:bg-[#282E3F] text-[#00D68F] font-bold rounded-xl border border-[#2E3548] hover:border-[#00D68F] text-xs transition cursor-pointer flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Add customization</span>
                      <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    </button>

                    {showAddCustomizationMenu && (
                      <div className="absolute left-0 mt-2 w-56 bg-[#202533] border border-[#2E3548] rounded-xl shadow-2xl z-20 py-1 divide-y divide-[#2E3548]">
                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('dropdown', 'Select Custom Option')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                            <span>Dropdown</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('multi_select', 'Multiple Selections')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                            <span>Multiple selection</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('text', 'Custom Text Message')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <Type className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Text field</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('number', 'Custom Number Input')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <Hash className="w-3.5 h-3.5 text-amber-400" />
                            <span>Number field</span>
                          </button>
                        </div>

                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('date', 'Delivery Date Preference')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5 text-rose-400" />
                            <span>Date field</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('time', 'Preferred Delivery Time')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Time field</span>
                          </button>
                        </div>

                        <div className="py-1">
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('upload_image', 'Upload Custom Print Photo')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <LucideImage className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Upload image</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCustomizationField('upload_file', 'Upload Document / Spec File')}
                            className="w-full px-3 py-2 text-left text-xs font-bold text-slate-200 hover:bg-[#282E3F] flex items-center gap-2 cursor-pointer"
                          >
                            <FileUp className="w-3.5 h-3.5 text-yellow-400" />
                            <span>Upload file</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>

            {/* Accordion 4: Search Engine Optimization (SEO) */}
            <div>
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'seo' ? null : 'seo')}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-xs text-white hover:bg-[#252B3B] transition cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-bold">Search engine optimization (SEO)</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal pl-6">
                    Optimize title, meta description, and URL slug for Google search index.
                  </p>
                </div>
                {openSection === 'seo' ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {openSection === 'seo' && (
                <div className="p-4 sm:p-5 bg-[#181B26] space-y-4 text-xs border-t border-[#2E3548]">

                  {/* Feature Banner for Store Growth */}
                  <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/30 p-3.5 rounded-xl text-blue-200 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white text-xs">🚀 Store Growth & SEO Optimization</div>
                      <div className="text-[11px] text-blue-300">Custom meta titles and descriptions increase Google search clicks and organic store traffic.</div>
                    </div>
                  </div>

                  {/* Google Search Result Preview Card */}
                  <div className="bg-[#202533] border border-[#2E3548] p-3.5 rounded-xl space-y-1">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Google Search Result Preview</div>
                    <div className="text-blue-400 font-bold text-sm hover:underline cursor-pointer">
                      {seoTitle || title || titleBn || 'Product Title'}
                    </div>
                    <div className="text-emerald-400 text-[11px] font-mono">
                      https://dhakacraft.zid.app/products/{seoSlug || 'product-slug'}
                    </div>
                    <div className="text-slate-400 text-[11px] line-clamp-2">
                      {seoDescription || 'Product description preview on search results.'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Meta Title</label>
                    <input
                      type="text"
                      value={seoTitle}
                      onChange={(e) => setSeoTitle(e.target.value)}
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">Meta Description</label>
                    <textarea
                      rows={2}
                      value={seoDescription}
                      onChange={(e) => setSeoDescription(e.target.value)}
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-xl p-3 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">URL Slug</label>
                    <input
                      type="text"
                      value={seoSlug}
                      onChange={(e) => setSeoSlug(e.target.value)}
                      className="w-full bg-[#202533] border border-[#2E3548] rounded-xl px-3.5 py-2 text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 5: Custom Fields */}
            <div>
              <button
                type="button"
                onClick={() => setOpenSection(openSection === 'custom_fields' ? null : 'custom_fields')}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left font-bold text-xs text-white hover:bg-[#252B3B] transition cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-bold">Custom fields</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-normal pl-6">
                    Add custom fields to your product such as production date, care instructions, origin, or fabric type.
                  </p>
                </div>
                {openSection === 'custom_fields' ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
              </button>

              {openSection === 'custom_fields' && (
                <div className="p-4 sm:p-5 bg-[#181B26] space-y-4 text-xs border-t border-[#2E3548]">

                  {/* Banner inside Custom Fields as strictly requested */}
                  <div className="bg-purple-900/30 border border-purple-500/30 p-3.5 rounded-xl space-y-1.5 text-purple-200">
                    <p className="text-xs">
                      You can modify and control the type and content of fields and their options through the custom fields settings page.
                    </p>
                    <button
                      type="button"
                      onClick={() => alert('Opening Custom Fields Settings Page')}
                      className="text-purple-300 hover:text-purple-100 font-bold underline transition cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>Custom fields settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Active Custom Fields List */}
                  {customFields.length > 0 && (
                    <div className="space-y-2">
                      {customFields.map((cf) => (
                        <div key={cf.id} className="bg-[#202533] border border-[#2E3548] p-3 rounded-xl flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-bold">{cf.name}</span>
                            <div className="text-white font-bold text-xs">{cf.value}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCustomFields(customFields.filter(f => f.id !== cf.id))}
                            className="p-1 text-slate-500 hover:text-red-400 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add New Custom Field Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2 border-t border-[#2E3548]">
                    <input
                      type="text"
                      placeholder="Field Name (e.g. Care Instructions)"
                      value={newCfName}
                      onChange={(e) => setNewCfName(e.target.value)}
                      className="sm:col-span-2 bg-[#202533] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                    />
                    <input
                      type="text"
                      placeholder="Value (e.g. Dry Clean Only)"
                      value={newCfValue}
                      onChange={(e) => setNewCfValue(e.target.value)}
                      className="sm:col-span-2 bg-[#202533] border border-[#2E3548] rounded-xl px-3 py-2 text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomField}
                      className="bg-[#00D68F] text-slate-950 font-bold rounded-xl px-3 py-2 hover:bg-[#00E699] transition cursor-pointer text-xs"
                    >
                      + Add
                    </button>
                  </div>

                </div>
              )}
            </div>

          </div>

          {/* Dedicated High-Priority 'Shipping & Delivery Charges' Card */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 sm:p-6 rounded-2xl space-y-4 shadow-xl">
            <div className="flex items-center gap-2 pb-2 border-b border-[#2E3548]">
              <Truck className="w-5 h-5 text-[#00D68F]" />
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Shipping & Delivery Charges</span>
                  <span className="text-[10px] bg-red-500/20 text-red-400 font-extrabold px-2 py-0.5 rounded border border-red-500/30 uppercase">
                    Mandatory
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Specify location-specific delivery fees for this product. All custom zones are required before saving.
                </p>
              </div>
            </div>

            {deliveryValidationError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>{deliveryValidationError}</span>
              </div>
            )}

            <div className="space-y-3">
              {deliveryRates.map((rate, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Zone/Location Name
                    </label>
                    <input
                      type="text"
                      required
                      value={rate.zoneName}
                      onChange={(e) => {
                        const newRates = [...deliveryRates];
                        newRates[index].zoneName = e.target.value;
                        setDeliveryRates(newRates);
                      }}
                      placeholder="e.g. Inside Dhaka"
                      className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F] placeholder-slate-600"
                    />
                  </div>
                  <div className="w-36">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Delivery Fee (৳)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="0"
                        value={rate.fee}
                        onChange={(e) => {
                          const newRates = [...deliveryRates];
                          newRates[index].fee = e.target.value === '' ? '' : Number(e.target.value);
                          setDeliveryRates(newRates);
                        }}
                        placeholder="0"
                        className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-3.5 pr-8 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-bold">
                        ৳
                      </span>
                    </div>
                  </div>
                  {deliveryRates.length > 1 && (
                    <div className="pt-5">
                      <button
                        type="button"
                        onClick={() => {
                          const newRates = deliveryRates.filter((_, i) => i !== index);
                          setDeliveryRates(newRates);
                        }}
                        className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition cursor-pointer border border-rose-500/20"
                        title="Remove Zone"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setDeliveryRates([...deliveryRates, { zoneName: '', fee: '' }]);
              }}
              className="px-4 py-2 bg-[#202533] hover:bg-[#282E3F] text-slate-300 font-bold rounded-xl border border-[#2E3548] hover:border-[#00D68F] text-xs transition cursor-pointer flex items-center gap-1.5 w-fit"
            >
              <Plus className="w-4 h-4 text-[#00D68F]" />
              <span>+ Add Delivery Zone</span>
            </button>
          </div>

        </div>

        {/* Right Side Column - Live Storefront Card Preview & Settings */}
        <div className="space-y-6">

          {/* Live Store Product Preview Card */}
          <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl space-y-3 sticky top-24 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#2E3548] pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-[#00D68F]" />
                <span className="text-xs font-bold text-white">Live Storefront Card</span>
              </div>
              <span className="text-[10px] bg-[#00D68F]/20 text-[#00D68F] font-bold px-2 py-0.5 rounded-full">
                PREVIEW
              </span>
            </div>

            {/* Product Card Preview Box */}
            <div className="bg-[#181B26] border border-[#2E3548] rounded-xl p-3 overflow-hidden shadow-inner space-y-3">
              <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-[#202533]">
                {image ? (
                  <SafeImage src={image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'} alt={title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                    No image uploaded
                  </div>
                )}

                {hasDiscount && (
                  <span className="absolute top-2 left-2 bg-rose-500 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-md">
                    SALE
                  </span>
                )}

                {/* Product Tag / Badge live preview */}
                {selectedFilter && (
                  <span className={`absolute bottom-2 left-2 text-[9px] font-black px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider ${
                    selectedFilter.includes('Arrival') ? 'bg-[#00D68F] text-slate-950' :
                    selectedFilter.includes('Bestseller') ? 'bg-amber-500 text-white' :
                    selectedFilter.includes('Featured') ? 'bg-blue-600 text-white' :
                    'bg-rose-500 text-white'
                  }`}>
                    {selectedFilter.includes('Arrival') ? 'নতুন সংকলন' :
                     selectedFilter.includes('Bestseller') ? 'সেরা বিক্রি' :
                     selectedFilter.includes('Featured') ? 'বিশেষ পন্য' :
                     selectedFilter.includes('Clearance') ? 'ডিসকাউন্ট অফার' :
                     selectedFilter}
                  </span>
                )}

                <span className={`absolute top-2 right-2 text-[9px] font-extrabold px-2 py-0.5 rounded-full shadow-md ${
                  status === 'Active' ? 'bg-[#00D68F] text-slate-950' : 'bg-slate-700 text-slate-200'
                }`}>
                  {status}
                </span>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase">{brand || category || 'Category'}</div>
                <h3 className="font-bold text-white text-sm line-clamp-1">{title || 'Product Name (EN)'}</h3>
                {titleBn && <p className="text-[11px] text-emerald-400 font-semibold">{titleBn}</p>}

                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-[#00D68F]">৳{numSellingPrice.toLocaleString()}</span>
                    {hasDiscount && numComparePrice > numSellingPrice && (
                      <span className="text-[11px] text-slate-500 line-through">৳{numComparePrice.toLocaleString()}</span>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 font-semibold">
                    Stock: {totalStock} pcs
                  </span>
                </div>

                <button
                  type="button"
                  disabled
                  className="w-full mt-3 py-1.5 bg-[#00D68F] text-slate-950 font-bold text-xs rounded-lg opacity-90 cursor-not-allowed"
                >
                  Add to Cart
                </button>
              </div>
            </div>

            {/* Additional Details Checkboxes */}
            <div className="pt-2 border-t border-[#2E3548] space-y-2.5 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresShipping}
                  onChange={(e) => setRequiresShipping(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#00D68F]"
                />
                <span>Requires physical courier shipping</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTaxExempt}
                  onChange={(e) => setIsTaxExempt(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#00D68F]"
                />
                <span>Tax Exempt Product</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasDiscount}
                  onChange={(e) => setHasDiscount(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#00D68F]"
                />
                <span>Enable promotional discount badge</span>
              </label>
            </div>
          </div>

        </div>

      </div>

      {showImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="bg-[#202533] border border-[#2E3548] w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-4 border-b border-[#2E3548] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Select Product Image</h3>
                <p className="text-xs text-slate-400">Upload a product image from your device</p>
              </div>
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
              <div className="border-b border-[#2E3548] bg-[#181B26] px-4 py-3">
                <p className="text-xs font-bold text-[#00D68F]">Upload File</p>
              </div>

            {/* Content */}
            <div className="p-5 flex-1 overflow-y-auto">
                <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-[#2E3548] rounded-xl bg-[#181B26] text-center p-6">
                  <Upload className="w-8 h-8 text-[#00D68F] mb-3" />
                  <p className="text-xs font-bold text-slate-200 mb-1">Click to select files from your device</p>
                  <p className="text-[10px] text-slate-500 mb-4">Supports PNG, JPG, WEBP, GIF</p>
                  <button
                    type="button"
                    onClick={() => {
                      imageInputRef.current?.click();
                      setShowImageModal(false);
                    }}
                    className="px-4 py-2 bg-[#282E3F] hover:bg-[#32394E] text-white font-bold text-xs rounded-xl transition border border-[#2E3548]"
                  >
                    Open Device File Picker
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};
