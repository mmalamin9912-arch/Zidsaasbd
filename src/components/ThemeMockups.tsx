import React from 'react';
import { Search, Menu, ShoppingCart, ChevronRight, Star, Heart, User, ArrowRight } from 'lucide-react';
import SafeImage from './SafeImage';

export const SupermarketTechMockup: React.FC = () => {
  return (
    <div className="min-h-full bg-[#F2F4F8] font-sans text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="bg-[#00D68F] text-slate-950 py-2 px-4 text-center text-xs font-extrabold tracking-wide">
          FLASH SALE: UP TO 50% OFF ELECTRONICS & GROCERIES
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#00D68F] rounded-xl flex items-center justify-center text-slate-950 font-black text-xl">S</div>
              <span className="font-extrabold text-xl hidden sm:block tracking-tight text-slate-900">MegaMart</span>
            </div>

            <div className="flex-1 max-w-2xl hidden md:flex">
              <div className="relative w-full flex items-center">
                <input type="text" placeholder="Search for groceries, tech, appliances..." className="w-full bg-slate-100 border-2 border-transparent focus:border-[#00D68F] focus:bg-white rounded-xl py-2.5 px-4 pr-12 text-sm transition-all outline-none" readOnly />
                <button className="absolute right-2 p-1.5 bg-[#00D68F] text-slate-950 rounded-lg"><Search className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl hidden sm:block"><User className="w-5 h-5" /></button>
              <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span className="bg-[#00D68F] text-slate-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">3</span>
                <span className="font-bold text-sm hidden sm:block">৳ 4,500</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-[1400px] mx-auto w-full flex flex-col lg:flex-row gap-6 p-4 md:p-6">
        {/* Sidebar Categories */}
        <aside className="hidden lg:block w-72 shrink-0 bg-white rounded-3xl border border-slate-200/60 p-6 h-fit shadow-sm">
          <h3 className="font-extrabold text-slate-900 mb-4 flex items-center gap-2">
            <Menu className="w-5 h-5 text-[#00D68F]" />
            All Categories
          </h3>
          <nav className="space-y-1">
            {['Fresh Produce', 'Groceries & Essentials', 'Dairy & Bakery', 'Snacks & Beverages', 'Mobiles & Tablets', 'Home Appliances', 'Personal Care'].map((cat, i) => (
              <a key={i} href="#" onClick={e => e.preventDefault()} className={`block py-2.5 px-3 rounded-xl text-sm font-semibold transition flex items-center justify-between ${i === 4 ? 'bg-slate-50 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
                {cat}
                <ChevronRight className="w-4 h-4 opacity-50" />
              </a>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 space-y-8">
          {/* Hero Banner */}
          <section className="bg-slate-900 rounded-3xl overflow-hidden relative min-h-[300px] flex items-center">
            <SafeImage src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80" alt="Supermarket Hero" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/80 to-transparent" />
            <div className="relative z-10 p-8 sm:p-12 max-w-xl">
              <span className="inline-block px-3 py-1 bg-[#00D68F] text-slate-950 font-black text-xs rounded-full mb-4">WEEKEND SPECIAL</span>
              <h2 className="text-3xl md:text-5xl font-black text-white mb-4 leading-tight">Fresh Groceries & Latest Tech</h2>
              <p className="text-slate-300 text-sm md:text-base mb-8">Get everything you need delivered in 30 minutes with our express delivery.</p>
              <button className="bg-white text-slate-900 hover:bg-slate-100 font-extrabold px-6 py-3 rounded-xl transition shadow-lg">Shop Now</button>
            </div>
          </section>

          {/* Grid section */}
          <section className="space-y-4">
            <div className="flex justify-between items-end border-b border-slate-200 pb-3">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Flash Deals</h2>
              <button className="text-sm font-bold text-[#00D68F] hover:underline cursor-pointer">View All</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { title: 'Organic Apples (1kg)', price: '250', oldPrice: '350', img: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=400&q=80', badge: '-28%' },
                { title: 'Samsung Galaxy S24 Ultra', price: '145,000', oldPrice: '155,000', img: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=400&q=80', badge: 'Tech' },
                { title: 'Fresh Dairy Milk 1L', price: '90', oldPrice: '100', img: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=400&q=80', badge: 'Fresh' },
                { title: 'Sony WH-1000XM5', price: '32,500', oldPrice: '38,000', img: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=400&q=80', badge: 'Audio' },
              ].map((prod, i) => (
                <div key={i} className="bg-white rounded-2xl p-3 border border-slate-200 hover:shadow-lg transition-all relative group flex flex-col justify-between">
                  <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">{prod.badge}</div>
                  <div className="aspect-square bg-slate-50 rounded-xl overflow-hidden mb-3 relative">
                    <SafeImage src={prod.img} alt={prod.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-300 mix-blend-multiply" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <h4 className="font-semibold text-sm text-slate-900 line-clamp-2 mb-2">{prod.title}</h4>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-extrabold text-slate-900">৳ {prod.price}</span>
                        <span className="text-xs text-slate-400 line-through">৳ {prod.oldPrice}</span>
                      </div>
                      <button className="w-full bg-slate-100 text-slate-700 hover:bg-[#00D68F] hover:text-slate-950 font-bold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1">
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export const ElegantFashionMockup: React.FC = () => {
  return (
    <div className="min-h-full bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button className="sm:hidden p-2"><Menu className="w-5 h-5" /></button>

          <div className="text-xl sm:text-2xl font-serif font-black tracking-widest uppercase text-slate-900">
            AURA
          </div>

          <nav className="hidden sm:flex items-center gap-6">
            {['New Arrivals', 'Women', 'Men', 'Accessories', 'Sale'].map(item => (
              <a key={item} href="#" onClick={e => e.preventDefault()} className="text-xs font-bold text-slate-600 hover:text-slate-900 uppercase tracking-widest transition">
                {item}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button className="p-2 text-slate-900 hover:bg-slate-50 rounded-full"><Search className="w-5 h-5" /></button>
            <button className="p-2 text-slate-900 hover:bg-slate-50 rounded-full hidden sm:block"><Heart className="w-5 h-5" /></button>
            <button className="p-2 text-slate-900 hover:bg-slate-50 rounded-full relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>
        </div>
      </header>

      {/* Story Categories */}
      <div className="bg-white border-b border-slate-100 py-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-4 px-4 max-w-7xl mx-auto min-w-max">
          {[
            { name: 'Summer', img: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=200&q=80' },
            { name: 'Dresses', img: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=200&q=80' },
            { name: 'Bags', img: 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=200&q=80' },
            { name: 'Shoes', img: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=200&q=80' },
            { name: 'Jewelry', img: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=200&q=80' },
            { name: 'Denim', img: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=200&q=80' },
          ].map((cat, i) => (
            <div key={i} className="flex flex-col items-center gap-2 cursor-pointer group">
              <div className="w-16 h-16 rounded-full border-2 border-slate-200 group-hover:border-slate-900 p-0.5 transition-all">
                <div className="w-full h-full rounded-full overflow-hidden">
                  <SafeImage src={cat.img} alt={cat.name} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-12">
        {/* Minimal Hero */}
        <section className="relative h-[60vh] sm:h-[70vh] rounded-[2rem] overflow-hidden bg-slate-900 flex items-center justify-center text-center">
          <SafeImage src="https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&w=1600&q=80" alt="Fashion Hero" className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay" />
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 p-6 flex flex-col items-center">
            <h2 className="text-4xl sm:text-6xl font-serif text-white mb-6 max-w-2xl leading-tight">The Summer Collection</h2>
            <button className="bg-white text-slate-900 hover:bg-slate-100 font-bold uppercase tracking-widest text-xs px-8 py-4 transition flex items-center gap-2">
              Discover Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Product Grid */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-serif text-slate-900">Trending Now</h2>
            <a href="#" className="text-sm font-bold text-slate-500 hover:text-slate-900 border-b border-transparent hover:border-slate-900 transition">View All</a>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {[
              { title: 'Linen Wrap Dress', price: '4,500', img: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=600&q=80' },
              { title: 'Leather Mini Bag', price: '8,900', img: 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?auto=format&fit=crop&w=600&q=80' },
              { title: 'Pleated Midi Skirt', price: '3,200', img: 'https://images.unsplash.com/photo-1583496661160-c588c443c982?auto=format&fit=crop&w=600&q=80' },
              { title: 'Silk Camisole', price: '2,100', img: 'https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?auto=format&fit=crop&w=600&q=80' },
            ].map((prod, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="aspect-[3/4] bg-slate-100 overflow-hidden relative mb-4">
                  <SafeImage src={prod.img} alt={prod.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
                  <div className="absolute inset-x-0 bottom-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/50 to-transparent flex justify-center">
                    <button className="w-full bg-white text-slate-900 font-bold text-xs py-3 uppercase tracking-widest hover:bg-slate-100 transition">
                      Quick Add
                    </button>
                  </div>
                </div>
                <h4 className="font-medium text-sm text-slate-900 mb-1">{prod.title}</h4>
                <p className="text-slate-500 text-sm">৳ {prod.price}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};
