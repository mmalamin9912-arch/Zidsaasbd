const fs = require('fs');
const filepath = 'c:/Users/Dell/Desktop/zid-bd-merchant-dashboard/src/components/TenantStorefrontView.tsx';
let content = fs.readFileSync(filepath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// ─── PATCH A: Fix the review button - update reviewed check to also check order.is_reviewed ───
// The button is already correct - delivered && !reviewed determines active state
// The fix: also check order-level is_reviewed field from server if customerReviews is empty
const oldReviewedCheck = `                    const reviewed = customerReviews.some((r) => r.orderId === order.id && (!r.productId || r.productId === item.id));`;
const newReviewedCheck = `                    // A review exists if: (a) the customer submitted one in this session (localStorage/server-hydrated),
                    // OR (b) the server-side order row has is_reviewed===true for this item.
                    const reviewed =
                      customerReviews.some((r) => r.orderId === order.id && (!r.productId || r.productId === item.id)) ||
                      Boolean((order as any).is_reviewed === true && (!item.id));`;

// ─── PATCH B: Update Review Modal div to allow scroll + add image upload section ───
const oldReviewModal = `            <div
            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                {reviewModal.item.image ? (
                  <SafeImage src={reviewModal.item.image} alt="" className="h-11 w-11 rounded-xl border border-slate-100 object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                    <ShoppingBag className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">{t('sf_review_modal_title')}</h3>
                  <p className="truncate text-xs text-slate-500">{t('sf_review_for')} {reviewModal.item.productName}</p>
                </div>
              </div>
              <button onClick={closeItemModals} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitModalReview} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_review_comment_label')}</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setModalRating(n)} className="cursor-pointer transition hover:scale-110" aria-label={\`\${n} star\`}>
                      <Star className={\`h-9 w-9 \${n <= modalRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}\`} />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-bold text-slate-600">{modalRating > 0 ? \`\${modalRating}/5\` : ''}</span>
                </div>
              </div>
              <textarea
                value={modalComment}
                onChange={(e) => setModalComment(e.target.value)}
                placeholder={t('sf_review_placeholder')}
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
              />
              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{modalError}</div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={closeItemModals} className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                  {t('sf_cancel')}
                </button>
                <button type="submit" disabled={isModalSubmitting} className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-accent)] py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer disabled:opacity-60">
                  {isModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                  {isModalSubmitting ? t('sf_submitting') : t('sf_submit')}
                </button>
              </div>
            </form>
          </div>`;

const newReviewModal = `            <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
              <div className="flex items-center gap-3">
                {reviewModal.item.image ? (
                  <SafeImage src={reviewModal.item.image} alt="" className="h-11 w-11 rounded-xl border border-slate-100 object-cover" />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                    <ShoppingBag className="h-5 w-5 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">{t('sf_review_modal_title')}</h3>
                  <p className="truncate text-xs text-slate-500">{t('sf_review_for')} {reviewModal.item.productName}</p>
                </div>
              </div>
              <button onClick={closeItemModals} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitModalReview} className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_review_comment_label')}</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setModalRating(n)} className="cursor-pointer transition hover:scale-110" aria-label={\`\${n} star\`}>
                      <Star className={\`h-9 w-9 \${n <= modalRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}\`} />
                    </button>
                  ))}
                  <span className="ml-2 text-sm font-bold text-slate-600">{modalRating > 0 ? \`\${modalRating}/5\` : ''}</span>
                </div>
              </div>
              <textarea
                value={modalComment}
                onChange={(e) => setModalComment(e.target.value)}
                placeholder={t('sf_review_placeholder')}
                rows={4}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[var(--primary-accent)]"
              />
              {/* ── Photo / Camera Upload ── */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_review_add_photo')}</label>
                <div className="flex flex-wrap gap-2">
                  {/* Existing preview thumbnails */}
                  {modalReviewImages.map((img, idx) => (
                    <div key={idx} className="relative h-20 w-20 shrink-0">
                      <img src={img.preview} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
                      <button
                        type="button"
                        onClick={() => setModalReviewImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow cursor-pointer"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {/* Add photo buttons — hidden when 4 images reached */}
                  {modalReviewImages.length < 4 && (
                    <div className="flex gap-2">
                      {/* Gallery picker */}
                      <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-[var(--primary-accent)] hover:bg-slate-100 transition">
                        <Camera className="h-5 w-5" />
                        <span className="text-[9px] font-bold leading-tight text-center">
                          {t('sf_review_add_photo_btn')}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleModalReviewImages}
                        />
                      </label>
                      {/* Camera capture (mobile) */}
                      <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-600 hover:border-amber-400 hover:bg-amber-100 transition">
                        <Camera className="h-5 w-5" />
                        <span className="text-[9px] font-bold leading-tight text-center">
                          {t('sf_review_camera_btn')}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handleModalReviewImages}
                        />
                      </label>
                    </div>
                  )}
                </div>
                {modalReviewImages.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    {modalReviewImages.length}/4 {t('sf_review_photos_selected')}
                  </p>
                )}
              </div>
              {modalError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{modalError}</div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={closeItemModals} className="flex-1 rounded-xl border border-slate-300 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                  {t('sf_cancel')}
                </button>
                <button type="submit" disabled={isModalSubmitting} className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary-accent)] py-3 text-sm font-black text-slate-950 hover:bg-[var(--primary-accent)]/90 transition cursor-pointer disabled:opacity-60">
                  {isModalSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                  {isModalSubmitting ? t('sf_submitting') : t('sf_submit')}
                </button>
              </div>
            </form>
          </div>`;

// Apply Patch A
if (content.includes(oldReviewedCheck)) {
  content = content.replace(oldReviewedCheck, newReviewedCheck);
  console.log('Patch A (reviewed check) applied');
} else {
  console.log('Patch A FAILED - old text not found');
  // Find divergence
  const lines = oldReviewedCheck.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!content.includes(lines[i])) {
      console.log('  First missing line [' + i + ']: ' + JSON.stringify(lines[i].slice(0, 100)));
      break;
    }
  }
}

// Apply Patch B
if (content.includes(oldReviewModal)) {
  content = content.replace(oldReviewModal, newReviewModal);
  console.log('Patch B (review modal UI) applied');
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('File saved');
} else {
  console.log('Patch B FAILED - old review modal not found');
  // Find divergence
  const lines = oldReviewModal.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!content.includes(lines[i])) {
      console.log('  First missing line [' + i + ']: ' + JSON.stringify(lines[i].slice(0, 100)));
      break;
    }
  }
}
