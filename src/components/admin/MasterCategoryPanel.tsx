/**
 * MASTER CATEGORY MANAGEMENT — the Super Admin owner of the global taxonomy.
 *
 * This is the authoritative category tree every merchant's product form reads
 * from and every marketplace filter resolves against. Unlike the presentation
 * list in Marketplace Studio (which only decides what the front-page rail
 * shows), a node here defines a category that products may be TAGGED with.
 *
 *   Primary category  →  sub-category  →  (optional) sub-type
 *
 * Renames propagate to existing products server-side, so a product never ends
 * up stranded under a name the tree no longer contains.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, Save, Loader2, ChevronDown, ChevronRight, ChevronUp,
  Eye, EyeOff, Pencil, X, FolderTree, Sparkles, Tag, AlertTriangle,
} from 'lucide-react';
import SafeImage from '../SafeImage';
import { useToast } from '../ToastProvider';
import { readAndDownscaleImage } from '../../utils/imageUtils';
import {
  type TaxonomyNode,
  type TaxonomyTree,
  fetchAdminTaxonomy,
  createTaxonomyNode,
  updateTaxonomyNode,
  deleteTaxonomyNode,
  reorderTaxonomyNodes,
  seedStarterTaxonomy,
} from '../../lib/categoryTaxonomyApi';

const CARD = 'bg-[#181B26] border border-[#2E3548] rounded-2xl';
const INNER = 'bg-[#202533] border border-[#2E3548] rounded-xl';
const INPUT =
  'w-full bg-[#181B26] border border-[#3A435E] rounded-xl px-3 py-2 text-sm text-white ' +
  'focus:ring-2 focus:ring-indigo-500/50 outline-none placeholder:text-slate-600';
const LABEL = 'block text-[10px] uppercase font-black text-slate-500 mb-1.5';

interface EditorState {
  mode: 'create' | 'edit';
  /** Present when editing. */
  id?: string;
  name: string;
  emoji: string;
  image?: string;
  description: string;
  parentId: string | null;
  isActive: boolean;
}

const blankEditor = (parentId: string | null = null): EditorState => ({
  mode: 'create',
  name: '',
  emoji: '',
  description: '',
  parentId,
  isActive: true,
});

export const MasterCategoryPanel: React.FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<TaxonomyNode[]>([]);
  const [tree, setTree] = useState<TaxonomyTree[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminTaxonomy();
      setNodes(data.nodes);
      setTree(data.tree);
      // Open every primary by default so the structure is visible at a glance.
      setExpanded(new Set(data.nodes.filter((n) => !n.parent_id).map((n) => n.id)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const primaryCount = useMemo(() => nodes.filter((n) => !n.parent_id).length, [nodes]);
  const subCount = useMemo(() => nodes.filter((n) => n.parent_id).length, [nodes]);
  const hiddenCount = useMemo(() => nodes.filter((n) => !n.isActive).length, [nodes]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* ──────────────────────────── mutations ──────────────────────────── */

  const handleSave = async () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) {
      toast.error('A category name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === 'edit' && editor.id) {
        const res = await updateTaxonomyNode(editor.id, {
          name,
          emoji: editor.emoji || undefined,
          image: editor.image || undefined,
          description: editor.description || undefined,
          parent_id: editor.parentId,
          isActive: editor.isActive,
        });
        if (!res.ok) {
          toast.error('Category was NOT updated', { description: res.error });
          return;
        }
        toast.success('Category updated', {
          description: res.renamedProducts
            ? `${res.renamedProducts} product${res.renamedProducts === 1 ? '' : 's'} re-tagged with the new name.`
            : undefined,
        });
      } else {
        const res = await createTaxonomyNode({
          name,
          emoji: editor.emoji || undefined,
          image: editor.image || undefined,
          description: editor.description || undefined,
          parent_id: editor.parentId,
          isActive: editor.isActive,
        });
        if (!res.ok) {
          toast.error('Category was NOT created', { description: res.error });
          return;
        }
        if (editor.parentId) setExpanded((prev) => new Set(prev).add(editor.parentId!));
        toast.success(`“${name}” added to the global taxonomy`);
      }
      setEditor(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (node: TaxonomyNode) => {
    const res = await updateTaxonomyNode(node.id, { isActive: !node.isActive });
    if (!res.ok) {
      toast.error('Visibility was NOT changed', { description: res.error });
      return;
    }
    await load();
  };

  const handleDelete = async (node: TaxonomyNode) => {
    if (!window.confirm(
      `Delete “${node.name}”?\n\nProducts already tagged with it keep the label, but it disappears from the merchant dropdown and the marketplace menu.`
    )) return;
    const res = await deleteTaxonomyNode(node.id);
    if (!res.ok) {
      toast.error('Category was NOT deleted', { description: res.error });
      return;
    }
    toast.success('Category deleted');
    await load();
  };

  /** Move a node up/down among its own siblings. */
  const handleMove = async (node: TaxonomyNode, siblings: TaxonomyTree[], dir: -1 | 1) => {
    const index = siblings.findIndex((s) => s.id === node.id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const ordered = [...siblings];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    const entries = ordered.map((s, i) => ({ id: s.id, sortOrder: i }));
    setTree((prev) => applyLocalOrder(prev, node.parent_id, ordered.map((s) => s.id)));
    const res = await reorderTaxonomyNodes(entries);
    if (!res.ok) {
      toast.error('Order was not saved', { description: res.error });
    }
    await load();
  };

  const handleSeed = async () => {
    if (!window.confirm('Install the starter category tree?\n\nExisting categories with the same name are kept — nothing is overwritten.')) return;
    setSeeding(true);
    try {
      const res = await seedStarterTaxonomy();
      if (!res.ok) {
        toast.error('Starter tree was NOT installed', { description: res.error });
        return;
      }
      toast.success(res.created > 0 ? `${res.created} categories added` : 'The starter tree is already installed');
      await load();
    } finally {
      setSeeding(false);
    }
  };

  /* ──────────────────────────── rendering ──────────────────────────── */

  const renderNode = (node: TaxonomyTree, siblings: TaxonomyTree[], depth: number) => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    const isPrimary = !node.parent_id;

    return (
      <div key={node.id}>
        <div
          className={`group flex flex-wrap items-center gap-2 border-b border-[#2E3548] px-3 py-2 hover:bg-[#1d2130] ${
            node.isActive ? '' : 'opacity-55'
          }`}
          style={{ paddingLeft: `${12 + depth * 22}px` }}
        >
          <button
            type="button"
            onClick={() => toggle(node.id)}
            disabled={!hasChildren}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 ${
              hasChildren ? 'hover:bg-[#2E3548] hover:text-white cursor-pointer' : 'opacity-25'
            }`}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {hasChildren ? (
              isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
            ) : (
              <span className="h-1 w-1 rounded-full bg-slate-600" />
            )}
          </button>

          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#eef0ff] text-sm">
            {node.image ? <SafeImage src={node.image} alt={node.name} className="h-full w-full object-cover" /> : (node.emoji || (isPrimary ? '📁' : '🏷️'))}
          </span>

          <span className={`min-w-0 flex-1 truncate text-sm ${isPrimary ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
            {node.name}
          </span>

          {isPrimary && (
            <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-indigo-300">
              Primary
            </span>
          )}
          {node.level === 3 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300">
              Sub-type
            </span>
          )}
          {hasChildren && (
            <span className="text-[10px] text-slate-500">{node.children.length} sub</span>
          )}

          <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition group-hover:opacity-100">
            <button type="button" onClick={() => void handleMove(node, siblings, -1)} className="rounded p-1.5 text-slate-400 hover:bg-[#2E3548] hover:text-white" title="Move up">
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => void handleMove(node, siblings, 1)} className="rounded p-1.5 text-slate-400 hover:bg-[#2E3548] hover:text-white" title="Move down">
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {depth < 2 && (
              <button
                type="button"
                onClick={() => setEditor(blankEditor(node.id))}
                className="rounded p-1.5 text-slate-400 hover:bg-[#2E3548] hover:text-emerald-400"
                title={depth === 0 ? 'Add sub-category' : 'Add sub-type'}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleToggleActive(node)}
              className="rounded p-1.5 text-slate-400 hover:bg-[#2E3548] hover:text-white"
              title={node.isActive ? 'Hide from merchants' : 'Show to merchants'}
            >
              {node.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setEditor({
                mode: 'edit',
                id: node.id,
                name: node.name,
                emoji: node.emoji || '',
                image: node.image,
                description: node.description || '',
                parentId: node.parent_id,
                isActive: node.isActive,
              })}
              className="rounded p-1.5 text-slate-400 hover:bg-[#2E3548] hover:text-white"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(node)}
              className="rounded p-1.5 text-slate-400 hover:bg-[#2E3548] hover:text-red-400"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {isOpen && node.children.map((child) => renderNode(child, node.children, depth + 1))}
      </div>
    );
  };

  const parentOptions = useMemo(
    () => nodes.filter((n) => n.level <= 2 && n.id !== editor?.id),
    [nodes, editor?.id],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">Master Categories</h3>
          <p className="text-xs text-slate-400">
            The global category tree. Merchants choose from this list when creating products, and the
            marketplace mega-menu is built from it — so the same product can never be filed under three
            different spellings.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSeed()}
            disabled={seeding}
            className="flex items-center gap-1.5 rounded-xl border border-[#3A435E] bg-[#202533] px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-[#282E3F] disabled:opacity-50"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Load starter tree
          </button>
          <button
            type="button"
            onClick={() => setEditor(blankEditor(null))}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
          >
            <Plus className="w-4 h-4" /> New primary category
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Primary categories', value: primaryCount, color: 'text-indigo-400', Icon: FolderTree },
          { label: 'Sub-categories', value: subCount, color: 'text-emerald-400', Icon: Tag },
          { label: 'Hidden', value: hiddenCount, color: 'text-amber-400', Icon: EyeOff },
        ].map((stat) => (
          <div key={stat.label} className={`${CARD} p-4`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-500">{stat.label}</span>
              <stat.Icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className="text-xl font-black text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {nodes.length === 0 && !loading && (
        <div className={`${INNER} flex items-start gap-3 p-5`}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <div className="text-sm font-bold text-white">No global taxonomy yet</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Until a tree exists, merchants keep their legacy free-text categories. Install the starter
              tree above (or create your own primary categories) — as soon as any category exists, the
              product form switches to the mandatory Category → Sub-category dropdowns.
            </p>
          </div>
        </div>
      )}

      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[#2E3548] px-4 py-3">
          <h4 className="flex items-center gap-2 text-sm font-bold text-white">
            <FolderTree className="h-4 w-4 text-indigo-400" /> Category tree
          </h4>
          <button type="button" onClick={() => void load()} className="text-[11px] font-bold text-slate-400 hover:text-white">
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading taxonomy…
          </div>
        ) : tree.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            Nothing here yet — create a primary category to get started.
          </div>
        ) : (
          <div>{tree.map((node) => renderNode(node, tree, 0))}</div>
        )}
      </div>

      {/* ── Editor modal ── */}
      {editor && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className={`${CARD} my-10 w-full max-w-xl space-y-4 p-6`}>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">
                {editor.mode === 'edit'
                  ? 'Edit category'
                  : editor.parentId ? 'New sub-category' : 'New primary category'}
              </h4>
              <button type="button" onClick={() => setEditor(null)} className="rounded-lg p-2 text-slate-400 hover:bg-[#2E3548] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className={LABEL}>Category name *</label>
              <input
                className={INPUT}
                value={editor.name}
                autoFocus
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSave(); } }}
                placeholder="e.g. Sarees & Jamdani"
              />
              {editor.mode === 'edit' && (
                <p className="mt-1.5 text-[10px] text-amber-400/90">
                  Renaming re-tags every existing product using this category, so it stays filterable.
                </p>
              )}
            </div>

            <div>
              <label className={LABEL}>Parent category</label>
              <select
                className={INPUT}
                value={editor.parentId || ''}
                onChange={(e) => setEditor({ ...editor, parentId: e.target.value || null })}
              >
                <option value="">— None (primary category) —</option>
                {parentOptions.map((node) => (
                  <option key={node.id} value={node.id}>
                    {'— '.repeat(node.level - 1)}{node.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Emoji</label>
                <input
                  className={INPUT}
                  maxLength={4}
                  value={editor.emoji}
                  onChange={(e) => setEditor({ ...editor, emoji: e.target.value })}
                  placeholder="👗"
                />
              </div>
              <div>
                <label className={LABEL}>Cover image (optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const dataUrl = await readAndDownscaleImage(file, 512);
                      if (dataUrl) setEditor({ ...editor, image: dataUrl });
                    }}
                    className="w-full text-[10px] text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-[#2E3548] file:px-2 file:py-1.5 file:text-[10px] file:font-semibold file:text-white hover:file:bg-[#3A435E]"
                  />
                  {editor.image && (
                    <button type="button" onClick={() => setEditor({ ...editor, image: undefined })} className="rounded p-1 text-slate-400 hover:text-red-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL}>Description (optional)</label>
              <input
                className={INPUT}
                value={editor.description}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                placeholder="Shown in the mega-menu under the heading"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-300">
              <input
                type="checkbox"
                checked={editor.isActive}
                onChange={(e) => setEditor({ ...editor, isActive: e.target.checked })}
                className="h-4 w-4 accent-indigo-500"
              />
              Visible to merchants and shoppers
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditor(null)} className="rounded-xl border border-[#3A435E] bg-[#202533] px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-[#282E3F]">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editor.mode === 'edit' ? 'Save changes' : 'Create category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Re-order one sibling set in the local tree so the move is visible instantly. */
function applyLocalOrder(tree: TaxonomyTree[], parentId: string | null, orderedIds: string[]): TaxonomyTree[] {
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  const sortLevel = (level: TaxonomyTree[]) =>
    [...level].sort((a, b) => (rank.get(a.id) ?? a.sortOrder) - (rank.get(b.id) ?? b.sortOrder));
  if (parentId === null) return sortLevel(tree);
  return tree.map((node) => {
    if (node.id === parentId) return { ...node, children: sortLevel(node.children) };
    return { ...node, children: applyLocalOrder(node.children, parentId, orderedIds) };
  });
}

export default MasterCategoryPanel;
