import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  AlertTriangle, 
  TrendingDown, 
  Plus, 
  RefreshCw, 
  Search, 
  ArrowRight,
  ExternalLink,
  LogIn,
  LogOut,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { auth, signInWithGoogle, firebaseConfig } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';

// --- Components ---

const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-[#141414] border border-white/5 p-5 rounded-2xl flex items-start justify-between relative overflow-hidden group"
  >
    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative z-10">
      <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-2 font-display">{title}</p>
      <div className="flex items-baseline space-x-2">
        <h2 className="text-3xl font-black text-white tracking-tighter font-display">{value}</h2>
        {sub && <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${color.replace('text', 'bg')}/20 ${color} font-mono`}>{sub}</span>}
      </div>
    </div>
    <div className={`p-2.5 rounded-xl ${color.replace('text', 'bg')}/10 relative z-10`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
  </motion.div>
);

const VolatilityIndex = ({ history }: { history: any[] }) => {
  const calculateVolatility = () => {
    const validHistory = (history || []).filter(h => h.price && !isNaN(parseFloat(h.price)));
    if (validHistory.length < 3) return { val: 0, status: 'Analisi', color: 'text-slate-500', icon: '?', bg: 'bg-white/5', desc: 'Raccogliendo dati storici per il calcolo...' };
    
    // Sort by timestamp to ensure the window is correct
    const sorted = [...validHistory].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const prices = sorted.slice(-10).map(h => parseFloat(h.price));
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    const volatility = (stdDev / mean) * 100;

    if (volatility < 1.5) return { val: volatility, status: 'Stabile', color: 'text-emerald-400', icon: '→', bg: 'bg-emerald-500/10', desc: 'Prezzi solidi, fluttuazioni trascurabili.' };
    if (volatility < 5) return { val: volatility, status: 'Flessibile', color: 'text-amber-400', icon: '↗', bg: 'bg-amber-500/10', desc: 'Movimenti moderati rilevati.' };
    return { val: volatility, status: 'Volatile', color: 'text-rose-400', icon: '↑', bg: 'bg-rose-500/10', desc: 'Alta instabilità. Opportunità di acquisto.' };
  };

  const { val, status, color, icon, bg, desc } = calculateVolatility();

  return (
    <div className="bg-[#141414] border border-white/5 p-5 rounded-2xl flex flex-col justify-center relative group overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <TrendingDown className={`w-12 h-12 ${color}`} />
      </div>
      <div className="flex items-center justify-between mb-2 relative z-10">
        <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] font-display">Volatilità Mercato</p>
        <span className={`${color} font-black text-lg`}>{icon}</span>
      </div>
      <h2 className={`text-3xl font-black ${color} tracking-tighter relative z-10 font-display`}>{val.toFixed(1)}%</h2>
      <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-tight relative z-10 font-mono">
        Stato: <span className={color}>{status}</span>
      </p>
      
      <div className={`absolute inset-0 ${bg} backdrop-blur-md p-5 flex items-center justify-center text-center opacity-0 group-hover:opacity-100 transition-opacity z-20`}>
        <p className={`text-[10px] font-black ${color} uppercase tracking-widest leading-relaxed`}>{desc}</p>
      </div>
    </div>
  );
};

const PriceHistoryChart = ({ 
  data, 
  selectedProductName, 
  selectedProductId, 
  setSelectedProductId 
}: { 
  data: any[], 
  selectedProductName: string, 
  selectedProductId: string | null, 
  setSelectedProductId: (id: string | null) => void 
}) => (
  <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 h-[400px] flex flex-col">
    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 relative z-10">
      <div className="flex flex-col">
        <h3 className="text-lg font-black text-white tracking-tight uppercase font-display">Analisi Storica</h3>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] font-mono">{selectedProductName || 'Seleziona un target'}</p>
      </div>
      <div className="flex gap-4">
         {selectedProductId && (
           <button 
             onClick={() => setSelectedProductId(null)}
             className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors"
           >
             Rimuovi Filtro
           </button>
         )}
         <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500" />
            <span className="text-[10px] font-bold text-slate-500 uppercase">Live Price</span>
         </div>
      </div>
    </div>
    <div className="flex-1 relative min-h-[300px]">
      {data.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 opacity-30">
            <div className="p-4 bg-white/5 rounded-full border border-white/5">
              <TrendingDown className="w-10 h-10 text-slate-500" />
            </div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] text-center font-display">
              In attesa di dati...<br/>
              <span className="text-[8px] font-normal lowercase opacity-50 font-sans tracking-normal">i flussi verranno popoalti al prossimo scan</span>
            </p>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={(val) => {
                try { return format(new Date(val), 'd MMM', { locale: it }); } catch (e) { return ''; }
              }}
              fontSize={9}
              tick={{ fill: '#64748b', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis 
              fontSize={9}
              tick={{ fill: '#64748b', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => `€${val}`}
              domain={['auto', 'auto']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#0d0d0d', 
                borderRadius: '12px', 
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.5)',
                padding: '12px'
              }}
              itemStyle={{ color: '#fff', fontWeight: '900', fontSize: '14px' }}
              labelStyle={{ color: '#64748b', fontSize: '9px', fontWeight: '800', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              labelFormatter={(val) => format(new Date(val), 'PPP p', { locale: it })}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#6366f1" 
              strokeWidth={4}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 4, stroke: '#6366f1', fill: '#fff' }}
              animationDuration={1500}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<any>({ products: [], competitors: [], history: [], alerts: [] });
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [rescanLoading, setRescanLoading] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'history'>('dashboard');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const ts = Date.now();
      const [pRes, cRes, hRes, aRes] = await Promise.all([
        fetch(`/api/products?t=${ts}`),
        fetch(`/api/competitors?t=${ts}`),
        fetch(`/api/price-history?t=${ts}`),
        fetch(`/api/alerts?t=${ts}`)
      ]);

      const [products, competitors, history, alerts] = await Promise.all([
        pRes.json(),
        cRes.json(),
        hRes.json(),
        aRes.json()
      ]);

      setData({ 
        products: products || [], 
        competitors: competitors || [], 
        history: history || [], 
        alerts: alerts || [] 
      });
      setError(null);
    } catch (err: any) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Data refresher
  useEffect(() => {
    if (!user) return;
    fetchData();
    const interval = setInterval(fetchData, 10000); // refresh every 10s for real-time feel
    return () => clearInterval(interval);
  }, [user]);

  const filteredHistory = selectedProductId 
    ? data.history.filter((h: any) => h.entityId === selectedProductId)
    : []; // Show empty chart if no product selected to avoid mixed data

  const selectedProductName = selectedProductId 
    ? data.products.find((p: any) => p.id === selectedProductId)?.name 
    : 'Market Board (All Targets)';

  const [uploadLoading, setUploadLoading] = useState<string | null>(null);

  const handleFileUpload = async (productId: string, file: File) => {
    setUploadLoading(productId);
    const formData = new FormData();
    formData.append('htmlFile', file);
    formData.append('productId', productId);

    try {
      const res = await fetch('/api/upload-asset', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        alert('File HTML caricato con successo!');
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadLoading(null);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsAdding(false);
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName || 'Investigating Target...',
          url: newUrl,
          ownerId: user.uid
        })
      });
      setNewName('');
      setNewUrl('');
      fetchData();
      // Trigger global scrape
      fetch('/api/scrape-now', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRescan = async (productId: string) => {
    setRescanLoading(productId);
    try {
      await fetch(`/api/rescan/${productId}`, { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setRescanLoading(null);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, productId: string) => {
    // Immediate visual feedback
    console.log('DEBUG: EXECUTING DELETE FOR ID:', productId);
    
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!productId || productId === 'undefined') {
      console.error('DEBUG: Cannot delete, ID is invalid');
      return;
    }
    
    if (deletingId) return;

    setDeletingId(productId);
    try {
      console.log('UI: Sending DELETE request for', productId);
      const response = await fetch(`/api/products/${productId}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      console.log('UI: Server response:', result);
      
      if (response.ok && result.success) {
        if (selectedProductId === productId) setSelectedProductId(null);
        await fetchData();
      } else {
        console.error('UI: Delete failed', result.error);
        alert('Errore: ' + (result.error || 'Operazione fallita'));
      }
    } catch (err) {
      console.error('Delete Network Error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleScrapeNow = async () => {
    setRescanLoading('all');
    await fetch('/api/scrape-now', { method: 'POST' });
    setTimeout(() => setRescanLoading(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-slate-400 font-medium">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center font-sans p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#141414] p-12 rounded-[2.5rem] shadow-2xl border border-white/5 space-y-8"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-500/20 group-hover:scale-110 transition-transform">
            <TrendingDown className="text-white w-10 h-10" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-white mb-2 font-display">PriceWatch</h1>
            <p className="text-slate-400 font-medium text-sm">Elite E-commerce Intelligence Platform</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-4 px-8 py-4 bg-white text-black rounded-2xl font-black text-lg hover:bg-indigo-50 transition-all active:scale-95 shadow-xl shadow-white/5 border border-white/10"
          >
            <LogIn className="w-6 h-6" /> Accedi al Terminale
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] font-sans text-slate-300 overflow-x-hidden">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 h-full w-20 bg-[#0d0d0d] flex flex-col items-center py-8 gap-8 border-r border-white/5 z-50">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <TrendingDown className="text-white w-6 h-6" />
        </div>
        <div className="flex flex-col gap-6 mt-12 flex-1">
          <button 
            onClick={() => setView('dashboard')}
            className={`p-3 rounded-xl transition-all ${view === 'dashboard' ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
            title="Analisi Tempo Reale"
          >
            <TrendingDown className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setView('history')}
            className={`p-3 rounded-xl transition-all ${view === 'history' ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
            title="Portafoglio Asset"
          >
            <RefreshCw className="w-6 h-6" />
          </button>
        </div>
        <button 
          onClick={() => signOut(auth)}
          className="p-3 text-slate-500 hover:text-rose-500 transition-colors mb-4"
        >
          <LogOut className="w-6 h-6" />
        </button>
      </nav>

      {/* Main Content */}
      <main className="ml-20 p-8 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6 relative">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/5 blur-[100px] rounded-full pointer-events-none" />
          <div>
            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.4em] font-display">Intelligence Terminal</span>
            <div className="flex items-center gap-4 mt-2">
              <h1 className="text-5xl font-black tracking-tighter text-white font-display uppercase">
                {view === 'dashboard' ? 'Infrastruttura' : 'Asset Grid'}
              </h1>
              <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg flex items-center gap-1.5 border border-emerald-500/20 backdrop-blur-sm">
                <div className={`w-2 h-2 bg-emerald-500 rounded-full ${rescanLoading ? 'animate-ping' : 'animate-pulse'}`} />
                <span className="text-[10px] font-black uppercase tracking-wider font-mono">
                  {rescanLoading ? 'Scansione in corso...' : 'Feed Live'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-4 relative z-10">
            <button 
              onClick={handleScrapeNow}
              disabled={rescanLoading === 'all'}
              className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl font-bold text-slate-300 hover:bg-white/10 transition-all font-display uppercase text-[10px] tracking-widest disabled:opacity-50"
            >
              {rescanLoading === 'all' ? <RefreshCw className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />} 
              Aggiorna Feed
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 font-display uppercase text-[10px] tracking-widest"
            >
              <Plus className="w-4 h-4" /> Nuovo Target
            </button>
          </div>
        </header>

        {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-8 p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-rose-500 rounded-2xl shadow-lg shadow-rose-500/20">
                    <AlertTriangle className="text-white w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-rose-500 text-lg">Si è verificato un errore</h3>
                    <div className="text-rose-400 text-sm leading-relaxed mt-1">
                      {error.includes('PERMISSION_DENIED') ? (
                        <>
                          <p>L'API di Firestore non è attiva sul progetto.</p>
                          <a 
                            href={`https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=${error.split('project ')[1]?.split(' ')[0] || firebaseConfig.projectId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2 font-bold underline"
                          >
                            Clicca qui per abilitarla nella console Google Cloud
                          </a>
                        </>
                      ) : (
                        <p>{error}</p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

        {view === 'dashboard' ? (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              <StatCard 
                title="Monitoraggio Target" 
                value={data.products.length} 
                sub="Attivi" 
                icon={Search} 
                color="text-indigo-400" 
              />
              <StatCard 
                title="Sotto Soglia" 
                value={data.alerts.length} 
                sub="Anomalie Prezzo" 
                icon={AlertTriangle} 
                color="text-rose-400" 
              />
              <VolatilityIndex history={data.history} />
              <StatCard 
                title="Efficienza Pipeline" 
                value="99.9%" 
                sub="Uptime" 
                icon={RefreshCw} 
                color="text-emerald-400" 
              />
            </div>

            {/* Alerts Section */}
            <AnimatePresence>
              {data.alerts.length > 0 && (
                <motion.section 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-12 overflow-hidden"
                >
                  <div className="bg-rose-500/5 border-l-4 border-rose-500 p-6 rounded-r-2xl border border-white/5">
                    <div className="flex items-center gap-3 mb-4">
                      <AlertTriangle className="text-rose-500 w-6 h-6" />
                      <h2 className="text-lg font-bold text-rose-100 uppercase tracking-wide">Cali Prezzo Rilevati</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {data.alerts.slice(0, 6).map((alert: any) => (
                        <div key={alert.id} className="bg-[#1a1a1a] p-4 rounded-xl shadow-sm border border-white/5 flex justify-between items-center transition-transform hover:scale-[1.02]">
                          <div>
                            <p className="font-bold text-white text-sm">{alert.entityName || 'Aura Sync Tech'}</p>
                            <p className="text-[10px] text-slate-500">{format(new Date(alert.timestamp), 'PPp', { locale: it })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-rose-500 font-black text-lg">-{alert.percentageChange?.toFixed(1) || '0.0'}%</p>
                            <p className="text-xs font-bold text-slate-300">€{alert.newPrice || '---'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>

            {/* Row Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
              <div className="lg:col-span-2">
                <PriceHistoryChart 
                  data={filteredHistory.map((h: any) => ({ ...h, price: parseFloat(h.price) }))} 
                  selectedProductName={selectedProductName}
                  selectedProductId={selectedProductId}
                  setSelectedProductId={setSelectedProductId}
                />
              </div>

              <div className="bg-[#141414] border border-white/5 rounded-[2rem] shadow-sm p-8 h-full flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                   <Search className="w-32 h-32 text-indigo-500" />
                </div>
                <h3 className="text-xl font-black mb-8 text-white tracking-tight uppercase font-display relative z-10">Flusso Attivo</h3>
                <div className="space-y-6 flex-1 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar relative z-10">
                  {data.products.map((p: any) => (
                    <div 
                      key={p.id} 
                      className={`group/item pb-6 border-b border-white/5 last:border-0 relative cursor-pointer ${selectedProductId === p.id ? 'bg-indigo-500/5 -mx-4 px-4 py-4 mb-2 rounded-xl border-b-0' : ''}`}
                      onClick={() => setSelectedProductId(p.id)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className={`font-black text-sm group-hover/item:text-indigo-400 transition-colors mb-1 truncate max-w-[180px] font-display ${selectedProductId === p.id ? 'text-indigo-400' : 'text-white'}`}>{p.name || 'Inizializzazione...'}</h4>
                          <p className="text-[10px] text-slate-500 truncate max-w-[150px] font-mono">{p.url}</p>
                        </div>
                        <div className="flex gap-1">
                          <button 
                            disabled={rescanLoading === p.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRescan(p.id);
                            }}
                            className="p-1.5 bg-white/5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all disabled:opacity-30"
                            title="Scansione Forzata"
                          >
                            <RefreshCw className={`w-3 h-3 ${rescanLoading === p.id ? 'animate-spin' : ''}`} />
                          </button>
                          <button 
                            id={`delete-btn-feed-${p.id}`}
                            disabled={deletingId === p.id}
                            onClick={(e) => {
                              handleDelete(e, p.id);
                            }}
                            className={`p-1.5 bg-white/5 rounded-lg text-slate-500 transition-all ${deletingId === p.id ? 'opacity-50 cursor-wait' : 'hover:text-rose-500 hover:bg-rose-500/10'}`}
                            title="Elimina"
                          >
                            <Trash2 className={`w-3 h-3 ${deletingId === p.id ? 'animate-pulse' : ''}`} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[9px] font-black text-emerald-500 uppercase mb-0.5 font-display tracking-widest">Quotazione</p>
                          <p className={`text-2xl font-black font-display ${selectedProductId === p.id ? 'text-indigo-300' : 'text-white'}`}>€{p.currentPrice || '---'}</p>
                        </div>
                        <div className="text-right">
                           <p className="text-[9px] font-bold text-slate-600 uppercase font-mono tracking-tighter">Ultimo Sync</p>
                           <p className="text-[10px] font-medium text-slate-400 font-mono tracking-tighter">{p.lastUpdated ? format(new Date(p.lastUpdated), 'p') : 'Pending'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {data.products.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center opacity-40">
                      <Search className="w-12 h-12 text-slate-500 mb-4" />
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] leading-relaxed">Nessuno scanner attivo.<br/>Aggiungi un URL.</p>
                    </div>
                  )}
                </div>
                
                <button 
                  onClick={() => setIsAdding(true)}
                  className="mt-8 w-full py-4 border border-white/5 hover:border-indigo-500/30 rounded-2xl text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] hover:text-indigo-400 transition-all flex items-center justify-center gap-2 bg-white/[0.02]"
                >
                  <Plus className="w-3 h-3" /> Aggiungi Target
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-[#141414] border border-white/5 rounded-[2.5rem] p-10 overflow-hidden relative">
            <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12">
               <RefreshCw className="w-64 h-64 text-white" />
            </div>
            <div className="overflow-x-auto relative z-10">
              <table className="w-full text-left">
                <thead className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] border-b border-white/5 font-display">
                  <tr>
                    <th className="pb-6">Configurazione Target</th>
                    <th className="pb-6">Valore Spot</th>
                    <th className="pb-6">Indice Hit</th>
                    <th className="pb-6">Data Deploy</th>
                    <th className="pb-6">Asset Locale</th>
                    <th className="pb-6">Stato</th>
                    <th className="pb-6 text-right">Controlli</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-sans">
                  {data.products.map((p: any) => (
                    <tr key={p.id} className="hover:bg-white/[0.03] transition-all group cursor-pointer" onClick={() => { setSelectedProductId(p.id); setView('dashboard'); }}>
                      <td className="py-6">
                        <div className="flex flex-col">
                          <span className="text-white font-bold group-hover:text-indigo-400 transition-colors font-display tracking-tight text-base">{p.name || 'Inizializzazione...'}</span>
                          <span className="text-[10px] text-slate-500 font-mono mt-1 opacity-60 truncate max-w-xs">{p.url}</span>
                        </div>
                      </td>
                      <td className="py-6 text-white font-black font-display text-lg tracking-tighter">{p.currentPrice ? `€${p.currentPrice.toLocaleString('it-IT')}` : '€ ---'}</td>
                      <td className="py-6 text-slate-400 font-mono text-xs">{p.scanCount || 0}</td>
                      <td className="py-6 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                        {p.createdAt ? format(new Date(p.createdAt), 'd MMM yyyy', { locale: it }) : '---'}
                      </td>
                      <td className="py-6">
                        <div className="flex items-center gap-2">
                          <label className={`cursor-pointer p-2 rounded-lg transition-all ${uploadLoading === p.id ? 'bg-indigo-500/20' : 'bg-white/5 hover:bg-indigo-500/20 hover:text-indigo-400 text-slate-500'}`} onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="file" 
                              className="hidden" 
                              accept=".html,.htm" 
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(p.id, e.target.files[0])}
                            />
                            {uploadLoading === p.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" /> : <Plus className="w-3.5 h-3.5" />}
                          </label>
                           <span className="text-[9px] font-black uppercase text-slate-700 font-mono tracking-tighter">Dump</span>
                        </div>
                      </td>
                      <td className="py-6">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black border uppercase tracking-widest font-mono ${p.lastUpdated ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>
                          {p.lastUpdated ? 'Sincronizzato' : 'Pronto'}
                        </span>
                      </td>
                      <td className="py-6 text-right">
                         <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRescan(p.id);
                              }}
                              disabled={rescanLoading === p.id}
                              className="p-2 bg-white/5 text-slate-400 hover:text-indigo-400 rounded-lg transition-all border border-white/5"
                              title="Sync Forzato"
                            >
                               <RefreshCw className={`w-3.5 h-3.5 ${rescanLoading === p.id ? 'animate-spin' : ''}`} />
                            </button>
                            <button 
                              id={`delete-btn-portfolio-${p.id}`}
                              onClick={(e) => {
                                handleDelete(e, p.id);
                              }}
                              disabled={deletingId === p.id}
                              className={`p-2 bg-white/5 text-slate-400 rounded-lg transition-all border border-white/5 ${deletingId === p.id ? 'opacity-50 cursor-wait' : 'hover:text-rose-500 hover:bg-rose-500/10'}`}
                              title="Elimina Asset"
                            >
                               <Trash2 className={`w-3.5 h-3.5 ${deletingId === p.id ? 'animate-pulse' : ''}`} />
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Add Product Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#141414] w-full max-w-md rounded-[3rem] p-10 shadow-2xl border border-white/10 overflow-hidden font-sans"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-600" />
              <h2 className="text-3xl font-black mb-2 tracking-tighter text-white font-display uppercase">Monitoraggio Target</h2>
              <p className="text-[10px] text-slate-500 mb-8 font-bold uppercase tracking-[0.2em] font-mono">Inietta un nuovo URL nell'infrastruttura PriceWatch.</p>
              
              <form onSubmit={handleAddProduct} className="space-y-8">
                 <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 mb-3 font-display">Etichetta Descrittiva</label>
                  <input 
                    type="text" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Esempio: iPhone 15 Pro - Amazon"
                    className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:border-indigo-500/50 outline-none transition-all font-bold text-white placeholder:text-slate-800 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 mb-3 font-display">Target URL Endpoint</label>
                  <input 
                    type="url" 
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://eboutique.com/product/..."
                    className="w-full bg-black border border-white/5 rounded-2xl px-6 py-4 focus:border-indigo-500/50 outline-none transition-all font-bold text-white placeholder:text-slate-800 text-sm"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-indigo-600 text-white font-black py-5 rounded-[1.5rem] hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-600/20 flex items-center justify-center gap-3 text-sm uppercase tracking-[0.2em] font-display"
                >
                  Inizializza Target <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="ml-20 p-12 border-t border-white/5 text-center bg-[#0d0d0d]/50">
        <p className="text-xs font-black text-slate-600 uppercase tracking-[0.4em] mb-2 font-display">PriceWatch Neural Engine v5.1</p>
        <p className="text-[10px] font-bold text-slate-800 uppercase tracking-[0.2em] font-mono">© 2026 Hackathon Rising Youth • Sviluppo Elite</p>
      </footer>
    </div>
  );
}

