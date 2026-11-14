import React, { useEffect, useState, useRef } from 'react';
import { PLACEHOLDER_IMAGE, resolveProductImage, toRenderableImageUrl } from '../utils/imageFallback';

interface CheckoutThumbnailProps {
  product?: any;
  line?: any;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
}

/** Cache of fetched product images by product ID to avoid duplicate network requests */
const productDbImageCache = new Map<string, string>();

/**
 * CheckoutThumbnail — clean, robust product photo component for the Checkout Order Summary.
 *
 * 1. Reliably extracts the image URL from product fields (image, imageUrl, image_url,
 *    thumbnail, thumbnailUrl, images[0], gallery[0]) and cart line fallback.
 * 2. Normalizes relative vs. absolute paths (Supabase storage paths, external CDNs, local assets).
 * 3. If missing in old cart data, fetches fresh product details directly from the MongoDB backend.
 * 4. Gracefully renders the placeholder on network/asset failure with zero layout shift.
 */
export const CheckoutThumbnail: React.FC<CheckoutThumbnailProps> = ({
  product,
  line,
  alt = 'Product',
  className = 'h-20 w-20 shrink-0 rounded-lg border object-cover',
  width = 80,
  height = 80,
}) => {
  const productId = String(
    product?.id ??
    product?.productId ??
    product?.product_id ??
    line?.productId ??
    line?.product_id ??
    line?.product?.id ??
    ''
  ).trim();

  // Resolve initial candidate
  const initialCandidate =
    resolveProductImage(product) ||
    resolveProductImage(line) ||
    (productId && productDbImageCache.get(productId)) ||
    '';

  const [resolvedSrc, setResolvedSrc] = useState<string>(() =>
    initialCandidate ? toRenderableImageUrl(initialCandidate) : ''
  );
  const [hasError, setHasError] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update whenever product, line, or productId prop changes
  useEffect(() => {
    const candidate =
      resolveProductImage(product) ||
      resolveProductImage(line) ||
      (productId && productDbImageCache.get(productId)) ||
      '';

    if (candidate) {
      setResolvedSrc(toRenderableImageUrl(candidate));
      setHasError(false);
      return;
    }

    // If missing from both product and line, fetch fresh from the product database
    if (productId && !candidate) {
      let isCurrent = true;
      fetch(`/api/products?id=${encodeURIComponent(productId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isCurrent || !isMountedRef.current || !data) return;
          const freshItem = Array.isArray(data) ? data[0] : data;
          if (freshItem) {
            const freshImage = resolveProductImage(freshItem);
            if (freshImage) {
              const fullUrl = toRenderableImageUrl(freshImage);
              productDbImageCache.set(productId, fullUrl);
              setResolvedSrc(fullUrl);
              setHasError(false);
            }
          }
        })
        .catch(() => {
          // Keep placeholder on fetch error
        });

      return () => {
        isCurrent = false;
      };
    }
  }, [product, line, productId]);

  const handleImageError = () => {
    // If the currently loaded image fails and we haven't fetched fresh from DB, attempt one fresh fetch
    if (!hasError && productId && !productDbImageCache.has(productId)) {
      fetch(`/api/products?id=${encodeURIComponent(productId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!isMountedRef.current || !data) {
            setHasError(true);
            return;
          }
          const freshItem = Array.isArray(data) ? data[0] : data;
          const freshImage = freshItem ? resolveProductImage(freshItem) : '';
          const freshUrl = freshImage ? toRenderableImageUrl(freshImage) : '';
          if (freshUrl && freshUrl !== resolvedSrc) {
            productDbImageCache.set(productId, freshUrl);
            setResolvedSrc(freshUrl);
          } else {
            setHasError(true);
          }
        })
        .catch(() => {
          setHasError(true);
        });
    } else {
      setHasError(true);
    }
  };

  const finalSrc = !hasError && resolvedSrc ? resolvedSrc : PLACEHOLDER_IMAGE;

  return (
    <img
      src={finalSrc}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      onError={handleImageError}
      className={className}
      style={{
        backgroundColor: '#1e293b',
        aspectRatio: '1 / 1',
      }}
    />
  );
};

export default CheckoutThumbnail;
