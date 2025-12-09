
import { Pokemon } from './types';

// Simplified Type Effectiveness Chart (1 = normal, 2 = super, 0.5 = resist, 0 = immune)
export const TYPE_CHART: Record<string, Record<string, number>> = {
  Fire: { Grass: 2, Ice: 2, Bug: 2, Steel: 2, Fire: 0.5, Water: 0.5, Rock: 0.5, Dragon: 0.5 },
  Water: { Fire: 2, Ground: 2, Rock: 2, Water: 0.5, Grass: 0.5, Dragon: 0.5 },
  Grass: { Water: 2, Ground: 2, Rock: 2, Fire: 0.5, Grass: 0.5, Poison: 0.5, Flying: 0.5, Bug: 0.5, Dragon: 0.5, Steel: 0.5 },
  Electric: { Water: 2, Flying: 2, Electric: 0.5, Grass: 0.5, Dragon: 0.5, Ground: 0 },
  Ice: { Grass: 2, Ground: 2, Flying: 2, Dragon: 2, Fire: 0.5, Water: 0.5, Ice: 0.5, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Rock: 2, Dark: 2, Steel: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Fairy: 0.5, Ghost: 0 },
  Poison: { Grass: 2, Fairy: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0 },
  Ground: { Fire: 2, Electric: 2, Poison: 2, Rock: 2, Steel: 2, Grass: 0.5, Bug: 0.5, Flying: 0 },
  Flying: { Grass: 2, Fighting: 2, Bug: 2, Electric: 0.5, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Steel: 0.5, Dark: 0 },
  Bug: { Grass: 2, Psychic: 2, Dark: 2, Fire: 0.5, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Ghost: 0.5, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Flying: 2, Bug: 2, Fighting: 0.5, Ground: 0.5, Steel: 0.5 },
  Ghost: { Psychic: 2, Ghost: 2, Dark: 0.5, Normal: 0 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Steel: { Ice: 2, Rock: 2, Fairy: 2, Fire: 0.5, Water: 0.5, Electric: 0.5, Steel: 0.5 },
  Dark: { Psychic: 2, Ghost: 2, Fighting: 0.5, Dark: 0.5, Fairy: 0.5 },
  Fairy: { Fighting: 2, Dragon: 2, Dark: 2, Fire: 0.5, Poison: 0.5, Steel: 0.5, Normal: 1 }, // Added Normal neutral to handle edge cases
  Normal: { Rock: 0.5, Steel: 0.5, Ghost: 0 }
};

// Abilities that provide Type Immunities
export const ABILITY_IMMUNITIES: Record<string, string[]> = {
  'Levitate': ['Ground'],
  'Earth Eater': ['Ground'],
  'Flash Fire': ['Fire'],
  'Well-Baked Body': ['Fire'],
  'Water Absorb': ['Water'],
  'Storm Drain': ['Water'],
  'Dry Skin': ['Water'],
  'Volt Absorb': ['Electric'],
  'Lightning Rod': ['Electric'],
  'Motor Drive': ['Electric'],
  'Sap Sipper': ['Grass'],
  'Purifying Salt': ['Ghost'], // Actually resist, but treating high for mitigation
  'Good as Gold': ['Status'], // Special case
};

export const getEffectiveness = (moveType: string, defenderTypes: string[], abilities: string[] = [], useAbilities: boolean = false): number => {
  let multiplier = 1;
  const attackersMap = TYPE_CHART[moveType] || {};
  
  // Check Type Chart
  defenderTypes.forEach(type => {
    if (attackersMap[type] !== undefined) multiplier *= attackersMap[type];
  });

  // Check Abilities
  if (useAbilities) {
    abilities.forEach(ab => {
      const immuneTypes = ABILITY_IMMUNITIES[ab];
      if (immuneTypes && immuneTypes.includes(moveType)) {
        multiplier = 0;
      }
    });
  }

  return multiplier;
};

export interface MoveData {
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  bp: number;
  priority?: number;
  tags?: string[];
  name?: string;
  desc?: string;
}

// Dynamically populated from fetch
export const MOVES_DATA: Record<string, MoveData> = {};

export const MOVE_CATEGORIES: Record<string, string[]> = {
  'Setup': ['Swords Dance', 'Dragon Dance', 'Calm Mind', 'Nasty Plot', 'Quiver Dance', 'Bulk Up', 'Coil', 'Shift Gear', 'Iron Defense', 'Agility', 'Rock Polish', 'Shell Smash', 'Belly Drum'],
  'Cleric': ['Heal Bell', 'Aromatherapy', 'Wish', 'Healing Wish', 'Lunar Dance', 'Revival Blessing', 'Jungle Healing'],
  'Momentum': ['U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Baton Pass', 'Shed Tail', 'Chilly Reception'],
  'Hazard Control': ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web', 'Rapid Spin', 'Defog', 'Mortal Spin', 'Tidy Up', 'Court Change', 'Ceaseless Edge', 'Stone Axe'],
  'Speed Control': ['Tailwind', 'Trick Room', 'Thunder Wave', 'Icy Wind', 'String Shot', 'Scary Face', 'Electroweb', 'Glaciate', 'Bulldoze'],
  'Support': ['Reflect', 'Light Screen', 'Aurora Veil', 'Helping Hand', 'Follow Me', 'Rage Powder', 'Wide Guard', 'Quick Guard', 'Safeguard'],
  'Status': ['Will-O-Wisp', 'Toxic', 'Thunder Wave', 'Glare', 'Spore', 'Sleep Powder', 'Hypnosis', 'Yawn', 'Lovely Kiss', 'Dark Void', 'Stun Spore', 'Poison Powder'],
  'Disruption': ['Taunt', 'Encore', 'Torment', 'Disable', 'Roar', 'Whirlwind', 'Haze', 'Clear Smog', 'Dragon Tail', 'Circle Throw', 'Knock Off'],
  'Field Manipulation': ['Grassy Terrain', 'Electric Terrain', 'Misty Terrain', 'Psychic Terrain', 'Sunny Day', 'Rain Dance', 'Sandstorm', 'Snowscape', 'Gravity', 'Wonder Room', 'Magic Room'],
  'Trapping': ['Magma Storm', 'Sand Tomb', 'Whirlpool', 'Fire Spin', 'Infestation', 'Block', 'Mean Look', 'Shadow Tag', 'Arena Trap', 'Magnet Pull', 'Thunder Cage'],
  'Type Changing': ['Soak', 'Magic Powder', 'Trick-or-Treat', 'Forest\'s Curse'],
  'Z-Setup': ['Z-Celebrate', 'Z-Happy Hour', 'Z-Hold Hands', 'Z-Splash', 'Z-Conversion'] // Logic handled in helper usually
};

export const getMoveCategory = (moveName: string): string | null => {
  for (const [cat, moves] of Object.entries(MOVE_CATEGORIES)) {
    if (moves.includes(moveName)) return cat;
    // Basic Z-move check
    if (cat === 'Z-Setup' && (moveName.includes('Z-') || moveName === 'Celebrate' || moveName === 'Happy Hour')) return cat;
  }
  return null;
};

// --- DATA FETCHING ---

const SHOWDOWN_POKEDEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';
const SHOWDOWN_MOVES_URL = 'https://play.pokemonshowdown.com/data/moves.json';
const SHOWDOWN_LEARNSETS_URL = 'https://play.pokemonshowdown.com/data/learnsets.json';

// --- POINT OVERRIDES ---
const POINT_OVERRIDES: Record<string, number> = {
  // 20 Points
  "Annihilape": 20, "Archaludon": 20, "Dragonite": 20, "Gholdengo": 20, "Ursaluna": 20, "Ursaluna-Bloodmoon": 20,
  // 19 Points
  "Amoonguss": 19, "Dragapult": 19, "Garchomp": 19, "Incineroar": 19, "Kingambit": 19, "Porygon2": 19, "Rillaboom": 19, "Whimsicott": 19,
  // 18 Points
  "Indeedee-F": 18, "Indeedee-Female": 18, "Maushold": 18, "Sinistcha": 18, "Sneasler": 18, "Torkoal": 18,
  // 17 Points
  "Ninetales-Alola": 17, "Alolan Ninetales": 17, "Basculegion": 17, "Baxcalibur": 17, "Dondozo": 17, "Gothitelle": 17, 
  "Grimmsnarl": 17, "Arcanine-Hisui": 17, "Hisuian Arcanine": 17, "Indeedee": 17, "Indeedee-Male": 17, "Pelipper": 17, "Smeargle": 17, "Volcarona": 17,
  // 16 Points
  "Arcanine": 16, "Electabuzz": 16, "Farigiraf": 16, "Hatterene": 16, "Magmar": 16, "Politoed": 16, "Primarina": 16, "Salamence": 16, "Talonflame": 16, "Tatsugiri": 16,
  // 15 Points
  "Clefairy": 15, "Glimmora": 15, "Goodra-Hisui": 15, "Hisuian Goodra": 15, "Typhlosion-Hisui": 15, "Hisuian Typhlosion": 15, "Hydreigon": 15, "Kommo-o": 15, "Palafin": 15, "Tyranitar": 15,
  // 14 Points
  "Armarouge": 14, "Azumarill": 14, "Bronzong": 14, "Charizard": 14, "Clefable": 14, "Excadrill": 14, "Gyarados": 14, 
  "Lilligant-Hisui": 14, "Hisuian Lilligant": 14, "Illumise": 14, "Mamoswine": 14, "Meowscarada": 14, "Metagross": 14, 
  "Oranguru": 14, "Tauros-Paldea-Aqua": 14, "Paldean Tauros Aqua": 14, "Sableye": 14, "Sylveon": 14,
  // 13 Points
  "Araquanid": 13, "Ceruledge": 13, "Conkeldurr": 13, "Dusclops": 13, "Gardevoir": 13, "Hariyama": 13, "Kleavor": 13, 
  "Klefki": 13, "Mienshao": 13, "Murkrow": 13, "Tauros-Paldea-Blaze": 13, "Paldean Tauros Blaze": 13, "Rotom-Wash": 13, 
  "Scrafty": 13, "Skeledirge": 13, "Volbeat": 13,
  // 12 Points
  "Chandelure": 12, "Cinderace": 12, "Comfey": 12, "Corviknight": 12, "Delphox": 12, "Gallade": 12, "Garganacl": 12, 
  "Gengar": 12, "Gothorita": 12, "Greninja": 12, "Infernape": 12, "Magmortar": 12, "Ninetales": 12, "Overqwil": 12, 
  "Porygon-Z": 12, "Rhyperior": 12, "Scizor": 12, "Tinkaton": 12, "Typhlosion": 12, "Vivillon": 12,
  // 11 Points
  "Drifblim": 11, "Electivire": 11, "Flamigo": 11, "Weezing-Galar": 11, "Galarian Weezing": 11, "Gastrodon": 11, 
  "Zoroark-Hisui": 11, "Hisuian Zoroark": 11, "Kilowattrel": 11, "Krookodile": 11, "Ludicolo": 11, "Meowstic": 11, "Meowstic-Male": 11, 
  "Milotic": 11, "Mimikyu": 11, "Noivern": 11, "Pawmot": 11, "Reuniclus": 11, "Ribombee": 11, "Rotom-Heat": 11, 
  "Salazzle": 11, "Staraptor": 11, "Weavile": 11,
  // 10 Points
  "Blastoise": 10, "Breloom": 10, "Empoleon": 10, "Goodra": 10, "Hitmontop": 10, "Jumpluff": 10, "Kingdra": 10, 
  "Quaquaval": 10, "Rotom-Mow": 10, "Serperior": 10, "Shiftry": 10, "Slowbro": 10, "Slowking": 10, "Tsareena": 10, "Weezing": 10,
  // 9 Points
  "Abomasnow": 9, "Persian-Alola": 9, "Alolan Persian": 9, "Bisharp": 9, "Blaziken": 9, "Brambleghast": 9, "Dragalge": 9, 
  "Espathra": 9, "Florges": 9, "Slowbro-Galar": 9, "Galarian Slowbro": 9, "Slowking-Galar": 9, "Galarian Slowking": 9, 
  "Haxorus": 9, "Samurott-Hisui": 9, "Hisuian Samurott": 9, "Hydrapple": 9, "Snorlax": 9, "Swampert": 9, "Toedscruel": 9, "Venusaur": 9,
  // 8 Points
  "Cetitan": 8, "Dusknoir": 8, "Hawlucha": 8, "Hippowdon": 8, "Braviary-Hisui": 8, "Hisuian Braviary": 8, 
  "Decidueye-Hisui": 8, "Hisuian Decidueye": 8, "Inteleon": 8, "Lilligant": 8, "Lucario": 8, "Magnezone": 8, 
  "Mandibuzz": 8, "Medicham": 8, "Mudsdale": 8, "Raichu": 8, "Torracat": 8, "Torterra": 8, "Vaporeon": 8,
  // 7 Points
  "Muk-Alola": 7, "Alolan Muk": 7, "Arboliva": 7, "Barraskewda": 7, "Braviary": 7, "Bruxish": 7, "Chesnaught": 7, 
  "Copperajah": 7, "Eelektross": 7, "Exeggutor": 7, "Floatzel": 7, "Grafaiai": 7, "Houndstone": 7, "Jolteon": 7, 
  "Lycanroc-Dusk": 7, "Pachirisu": 7, "Tauros-Paldea-Combat": 7, "Paldean Tauros": 7, "Scovillain": 7, "Spiritomb": 7, 
  "Thwackey": 7, "Toxtricity": 7, "Umbreon": 7, "Venomoth": 7, "Zoroark": 7,
  // 6 Points
  "Exeggutor-Alola": 6, "Alolan Exeggutor": 6, "Ambipom": 6, "Basculin": 6, "Beartic": 6, "Crawdaunt": 6, "Duraludon": 6, 
  "Espeon": 6, "Feraligatr": 6, "Foongus": 6, "Glaceon": 6, "Heracross": 6, "Electrode-Hisui": 6, "Hisuian Electrode": 6, 
  "Qwilfish-Hisui": 6, "Hisuian Qwilfish": 6, "Sneasel-Hisui": 6, "Hisuian Sneasel": 6, "Hitmonlee": 6, "Lycanroc": 6, "Lycanroc-Midday": 6, 
  "Mismagius": 6, "Morgrem": 6, "Rampardos": 6, "Rhydon": 6, "Rotom-Fan": 6, "Rotom-Frost": 6, "Slaking": 6, "Sneasel": 6, 
  "Toxicroak": 6, "Ursaring": 6, "Victreebel": 6, "Vikavolt": 6, "Wyrdeer": 6, "Yanmega": 6,
  // 5 Points
  "Alcremie": 5, "Raichu-Alola": 5, "Alolan Raichu": 5, "Appletun": 5, "Bellibolt": 5, "Cloyster": 5, "Decidueye": 5, 
  "Donphan": 5, "Drednaw": 5, "Emboar": 5, "Froslass": 5, "Frosmoth": 5, "Galvantula": 5, "Hitmonchan": 5, "Luxray": 5, 
  "Mabosstiff": 5, "Magneton": 5, "Orthworm": 5, "Passimian": 5, "Persian": 5, "Pincurchin": 5, "Polteageist": 5, 
  "Primeape": 5, "Qwilfish": 5, "Rabsca": 5, "Revavroom": 5, "Tauros": 5, "Vileplume": 5,
  // 4 Points
  "Sandslash-Alola": 4, "Alolan Sandslash": 4, "Bellossom": 4, "Blissey": 4, "Bombirdier": 4, "Cinccino": 4, "Clawitzer": 4, 
  "Coalossal": 4, "Cottonee": 4, "Dachsbun": 4, "Dudunsparce": 4, "Dugtrio": 4, "Flygon": 4, "Furret": 4, "Gliscor": 4, 
  "Golurk": 4, "Granbull": 4, "Lanturn": 4, "Lokix": 4, "Malamar": 4, "Naclstack": 4, "Oricorio": 4, "Palossand": 4, 
  "Perrserker": 4, "Pyroar": 4, "Riolu": 4, "Rotom": 4, "Sandaconda": 4, "Sceptile": 4, "Squawkabilly": 4, "Stonjourner": 4,
  // 3 Points
  "Golem-Alola": 3, "Alolan Golem": 3, "Altaria": 3, "Ampharos": 3, "Arbok": 3, "Avalugg": 3, "Camerupt": 3, "Chansey": 3, 
  "Clodsire": 3, "Crabominable": 3, "Cryogonal": 3, "Cyclizar": 3, "Dewgong": 3, "Dipplin": 3, "Ditto": 3, "Dodrio": 3, 
  "Electrode": 3, "Flapple": 3, "Fletchinder": 3, "Forretress": 3, "Golduck": 3, "Greedent": 3, "Haunter": 3, 
  "Avalugg-Hisui": 3, "Hisuian Avalugg": 3, "Honchkrow": 3, "Houndoom": 3, "Hypno": 3, "Klawf": 3, "Leafeon": 3, 
  "Lurantis": 3, "Masquerain": 3, "Minior": 3, "Misdreavus": 3, "Muk": 3, "Piloswine": 3, "Poliwrath": 3, "Poltchageist": 3, 
  "Probopass": 3, "Quagsire": 3, "Samurott": 3, "Sawsbuck": 3, "Scyther": 3, "Skarmory": 3, "Skuntank": 3, "Tentacruel": 3, 
  "Trevenant": 3, "Veluza": 3,
  // 2 Points
  "Dugtrio-Alola": 2, "Alolan Dugtrio": 2, "Alomomola": 2, "Ariados": 2, "Bastiodon": 2, "Carbink": 2, "Cramorant": 2, 
  "Dunsparce": 2, "Eiscue": 2, "Falinks": 2, "Flareon": 2, "Fletchling": 2, "Girafarig": 2, "Glalie": 2, "Gligar": 2, 
  "Glimmet": 2, "Gogoat": 2, "Golem": 2, "Grumpig": 2, "Gumshoos": 2, "Gurdurr": 2, "Komala": 2, "Lapras": 2, "Leavanny": 2, 
  "Lumineon": 2, "Meganium": 2, "Meowstic-F": 2, "Meowstic-Female": 2, "Morpeko": 2, "Oinkologne": 2, "Pikachu": 2, 
  "Porygon": 2, "Sandslash": 2, "Shroodle": 2, "Stantler": 2, "Sudowoodo": 2, "Toucannon": 2, "Toxapex": 2, "Tropius": 2, 
  "Venonat": 2, "Wartortle": 2, "Wigglytuff": 2, "Wugtrio": 2, "Zangoose": 2, "Zebstrika": 2,
  // 1 Point
  "Aipom": 1, "Diglett-Alola": 1, "Alolan Diglett": 1, "Geodude-Alola": 1, "Alolan Geodude": 1, "Graveler-Alola": 1, 
  "Alolan Graveler": 1, "Grimer-Alola": 1, "Alolan Grimer": 1, "Meowth-Alola": 1, "Alolan Meowth": 1, "Sandshrew-Alola": 1, 
  "Alolan Sandshrew": 1, "Vulpix-Alola": 1, "Alolan Vulpix": 1, "Applin": 1, "Arctibax": 1, "Arrokuda": 1, "Axew": 1, 
  "Azurill": 1, "Bagon": 1, "Banette": 1, "Barboach": 1, "Bayleef": 1, "Beldum": 1, "Bellsprout": 1, "Bergmite": 1, 
  "Blitzle": 1, "Bounsweet": 1, "Braixen": 1, "Bramblin": 1, "Brionne": 1, "Bronzor": 1, "Buizel": 1, "Bulbasaur": 1, 
  "Cacnea": 1, "Cacturne": 1, "Capsakid": 1, "Carkol": 1, "Cetoddle": 1, "Charcadet": 1, "Charjabug": 1, "Charmander": 1, 
  "Charmeleon": 1, "Chespin": 1, "Chewtle": 1, "Chikorita": 1, "Chimchar": 1, "Chimecho": 1, "Chinchou": 1, "Clauncher": 1, 
  "Combusken": 1, "Corphish": 1, "Corvisquire": 1, "Crabrawler": 1, "Cranidos": 1, "Croagunk": 1, "Crocalor": 1, 
  "Croconaw": 1, "Cubchoo": 1, "Cufant": 1, "Cutiefly": 1, "Cyndaquil": 1, "Dartrix": 1, "Dedenne": 1, "Deerling": 1, 
  "Deino": 1, "Delibird": 1, "Dewott": 1, "Dewpider": 1, "Diglett": 1, "Doduo": 1, "Dolliv": 1, "Dragonair": 1, 
  "Drakloak": 1, "Dratini": 1, "Dreepy": 1, "Drifloon": 1, "Drilbur": 1, "Drizzile": 1, "Drowzee": 1, "Ducklett": 1, 
  "Duosion": 1, "Duskull": 1, "Eelektrik": 1, "Eevee": 1, "Ekans": 1, "Elekid": 1, "Espurr": 1, "Exeggcute": 1, 
  "Feebas": 1, "Fennekin": 1, "Fidough": 1, "Finizen": 1, "Finneon": 1, "Flaaffy": 1, "Flittle": 1, "Floette": 1, 
  "Floragato": 1, "Fomantis": 1, "Fraxure": 1, "Frigibax": 1, "Froakie": 1, "Frogadier": 1, "Fuecoco": 1, "Gabite": 1, 
  "Meowth-Galar": 1, "Galarian Meowth": 1, "Slowpoke-Galar": 1, "Galarian Slowpoke": 1, "Gastly": 1, "Geodude": 1, 
  "Gible": 1, "Gimmighoul": 1, "Gloom": 1, "Golett": 1, "Goomy": 1, "Gothita": 1, "Graveler": 1, "Greavard": 1, "Grimer": 1, 
  "Grookey": 1, "Grotle": 1, "Grovyle": 1, "Growlithe": 1, "Grubbin": 1, "Gulpin": 1, "Hakamo-o": 1, "Hatenna": 1, 
  "Hattrem": 1, "Hippopotas": 1, "Growlithe-Hisui": 1, "Hisuian Growlithe": 1, "Sliggoo-Hisui": 1, "Hisuian Sliggoo": 1, 
  "Voltorb-Hisui": 1, "Hisuian Voltorb": 1, "Zorua-Hisui": 1, "Hisuian Zorua": 1, "Hoothoot": 1, "Hoppip": 1, 
  "Houndour": 1, "Impidimp": 1, "Inkay": 1, "Ivysaur": 1, "Jangmo-o": 1, "Jigglypuff": 1, "Joltik": 1, "Kirlia": 1, 
  "Koffing": 1, "Kricketune": 1, "Krokorok": 1, "Lampent": 1, "Larvesta": 1, "Larvitar": 1, "Lechonk": 1, "Litleo": 1, 
  "Litten": 1, "Litwick": 1, "Lombre": 1, "Lotad": 1, "Luvdisc": 1, "Luxio": 1, "Lycanroc-Midnight": 1, "Magby": 1, 
  "Magcargo": 1, "Magikarp": 1, "Magnemite": 1, "Makuhita": 1, "Mankey": 1, "Mareanie": 1, "Mareep": 1, "Marill": 1, 
  "Marshtomp": 1, "Maschiff": 1, "Meditite": 1, "Meowth": 1, "Metang": 1, "Mienfoo": 1, "Mightyena": 1, "Milcery": 1, 
  "Minccino": 1, "Minun": 1, "Monferno": 1, "Mudbray": 1, "Mudkip": 1, "Munchlax": 1, "Nacli": 1, "Noctowl": 1, "Noibat": 1, 
  "Nosepass": 1, "Numel": 1, "Nuzleaf": 1, "Nymble": 1, "Oddish": 1, "Oshawott": 1, "Wooper-Paldea": 1, "Paldean Wooper": 1, 
  "Pawmi": 1, "Pawmo": 1, "Pawniard": 1, "Petilil": 1, "Phanpy": 1, "Phantump": 1, "Pichu": 1, "Pignite": 1, "Pikipek": 1, 
  "Pineco": 1, "Piplup": 1, "Plusle": 1, "Poliwag": 1, "Poliwhirl": 1, "Poochyena": 1, "Popplio": 1, "Prinplup": 1, 
  "Psyduck": 1, "Pupitar": 1, "Quaxly": 1, "Quaxwell": 1, "Quilava": 1, "Quilladin": 1, "Raboot": 1, "Ralts": 1, "Rellor": 1, 
  "Rhyhorn": 1, "Rockruff": 1, "Rolycoly": 1, "Rookidee": 1, "Rowlet": 1, "Rufflet": 1, "Salandit": 1, "Sandile": 1, 
  "Sandshrew": 1, "Sandygast": 1, "Scatterbug": 1, "Scorbunny": 1, "Scraggy": 1, "Seedot": 1, "Seel": 1, "Sentret": 1, 
  "Servine": 1, "Seviper": 1, "Sewaddle": 1, "Shelgon": 1, "Shellder": 1, "Shellos": 1, "Shieldon": 1, "Shinx": 1, 
  "Shroomish": 1, "Shuppet": 1, "Silicobra": 1, "Sinistea": 1, "Skiddo": 1, "Skiploom": 1, "Skrelp": 1, "Skwovet": 1, 
  "Slakoth": 1, "Sliggoo": 1, "Slowpoke": 1, "Slugma": 1, "Smoliv": 1, "Snivy": 1, "Snom": 1, "Snorunt": 1, "Snover": 1, 
  "Snubbull": 1, "Sobble": 1, "Solosis": 1, "Spewpa": 1, "Spidops": 1, "Spinarak": 1, "Spoink": 1, "Sprigatito": 1, 
  "Squirtle": 1, "Staravia": 1, "Starly": 1, "Steenee": 1, "Stunky": 1, "Sunflora": 1, "Sunkern": 1, "Surskit": 1, 
  "Swablu": 1, "Swadloon": 1, "Swalot": 1, "Swanna": 1, "Swinub": 1, "Tadbulb": 1, "Tandemaus": 1, "Tarountula": 1, 
  "Teddiursa": 1, "Tentacool": 1, "Tepig": 1, "Timburr": 1, "Tinkatink": 1, "Tinkatuff": 1, "Toedscool": 1, "Torchic": 1, 
  "Totodile": 1, "Toxel": 1, "Trapinch": 1, "Treecko": 1, "Trumbeak": 1, "Turtwig": 1, "Tynamo": 1, "Tyrogue": 1, 
  "Varoom": 1, "Vespiquen": 1, "Vibrava": 1, "Vigoroth": 1, "Voltorb": 1, "Vullaby": 1, "Vulpix": 1, "Wattrel": 1, 
  "Weepinbell": 1, "Whiscash": 1, "Wiglett": 1, "Wingull": 1, "Wooper": 1, "Yanma": 1, "Yungoos": 1, "Zweilous": 1
};

// Helper to guess tier/points based on BST if tier data is missing
const calculatePoints = (p: any): number => {
  // 1. Check strict manual override
  if (POINT_OVERRIDES[p.name]) return POINT_OVERRIDES[p.name];

  // 2. Normalize and check again (Handles 'Alolan Ninetales' vs 'Ninetales-Alola' discrepancy)
  // Convert standard Showdown name "Ninetales-Alola" to "Alolan Ninetales" format to match user list keys
  if (p.name.includes('-')) {
      // Try reversing: "Ninetales-Alola" -> "Alolan Ninetales"
      const parts = p.name.split('-');
      if (parts.length === 2) {
          const reversed = parts[1] + " " + parts[0]; // e.g. "Alola Ninetales"
          if (POINT_OVERRIDES[reversed]) return POINT_OVERRIDES[reversed];
          
          // Try adding 'n' if it ends in 'a' or 'i'? No, standard is "Alolan", "Hisuian", "Galarian"
          // Let's explicitly try specific suffix conversions
          const suffixMap: Record<string, string> = {
              'Alola': 'Alolan',
              'Galar': 'Galarian',
              'Hisui': 'Hisuian',
              'Paldea': 'Paldean'
          };
          if (suffixMap[parts[1]]) {
              const naturalName = `${suffixMap[parts[1]]} ${parts[0]}`;
              if (POINT_OVERRIDES[naturalName]) return POINT_OVERRIDES[naturalName];
          }
      }
  }

  // 3. Fallback logic removed as requested. Return 0 to indicate exclusion.
  return 0;
};

// Fallback data in case fetch fails
export const FALLBACK_POKEMON: Pokemon[] = [
  { id: 1, name: 'Bulbasaur', types: ['Grass', 'Poison'], tier: 'LC', stats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 }, points: 4, sprite: 'https://play.pokemonshowdown.com/sprites/gen5/bulbasaur.png', movePool: [], abilities: ['Overgrow'], role: 'Starter' },
];

export const fetchPokedex = async (): Promise<Pokemon[]> => {
  try {
    const [dexRes, movesRes, learnRes] = await Promise.all([
      fetch(SHOWDOWN_POKEDEX_URL),
      fetch(SHOWDOWN_MOVES_URL),
      fetch(SHOWDOWN_LEARNSETS_URL)
    ]);

    if (!dexRes.ok || !movesRes.ok || !learnRes.ok) throw new Error('Failed to fetch Showdown data');
    
    const dexData = await dexRes.json();
    const movesData = await movesRes.json();
    const learnsetData = await learnRes.json();

    // 1. Populate MOVES_DATA
    Object.keys(movesData).forEach(moveKey => {
       const m = movesData[moveKey];
       if (m.isZ || m.isMax) return; // Skip Z-moves/Max moves for simplicity
       MOVES_DATA[m.name] = {
         name: m.name,
         type: m.type,
         category: m.category,
         bp: m.basePower,
         priority: m.priority,
         tags: m.flags ? Object.keys(m.flags) : [],
         desc: m.shortDesc || m.desc
       };
    });

    const pokemonList: Pokemon[] = [];

    // 2. Populate Pokemon List
    Object.keys(dexData).forEach((key) => {
      const p = dexData[key];
      // Check if p.baseStats exists to prevent crashing
      if (!p.baseStats) return;

      // Skip special battle forms if needed (keeping basic logic)
      if (p.num < 1 && p.num > -100) return; 

      // FILTER: Only allow Pokemon present in our Point Overrides list
      const points = calculatePoints(p);
      if (points === 0) return;

      // Determine ID 
      let rawId = p.num > 0 ? p.num : Math.abs(p.num) + 10000;
      
      const spriteName = p.name.toLowerCase().replace(/[^\w]/g, '').replace('mega', '-mega').replace('alola', '-alola').replace('galar', '-galar').replace('hisui', '-hisui').replace('paldea', '-paldea');
      
      // Get Learnset
      // Try exact match, then base species
      let speciesKey = key;
      let rawLearnset = learnsetData[speciesKey]?.learnset;
      
      if (!rawLearnset && p.baseSpecies) {
        // Fallback to base species key (clean text)
        const baseKey = p.baseSpecies.toLowerCase().replace(/[^a-z0-9]/g, '');
        rawLearnset = learnsetData[baseKey]?.learnset;
      }
      
      // Map move IDs to Move Names
      const movePool: string[] = [];
      if (rawLearnset) {
         Object.keys(rawLearnset).forEach(moveId => {
            const moveName = movesData[moveId]?.name;
            if (moveName && MOVES_DATA[moveName]) {
               movePool.push(moveName);
            }
         });
      }

      const mon: Pokemon = {
        id: rawId,
        name: p.name,
        types: p.types,
        tier: p.tier || 'Unknown',
        stats: p.baseStats,
        points: points,
        sprite: `https://play.pokemonshowdown.com/sprites/gen5/${spriteName}.png`,
        movePool: movePool,
        abilities: p.abilities ? Object.values(p.abilities) : [],
        role: 'Flex',
        tags: p.tags || []
      };
      
      if (p.isNonstandard) {
          mon.isNonstandard = p.isNonstandard;
      }
      
      // Fix ID collision for forms
      if (pokemonList.some(existing => existing.id === mon.id)) {
         mon.id = mon.id + Math.floor(Math.random() * 100000); 
      }

      pokemonList.push(mon);
    });

    return pokemonList;
  } catch (error) {
    console.error("Error loading pokedex:", error);
    MOVES_DATA['Flamethrower'] = { type: 'Fire', category: 'Special', bp: 90, name: 'Flamethrower' };
    return FALLBACK_POKEMON;
  }
};

export const FULL_POKEDEX: Pokemon[] = [];
