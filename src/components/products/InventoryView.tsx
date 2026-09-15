import React, { useState } from 'react';
import { Product } from '../../types';
import { Warehouse, Search, Plus, Minus, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
import SafeImage from '../SafeImage';

interface InventoryViewProps {
  products: Product[];
  onUpdateProducts?: (products: Product[]) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({ products, onUpdateProducts }) => {
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdjustStock = (productId: string, delta: number) => {
    const updated = products.map(p => {
      if (p.id === productId) {
        const newStock = Math.max(0, p.stock + delta);
        return {
          ...p,
          stock: newStock,
          status: newStock === 0 ? ('Out of Stock' as const) : p.status === 'Out of Stock' ? ('Active' as const) : p.status,
        };
      }
      return p;
    });

    if (onUpdateProducts) {
      onUpdateProducts(updated);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#202533] border border-[#2E3548] p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Warehouse className="w-5 h-5 text-[#00D68F]" />
            <span>Multi-Warehouse Inventory Stock Matrix</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor real-time inventory counts across Dhaka, Chittagong, and Sylhet distribution centers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedWarehouse}
            onChange={(e) => setSelectedWarehouse(e.target.value)}
            className="bg-[#181B26] border border-[#2E3548] rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-[#00D68F]"
          >
            <option value="all">All Regional Warehouses</option>
            <option value="dhaka">Dhaka Central Hub</option>
            <option value="ctg">Chittagong Regional Depot</option>
            <option value="sylhet">Sylhet Fulfillment Center</option>
          </select>
        </div>
      </div>

      {/* Top Search Bar */}
      <div className="bg-[#202533] border border-[#2E3548] p-4 rounded-2xl flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stock by product name or SKU..."
            className="w-full bg-[#181B26] border border-[#2E3548] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#00D68F]"
          />
        </div>
      </div>

      {/* Inventory Stock Table */}
      <div className="bg-[#202533] border border-[#2E3548] rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-[#181B26] text-slate-400 uppercase text-[10px] tracking-wider border-b border-[#2E3548] font-bold">
              <tr>
                <th className="p-3.5">Product Item</th>
                <th className="p-3.5">SKU</th>
                <th className="p-3.5">Dhaka Hub</th>
                <th className="p-3.5">CTG Depot</th>
                <th className="p-3.5">Sylhet Hub</th>
                <th className="p-3.5">Total Stock</th>
                <th className="p-3.5 text-right">Quick Stock Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2E3548]">
              {filteredProducts.map((p) => {
                const dhakaStock = p.warehouseStocks?.[0]?.stock ?? Math.floor(p.stock * 0.5);
                const ctgStock = p.warehouseStocks?.[1]?.stock ?? Math.floor(p.stock * 0.3);
                const sylhetStock = p.warehouseStocks?.[2]?.stock ?? Math.max(0, p.stock - dhakaStock - ctgStock);

                return (
                  <tr key={p.id} className="hover:bg-[#252B3B]">
                    <td className="p-3.5 flex items-center gap-3">
                      <SafeImage src={p.image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200'} alt={p.title} className="w-10 h-10 object-cover rounded-lg border border-[#3A435E]" />
                      <div>
                        <div className="font-bold text-white">{p.title}</div>
                        <div className="text-[10px] text-slate-400">{p.category}</div>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-slate-300">{p.sku}</td>
                    <td className="p-3.5 font-bold text-white">{dhakaStock} pcs</td>
                    <td className="p-3.5 font-bold text-white">{ctgStock} pcs</td>
                    <td className="p-3.5 font-bold text-white">{sylhetStock} pcs</td>
                    <td className="p-3.5 font-extrabold">
                      {p.stock === 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Out of Stock</span>
                        </span>
                      ) : p.stock < 10 ? (
                        <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Low Stock: {p.stock}</span>
                        </span>
                      ) : (
                        <span className="text-[#00D68F] font-black">{p.stock} Units</span>
                      )}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center gap-1 bg-[#181B26] p-1 rounded-xl border border-[#2E3548]">
                        <button
                          onClick={() => handleAdjustStock(p.id, -1)}
                          className="w-7 h-7 bg-[#282E3F] hover:bg-[#32394E] rounded-lg text-white font-bold flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center font-black text-white text-xs">{p.stock}</span>
                        <button
                          onClick={() => handleAdjustStock(p.id, 1)}
                          className="w-7 h-7 bg-[#282E3F] hover:bg-[#32394E] rounded-lg text-white font-bold flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
