import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LeagueState, Team, Pokemon, Matchup, TYPES, Transaction } from './types';
import { fetchPokedex, FALLBACK_POKEMON, getEffectiveness, MOVES_DATA, MOVE_CATEGORIES, getMoveCategory } from './constants';
import { generateSchedule } from './utils/scheduleGenerator';

// Firebase Imports
import { auth, db } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  getDocs 
} from 'firebase/firestore';

// --- Icons ---
const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="18" x2="20" y2="18"></line></svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
const ChevronDown = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
);
const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
);

// --- Constants & Helpers ---

const STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

const getStatValues = (p: Pokemon) => [p.stats.hp, p.stats.atk, p.stats.def, p.stats.spa, p.stats.spd, p.stats.spe];
const getBST = (p: Pokemon) => Object.values(p.stats).reduce((a,b) => a+b, 0);

const calculateStat = (base: number, iv: number, ev: number, level: number, nature: number) => {
  if (nature === -1) return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level / 100 + 5)); 
  return Math.floor((Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100) + 5) * nature);
};

const TYPE_COLORS: Record<string, string> = {
  Normal: 'bg-gray-500', Fire: 'bg-red-600', Water: 'bg-blue-600', Grass: 'bg-green-600',
  Electric: 'bg-yellow-500 text-black', Ice: 'bg-cyan-500 text-black', Fighting: 'bg-red-800',
  Poison: 'bg-purple-600', Ground: 'bg-yellow-700', Flying: 'bg-indigo-500',
  Psychic: 'bg-pink-600', Bug: 'bg-lime-600', Rock: 'bg-yellow-800', Ghost: 'bg-purple-800',
  Dragon: 'bg-indigo-800', Steel: 'bg-gray-600', Dark: 'bg-gray-800', Fairy: 'bg-pink-400 text-black'
};

const TypeBadge: React.FC<{ type: string; size?: 'sm' | 'md' }> = ({ type, size = 'md' }) => {
  const color = TYPE_COLORS[type] || 'bg-gray-500';
  const px = size === 'sm' ? 'px-1' : 'px-2';
  const py = size === 'sm' ? 'py-0.5' : 'py-1';
  const text = size === 'sm' ? 'text-[9px]' : 'text-xs';
  
  return (
    <span className={`${color} ${px} ${py} ${text} rounded text-white font-bold uppercase tracking-wider shadow-sm`}>
      {type}
    </span>
  );
};

// Smart Image Component for handling broken sprites
const PokemonImage: React.FC<{ src: string, alt: string, className?: string }> = ({ src, alt, className }) => {
  const [imgSrc, setImgSrc] = useState(src);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => { setImgSrc(src); setErrorCount(0); }, [src]);

  const handleError = () => {
    if (errorCount === 0) {
      const name = alt.toLowerCase().replace(/[^\w-]/g, '');
      setImgSrc(`https://play.pokemonshowdown.com/sprites/ani/${name}.gif`);
    } else if (errorCount === 1) {
       const name = alt.toLowerCase().replace(/[^\w-]/g, '').replace(' ', '-');
       setImgSrc(`https://img.pokemondb.net/sprites/home/normal/${name}.png`);
    } else {
       setImgSrc('https://via.placeholder.com/64?text=?');
    }
    setErrorCount(prev => prev + 1);
  };

  return <img src={imgSrc} alt={alt} className={className} onError={handleError} loading="lazy" title={alt} />;
};

// Helper to minify pokemon data for storage (removes large movePool)
const minifyPokemon = (p: Pokemon): Pokemon => {
    return { ...p, movePool: [] };
};

// Helper to hydrate pokemon data (restores movePool for analysis)
const hydrateTeam = (team: Team): Team => {
    const fullList = (window as any).FULL_POKEDEX || [];
    if (fullList.length === 0) return team;
    
    return {
        ...team,
        roster: team.roster.map(p => {
            const full = fullList.find((f: Pokemon) => f.id === p.id);
            if (!full) return p;
            // Restore movePool from the full pokedex, but keep team-specific edits like teraType/stats if any
            // IMPORTANT: Put ...p before ...full to keep custom stats/tera, BUT explicitly set movePool from full
            return { ...p, ...full, teraType: p.teraType, points: p.points, movePool: full.movePool };
        })
    };
};

// --- Analysis Components ---

const DraftSummary: React.FC<{ team: Team }> = ({ team }) => {
  const [sortStat, setSortStat] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (stat: string) => {
    if (sortStat === stat) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortStat(stat); setSortDir('desc'); }
  };

  const sortedRoster = useMemo(() => {
    if (!sortStat) return team.roster;
    return [...team.roster].sort((a, b) => {
      let valA, valB;
      if (sortStat === 'points') { valA = a.points; valB = b.points; }
      else if (sortStat === 'BST') { valA = getBST(a); valB = getBST(b); }
      else { valA = (a.stats as any)[sortStat.toLowerCase()]; valB = (b.stats as any)[sortStat.toLowerCase()]; }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [team.roster, sortStat, sortDir]);

  return (
    <div className="overflow-x-auto bg-gray-800 rounded border border-gray-700 mb-8">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-900 uppercase text-xs text-gray-400">
          <tr>
            <th className="p-3">Pokemon</th>
            <th className="p-3">Type</th>
            <th className="p-3">Abilities</th>
            {STAT_LABELS.map(s => (
              <th key={s} className="p-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort(s)}>
                {s} {sortStat === s && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
            ))}
            <th className="p-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort('BST')}>
               BST {sortStat === 'BST' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRoster.map(p => (
            <tr key={p.id} className="border-b border-gray-700 hover:bg-white/5">
              <td className="p-2 flex items-center gap-2 font-bold">
                <PokemonImage src={p.sprite} alt={p.name} className="w-8 h-8" /> {p.name}
              </td>
              <td className="p-2"><div className="flex gap-1">{p.types.map(t => <TypeBadge key={t} type={t} size="sm"/>)}</div></td>
              <td className="p-2 text-xs text-gray-400 max-w-[150px] truncate">{p.abilities?.join(', ')}</td>
              {getStatValues(p).map((v, i) => (
                <td key={i} className="p-2 text-center font-mono">{v}</td>
              ))}
              <td className="p-2 text-center font-mono font-bold text-yellow-500">{getBST(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
const DefenseGrid: React.FC<{ team: Team }> = ({ team }) => {
  const [useAbilities, setUseAbilities] = useState(false);

  return (
    <div className="bg-gray-800 rounded border border-gray-700 p-4">
      <div className="flex justify-between items-center mb-4">
         <h4 className="font-bold text-lg">Defensive Type Chart</h4>
         <label className="flex items-center gap-2 text-xs bg-gray-900 p-2 rounded border border-gray-600 cursor-pointer hover:bg-gray-700">
            <input type="checkbox" checked={useAbilities} onChange={e => setUseAbilities(e.target.checked)} />
            Include Ability Immunities
         </label>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="w-full text-xs text-center border-separate border-spacing-1 table-fixed min-w-[800px]">
          <thead>
            <tr>
              <th className="p-2 text-left sticky left-0 z-10 bg-gray-800 w-32">Pokemon</th>
              {TYPES.map(t => (
                <th key={t} className="p-1 w-10">
                  <TypeBadge type={t} size="sm" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.roster.map(p => (
              <tr key={p.id} className="hover:bg-white/5 transition group h-14">
                <td className="p-1 sticky left-0 bg-gray-800 border-r border-gray-700 group-hover:bg-gray-700">
                  <div className="group/img relative flex justify-center">
                     <PokemonImage src={p.sprite} alt={p.name} className="w-12 h-12" />
                     <div className="absolute left-full top-0 ml-2 hidden group-hover/img:block bg-black text-white text-xs p-1 rounded z-50 whitespace-nowrap">{p.name}</div>
                  </div>
                </td>
                {TYPES.map(t => {
                  const eff = getEffectiveness(t, p.types, p.abilities, useAbilities);
                  let bg = "bg-gray-700/30 text-gray-600";
                  let content = "";
                  if (eff >= 4) { bg = "bg-red-600 text-white font-bold ring-1 ring-red-400"; content = "4"; }
                  else if (eff === 2) { bg = "bg-red-900/60 text-red-200 border border-red-800"; content = "2"; }
                  else if (eff === 0.5) { bg = "bg-green-900/60 text-green-200 border border-green-800"; content = "½"; }
                  else if (eff <= 0.25 && eff > 0) { bg = "bg-green-600 text-white font-bold ring-1 ring-green-400"; content = "¼"; }
                  else if (eff === 0) { bg = "bg-gray-600 text-gray-300"; content = "0"; }
                  return <td key={t} className={`p-1 rounded ${bg} border border-gray-800 hover:ring-2 ring-white/50 cursor-default`}>{content}</td>;
                })}
              </tr>
            ))}
            <tr className="h-4"></tr>
            <tr className="font-bold h-10">
              <td className="p-2 text-right text-gray-400 sticky left-0 bg-gray-800">Weak</td>
              {TYPES.map(t => {
                const count = team.roster.reduce((acc, p) => acc + (getEffectiveness(t, p.types, p.abilities, useAbilities) > 1 ? 1 : 0), 0);
                return <td key={t} className={`p-1 rounded ${count > 2 ? 'bg-red-500/20 text-red-400' : 'text-gray-500'}`}>{count || '-'}</td>
              })}
            </tr>
            <tr className="font-bold h-10">
              <td className="p-2 text-right text-gray-400 sticky left-0 bg-gray-800">Resist</td>
              {TYPES.map(t => {
                const count = team.roster.reduce((acc, p) => acc + (getEffectiveness(t, p.types, p.abilities, useAbilities) < 1 ? 1 : 0), 0);
                return <td key={t} className={`p-1 rounded ${count > 2 ? 'bg-green-500/20 text-green-400' : 'text-gray-500'}`}>{count || '-'}</td>
              })}
            </tr>
            <tr className="font-bold border-t border-gray-600 h-10">
              <td className="p-2 text-right text-white sticky left-0 bg-gray-800">Delta</td>
              {TYPES.map(t => {
                const weak = team.roster.reduce((acc, p) => acc + (getEffectiveness(t, p.types, p.abilities, useAbilities) > 1 ? 1 : 0), 0);
                const resist = team.roster.reduce((acc, p) => acc + (getEffectiveness(t, p.types, p.abilities, useAbilities) < 1 ? 1 : 0), 0);
                const delta = resist - weak;
                const bg = delta > 0 ? 'bg-green-900/50 text-green-300' : delta < 0 ? 'bg-red-900/50 text-red-300' : 'bg-gray-800 text-gray-500';
                return <td key={t} className={`p-1 rounded ${bg}`}>{delta > 0 ? '+' : ''}{delta === 0 ? '-' : delta}</td>
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
const CoverageCard: React.FC<{ attacker: Pokemon, defender: Team, useAbilities: boolean }> = ({ attacker, defender, useAbilities }) => {
  const [physEnabled, setPhysEnabled] = useState(true);
  const [specEnabled, setSpecEnabled] = useState(true);
  const [disabledTypes, setDisabledTypes] = useState<Set<string>>(new Set());

  const physMoves = new Map<string, number>();
  const specMoves = new Map<string, number>();
  const allMoves = new Map<string, string>(); 
  
  attacker.movePool.forEach(mName => {
    const m = MOVES_DATA[mName];
    if (m) {
        if (m.category === 'Physical') {
            if (!physMoves.has(m.type) || m.bp > physMoves.get(m.type)!) {
                physMoves.set(m.type, m.bp);
                allMoves.set(`Physical-${m.type}`, m.name);
            }
        }
        if (m.category === 'Special') {
            if (!specMoves.has(m.type) || m.bp > specMoves.get(m.type)!) {
                specMoves.set(m.type, m.bp);
                allMoves.set(`Special-${m.type}`, m.name);
            }
        }
    }
  });

  const toggleType = (t: string) => {
     const next = new Set(disabledTypes);
     if (next.has(t)) next.delete(t);
     else next.add(t);
     setDisabledTypes(next);
  };

  const coverageMap = defender.roster.map(def => {
    let hit = false;
    attacker.movePool.forEach(mName => {
      const m = MOVES_DATA[mName];
      if (m && m.category !== 'Status') {
        // Filter Logic
        if (m.category === 'Physical' && !physEnabled) return;
        if (m.category === 'Special' && !specEnabled) return;
        if (disabledTypes.has(m.type)) return;

        if (getEffectiveness(m.type, def.types, def.abilities, useAbilities) >= 2) hit = true;
      }
    });
    return hit;
  });

  const percent = Math.round((coverageMap.filter(x => x).length / defender.roster.length) * 100) || 0;

  return (
    <div className="bg-gray-800 p-4 rounded border border-gray-700 flex flex-col md:flex-row gap-6 items-center min-h-[160px]">
       <div className="flex flex-col items-center w-24 shrink-0">
          <PokemonImage src={attacker.sprite} alt={attacker.name} className="w-20 h-20" />
          <span className="font-bold text-sm text-center">{attacker.name}</span>
       </div>
       
       <div className="flex-1 space-y-3 w-full">
          {/* Physical Row */}
          <div className="flex gap-2 items-center">
             <button 
                onClick={() => setPhysEnabled(!physEnabled)}
                className={`text-[10px] w-10 uppercase font-bold px-1 rounded transition border ${physEnabled ? 'bg-gray-700 text-gray-200 border-gray-500 hover:bg-gray-600' : 'bg-gray-900 text-gray-600 border-gray-800 line-through'}`}
             >
                Phys
             </button>
             <div className={`flex gap-1 flex-wrap ${!physEnabled ? 'opacity-25 grayscale' : ''}`}>
                {Array.from(physMoves.keys()).map(t => (
                    <div 
                        key={t} 
                        onClick={() => toggleType(t)}
                        className={`group relative cursor-pointer transition-all ${disabledTypes.has(t) ? 'opacity-30 grayscale scale-90' : 'hover:scale-110'}`}
                    >
                        <TypeBadge type={t} size="sm" />
                        {!disabledTypes.has(t) && (
                            <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-black text-xs px-2 py-1 rounded whitespace-nowrap z-50">
                                {allMoves.get(`Physical-${t}`)} ({physMoves.get(t)})
                            </div>
                        )}
                    </div>
                ))}
                {physMoves.size === 0 && <span className="text-gray-600 text-xs">-</span>}
             </div>
          </div>

          {/* Special Row */}
          <div className="flex gap-2 items-center">
             <button 
                onClick={() => setSpecEnabled(!specEnabled)}
                className={`text-[10px] w-10 uppercase font-bold px-1 rounded transition border ${specEnabled ? 'bg-gray-700 text-gray-200 border-gray-500 hover:bg-gray-600' : 'bg-gray-900 text-gray-600 border-gray-800 line-through'}`}
             >
                Spec
             </button>
             <div className={`flex gap-1 flex-wrap ${!specEnabled ? 'opacity-25 grayscale' : ''}`}>
                {Array.from(specMoves.keys()).map(t => (
                    <div 
                        key={t} 
                        onClick={() => toggleType(t)}
                        className={`group relative cursor-pointer transition-all ${disabledTypes.has(t) ? 'opacity-30 grayscale scale-90' : 'hover:scale-110'}`}
                    >
                        <TypeBadge type={t} size="sm" />
                        {!disabledTypes.has(t) && (
                            <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-black text-xs px-2 py-1 rounded whitespace-nowrap z-50">
                                {allMoves.get(`Special-${t}`)} ({specMoves.get(t)})
                            </div>
                        )}
                    </div>
                ))}
                {specMoves.size === 0 && <span className="text-gray-600 text-xs">-</span>}
             </div>
          </div>
       </div>

       <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="w-full bg-gray-900 h-6 rounded-full overflow-hidden w-48 mb-1 relative">
             <div className="bg-green-600 h-full transition-all duration-300" style={{width: `${percent}%`}}></div>
             <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
                {percent}% Super Effective
             </div>
          </div>
          <div className="grid grid-cols-4 gap-2 justify-items-center">
             {defender.roster.map((def, i) => (
                <div key={def.id} className={`w-10 h-10 rounded flex items-center justify-center border border-gray-600 group relative transition-colors duration-300 ${coverageMap[i] ? 'bg-green-600/50' : 'bg-gray-800 grayscale'}`}>
                   <PokemonImage src={def.sprite} alt={def.name} className="w-8 h-8" />
                   <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black text-white text-[10px] px-1 rounded z-50 whitespace-nowrap">{def.name}</div>
                </div>
             ))}
          </div>
       </div>
    </div>
  )
};
const CoverageAnalysis: React.FC<{ attacker: Team, defender: Team }> = ({ attacker, defender }) => {
  const [useAbilities, setUseAbilities] = useState(true);
  return (
    <div className="space-y-4">
       <div className="flex justify-between items-center">
          <h4 className="font-bold text-lg">Coverage</h4>
          <label className="flex items-center gap-2 text-xs bg-gray-900 p-2 rounded border border-gray-600 cursor-pointer hover:bg-gray-700">
            <input type="checkbox" checked={useAbilities} onChange={e => setUseAbilities(e.target.checked)} />
            Include Ability Immunities
          </label>
       </div>
       <div className="grid grid-cols-1 gap-2">
          {attacker.roster.map(p => (
             <CoverageCard key={p.id} attacker={p} defender={defender} useAbilities={useAbilities} />
          ))}
       </div>
    </div>
  );
};
const UtilityAnalysis: React.FC<{ team: Team }> = ({ team }) => {
   const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
   const categories = Object.keys(MOVE_CATEGORIES);
   
   const toggle = (cat: string) => {
       const next = new Set(openCategories);
       if(next.has(cat)) next.delete(cat);
       else next.add(cat);
       setOpenCategories(next);
   };

   return (
     <div className="bg-gray-800 rounded border border-gray-700 p-4">
       <h4 className="font-bold text-lg mb-4">Learned Moves</h4>
       <div className="flex flex-col gap-2">
         {categories.map(cat => {
           const movesInCat = new Set<string>();
           team.roster.forEach(p => {
              p.movePool.forEach(m => {
                 if (getMoveCategory(m) === cat) movesInCat.add(m);
              });
           });
           const moveList = Array.from(movesInCat).sort();
           const isOpen = openCategories.has(cat);

           return (
             <div key={cat} className="bg-gray-900 rounded border border-gray-700 overflow-hidden">
               <button onClick={() => toggle(cat)} className="w-full flex justify-between items-center p-3 hover:bg-gray-800 transition">
                  <span className="font-bold text-sm text-gray-200">{cat}</span>
                  <div className="flex items-center gap-2">
                     <span className={`text-xs bg-gray-800 px-2 py-1 rounded ${moveList.length > 0 ? 'text-yellow-400' : 'text-gray-500'}`}>{moveList.length} moves</span>
                     <ChevronDown />
                  </div>
               </button>
               {isOpen && moveList.length > 0 && (
                  <div className="p-4 bg-gray-800 border-t border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                     {moveList.map(move => {
                        const users = team.roster.filter(p => p.movePool.includes(move));
                        return (
                           <div key={move} className="bg-gray-900/50 p-2 rounded border border-gray-700">
                              <div className="text-xs font-bold text-blue-300 mb-2 cursor-help group relative inline-block border-b border-dashed border-blue-900 pb-1 w-full">
                                 {move}
                                 <div className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-64 bg-black border border-gray-600 p-2 rounded z-50 text-gray-300 font-normal">
                                    {MOVES_DATA[move]?.desc || "No description."}
                                 </div>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                 {users.map(u => (
                                    <div key={u.id} className="relative group/user">
                                       <div className="bg-gray-700 p-1 rounded">
                                          <PokemonImage src={u.sprite} alt={u.name} className="w-6 h-6" />
                                       </div>
                                       <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/user:block bg-black text-white text-[10px] px-1 rounded whitespace-nowrap z-10">{u.name}</div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        )
                     })}
                  </div>
               )}
             </div>
           )
         })}
       </div>
     </div>
   )
};
const SpeedChart: React.FC<{ teamA: Team; teamB: Team }> = ({ teamA, teamB }) => {
  const processedMons = useMemo(() => {
    const list: any[] = [];
    [...teamA.roster.map(p => ({...p, t: 'A', teamName: teamA.name})), ...teamB.roster.map(p => ({...p, t: 'B', teamName: teamB.name}))].forEach(p => {
       const base = p.stats.spe;
       const lvl = 50;
       list.push({ ...p, val: base, label: 'Base', type: 'baseOnly' });
       list.push({ ...p, val: calculateStat(base, 31, 0, lvl, 1), label: '0 EV', type: 'granular' });
       list.push({ ...p, val: calculateStat(base, 31, 252, lvl, 1), label: 'Max', type: 'granular' });
       const maxPlus = calculateStat(base, 31, 252, lvl, 1.1);
       list.push({ ...p, val: maxPlus, label: 'Max+', type: 'granular' });
       if (p.abilities?.includes('Swift Swim') || p.abilities?.includes('Chlorophyll') || p.abilities?.includes('Sand Rush') || p.abilities?.includes('Slush Rush') || p.abilities?.includes('Surge Surfer') || p.abilities?.includes('Unburden')) {
           list.push({ ...p, val: Math.floor(maxPlus * 2), label: '+2 (Ability)', type: 'granular' });
       }
       list.push({ ...p, val: Math.floor(maxPlus * 1.5), label: '+1 (Scarf)', type: 'granular' });
    });
    return list.sort((a,b) => b.val - a.val);
  }, [teamA, teamB]);

  const baseSpeedList = processedMons.filter(p => p.type === 'baseOnly');
  const granularList = processedMons.filter(p => p.type === 'granular');
  const maxSpeed = granularList.length ? granularList[0].val : 100;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
       <div className="bg-gray-800 rounded border border-gray-700 flex flex-col md:col-span-1">
          <div className="p-3 border-b border-gray-700 bg-gray-900 font-bold text-center text-sm">Base Speeds</div>
          <div className="p-2 space-y-1">
             {baseSpeedList.map((row, i) => (
                <div key={i} className="flex justify-between items-center p-2 rounded bg-gray-700/30 mb-1">
                   <div className="flex items-center gap-2">
                      <PokemonImage src={row.sprite} alt={row.name} className="w-8 h-8" />
                      <span className={`font-bold text-xs ${row.t === 'A' ? 'text-blue-300' : 'text-red-300'}`}>{row.name}</span>
                   </div>
                   <span className="font-mono font-bold text-white">{row.val}</span>
                </div>
             ))}
          </div>
       </div>

       <div className="bg-gray-800 rounded border border-gray-700 flex flex-col md:col-span-2">
          <div className="p-3 border-b border-gray-700 bg-gray-900 text-xs text-gray-400 flex justify-between font-bold shrink-0">
             <span>Speed Tiers (Lvl 50)</span>
             <span>Detailed</span>
          </div>
          <div className="p-2 space-y-1">
             {granularList.map((row, i) => (
                <div key={i} className="flex items-center text-xs hover:bg-white/5 p-1 rounded group transition">
                   <div className={`w-8 font-mono font-bold text-right mr-3 ${row.t === 'A' ? 'text-blue-400' : 'text-red-400'}`}>{row.val}</div>
                   <div className="flex-1 relative h-7 bg-gray-700/30 rounded overflow-hidden flex items-center ring-1 ring-gray-700/50">
                      <div className={`absolute top-0 bottom-0 left-0 opacity-40 ${row.t === 'A' ? 'bg-blue-600' : 'bg-red-600'}`} style={{width: `${(row.val / maxSpeed)*100}%`}}></div>
                      <PokemonImage src={row.sprite} alt={row.name} className="w-6 h-6 ml-2 z-10" />
                      <span className="ml-2 z-10 font-bold text-gray-200 truncate">{row.name}</span>
                      <span className="ml-2 z-10 text-gray-500 italic text-[10px] bg-gray-900/50 px-1 rounded">{row.label}</span>
                   </div>
                </div>
             ))}
          </div>
       </div>
    </div>
  );
};
const TeraAnalysis: React.FC<{ team: Team }> = ({ team }) => {
   return (
      <div className="bg-gray-800 rounded border border-gray-700 p-4 mt-6">
         <h4 className="font-bold text-lg mb-4">Tera Types</h4>
         <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {team.roster.map(p => (
               <div key={p.id} className="bg-gray-700/30 p-3 rounded border border-gray-700 flex flex-col items-center gap-2">
                  <PokemonImage src={p.sprite} alt={p.name} className="w-16 h-16" />
                  <span className="font-bold text-sm text-center">{p.name}</span>
                  {p.teraType ? (
                     <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-500 uppercase">Tera</span>
                        <TypeBadge type={p.teraType} />
                     </div>
                  ) : (
                     <span className="text-xs text-gray-600 italic">None Set</span>
                  )}
               </div>
            ))}
         </div>
      </div>
   );
};

const LeagueHome: React.FC<{ league: LeagueState }> = ({ league }) => {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 flex flex-col md:flex-row items-center gap-6 shadow-xl relative overflow-hidden">
        {league.logoUrl && <img src={league.logoUrl} className="w-24 h-24 rounded-full border-4 border-yellow-500 shadow-lg z-10 bg-black object-cover" />}
        <div className="text-center md:text-left z-10">
           <h2 className="text-4xl font-black text-white tracking-tight mb-2 uppercase italic">{league.name}</h2>
           <p className="text-yellow-400 font-bold mb-1">Week {league.currentWeek} • {league.phase.toUpperCase()}</p>
           <p className="text-gray-400 text-sm max-w-lg">Manage your team, scout opponents, and battle your way to the championship. Good luck, coach!</p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-yellow-500/10 to-transparent pointer-events-none"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-800 p-4 rounded border border-gray-700 h-96 flex flex-col">
           <h3 className="font-bold text-xl mb-4 text-yellow-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              Recent Activity
           </h3>
           <div className="space-y-3 overflow-y-auto flex-1 custom-scrollbar pr-2">
              {league.transactions.slice(0, 20).map(t => (
                  <div key={t.id} className="text-sm bg-gray-700/30 p-2 rounded border border-gray-700 flex items-start gap-3">
                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-0.5 ${t.type === 'ADD' ? 'bg-green-900 text-green-200' : t.type === 'DROP' ? 'bg-red-900 text-red-200' : 'bg-blue-900 text-blue-200'}`}>
                        {t.type}
                     </span>
                     <div className="flex-1">
                        {t.type === 'MATCH_REPORT' ? (
                            <div className="font-bold text-gray-300">{t.pokemonName}</div>
                        ) : (
                            <>
                                <div className="font-bold text-gray-300">{t.teamName}</div>
                                <div className="text-gray-400 text-xs">
                                {t.type === 'ADD' ? 'added' : 'dropped'} <span className="text-yellow-500 font-bold">{t.pokemonName}</span>
                                </div>
                            </>
                        )}
                     </div>
                     <span className="ml-auto text-xs text-gray-600">{new Date(t.date).toLocaleDateString()}</span>
                  </div>
              ))}
              {league.transactions.length === 0 && <div className="text-gray-500 italic text-center py-10">No recent activity</div>}
           </div>
        </div>
        <div className="bg-gray-800 p-4 rounded border border-gray-700">
           <h3 className="font-bold text-xl mb-4 text-yellow-400 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              League Stats
           </h3>
           <div className="grid grid-cols-2 gap-4 text-center">
              <div className="bg-gray-700/30 p-4 rounded border border-gray-600">
                 <div className="text-3xl font-bold text-white">{league.teams.length}</div>
                 <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">Teams</div>
              </div>
              <div className="bg-gray-700/30 p-4 rounded border border-gray-600">
                 <div className="text-3xl font-bold text-white">{(league.teams.length - 1) * 2 || 0}</div>
                 <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">Weeks</div>
              </div>
              <div className="bg-gray-700/30 p-4 rounded border border-gray-600">
                 <div className="text-3xl font-bold text-white">{league.schedule.length}</div>
                 <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">Total Matches</div>
              </div>
              <div className="bg-gray-700/30 p-4 rounded border border-gray-600">
                 <div className="text-3xl font-bold text-white">{league.teams.reduce((acc, t) => acc + t.roster.length, 0)}</div>
                 <div className="text-xs text-gray-500 uppercase tracking-widest mt-1">Pokemon Drafted</div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const MatchReportModal: React.FC<{
    match: Matchup;
    league: LeagueState;
    onClose: () => void;
    onSubmit: (result: any) => void;
}> = ({ match, league, onClose, onSubmit }) => {
    const [scoreA, setScoreA] = useState(0);
    const [scoreB, setScoreB] = useState(0);
    const [replay, setReplay] = useState('');
    const [activeTab, setActiveTab] = useState<'score' | 'teamA' | 'teamB'>('score');
    const [detailsA, setDetailsA] = useState<{ used: Set<number>, kills: Record<number, number>, deaths: Record<number, number> }>({ used: new Set(), kills: {}, deaths: {} });
    const [detailsB, setDetailsB] = useState<{ used: Set<number>, kills: Record<number, number>, deaths: Record<number, number> }>({ used: new Set(), kills: {}, deaths: {} });

    const tA = league.teams.find(t => t.id === match.teamAId);
    const tB = league.teams.find(t => t.id === match.teamBId);

    if (!tA || !tB) return null;

    const toggleUsed = (team: 'A'|'B', pid: number) => {
        const target = team === 'A' ? detailsA : detailsB;
        const setTarget = team === 'A' ? setDetailsA : setDetailsB;
        const newUsed = new Set(target.used);
        if (newUsed.has(pid)) newUsed.delete(pid);
        else newUsed.add(pid);
        setTarget({ ...target, used: newUsed });
    };

    const updateStat = (team: 'A'|'B', type: 'kills'|'deaths', pid: number, val: number) => {
        const target = team === 'A' ? detailsA : detailsB;
        const setTarget = team === 'A' ? setDetailsA : setDetailsB;
        setTarget({ ...target, [type]: { ...target[type], [pid]: val } });
    };

    const handleSubmit = () => {
        const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
        onSubmit({
            scoreA, scoreB, winnerId, replayUrl: replay,
            teamADetails: { pokemonUsed: Array.from(detailsA.used), kills: detailsA.kills, deaths: detailsA.deaths },
            teamBDetails: { pokemonUsed: Array.from(detailsB.used), kills: detailsB.kills, deaths: detailsB.deaths }
        });
    };

    const renderTeamStats = (team: Team, details: typeof detailsA, teamKey: 'A'|'B') => (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {team.roster.map(p => {
                const isUsed = details.used.has(p.id);
                return (
                    <div key={p.id} className={`p-2 rounded border ${isUsed ? 'bg-gray-700 border-yellow-500' : 'bg-gray-800 border-gray-700'} flex flex-col gap-2`}>
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleUsed(teamKey, p.id)}>
                             <input type="checkbox" checked={isUsed} onChange={() => {}} className="pointer-events-none" />
                             <img src={p.sprite} className="w-8 h-8" />
                             <span className="font-bold text-sm flex-1">{p.name}</span>
                        </div>
                        {isUsed && (
                            <div className="flex gap-4 pl-8">
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-green-400 font-bold">Kills</span>
                                    <input type="number" min="0" className="w-12 bg-gray-900 border border-gray-600 rounded px-1 text-center text-sm" value={details.kills[p.id] || 0} onChange={(e) => updateStat(teamKey, 'kills', p.id, parseInt(e.target.value)||0)} />
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-red-400 font-bold">Deaths</span>
                                    <input type="number" min="0" max="3" className="w-12 bg-gray-900 border border-gray-600 rounded px-1 text-center text-sm" value={details.deaths[p.id] || 0} onChange={(e) => updateStat(teamKey, 'deaths', p.id, parseInt(e.target.value)||0)} />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg border border-gray-700 max-w-2xl w-full flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h3 className="text-xl font-bold">Report Match Result</h3>
                    <div className="flex bg-gray-900 rounded p-1">
                        <button onClick={() => setActiveTab('score')} className={`px-3 py-1 text-xs rounded font-bold ${activeTab === 'score' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}>Score</button>
                        <button onClick={() => setActiveTab('teamA')} className={`px-3 py-1 text-xs rounded font-bold ${activeTab === 'teamA' ? 'bg-blue-900 text-blue-100' : 'text-gray-400'}`}>{tA.name}</button>
                        <button onClick={() => setActiveTab('teamB')} className={`px-3 py-1 text-xs rounded font-bold ${activeTab === 'teamB' ? 'bg-red-900 text-red-100' : 'text-gray-400'}`}>{tB.name}</button>
                    </div>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                    {activeTab === 'score' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <div className="text-center">
                                    <div className="font-bold mb-2 text-blue-400">{tA.name}</div>
                                    <input type="number" className="w-20 bg-gray-700 border border-gray-600 rounded p-4 text-center text-3xl font-bold" value={scoreA} onChange={e => setScoreA(parseInt(e.target.value)||0)} />
                                </div>
                                <div className="text-gray-500 font-bold text-xl">VS</div>
                                <div className="text-center">
                                    <div className="font-bold mb-2 text-red-400">{tB.name}</div>
                                    <input type="number" className="w-20 bg-gray-700 border border-gray-600 rounded p-4 text-center text-3xl font-bold" value={scoreB} onChange={e => setScoreB(parseInt(e.target.value)||0)} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Replay URL (Optional)</label>
                                <input className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white" value={replay} onChange={e => setReplay(e.target.value)} placeholder="https://replay.pokemonshowdown.com/..." />
                            </div>
                            <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded text-sm text-yellow-200 text-center">
                                Please switch tabs to enter detailed stats (Kills/Deaths) for MVP tracking before submitting!
                            </div>
                        </div>
                    )}
                    {activeTab === 'teamA' && renderTeamStats(tA, detailsA, 'A')}
                    {activeTab === 'teamB' && renderTeamStats(tB, detailsB, 'B')}
                </div>
                <div className="p-4 border-t border-gray-700 flex gap-4">
                    <button onClick={onClose} className="flex-1 bg-gray-700 py-3 rounded font-bold hover:bg-gray-600">Cancel</button>
                    <button onClick={handleSubmit} className="flex-1 bg-green-600 py-3 rounded font-bold hover:bg-green-500 shadow-lg">Submit Final Result</button>
                </div>
            </div>
        </div>
    );
};

const Navbar: React.FC<{ user: User; onLogout: () => void; leagueName?: string; onBack?: () => void; activeTab: string; onTabChange: (t: string) => void; }> = ({ user, onLogout, leagueName, onBack, activeTab, onTabChange }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    return (
        <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {onBack && (<button onClick={onBack} className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>)}
                    <span className="text-xl font-bold text-yellow-400 tracking-tight">PokeDraft Hub</span>
                    {leagueName && (<><span className="text-gray-600 hidden md:inline">/</span><span className="font-bold text-white hidden md:inline">{leagueName}</span></>)}
                </div>
                <div className="hidden md:flex items-center gap-4">
                    <div className="text-sm text-right"><div className="font-bold text-white">{user.email}</div><div className="text-xs text-gray-500">Coach</div></div>
                    <button onClick={onLogout} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded text-gray-300">Sign Out</button>
                </div>
                <button className="md:hidden p-2 text-gray-400" onClick={() => setIsMenuOpen(!isMenuOpen)}><MenuIcon /></button>
            </div>
            {isMenuOpen && (
                <div className="md:hidden bg-gray-800 border-t border-gray-700 p-4 space-y-4">
                     {leagueName && <div className="font-bold text-center text-white pb-2 border-b border-gray-700">{leagueName}</div>}
                     {leagueName && (
                        <div className="grid grid-cols-2 gap-2">
                           {['home', 'standings', 'schedule', 'playoffs', 'mvp', 'transactions', 'myteam', 'analysis'].map(t => (
                              <button key={t} onClick={() => {onTabChange(t); setIsMenuOpen(false);}} className={`p-2 rounded text-xs font-bold uppercase ${activeTab === t ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-300'}`}>{t}</button>
                           ))}
                        </div>
                     )}
                     <div className="pt-2 border-t border-gray-700 flex justify-between items-center">
                        <span className="text-sm text-gray-400">{user.email}</span>
                        <button onClick={onLogout} className="text-xs bg-red-900/50 text-red-200 px-3 py-1 rounded">Sign Out</button>
                     </div>
                </div>
            )}
        </nav>
    );
};
const TierRow: React.FC<{ points: number, pokemons: Pokemon[] }> = ({ points, pokemons }) => {
    const [expanded, setExpanded] = useState(false);
    const displayList = expanded ? pokemons : pokemons.slice(0, 12);
    return (
        <div className="mb-4">
            <h4 className="text-yellow-400 font-bold mb-2 border-b border-gray-700 pb-1 flex justify-between items-end">
                <span>{points} Points</span>
                <span className="text-xs text-gray-500">{pokemons.length} Pokemon</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
                {displayList.map(p => (
                    <div key={p.id} className="bg-gray-800 p-1 rounded flex flex-col items-center border border-gray-700 hover:border-gray-500 transition cursor-help" title={`${p.name} - ${p.types.join('/')}`}>
                        <PokemonImage src={p.sprite} alt={p.name} className="w-8 h-8"/>
                        <span className="text-[9px] text-gray-400 truncate w-full text-center">{p.name}</span>
                    </div>
                ))}
            </div>
            {pokemons.length > 12 && (<button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-400 hover:text-blue-300 mt-1 w-full text-center py-1 bg-gray-800/50 rounded">{expanded ? 'Show Less' : `+${pokemons.length - 12} More`}</button>)}
        </div>
    );
};
const LeagueLobby: React.FC<{ league: LeagueState; user: User }> = ({ league, user }) => {
   const isCommish = league.commissionerId === user.uid;
   const tiers = useMemo(() => {
       const map = new Map<number, Pokemon[]>();
       league.pokemonPool.forEach(p => { if (!map.has(p.points)) map.set(p.points, []); map.get(p.points)!.push(p); });
       return Array.from(map.entries()).sort((a,b) => b[0] - a[0]);
   }, [league.pokemonPool]);
   return (
      <div className="p-8 text-center max-w-6xl mx-auto animate-fade-in">
         <h2 className="text-3xl font-bold mb-4">League Lobby</h2>
         <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 mb-8 shadow-xl">
            <div className="text-gray-400 mb-2 uppercase tracking-widest text-xs">Invite Code</div>
            <div className="text-5xl font-mono font-bold text-yellow-400 tracking-widest mb-2 select-all">{league.joinCode}</div>
            <div className="text-sm text-gray-500">Share this code with your friends to join</div>
         </div>
         <div className="grid grid-cols-2 gap-4 mb-8 max-w-2xl mx-auto">
             <div className="bg-gray-800 p-4 rounded border border-gray-700"><div className="text-xs text-gray-500 uppercase tracking-widest">Total Budget</div><div className="text-2xl font-bold text-green-400">{league.draftConfig.totalBudget} pts</div></div>
             <div className="bg-gray-800 p-4 rounded border border-gray-700"><div className="text-xs text-gray-500 uppercase tracking-widest">Roster Size</div><div className="text-2xl font-bold text-blue-400">{league.draftConfig.maxPokemon} mons</div></div>
         </div>
         <div className="mb-8">
            <h3 className="font-bold text-xl mb-4 text-left">Registered Teams ({league.teams.length}/{league.maxPlayers})</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {league.teams.map(t => (<div key={t.id} className="bg-gray-800 p-4 rounded-lg flex items-center gap-4 border border-gray-700 shadow-md"><img src={t.logoUrl} className="w-12 h-12 rounded-full bg-black border border-gray-600 object-cover"/><div className="text-left overflow-hidden"><div className="font-bold truncate">{t.name}</div><div className="text-xs text-gray-400 truncate">{t.coachName}</div></div></div>))}
               {Array.from({length: Math.max(0, league.maxPlayers - league.teams.length)}).map((_, i) => (<div key={i} className="bg-gray-800/30 p-4 rounded-lg border-2 border-dashed border-gray-700 flex items-center justify-center text-gray-500">Waiting for player...</div>))}
            </div>
         </div>
         <div className="mb-8 bg-gray-900 rounded border border-gray-800 p-4 text-left"><h3 className="font-bold text-xl mb-4">Draft Pool Preview</h3><div className="space-y-2">{tiers.map(([points, mons]) => (<TierRow key={points} points={points} pokemons={mons} />))}</div></div>
         {isCommish ? (
            <button disabled={league.teams.length < 2} onClick={async () => {
                 const pickOrder = league.teams.map(t => t.id);
                 for (let i = pickOrder.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pickOrder[i], pickOrder[j]] = [pickOrder[j], pickOrder[i]]; }
                 await updateDoc(doc(db, 'leagues', league.id!), { phase: 'draft', 'draftConfig.pickOrder': pickOrder, 'draftConfig.lastPickTime': Date.now(), 'draftConfig.currentPickIndex': 0 });
              }} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-bold py-4 px-10 rounded-full text-xl shadow-lg transition transform hover:scale-105">Start Snake Draft 🚀</button>
         ) : (<div className="text-yellow-400 animate-pulse font-bold bg-yellow-900/20 p-4 rounded inline-block">Waiting for commissioner to start draft...</div>)}
      </div>
   );
};
const TeamDetailModal: React.FC<{ team: Team, onClose: () => void }> = ({ team, onClose }) => {
    const [sort, setSort] = useState<string>('points');
    const [dir, setDir] = useState<'asc' | 'desc'>('desc');
    const sorted = [...team.roster].sort((a,b) => {
        let valA = sort === 'points' ? a.points : (a.stats as any)[sort];
        let valB = sort === 'points' ? b.points : (b.stats as any)[sort];
        return dir === 'asc' ? valA - valB : valB - valA;
    });
    const handleSort = (key: string) => { if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(key); setDir('desc'); } }
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-gray-800 w-full max-w-4xl rounded-lg border border-gray-700 shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900 rounded-t-lg">
                    <div className="flex items-center gap-4"><img src={team.logoUrl} className="w-12 h-12 rounded-full border border-gray-600 bg-black object-cover"/><div><h2 className="text-2xl font-bold">{team.name}</h2><div className="text-gray-400 text-sm">Coach: {team.coachName}</div></div></div><button onClick={onClose}><XIcon /></button>
                </div>
                <div className="overflow-auto p-4"><table className="w-full text-left text-sm"><thead className="bg-gray-900 text-gray-400 sticky top-0"><tr><th className="p-2">Pokemon</th><th className="p-2">Type</th>{['HP','Atk','Def','SpA','SpD','Spe'].map(s => (<th key={s} className="p-2 text-center cursor-pointer hover:text-white" onClick={() => handleSort(s.toLowerCase())}>{s} {sort === s.toLowerCase() && (dir === 'asc' ? '↑' : '↓')}</th>))}<th className="p-2">Abilities</th></tr></thead><tbody>{sorted.map(p => (<tr key={p.id} className="border-b border-gray-700 hover:bg-white/5"><td className="p-2 flex items-center gap-2 font-bold"><PokemonImage src={p.sprite} alt={p.name} className="w-8 h-8" /> {p.name}</td><td className="p-2"><div className="flex gap-1">{p.types.map(t => <TypeBadge key={t} type={t} size="sm"/>)}</div></td>{getStatValues(p).map((v, i) => <td key={i} className="p-2 text-center font-mono">{v}</td>)}<td className="p-2 text-xs text-gray-400">{p.abilities?.join(', ')}</td></tr>))}</tbody></table></div>
            </div>
        </div>
    )
}
const DraftView: React.FC<{ league: LeagueState; user: User }> = ({ league, user }) => {
   const [search, setSearch] = useState('');
   const [filterTier, setFilterTier] = useState('All');
   const [filterType, setFilterType] = useState('All');
   const [filterPoints, setFilterPoints] = useState('All');
   const [limit, setLimit] = useState(50);
   const [selectedPick, setSelectedPick] = useState<Pokemon | null>(null);
   const [viewTeam, setViewTeam] = useState<Team | null>(null);
   const [timer, setTimer] = useState(24 * 60 * 60);

   useEffect(() => { const interval = setInterval(() => { const elapsed = Math.floor((Date.now() - league.draftConfig.lastPickTime) / 1000); setTimer(Math.max(0, (24 * 60 * 60) - elapsed)); }, 1000); return () => clearInterval(interval); }, [league.draftConfig.lastPickTime]);
   const formatTime = (s: number) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`; };
   const totalTeams = league.draftConfig.pickOrder.length;
   const round = Math.floor(league.draftConfig.currentPickIndex / totalTeams);
   const pickInRound = league.draftConfig.currentPickIndex % totalTeams;
   const currentTeamId = (round % 2 === 0) ? league.draftConfig.pickOrder[pickInRound] : league.draftConfig.pickOrder[totalTeams - 1 - pickInRound];
   const currentTeam = league.teams.find(t => t.id === currentTeamId);
   const myTeam = league.teams.find(t => t.ownerId === user.uid);
   const isMyTurn = currentTeam?.ownerId === user.uid;
   const isCommish = league.commissionerId === user.uid;
   const draftedIds = new Set<number>();
   league.teams.forEach(t => t.roster.forEach(p => draftedIds.add(p.id)));
   const availablePokemon = league.pokemonPool.filter(p => !draftedIds.has(p.id));
   const confirmDraft = async () => {
      if (!selectedPick || !currentTeam) return;
      if (currentTeam.roster.length >= league.draftConfig.maxPokemon) { alert("Roster full!"); return; }
      if (currentTeam.budgetUsed + selectedPick.points > league.draftConfig.totalBudget) { alert("Not enough budget!"); return; }
      const newTeams = league.teams.map(t => { if (t.id === currentTeamId) { return { ...t, budgetUsed: t.budgetUsed + selectedPick.points, roster: [...t.roster.map(minifyPokemon), minifyPokemon(selectedPick)] }; } return { ...t, roster: t.roster.map(minifyPokemon) }; });
      const updates: any = { teams: newTeams, 'draftConfig.currentPickIndex': league.draftConfig.currentPickIndex + 1, 'draftConfig.lastPickTime': Date.now() };
      const totalSlots = totalTeams * league.draftConfig.maxPokemon;
      if (league.draftConfig.currentPickIndex + 1 >= totalSlots) { updates.phase = 'season'; updates.schedule = generateSchedule(newTeams); updates.currentWeek = 1; }
      await updateDoc(doc(db, 'leagues', league.id!), updates);
      setSelectedPick(null);
   };
   const filtered = availablePokemon.filter(p => { return p.name.toLowerCase().includes(search.toLowerCase()) && (filterTier === 'All' || p.tier === filterTier) && (filterType === 'All' || p.types.includes(filterType)) && (filterPoints === 'All' || p.points === parseInt(filterPoints)); }).sort((a,b) => b.points - a.points);
   const canPick = isMyTurn || isCommish;

   return (
      <div className="flex flex-col h-[calc(100vh-80px)] relative">
         <div className="bg-gray-800 border-b border-gray-700 p-4 shadow-lg shrink-0 z-20">
            <div className="flex justify-between items-center max-w-7xl mx-auto">
               <div><h2 className="text-2xl font-bold text-yellow-400">Draft Room</h2><div className="text-sm text-gray-400">Round {round + 1} • Pick {pickInRound + 1}</div></div>
               <div className="text-center"><div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Current Pick</div><div className={`text-xl font-bold ${isMyTurn ? 'text-green-400 animate-pulse' : 'text-white'}`}>{isMyTurn ? 'Your Turn!' : `${currentTeam?.name}`}</div></div>
               <div className="text-center"><div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Time Left</div><div className="text-xl font-mono font-bold text-red-400">{formatTime(timer)}</div></div>
               <div className="text-right"><div className="text-xs text-gray-500 uppercase tracking-widest mb-1">My Budget</div>{myTeam && (<div className="text-xl font-bold font-mono text-blue-400">{myTeam.budgetUsed} / {league.draftConfig.totalBudget}</div>)}</div>
            </div>
         </div>
         <div className="flex flex-1 overflow-hidden">
             <div className="flex-1 bg-gray-900 p-4 overflow-y-auto pb-24">
                <div className="max-w-6xl mx-auto">
                    <div className="flex gap-4 mb-4 sticky top-0 bg-gray-900 z-10 p-2 border-b border-gray-800">
                       <input className="flex-1 bg-gray-800 p-2 rounded border border-gray-700 text-white" placeholder="Search Pokemon..." value={search} onChange={e => setSearch(e.target.value)} />
                       <select className="bg-gray-800 p-2 rounded border border-gray-700 text-white" value={filterTier} onChange={e => setFilterTier(e.target.value)}><option value="All">All Tiers</option>{['OU', 'UU', 'RU', 'NU', 'PU', 'LC'].map(t => <option key={t} value={t}>{t}</option>)}</select>
                       <select className="bg-gray-800 p-2 rounded border border-gray-700 text-white" value={filterType} onChange={e => setFilterType(e.target.value)}><option value="All">All Types</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                       <select className="bg-gray-800 p-2 rounded border border-gray-700 text-white" value={filterPoints} onChange={e => setFilterPoints(e.target.value)}><option value="All">All Points</option>{Array.from({length: 20}, (_, i) => 20 - i).map(p => <option key={p} value={p}>{p} pts</option>)}</select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                       {filtered.slice(0, limit).map(p => {
                          const budgetToCheck = currentTeam ? currentTeam.budgetUsed : 0;
                          const canAfford = (budgetToCheck + p.points <= league.draftConfig.totalBudget);
                          const disabled = !canPick || !canAfford;
                          return (
                             <div key={p.id} className={`relative bg-gray-800 rounded border p-3 flex flex-col gap-2 transition group ${selectedPick?.id === p.id ? 'ring-2 ring-yellow-500 bg-gray-700' : 'border-gray-600 hover:bg-gray-700'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`} onClick={() => !disabled && setSelectedPick(p)}>
                                <div className="flex justify-between items-start"><span className={`font-bold text-lg ${canAfford ? 'text-yellow-500' : 'text-red-500'}`}>{p.points} pts</span><span className="text-xs text-gray-500">{p.tier}</span></div>
                                <div className="self-center my-2"><PokemonImage src={p.sprite} alt={p.name} className="w-16 h-16" /></div>
                                <div className="text-center font-bold">{p.name}</div>
                                <div className="flex justify-center gap-1 mb-2">{p.types.map(t => <TypeBadge key={t} type={t} size="sm" />)}</div>
                                <div className="grid grid-cols-6 gap-1 text-[10px] text-center bg-black/20 p-1 rounded">{getStatValues(p).map((v, i) => (<div key={i}><div className="text-gray-500">{STAT_LABELS[i]}</div><div className="font-mono text-white">{v}</div></div>))}</div>
                                <div className="text-xs text-gray-400 mt-1 italic text-center truncate">{p.abilities?.join(', ')}</div>
                                {!canAfford && (<div className="absolute inset-0 bg-black/60 flex items-center justify-center text-red-500 font-bold rounded">Too Expensive</div>)}
                             </div>
                          );
                       })}
                    </div>
                    {filtered.length > limit && (<div className="text-center mt-4"><button onClick={() => setLimit(l => l + 50)} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded text-white font-bold">Show More</button></div>)}
                </div>
             </div>
             <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col hidden xl:flex">
                 <div className="p-4 border-b border-gray-700 font-bold text-gray-400">Teams & Rosters</div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {league.teams.map(t => {
                       const isPicking = t.id === currentTeamId;
                       return (<div key={t.id} onClick={() => setViewTeam(t)} className={`rounded p-3 border transition cursor-pointer hover:bg-white/5 ${isPicking ? 'bg-yellow-900/20 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-gray-700/30 border-gray-700'}`}><div className="flex items-center gap-2 mb-2"><img src={t.logoUrl} className="w-8 h-8 rounded-full bg-black border border-gray-600" /><div className="overflow-hidden"><div className={`font-bold truncate text-sm ${isPicking ? 'text-yellow-400' : 'text-gray-200'}`}>{t.name}</div><div className="text-xs text-gray-500">{t.roster.length}/{league.draftConfig.maxPokemon} • {t.budgetUsed} pts</div></div></div><div className="flex flex-wrap gap-1">{t.roster.map(p => (<div key={p.id} title={p.name} className="relative group"><img src={p.sprite} className="w-8 h-8" /></div>))}{Array.from({length: Math.max(0, league.draftConfig.maxPokemon - t.roster.length)}).map((_, i) => (<div key={i} className="w-8 h-8 bg-black/20 rounded-full border border-gray-600/50"></div>))}</div></div>)
                    })}
                 </div>
             </div>
         </div>
         {selectedPick && (
             <div className="absolute bottom-0 left-0 right-0 bg-gray-800 border-t border-yellow-500 p-4 shadow-2xl flex justify-between items-center z-50 animate-slide-up">
                 <div className="flex items-center gap-4"><PokemonImage src={selectedPick.sprite} alt={selectedPick.name} className="w-16 h-16"/><div><div className="text-yellow-400 font-bold text-lg">Confirm Selection</div><div className="text-white text-xl font-bold">{selectedPick.name} <span className="text-gray-400 text-base">({selectedPick.points} pts)</span></div></div></div>
                 <div className="flex gap-4"><button onClick={() => setSelectedPick(null)} className="bg-gray-700 text-white px-6 py-3 rounded font-bold hover:bg-gray-600">Cancel</button><button onClick={confirmDraft} className="bg-green-600 text-white px-8 py-3 rounded font-bold hover:bg-green-500 shadow-lg flex flex-col items-center leading-none"><span>{isMyTurn ? 'Draft Now' : isCommish ? 'Force Pick' : 'Draft'}</span>{isCommish && !isMyTurn && <span className="text-[10px] uppercase font-normal text-green-200 mt-1">Commissioner Override</span>}</button></div>
             </div>
         )}
         {viewTeam && <TeamDetailModal team={viewTeam} onClose={() => setViewTeam(null)} />}
      </div>
   );
};
const DashboardView: React.FC<{ user: User; onSelectLeague: (leagueId: string, pool: Pokemon[]) => void; availableLeagues: LeagueState[]; }> = ({ user, onSelectLeague, availableLeagues }) => {
  const [view, setView] = useState<'list'|'create'|'join'>('list');
  const [createStep, setCreateStep] = useState(0); 
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newMaxPlayers, setNewMaxPlayers] = useState(8);
  const [newTotalBudget, setNewTotalBudget] = useState(100);
  const [newMaxPokemon, setNewMaxPokemon] = useState(10); 
  const [commishTeamName, setCommishTeamName] = useState('');
  const [commishCoachName, setCommishCoachName] = useState('');
  const [commishTeamLogo, setCommishTeamLogo] = useState(''); 
  const [poolEditorState, setPoolEditorState] = useState<(Pokemon & { isActive: boolean })[]>([]);
  const [poolSearch, setPoolSearch] = useState('');
  const [poolLimit, setPoolLimit] = useState(50);
  const [poolPointFilter, setPoolPointFilter] = useState('All');
  const [joinCode, setJoinCode] = useState('');
  const [joinTeamName, setJoinTeamName] = useState('');
  const [joinCoachName, setJoinCoachName] = useState('');
  const [joinTeamLogo, setJoinTeamLogo] = useState(''); 

  useEffect(() => { if ((window as any).FULL_POKEDEX) { setPoolEditorState((window as any).FULL_POKEDEX.map((p: Pokemon) => ({ ...p, isActive: !p.tier?.includes('Uber') }))); } }, []);
  const handlePoolPreset = (preset: string) => { let newState = [...poolEditorState]; switch(preset) { case 'All': newState = newState.map(p => ({...p, isActive: true})); break; case 'None': newState = newState.map(p => ({...p, isActive: false})); break; case 'Reg H': newState = newState.map(p => ({...p, isActive: !p.isNonstandard})); break; case 'Reg F': newState = newState.map(p => ({...p, isActive: !p.isNonstandard})); break; } setPoolEditorState(newState); };
  const handleCreateLeague = async () => {
    const activePool = poolEditorState.filter(p => p.isActive).map(({isActive, ...p}) => p);
    if (activePool.length < newMaxPlayers * 6) { alert('Pool too small'); return; }
    const commishTeam: Team = { id: `team-1-${Date.now()}`, ownerId: user.uid, name: commishTeamName, logoUrl: commishTeamLogo || `https://ui-avatars.com/api/?name=${commishTeamName}&background=random`, coachName: commishCoachName, roster: [], budgetUsed: 0, wins: 0, losses: 0, differential: 0 };
    const simplifiedPool = activePool.map(minifyPokemon);
    const newLeague: Partial<LeagueState> = { name: newName, logoUrl: newLogo || `https://ui-avatars.com/api/?name=${newName}&background=random`, commissionerId: user.uid, maxPlayers: newMaxPlayers, joinCode: Math.random().toString(36).substring(2, 8).toUpperCase(), phase: 'setup', currentWeek: 0, teams: [commishTeam], pokemonPool: simplifiedPool, transactions: [], draftConfig: { totalBudget: newTotalBudget, maxPokemon: newMaxPokemon, pickOrder: [], currentPickIndex: 0, direction: 'forward', lastPickTime: 0 }, schedule: [] };
    await addDoc(collection(db, 'leagues'), newLeague);
    setView('list');
  };
  const handleJoinLeague = async () => {
     const q = query(collection(db, 'leagues'), where('joinCode', '==', joinCode));
     const snap = await getDocs(q);
     if (snap.empty) { alert("League not found"); return; }
     const lDoc = snap.docs[0];
     const lData = lDoc.data() as LeagueState;
     if (lData.teams.some(t => t.ownerId === user.uid)) { alert("Already joined"); return; }
     if (lData.teams.length >= lData.maxPlayers) { alert("Full"); return; }
     const newTeam: Team = { id: `team-${Date.now()}`, ownerId: user.uid, name: joinTeamName, coachName: joinCoachName, logoUrl: joinTeamLogo || `https://ui-avatars.com/api/?name=${joinTeamName}&background=random`, roster: [], budgetUsed: 0, wins: 0, losses: 0, differential: 0 };
     const minifiedTeams = lData.teams.map(t => ({ ...t, roster: t.roster.map(minifyPokemon) }));
     await updateDoc(doc(db, 'leagues', lDoc.id), { teams: [...minifiedTeams, newTeam] });
     setView('list');
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
       {view === 'list' && (
          <div className="space-y-8">
             <div className="flex justify-between items-center"><h1 className="text-3xl font-bold text-yellow-400">My Leagues</h1><div className="flex gap-4"><button onClick={() => { setCreateStep(0); setView('create'); }} className="bg-yellow-500 text-black font-bold px-4 py-2 rounded shadow hover:bg-yellow-400">+ Create</button><button onClick={() => setView('join')} className="bg-gray-700 text-white font-bold px-4 py-2 rounded shadow hover:bg-gray-600">Join with Code</button></div></div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {availableLeagues.map(l => (
                   <div key={l.id} onClick={() => onSelectLeague(l.id!, l.pokemonPool)} className="bg-gray-800 rounded-lg p-6 border border-gray-700 hover:border-yellow-500 cursor-pointer transition shadow-lg group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2">{l.commissionerId === user.uid && <span className="bg-red-900 text-red-200 text-xs px-2 py-1 rounded">Commish</span>}</div>
                      <div className="flex items-center gap-4 mb-4"><img src={l.logoUrl} className="w-16 h-16 rounded-full bg-black object-cover border-2 border-gray-600 group-hover:border-yellow-500 transition" /><div><h3 className="text-xl font-bold">{l.name}</h3><p className="text-sm text-gray-400">{l.teams.length}/{l.maxPlayers} Teams</p></div></div>
                      <div className="flex justify-between items-center text-xs text-gray-500 uppercase tracking-widest bg-gray-900/50 p-2 rounded"><span>{l.phase}</span><span>Week {l.currentWeek}</span></div>
                   </div>
                ))}
                {availableLeagues.length === 0 && (<div className="col-span-full text-center py-20 text-gray-500 bg-gray-800/30 rounded border-2 border-dashed border-gray-700">No leagues found. Create or join one to get started!</div>)}
             </div>
          </div>
       )}
       {view === 'create' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 shadow-2xl max-w-4xl mx-auto">
             <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-700"><h2 className="text-2xl font-bold flex items-center gap-2"><span className="bg-yellow-500 text-black w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">{createStep + 1}</span>{createStep === 0 ? 'League Details' : createStep === 1 ? 'Commissioner Team' : 'Draft Pool Editor'}</h2><button onClick={() => setView('list')} className="text-gray-400 hover:text-white">Cancel</button></div>
             {createStep === 0 && (<div className="space-y-4"><div><label className="block text-sm text-gray-400 mb-1">League Name</label><input className="w-full bg-gray-700 p-3 rounded text-white" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Indigo Plateau 2024" /></div><div><label className="block text-sm text-gray-400 mb-1">Logo URL (Optional)</label><input className="w-full bg-gray-700 p-3 rounded text-white" value={newLogo} onChange={e => setNewLogo(e.target.value)} placeholder="https://..." /></div><div className="grid grid-cols-3 gap-4"><div><label className="block text-sm text-gray-400 mb-1">Max Players</label><input type="number" className="w-full bg-gray-700 p-3 rounded text-white" value={newMaxPlayers} onChange={e => setNewMaxPlayers(parseInt(e.target.value))} /></div><div><label className="block text-sm text-gray-400 mb-1">Total Budget</label><input type="number" className="w-full bg-gray-700 p-3 rounded text-white" value={newTotalBudget} onChange={e => setNewTotalBudget(parseInt(e.target.value))} /></div><div><label className="block text-sm text-gray-400 mb-1">Roster Size</label><input type="number" className="w-full bg-gray-700 p-3 rounded text-white" value={newMaxPokemon} onChange={e => setNewMaxPokemon(parseInt(e.target.value))} /></div></div><button onClick={() => newName && setCreateStep(1)} className="w-full bg-blue-600 p-3 rounded font-bold mt-4">Next Step</button></div>)}
             {createStep === 1 && (<div className="space-y-4"><div><label className="block text-sm text-gray-400 mb-1">Your Team Name</label><input className="w-full bg-gray-700 p-3 rounded text-white" value={commishTeamName} onChange={e => setCommishTeamName(e.target.value)} placeholder="e.g. Pallet Town Pikachus" /></div><div><label className="block text-sm text-gray-400 mb-1">Your Coach Name</label><input className="w-full bg-gray-700 p-3 rounded text-white" value={commishCoachName} onChange={e => setCommishCoachName(e.target.value)} placeholder="e.g. Red" /></div><div><label className="block text-sm text-gray-400 mb-1">Team Logo URL (Optional)</label><input className="w-full bg-gray-700 p-3 rounded text-white" value={commishTeamLogo} onChange={e => setCommishTeamLogo(e.target.value)} placeholder="https://..." /></div><div className="flex gap-4 mt-4"><button onClick={() => setCreateStep(0)} className="flex-1 bg-gray-700 p-3 rounded font-bold">Back</button><button onClick={() => commishTeamName && setCreateStep(2)} className="flex-1 bg-blue-600 p-3 rounded font-bold">Next Step</button></div></div>)}
             {createStep === 2 && (<div className="h-[600px] flex flex-col"><div className="flex gap-4 mb-4 items-center flex-wrap"><input className="flex-1 bg-gray-700 p-2 rounded min-w-[200px]" placeholder="Search Pokemon..." value={poolSearch} onChange={e => setPoolSearch(e.target.value)} /><div className="flex items-center gap-2"><select onChange={(e) => handlePoolPreset(e.target.value)} className="bg-gray-700 p-2 rounded"><option value="">Select Preset...</option><option value="All">Enable All</option><option value="None">Disable All</option><option value="Reg H">Reg H (Mock)</option><option value="Reg F">Reg F (Mock)</option></select><select onChange={(e) => setPoolPointFilter(e.target.value)} className="bg-gray-700 p-2 rounded"><option value="All">All Points</option>{Array.from({length:20}, (_, i) => 20-i).map(p => <option key={p} value={p}>{p} pts</option>)}</select></div><div className="text-sm text-gray-400 self-center whitespace-nowrap">{poolEditorState.filter(p => p.isActive).length} Selected</div></div><div className="flex-1 overflow-y-auto bg-gray-900 rounded border border-gray-700 p-2"><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{poolEditorState.filter(p => { const matchName = p.name.toLowerCase().includes(poolSearch.toLowerCase()); const matchPoint = poolPointFilter === 'All' || p.points === parseInt(poolPointFilter); return matchName && matchPoint; }).slice(0, poolLimit).map(p => (<div key={p.id} className={`flex items-center gap-2 p-2 rounded border ${p.isActive ? 'bg-gray-800 border-gray-600' : 'bg-gray-900 border-gray-800 opacity-50'}`}><input type="checkbox" checked={p.isActive} onChange={() => { const next = [...poolEditorState]; const idx = next.findIndex(x => x.id === p.id); next[idx].isActive = !next[idx].isActive; setPoolEditorState(next); }} className="w-4 h-4 cursor-pointer" /><PokemonImage src={p.sprite} alt={p.name} className="w-10 h-10" /><div className="flex-1 min-w-0"><div className="text-sm font-bold truncate">{p.name}</div><div className="text-xs text-gray-500">{p.types.join('/')}</div></div><input type="number" className="w-12 bg-gray-700 border border-gray-600 rounded px-1 text-center" value={p.points} onChange={(e) => { const next = [...poolEditorState]; const idx = next.findIndex(x => x.id === p.id); next[idx].points = parseInt(e.target.value) || 0; setPoolEditorState(next); }} /></div>))}</div>{poolEditorState.length > poolLimit && (<div className="text-center mt-2"><button onClick={() => setPoolLimit(l => l + 50)} className="bg-gray-700 px-4 py-1 rounded hover:bg-gray-600 text-sm">Load More</button></div>)}</div><div className="flex gap-4 mt-4"><button onClick={() => setCreateStep(1)} className="flex-1 bg-gray-700 p-3 rounded font-bold">Back</button><button onClick={handleCreateLeague} className="flex-1 bg-green-600 p-3 rounded font-bold shadow-lg shadow-green-900/50">Create League</button></div></div>)}
          </div>
       )}
       {view === 'join' && (
          <div className="max-w-md mx-auto bg-gray-800 p-8 rounded-lg border border-gray-700 shadow-xl">
             <h2 className="text-2xl font-bold mb-6">Join a League</h2>
             <div className="space-y-4">
                <input className="w-full bg-gray-700 p-3 rounded" placeholder="League Join Code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} />
                <input className="w-full bg-gray-700 p-3 rounded" placeholder="Your Team Name" value={joinTeamName} onChange={e => setJoinTeamName(e.target.value)} />
                <input className="w-full bg-gray-700 p-3 rounded" placeholder="Your Coach Name" value={joinCoachName} onChange={e => setJoinCoachName(e.target.value)} />
                <input className="w-full bg-gray-700 p-3 rounded" placeholder="Team Logo URL (Optional)" value={joinTeamLogo} onChange={e => setJoinTeamLogo(e.target.value)} />
                <div className="flex gap-4 mt-6"><button onClick={() => setView('list')} className="flex-1 bg-gray-700 p-3 rounded">Cancel</button><button onClick={handleJoinLeague} className="flex-1 bg-blue-600 p-3 rounded font-bold">Join</button></div>
             </div>
          </div>
       )}
    </div>
  );
};

const SeasonView: React.FC<{ 
  league: LeagueState; 
  user: User; 
  activeTab: string; 
  onTabChange: (t: any) => void; 
}> = ({ league, user, activeTab, onTabChange }) => {
  const [viewWeek, setViewWeek] = useState(league.currentWeek);
  const [reportingMatch, setReportingMatch] = useState<Matchup | null>(null);
  const [analysisTeamA, setAnalysisTeamA] = useState(league.teams[0]?.id);
  const [analysisTeamB, setAnalysisTeamB] = useState(league.teams[1]?.id);
  const [draftSummaryTeam, setDraftSummaryTeam] = useState('A');
  const [defenseTeam, setDefenseTeam] = useState('A');
  const [coverageTeam, setCoverageTeam] = useState('A');
  const [utilityTeam, setUtilityTeam] = useState('A');
  const [teraTeam, setTeraTeam] = useState('A');
  const [editingTeam, setEditingTeam] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [faFilterPoint, setFaFilterPoint] = useState<string>('All');
  const [faSearch, setFaSearch] = useState('');
  const [faLimit, setFaLimit] = useState(20);
  
  // Custom Confirmation Modal State
  const [confirmationData, setConfirmationData] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const isCommish = league.commissionerId === user.uid;

  useEffect(() => { setViewWeek(league.currentWeek) }, [league.currentWeek]);

  const handleAdvanceWeek = async () => {
    if (!league.id) {
        alert("Error: League ID missing");
        return;
    }

    try {
        const regularSeasonMatches = league.schedule.filter(m => !m.isPlayoff);
        const lastRegularWeek = regularSeasonMatches.length > 0 
            ? Math.max(...regularSeasonMatches.map(m => m.week)) 
            : 0;
            
        // 1. Playoff Phase Logic
        if (league.phase === 'playoffs') {
           const semiFinals = league.schedule.filter(m => m.playoffRound === 'Semi-Final');
           const finals = league.schedule.filter(m => m.playoffRound === 'Final');
           
           if (semiFinals.length > 0 && finals.length === 0) {
              if (!semiFinals.every(m => m.completed)) { alert("Finish Semi-Finals first."); return; }
              const w1Id = league.schedule.find(m => m.id === semiFinals[0].id)?.winnerId;
              const w2Id = league.schedule.find(m => m.id === semiFinals[1].id)?.winnerId;

              if (!w1Id || !w2Id) { alert("Error identifying winners."); return; }

              const finalMatch: Matchup = {
                 id: `final-${Date.now()}`,
                 week: league.currentWeek + 1,
                 teamAId: w1Id,
                 teamBId: w2Id,
                 completed: false,
                 isPlayoff: true,
                 playoffRound: 'Final'
              };
              
              setConfirmationData({
                  message: "All Semi-Finals complete. Advance to Championship Week?",
                  onConfirm: async () => {
                      await updateDoc(doc(db, 'leagues', league.id!), {
                         currentWeek: league.currentWeek + 1,
                         schedule: [...league.schedule, finalMatch]
                      });
                  }
              });
           } else if (finals.length > 0 && finals[0].completed) {
              const champ = league.teams.find(t => t.id === finals[0].winnerId);
              
              setConfirmationData({
                  message: `Declare ${champ?.name} as the Champion and end the season?`,
                  onConfirm: async () => {
                      await updateDoc(doc(db, 'leagues', league.id!), {
                         phase: 'completed',
                         championId: champ?.id
                      });
                  }
              });
           }
           return;
        }

        // 2. Regular Season Logic
        if (league.phase === 'season') {
            if (league.currentWeek >= lastRegularWeek) {
                const sortedTeams = [...league.teams].sort((a,b) => {
                  if (a.wins !== b.wins) return b.wins - a.wins;
                  if (a.differential !== b.differential) return b.differential - a.differential;
                  return 0; 
                });
                
                const nextWeek = league.currentWeek + 1;
                let updates: any = {
                    phase: 'playoffs',
                    currentWeek: nextWeek
                };

                if (sortedTeams.length < 4) {
                    const finalMatch: Matchup = { 
                        id: `final-${Date.now()}`, 
                        week: nextWeek, 
                        teamAId: sortedTeams[0].id, 
                        teamBId: sortedTeams[1].id, 
                        completed: false, 
                        isPlayoff: true, 
                        playoffRound: 'Final'
                    };
                    updates.schedule = [...league.schedule, finalMatch];
                } else {
                    const top4 = sortedTeams.slice(0, 4);
                    const semiFinals: Matchup[] = [
                      { id: `sf-1-${Date.now()}`, week: nextWeek, teamAId: top4[0].id, teamBId: top4[3].id, completed: false, isPlayoff: true, playoffRound: 'Semi-Final' },
                      { id: `sf-2-${Date.now()}`, week: nextWeek, teamAId: top4[1].id, teamBId: top4[2].id, completed: false, isPlayoff: true, playoffRound: 'Semi-Final' }
                    ];
                    updates.schedule = [...league.schedule, ...semiFinals];
                }

                setConfirmationData({
                    message: "Regular Season concluded. Proceed to Playoffs?",
                    onConfirm: async () => {
                        await updateDoc(doc(db, 'leagues', league.id!), updates);
                    }
                });

            } else {
                // Standard Advance
                setConfirmationData({
                    message: `Advance schedule to Week ${league.currentWeek + 1}?`,
                    onConfirm: async () => {
                        await updateDoc(doc(db, 'leagues', league.id!), {
                            currentWeek: league.currentWeek + 1
                        });
                    }
                });
            }
        }
    } catch(err: any) {
        console.error(err);
        alert("Failed to advance: " + err.message);
    }
  };

  const handleTransaction = async (type: 'add' | 'drop', pokemon: Pokemon) => {
     if (league.currentWeek > 3) { alert("Free Agency locked."); return; }
     const myTeam = league.teams.find(t => t.ownerId === user.uid);
     if (!myTeam) return;

     const newTeams = league.teams.map(t => {
         if (t.id === myTeam.id) {
            let newRoster = [...t.roster];
            let newBudget = t.budgetUsed;
            if (type === 'drop') {
                newRoster = newRoster.filter(p => p.id !== pokemon.id);
                newBudget -= pokemon.points;
            } else {
                if (newRoster.length >= league.draftConfig.maxPokemon) throw new Error("Roster Full");
                if (newBudget + pokemon.points > league.draftConfig.totalBudget) throw new Error("Over budget");
                newRoster.push(pokemon);
                newBudget += pokemon.points;
            }
            return { ...t, budgetUsed: newBudget, roster: newRoster.map(minifyPokemon) };
         }
         return { ...t, roster: t.roster.map(minifyPokemon) };
     });

     try {
         const transaction: Transaction = {
           id: `trans-${Date.now()}`,
           date: Date.now(),
           teamId: myTeam.id,
           teamName: myTeam.name,
           type: type === 'add' ? 'ADD' : 'DROP',
           pokemonName: pokemon.name,
           points: pokemon.points
         };
         const newTransactions = [transaction, ...(league.transactions || [])];
         await updateDoc(doc(db, 'leagues', league.id!), { teams: newTeams, transactions: newTransactions });
     } catch (e: any) {
         alert(e.message || "Transaction failed");
     }
  };

  const handleUpdateTeam = async () => {
    const myTeam = league.teams.find(t => t.ownerId === user.uid);
    if (!myTeam) return;
    const newTeams = league.teams.map(t => {
        const updatedT = t.id === myTeam.id ? { ...t, name: editName, logoUrl: editLogo } : t;
        return { ...updatedT, roster: updatedT.roster.map(minifyPokemon) };
    });
    await updateDoc(doc(db, 'leagues', league.id!), { teams: newTeams });
    setEditingTeam(false);
  };

  const handleUpdateTera = async (pokemonId: number, teraType: string) => {
      const myTeam = league.teams.find(t => t.ownerId === user.uid);
      if (!myTeam) return;
      const newTeams = league.teams.map(t => {
          if (t.id === myTeam.id) {
              return {
                  ...t,
                  roster: t.roster.map(p => p.id === pokemonId ? { ...p, teraType } : p).map(minifyPokemon)
              };
          }
          return { ...t, roster: t.roster.map(minifyPokemon) };
      });
      await updateDoc(doc(db, 'leagues', league.id!), { teams: newTeams });
  };

  const renderSchedule = () => (
     <div className="max-w-4xl mx-auto">
        {league.phase === 'completed' && (
            <div className="bg-yellow-900/50 border border-yellow-500 p-6 rounded text-center mb-8">
                <h2 className="text-3xl font-bold text-yellow-400 mb-2">Season Completed</h2>
                <div className="text-xl">Champion: {league.teams.find(t => t.id === league.championId)?.name}</div>
            </div>
        )}
        <div className="flex justify-between items-center mb-6 bg-gray-800 p-4 rounded border border-gray-700 shadow-md">
           <div className="flex items-center gap-4">
              <button disabled={viewWeek <= 1} onClick={() => setViewWeek(v => v-1)} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 transition">←</button>
              <h2 className="text-xl font-bold text-yellow-400 w-64 text-center">
                 {league.phase === 'playoffs' && viewWeek > (league.schedule.filter(m => !m.isPlayoff).sort((a,b)=>b.week-a.week)[0]?.week || 99) ? 'Playoffs' : `Week ${viewWeek}`}
              </h2>
              <button disabled={viewWeek >= (league.schedule[league.schedule.length-1]?.week || 99)} onClick={() => setViewWeek(v => v+1)} className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 transition">→</button>
           </div>
           {isCommish && league.phase !== 'completed' && (
              <button onClick={handleAdvanceWeek} className="bg-red-600 hover:bg-red-500 text-xs px-3 py-2 rounded font-bold uppercase tracking-wider shadow">
                 {league.phase === 'playoffs' ? (league.schedule.filter(m => m.playoffRound === 'Final').length > 0 && league.schedule.filter(m => m.playoffRound === 'Final')[0].completed ? 'Complete Season' : 'Advance Round') : 'Advance Week'}
              </button>
           )}
        </div>
        <div className="space-y-4">
           {league.schedule.filter(m => m.week === viewWeek).map(m => {
              const tA = league.teams.find(t => t.id === m.teamAId);
              const tB = league.teams.find(t => t.id === m.teamBId);
              const isParticipant = tA?.ownerId === user.uid || tB?.ownerId === user.uid;
              const canReport = !m.completed || isCommish;

              return (
                 <div key={m.id} className={`p-4 rounded border transition hover:border-gray-500 ${m.completed ? 'bg-gray-800 border-gray-700' : 'bg-gray-800 border-l-4 border-l-yellow-500 border-gray-700'}`}>
                    {m.isPlayoff && <div className="text-center text-xs text-yellow-400 font-bold mb-2 uppercase tracking-widest">{m.playoffRound}</div>}
                    <div className="flex items-center justify-between">
                       <div className="flex-1 flex items-center gap-4">
                          <img src={tA?.logoUrl} className="w-10 h-10 rounded-full bg-black object-cover border border-gray-600" />
                          <div className="font-bold text-lg">{tA?.name}</div>
                          {m.completed && m.scoreA !== undefined && <span className={`text-2xl font-mono ${m.winnerId === tA?.id ? 'text-green-400' : 'text-gray-500'}`}>{m.scoreA}</span>}
                       </div>
                       <div className="mx-4 text-xs text-gray-500 font-mono">VS</div>
                       <div className="flex-1 flex items-center gap-4 justify-end">
                          {m.completed && m.scoreB !== undefined && <span className={`text-2xl font-mono ${m.winnerId === tB?.id ? 'text-green-400' : 'text-gray-500'}`}>{m.scoreB}</span>}
                          <div className="font-bold text-lg text-right">{tB?.name}</div>
                          <img src={tB?.logoUrl} className="w-10 h-10 rounded-full bg-black object-cover border border-gray-600" />
                       </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-700 flex justify-end gap-3">
                       {m.completed && m.replayUrl && <a href={m.replayUrl} target="_blank" className="text-xs bg-blue-900 text-blue-200 px-3 py-1 rounded border border-blue-700 hover:bg-blue-800">Watch Replay</a>}
                       <button onClick={() => { setAnalysisTeamA(tA?.id!); setAnalysisTeamB(tB?.id!); onTabChange('analysis'); }} className="text-xs bg-gray-700 px-3 py-1 rounded hover:bg-gray-600">Analyze Matchup</button>
                       {canReport && (isParticipant || isCommish) && <button onClick={() => setReportingMatch(m)} className="text-xs bg-green-700 px-3 py-1 rounded font-bold hover:bg-green-600">Report Result</button>}
                    </div>
                 </div>
              );
           })}
        </div>
     </div>
  );

  const renderPlayoffs = () => {
    // ... (Logic unchanged) ...
    const semiFinals = league.schedule.filter(m => m.playoffRound === 'Semi-Final');
    const finals = league.schedule.filter(m => m.playoffRound === 'Final');
    const hasSemis = league.teams.length >= 4;

    return (
       <div className="max-w-6xl mx-auto overflow-x-auto pb-8">
          {league.phase === 'season' && <div className="text-center p-4 bg-yellow-900/20 text-yellow-400 mb-8 rounded font-bold">Playoffs will begin after the regular season.</div>}
          
          <div className="flex justify-around items-center min-w-[700px] gap-8">
             {hasSemis && (
               <>
                 <div className="flex flex-col gap-16">
                    <h3 className="text-center font-bold mb-4 text-yellow-400 uppercase tracking-widest">Semi-Finals</h3>
                    {semiFinals.length > 0 ? semiFinals.map(m => {
                       const tA = league.teams.find(t => t.id === m.teamAId);
                       const tB = league.teams.find(t => t.id === m.teamBId);
                       return (
                          <div key={m.id} className="bg-gray-800 w-72 border border-gray-600 rounded shadow-lg overflow-hidden relative">
                             <div className={`p-3 border-b border-gray-700 flex justify-between items-center ${m.winnerId === tA?.id ? 'bg-green-900/30' : ''}`}>
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {tA && <img src={tA.logoUrl} className="w-6 h-6 rounded-full"/>}
                                    <span className="font-bold truncate">{tA?.name || 'TBD'}</span>
                                </div>
                                <span className="font-mono font-bold pl-2">{m.scoreA}</span>
                             </div>
                             <div className={`p-3 flex justify-between items-center ${m.winnerId === tB?.id ? 'bg-green-900/30' : ''}`}>
                                <div className="flex items-center gap-2 overflow-hidden">
                                    {tB && <img src={tB.logoUrl} className="w-6 h-6 rounded-full"/>}
                                    <span className="font-bold truncate">{tB?.name || 'TBD'}</span>
                                </div>
                                <span className="font-mono font-bold pl-2">{m.scoreB}</span>
                             </div>
                             <div className="absolute top-1/2 -right-4 w-4 h-0.5 bg-gray-600"></div>
                          </div>
                       )
                    }) : (
                       <>
                         <div className="w-72 h-24 bg-gray-800/50 border-2 border-dashed border-gray-700 rounded flex items-center justify-center text-gray-500">Seed 1 vs Seed 4</div>
                         <div className="w-72 h-24 bg-gray-800/50 border-2 border-dashed border-gray-700 rounded flex items-center justify-center text-gray-500">Seed 2 vs Seed 3</div>
                       </>
                    )}
                 </div>
                 
                 <div className="flex flex-col justify-around h-64 border-r-2 border-gray-600 relative w-8"></div>
               </>
             )}

             <div className="flex flex-col gap-12">
                <h3 className="text-center font-bold mb-4 text-yellow-400 uppercase tracking-widest text-xl">Championship</h3>
                {finals.length > 0 ? finals.map(m => {
                    const tA = league.teams.find(t => t.id === m.teamAId);
                    const tB = league.teams.find(t => t.id === m.teamBId);
                    return (
                       <div key={m.id} className="bg-gray-800 w-80 border-4 border-yellow-500 rounded shadow-2xl overflow-hidden scale-110 relative z-10">
                          <div className={`p-4 border-b border-gray-700 flex justify-between items-center ${m.winnerId === tA?.id ? 'bg-green-900/30' : ''}`}>
                             <div className="flex items-center gap-2 overflow-hidden">
                                {tA && <img src={tA.logoUrl} className="w-8 h-8 rounded-full"/>}
                                <span className="font-bold text-lg truncate">{tA?.name}</span>
                             </div>
                             <span className="font-mono font-bold text-lg">{m.scoreA}</span>
                          </div>
                          <div className={`p-4 flex justify-between items-center ${m.winnerId === tB?.id ? 'bg-green-900/30' : ''}`}>
                             <div className="flex items-center gap-2 overflow-hidden">
                                {tB && <img src={tB.logoUrl} className="w-8 h-8 rounded-full"/>}
                                <span className="font-bold text-lg truncate">{tB?.name}</span>
                             </div>
                             <span className="font-mono font-bold text-lg">{m.scoreB}</span>
                          </div>
                          {m.completed && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="text-yellow-500/20 text-6xl font-black uppercase -rotate-12 border-4 border-yellow-500/20 p-4 rounded-xl">CHAMPION</div></div>}
                       </div>
                    )
                }) : (
                   <div className="bg-gray-800/50 w-80 h-32 border-4 border-dashed border-gray-700 rounded flex items-center justify-center text-gray-500 text-xl font-bold">
                      {hasSemis ? 'Winner SF1 vs Winner SF2' : 'Seed 1 vs Seed 2'}
                   </div>
                )}
             </div>
          </div>
       </div>
    )
  };

  const renderAnalysis = () => {
    // FIX: Hydrate teams to restore move pools which were stripped by minifyPokemon
    const rawA = league.teams.find(t => t.id === analysisTeamA);
    const rawB = league.teams.find(t => t.id === analysisTeamB);
    
    if (!rawA || !rawB) return <div className="text-center p-10 text-gray-500">Select two teams to analyze</div>;

    const tA = hydrateTeam(rawA);
    const tB = hydrateTeam(rawB);

    const getTeam = (key: string) => key === 'A' ? tA : tB;
    const getOpponent = (key: string) => key === 'A' ? tB : tA;

    return (
       <div className="space-y-12 animate-fade-in min-h-[80vh] pb-24">
          <div className="bg-gray-800 p-4 rounded border border-gray-700 flex flex-col md:flex-row justify-center gap-4 shadow-lg sticky top-0 z-20">
             <select value={analysisTeamA} onChange={e => setAnalysisTeamA(e.target.value)} className="bg-gray-700 p-2 rounded text-white font-bold">
                {league.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
             </select>
             <span className="self-center font-mono text-gray-500">VS</span>
             <select value={analysisTeamB} onChange={e => setAnalysisTeamB(e.target.value)} className="bg-gray-700 p-2 rounded text-white font-bold">
                {league.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
             </select>
          </div>
          {/* ... existing analysis implementation ... */}
          <div className="bg-gray-900/50 p-4 rounded border border-gray-800">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-yellow-400">Draft Summary</h3>
                <div className="bg-gray-800 p-1 rounded flex">
                   <button onClick={() => setDraftSummaryTeam('A')} className={`px-3 py-1 rounded text-xs font-bold ${draftSummaryTeam === 'A' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tA.name}</button>
                   <button onClick={() => setDraftSummaryTeam('B')} className={`px-3 py-1 rounded text-xs font-bold ${draftSummaryTeam === 'B' ? 'bg-red-600 text-white' : 'text-gray-400'}`}>{tB.name}</button>
                </div>
             </div>
             <DraftSummary team={getTeam(draftSummaryTeam)} />
          </div>

          <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">Defensive Type Chart</h3>
                <div className="bg-gray-800 p-1 rounded flex">
                   <button onClick={() => setDefenseTeam('A')} className={`px-3 py-1 rounded text-xs font-bold ${defenseTeam === 'A' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tA.name}</button>
                   <button onClick={() => setDefenseTeam('B')} className={`px-3 py-1 rounded text-xs font-bold ${defenseTeam === 'B' ? 'bg-red-600 text-white' : 'text-gray-400'}`}>{tB.name}</button>
                </div>
             </div>
             <DefenseGrid team={getTeam(defenseTeam)} />
          </div>

          <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">Coverage</h3>
                <div className="bg-gray-800 p-1 rounded flex">
                   <button onClick={() => setCoverageTeam('A')} className={`px-3 py-1 rounded text-xs font-bold ${coverageTeam === 'A' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tA.name}</button>
                   <button onClick={() => setCoverageTeam('B')} className={`px-3 py-1 rounded text-xs font-bold ${coverageTeam === 'B' ? 'bg-red-600 text-white' : 'text-gray-400'}`}>{tB.name}</button>
                </div>
             </div>
             <CoverageAnalysis attacker={getTeam(coverageTeam)} defender={getOpponent(coverageTeam)} />
          </div>

          <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">Learned Moves</h3>
                <div className="bg-gray-800 p-1 rounded flex">
                   <button onClick={() => setUtilityTeam('A')} className={`px-3 py-1 rounded text-xs font-bold ${utilityTeam === 'A' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tA.name}</button>
                   <button onClick={() => setUtilityTeam('B')} className={`px-3 py-1 rounded text-xs font-bold ${utilityTeam === 'B' ? 'bg-red-600 text-white' : 'text-gray-400'}`}>{tB.name}</button>
                </div>
             </div>
             <UtilityAnalysis team={getTeam(utilityTeam)} />
          </div>

          <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-bold">Tera Analysis</h3>
                <div className="bg-gray-800 p-1 rounded flex">
                   <button onClick={() => setTeraTeam('A')} className={`px-3 py-1 rounded text-xs font-bold ${teraTeam === 'A' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>{tA.name}</button>
                   <button onClick={() => setTeraTeam('B')} className={`px-3 py-1 rounded text-xs font-bold ${teraTeam === 'B' ? 'bg-red-600 text-white' : 'text-gray-400'}`}>{tB.name}</button>
                </div>
             </div>
             <TeraAnalysis team={getTeam(teraTeam)} />
          </div>

          <div>
             <h3 className="text-2xl font-bold mb-4 text-center">Speed Tiers</h3>
             <SpeedChart teamA={tA} teamB={tB} />
          </div>
       </div>
    );
  };
  
  const renderMyTeam = () => {
    const myTeam = league.teams.find(t => t.ownerId === user.uid);
    if(!myTeam) return <div className="p-8 text-center text-gray-500">You do not own a team in this league.</div>;
    const draftedIds = new Set<number>();
    league.teams.forEach(t => t.roster.forEach(p => draftedIds.add(p.id)));
    const freeAgents = (league.pokemonPool || []).filter(p => !draftedIds.has(p.id)).filter(p => faFilterPoint === 'All' || p.points === parseInt(faFilterPoint)).filter(p => p.name.toLowerCase().includes(faSearch.toLowerCase())).sort((a,b) => b.points - a.points);
    return (
       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
             <div className="bg-gray-800 p-4 rounded border-t-4 border-blue-500 shadow-lg">
                <div className="flex justify-between items-start mb-4"><div className="flex-1">{editingTeam ? (<div className="space-y-2 mr-4"><input className="bg-gray-700 p-2 rounded w-full border border-gray-600" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Team Name"/><input className="bg-gray-700 p-2 rounded w-full border border-gray-600" value={editLogo} onChange={e => setEditLogo(e.target.value)} placeholder="Logo URL"/><div className="flex gap-2 text-xs mt-2"><button onClick={handleUpdateTeam} className="bg-green-600 px-3 py-1 rounded font-bold hover:bg-green-500">Save Changes</button><button onClick={() => setEditingTeam(false)} className="bg-gray-600 px-3 py-1 rounded font-bold hover:bg-gray-500">Cancel</button></div></div>) : (<div className="flex items-center gap-4"><img src={myTeam.logoUrl} className="w-16 h-16 rounded-full bg-black border-2 border-gray-600 object-cover" /><div><h3 className="text-2xl font-bold mb-1">{myTeam.name}</h3><div className="text-sm text-gray-400">Coach: {myTeam.coachName}</div></div></div>)}</div>{!editingTeam && <button onClick={() => { setEditingTeam(true); setEditName(myTeam.name); setEditLogo(myTeam.logoUrl); }} className="text-gray-400 hover:text-white p-2 bg-gray-700 rounded-full"><PencilIcon /></button>}</div>
                <div className="text-sm mb-4 bg-gray-900 p-3 rounded flex justify-between font-mono"><span>Budget: {myTeam.budgetUsed}/{league.draftConfig.totalBudget}</span><span>Roster: {myTeam.roster.length}/{league.draftConfig.maxPokemon}</span></div>
                <div className="space-y-2">{myTeam.roster.map(p => (<div key={p.id} className="bg-gray-700/50 p-3 rounded flex flex-col gap-2 border border-gray-700 hover:border-gray-500 transition"><div className="flex justify-between items-center"><div className="flex items-center gap-3"><PokemonImage src={p.sprite} alt={p.name} className="w-12 h-12" /><div><div className="font-bold text-base">{p.name}</div><div className="flex gap-1 mt-1">{p.types.map(t => <TypeBadge key={t} type={t} size="sm" />)}</div></div></div><div className="flex items-center gap-3"><span className="font-bold text-yellow-500 text-lg">{p.points}</span>{league.currentWeek <= 3 && <button onClick={() => handleTransaction('drop', p)} className="bg-red-900/50 hover:bg-red-800 text-red-200 text-xs px-3 py-1 rounded border border-red-800 font-bold uppercase">Drop</button>}</div></div><div className="flex gap-2 items-center text-xs"><span className="text-gray-400">Tera Type:</span><select value={p.teraType || ''} onChange={(e) => handleUpdateTera(p.id, e.target.value)} className="bg-gray-800 text-white rounded p-1 border border-gray-600"><option value="">None</option>{TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div><div className="grid grid-cols-6 gap-1 text-[10px] text-center bg-gray-900/50 p-2 rounded">{getStatValues(p).map((v, i) => (<div key={i}><div className="text-gray-500 font-bold">{STAT_LABELS[i]}</div><div className="font-mono text-gray-300">{v}</div></div>))}</div><div className="text-xs text-gray-400 italic px-1">Abilities: {p.abilities?.join(', ')}</div></div>))}</div>
             </div>
          </div>
          <div className="space-y-4">
             <h3 className="text-xl font-bold">Free Agency (Week {league.currentWeek}/3)</h3>
             <div className="flex gap-2 mb-2"><input placeholder="Search..." value={faSearch} onChange={e => setFaSearch(e.target.value)} className="flex-1 bg-gray-700 rounded p-2 text-sm border border-gray-600" /><select value={faFilterPoint} onChange={e => setFaFilterPoint(e.target.value)} className="bg-gray-700 rounded p-2 text-sm border border-gray-600"><option value="All">All Points</option>{Array.from({length:20}, (_,i)=>20-i).map(p => <option key={p} value={p}>{p} pts</option>)}</select></div>
             {league.currentWeek > 3 && <p className="text-red-400">Transactions are now locked for the season.</p>}
             <div className="bg-gray-800 p-4 rounded h-[800px] overflow-y-auto border border-gray-700">{freeAgents.slice(0, faLimit).map(p => (<div key={p.id} className="flex flex-col p-3 border-b border-gray-700 hover:bg-gray-700/50 transition gap-2"><div className="flex justify-between items-center"><div className="flex items-center gap-3"><PokemonImage src={p.sprite} alt={p.name} className="w-10 h-10" /><div><div className="font-bold text-sm">{p.name}</div><div className="flex gap-1 mt-1">{p.types.map(t => <TypeBadge key={t} type={t} size="sm" />)}</div></div></div><div className="flex items-center gap-3"><span className="font-bold text-yellow-500 text-lg">{p.points}</span>{league.currentWeek <= 3 && <button onClick={() => handleTransaction('add', p)} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1 rounded font-bold uppercase shadow">Add</button>}</div></div><div className="grid grid-cols-6 gap-1 text-[10px] text-center bg-black/20 p-1 rounded">{getStatValues(p).map((v, i) => (<div key={i}><span className="text-gray-500">{STAT_LABELS[i]}:</span> {v}</div>))}</div><div className="text-xs text-gray-400 italic px-1">Abilities: {p.abilities?.join(', ')}</div></div>))}{freeAgents.length > faLimit && (<button onClick={() => setFaLimit(l => l + 20)} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-center rounded mt-2">Load More</button>)}</div>
          </div>
       </div>
    );
  };
  const renderStandings = () => { const sorted = [...league.teams].sort((a,b) => { if (a.wins !== b.wins) return b.wins - a.wins; if (a.differential !== b.differential) return b.differential - a.differential; return 0; }); return (<div className="bg-gray-800 rounded border border-gray-700 overflow-hidden"><table className="w-full text-left"><thead className="bg-gray-900 text-gray-400 text-xs uppercase"><tr><th className="p-3">Rank</th><th className="p-3">Team</th><th className="p-3 text-center">W</th><th className="p-3 text-center">L</th><th className="p-3 text-center">Diff</th><th className="p-3 text-center">Coach</th></tr></thead><tbody>{sorted.map((t, i) => (<tr key={t.id} className="border-b border-gray-700 hover:bg-white/5"><td className="p-3 font-mono text-gray-500">{i+1}</td><td className="p-3 flex items-center gap-3"><img src={t.logoUrl} className="w-8 h-8 rounded-full bg-black border border-gray-600 object-cover"/><span className="font-bold">{t.name}</span></td><td className="p-3 text-center font-bold text-green-400">{t.wins}</td><td className="p-3 text-center font-bold text-red-400">{t.losses}</td><td className="p-3 text-center font-mono">{t.differential > 0 ? '+' : ''}{t.differential}</td><td className="p-3 text-center text-sm text-gray-400">{t.coachName}</td></tr>))}</tbody></table></div>); };
  const renderMVP = () => { const killMap: Record<number, number> = {}; const deathMap: Record<number, number> = {}; league.schedule.forEach(m => { if(m.teamADetails) { Object.entries(m.teamADetails.kills).forEach(([id, k]) => killMap[Number(id)] = (killMap[Number(id)] || 0) + (k as number)); Object.entries(m.teamADetails.deaths).forEach(([id, d]) => deathMap[Number(id)] = (deathMap[Number(id)] || 0) + (d as number)); } if(m.teamBDetails) { Object.entries(m.teamBDetails.kills).forEach(([id, k]) => killMap[Number(id)] = (killMap[Number(id)] || 0) + (k as number)); Object.entries(m.teamBDetails.deaths).forEach(([id, d]) => deathMap[Number(id)] = (deathMap[Number(id)] || 0) + (d as number)); } }); const allMons: any[] = []; league.teams.forEach(t => t.roster.forEach(p => { if (killMap[p.id] || deathMap[p.id]) { allMons.push({ ...p, kills: killMap[p.id] || 0, deaths: deathMap[p.id] || 0, team: t }); } })); allMons.sort((a,b) => b.kills - a.kills); return (<div className="bg-gray-800 rounded border border-gray-700 overflow-hidden"><table className="w-full text-left"><thead className="bg-gray-900 text-gray-400 text-xs uppercase"><tr><th className="p-3">Rank</th><th className="p-3">Pokemon</th><th className="p-3">Team</th><th className="p-3 text-center">Kills</th><th className="p-3 text-center">Deaths</th><th className="p-3 text-center">K/D</th></tr></thead><tbody>{allMons.map((p, i) => (<tr key={p.id} className="border-b border-gray-700 hover:bg-white/5"><td className="p-3 font-mono text-gray-500">{i+1}</td><td className="p-3 flex items-center gap-2"><PokemonImage src={p.sprite} alt={p.name} className="w-8 h-8" /><span className="font-bold">{p.name}</span></td><td className="p-3 text-sm text-gray-400">{p.team.name}</td><td className="p-3 text-center font-bold text-green-400">{p.kills}</td><td className="p-3 text-center font-bold text-red-400">{p.deaths}</td><td className="p-3 text-center font-mono">{(p.kills / (p.deaths || 1)).toFixed(2)}</td></tr>))}</tbody></table></div>) };
  const renderTransactions = () => (<div className="bg-gray-800 p-4 rounded border border-gray-700"><h3 className="text-xl font-bold mb-4">Transaction History</h3><div className="space-y-2">{league.transactions.map(t => (<div key={t.id} className="flex items-center gap-3 text-sm p-3 bg-gray-700/30 rounded"><span className="text-gray-400 w-24">{new Date(t.date).toLocaleDateString()}</span><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${t.type === 'ADD' ? 'bg-green-900 text-green-200' : t.type === 'DROP' ? 'bg-red-900 text-red-200' : 'bg-blue-900 text-blue-200'}`}>{t.type}</span><div className="flex-1">{t.type === 'MATCH_REPORT' ? (<span className="text-gray-300 font-bold">{t.pokemonName}</span>) : (<><span className="font-bold text-gray-300">{t.teamName}</span> {t.type === 'ADD' ? 'added' : 'dropped'} <span className="font-bold text-yellow-500">{t.pokemonName}</span></>)}</div></div>))}</div></div>);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 pb-24 space-y-6">
       <div className="hidden md:flex bg-gray-800 rounded p-1 gap-1 overflow-x-auto">{[{ id: 'home', label: 'Home' }, { id: 'standings', label: 'Standings' }, { id: 'schedule', label: 'Schedule' }, { id: 'playoffs', label: 'Playoffs' }, { id: 'mvp', label: 'MVP' }, { id: 'transactions', label: 'Transactions' }, { id: 'myteam', label: 'My Team' }, { id: 'analysis', label: 'Analysis' }].map(t => (<button key={t.id} onClick={() => onTabChange(t.id)} className={`px-4 py-2 rounded font-bold text-sm whitespace-nowrap transition ${activeTab === t.id ? 'bg-yellow-500 text-black shadow' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>{t.label}</button>))}</div>
       {activeTab === 'home' && <LeagueHome league={league} />}
       {activeTab === 'standings' && renderStandings()}
       {activeTab === 'schedule' && renderSchedule()}
       {activeTab === 'playoffs' && renderPlayoffs()}
       {activeTab === 'mvp' && renderMVP()}
       {activeTab === 'transactions' && renderTransactions()}
       {activeTab === 'myteam' && renderMyTeam()}
       {activeTab === 'analysis' && renderAnalysis()}
       {reportingMatch && (<MatchReportModal match={reportingMatch} league={league} onClose={() => setReportingMatch(null)} onSubmit={async (result) => { const newSchedule = league.schedule.map(m => m.id === reportingMatch.id ? { ...m, ...result, completed: true } : m); const winner = league.teams.find(t => t.id === result.winnerId); const loserId = result.winnerId === reportingMatch.teamAId ? reportingMatch.teamBId : reportingMatch.teamAId; const loser = league.teams.find(t => t.id === loserId); const newTeams = league.teams.map(t => { if (t.id === winner?.id) return { ...t, wins: t.wins + 1, differential: t.differential + (Math.abs(result.scoreA - result.scoreB)) }; if (t.id === loser?.id) return { ...t, losses: t.losses + 1, differential: t.differential - (Math.abs(result.scoreA - result.scoreB)) }; return t; }); const trans: Transaction = { id: `match-${Date.now()}`, date: Date.now(), teamId: 'SYSTEM', teamName: 'System', type: 'MATCH_REPORT', pokemonName: `Week ${reportingMatch.week}: ${winner?.name} def. ${loser?.name} (${result.scoreA}-${result.scoreB})`, points: 0 }; await updateDoc(doc(db, 'leagues', league.id!), { schedule: newSchedule, teams: newTeams, transactions: [trans, ...(league.transactions || [])] }); setReportingMatch(null); }} />)}
       
       {confirmationData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-gray-800 p-6 rounded-lg border border-yellow-500 shadow-2xl max-w-md w-full relative">
                <h3 className="text-xl font-bold text-white mb-2">Confirm Action</h3>
                <p className="text-gray-300 mb-6">{confirmationData.message}</p>
                <div className="flex gap-4">
                    <button 
                        onClick={() => setConfirmationData(null)}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={() => {
                            confirmationData.onConfirm();
                            setConfirmationData(null);
                        }}
                        className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-2 px-4 rounded transition shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [league, setLeague] = useState<LeagueState | null>(null);
  const [availableLeagues, setAvailableLeagues] = useState<LeagueState[]>([]);
  const [activeTab, setActiveTab] = useState('home');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    fetchPokedex().then(data => {
      (window as any).FULL_POKEDEX = data;
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'leagues'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeagueState));
      setAvailableLeagues(list.filter(l => l.commissionerId === user.uid || l.teams.some(t => t.ownerId === user.uid)));
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeLeagueId) return;
    const unsub = onSnapshot(doc(db, 'leagues', activeLeagueId), (d) => {
      if (d.exists()) setLeague({ id: d.id, ...d.data() } as LeagueState);
    });
    return () => unsub();
  }, [activeLeagueId]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isSignUp) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 p-8 rounded border border-gray-700 w-full max-w-md">
          <h1 className="text-3xl font-bold text-yellow-400 text-center mb-6">PokeDraft Hub</h1>
          <form onSubmit={handleAuth} className="space-y-4">
            <input type="email" placeholder="Email" className="w-full bg-gray-700 p-3 rounded text-white" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Password" className="w-full bg-gray-700 p-3 rounded text-white" value={password} onChange={e => setPassword(e.target.value)} />
            <button type="submit" className="w-full bg-yellow-500 text-black font-bold p-3 rounded">{isSignUp ? 'Sign Up' : 'Login'}</button>
          </form>
          <button onClick={() => setIsSignUp(!isSignUp)} className="w-full text-center mt-4 text-gray-400 text-sm">{isSignUp ? 'Have account? Login' : 'Need account? Sign Up'}</button>
        </div>
      </div>
    );
  }

  if (!activeLeagueId || !league) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar user={user} onLogout={() => signOut(auth)} activeTab="" onTabChange={() => {}} />
        <DashboardView user={user} availableLeagues={availableLeagues} onSelectLeague={(id) => setActiveLeagueId(id)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-24">
      <Navbar user={user} onLogout={() => { signOut(auth); setActiveLeagueId(null); }} leagueName={league.name} onBack={() => { setActiveLeagueId(null); setLeague(null); setActiveTab('home'); }} activeTab={activeTab} onTabChange={setActiveTab} />
      {league.phase === 'setup' && <LeagueLobby league={league} user={user} />}
      {league.phase === 'draft' && <DraftView league={league} user={user} />}
      {['season', 'playoffs', 'completed'].includes(league.phase) && <SeasonView league={league} user={user} activeTab={activeTab} onTabChange={setActiveTab} />}
    </div>
  );
};