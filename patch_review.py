import re

filepath = r"c:\Users\Dell\Desktop\zid-bd-merchant-dashboard\src\components\TenantStorefrontView.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# ─── PATCH 1: Replace handleModalReturnImage + handleSubmitModalReview block ───
old_block = '''\
  const handleModalReturnImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setModalReturnImage(String(reader.result || ''));
    reader.onerror = () => setModalError('Could not read the selected image.');
    reader.readAsDataURL(file);
  };

  /** POST a review for a single ordered item to /api/reviews. */
  const handleSubmitModalReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;
    setModalError('');
    if (modalRating < 1 || modalRating > 5) {
      setModalError(t('sf_review_required'));
      return;
    }
    const { order, item } = reviewModal;
    const slug = String(effectiveStoreSlug || '').split(':')[0].trim();
    setIsModalSubmitting(true);
    let saved = false;
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.id,
          productName: item.productName,
          orderId: order.id,
          orderNumber: order.orderNumber,
          rating: modalRating,
          comment: modalComment.trim(),
          customerName: customerSession?.name || order.customerName,
          customerPhone: customerSession?.phone || order.customerPhone,
          storeSlug: slug,
          storeId: order.storeId,
          merchantId: (merchant as any)?.id || order.merchantId,
        }),
      });
      const data = await res.json().catch(() => null);
      saved = Boolean(res.ok && data?.ok !== false);
    } catch (err: any) {
      saved = false;
    }
    setIsModalSubmitting(false);

    // Optimistic local record so the card shows "Reviewed" right away.
    const newReview: CustomerReviewItem = {
      id: `rev-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: item.id,
      productTitle: item.productName,
      productImage: item.image,
      rating: modalRating,
      comment: modalComment.trim(),
      customerName: customerSession?.name || order.customerName,
      createdAt: new Date().toLocaleString(),
    };
    setCustomerReviews((prev) => [newReview, ...prev]);
    if (!saved) console.warn('[TenantStorefrontView] review saved locally; server sync pending');
    closeItemModals();
  };'''

new_block = '''\
  /** Handle review photo selection (gallery or camera). Up to 4 images. */
  const handleModalReviewImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = 4 - modalReviewImages.length;
    const toAdd = files.slice(0, remaining);
    toAdd.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setModalReviewImages((prev) => [
          ...prev,
          { file, preview: String(reader.result || '') },
        ]);
      };
      reader.onerror = () => setModalError('Could not read the selected image.');
      reader.readAsDataURL(file);
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleModalReturnImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setModalReturnImage(String(reader.result || ''));
    reader.onerror = () => setModalError('Could not read the selected image.');
    reader.readAsDataURL(file);
  };

  /** Upload review images to Supabase Storage (review-images bucket). Returns public URLs. */
  const uploadReviewImages = async (
    files: { file: File; preview: string }[],
    slug: string,
  ): Promise<string[]> => {
    const { getSupabaseClient } = await import('../lib/supabase');
    const client = getSupabaseClient();
    if (!client || !files.length) return [];
    const urls: string[] = [];
    for (const { file } of files) {
      try {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await client.storage.from('review-images').upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });
        if (!error) {
          const { data: urlData } = client.storage.from('review-images').getPublicUrl(path);
          if (urlData?.publicUrl) urls.push(urlData.publicUrl);
        } else {
          console.warn('[TenantStorefrontView] review image upload error:', error.message);
        }
      } catch (err: any) {
        console.warn('[TenantStorefrontView] review image upload exception:', err?.message || err);
      }
    }
    return urls;
  };

  /** POST a review for a single ordered item to /api/reviews. */
  const handleSubmitModalReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModal) return;
    setModalError('');
    if (modalRating < 1 || modalRating > 5) {
      setModalError(t('sf_review_required'));
      return;
    }
    const { order, item } = reviewModal;
    const slug = String(effectiveStoreSlug || '').split(':')[0].trim();
    setIsModalSubmitting(true);
    let saved = false;
    // Upload images to Supabase Storage first, then include URLs in the review payload.
    const imageUrls = await uploadReviewImages(modalReviewImages, slug || 'general');
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: item.id,
          productName: item.productName,
          orderId: order.id,
          orderNumber: order.orderNumber,
          rating: modalRating,
          comment: modalComment.trim(),
          customerName: customerSession?.name || order.customerName,
          customerPhone: customerSession?.phone || order.customerPhone,
          storeSlug: slug,
          storeId: order.storeId,
          merchantId: (merchant as any)?.id || order.merchantId,
          ...(imageUrls.length ? { imageUrls } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      saved = Boolean(res.ok && data?.ok !== false);
    } catch (err: any) {
      saved = false;
    }
    setIsModalSubmitting(false);

    // Optimistic local record so the card shows "Reviewed" right away.
    const newReview: CustomerReviewItem = {
      id: `rev-${Date.now()}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      productId: item.id,
      productTitle: item.productName,
      productImage: item.image,
      rating: modalRating,
      comment: modalComment.trim(),
      customerName: customerSession?.name || order.customerName,
      createdAt: new Date().toLocaleString(),
    };
    setCustomerReviews((prev) => [newReview, ...prev]);
    if (!saved) console.warn('[TenantStorefrontView] review saved locally; server sync pending');
    closeItemModals();
  };'''

# Normalize CRLF to LF for comparison
old_block_norm = old_block.replace('\r\n', '\n')
content_norm = content.replace('\r\n', '\n')

if old_block_norm in content_norm:
    content_norm = content_norm.replace(old_block_norm, new_block, 1)
    # Write back with original line endings
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content_norm)
    print("SUCCESS: Patch 1 applied (handlers + uploadReviewImages)")
else:
    print("FAIL: Old block not found for Patch 1")
    # Debug: find where it diverges
    lines = old_block_norm.split('\n')
    for i, line in enumerate(lines):
        if line not in content_norm:
            print(f"  First missing line [{i}]: {repr(line[:80])}")
            break
