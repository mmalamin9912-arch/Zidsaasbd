const fs = require('fs');
const filepath = 'c:/Users/Dell/Desktop/zid-bd-merchant-dashboard/src/components/TenantStorefrontView.tsx';
let content = fs.readFileSync(filepath, 'utf8');
content = content.replace(/\r\n/g, '\n');

// ─── PATCH B1: Change inner div from fixed size to scrollable ───
const oldDiv = `            className="w-full max-w-md rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">`;
const newDiv = `            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">`;

// ─── PATCH B2: Insert photo upload section before modalError in review form ───
const oldErrorBlock = `              {modalError && (
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
          </div>
        </div>
      )}
      {/* Item-level Request Return Modal */}`;

const newErrorBlock = `              {/* ── Photo / Camera Upload ── */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600">{t('sf_review_add_photo')}</label>
                <div className="flex flex-wrap gap-2">
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
                  {modalReviewImages.length < 4 && (
                    <div className="flex gap-2">
                      <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-[var(--primary-accent)] hover:bg-slate-100 transition">
                        <Camera className="h-5 w-5" />
                        <span className="text-[9px] font-bold leading-tight text-center px-1">{t('sf_review_add_photo_btn')}</span>
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handleModalReviewImages} />
                      </label>
                      <label className="flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-600 hover:border-amber-400 hover:bg-amber-100 transition">
                        <Camera className="h-5 w-5" />
                        <span className="text-[9px] font-bold leading-tight text-center px-1">{t('sf_review_camera_btn')}</span>
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleModalReviewImages} />
                      </label>
                    </div>
                  )}
                </div>
                {modalReviewImages.length > 0 && (
                  <p className="mt-1.5 text-[10px] text-slate-400">{modalReviewImages.length}/4 {t('sf_review_photos_selected')}</p>
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
          </div>
        </div>
      )}
      {/* Item-level Request Return Modal */}`;

let changed = 0;

if (content.includes(oldDiv)) {
  content = content.replace(oldDiv, newDiv);
  changed++;
  console.log('B1 (scrollable div) applied');
} else {
  console.log('B1 FAILED');
  const lines = oldDiv.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!content.includes(lines[i])) {
      console.log('  Missing [' + i + ']: ' + JSON.stringify(lines[i].slice(0, 100)));
      break;
    }
  }
}

if (content.includes(oldErrorBlock)) {
  content = content.replace(oldErrorBlock, newErrorBlock);
  changed++;
  console.log('B2 (photo upload UI) applied');
} else {
  console.log('B2 FAILED');
  const lines = oldErrorBlock.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!content.includes(lines[i])) {
      console.log('  Missing [' + i + ']: ' + JSON.stringify(lines[i].slice(0, 100)));
      break;
    }
  }
}

if (changed > 0) {
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('File saved. Changes applied: ' + changed);
}
