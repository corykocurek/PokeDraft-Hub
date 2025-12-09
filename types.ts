
export interface Pokemon {
  id: number;
  name: string;
  types: string[];
  tier?: string; // LC, OU, Uber, CAP, etc.
  stats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  points: number;
  sprite: string;
  movePool: string[]; // List of Move Names
  abilities?: string[];
  role: string;
  tags?: string[]; // e.g. "Restricted Legendary", "Paradox"
  isNonstandard?: string; // e.g. "Past", "Future", "CAP"
  teraType?: string; // User assigned Tera Type
}

export interface Team {
  id: string; // Internal ID (usually team-{index})
  ownerId?: string; // Firebase Auth UID
  name: string;
  logoUrl: string;
  coachName: string;
  roster: Pokemon[];
  budgetUsed: number;
  wins: number;
  losses: number;
  differential: number; // For tiebreakers
}

export interface Matchup {
  id: string;
  week: number;
  teamAId: string;
  teamBId: string;
  winnerId?: string;
  scoreA?: number;
  scoreB?: number;
  completed: boolean;
  replayUrl?: string;
  isPlayoff?: boolean; // To distinguish in UI
  playoffRound?: 'Semi-Final' | 'Final';
  teamADetails?: {
    pokemonUsed: number[]; // IDs of pokemon brought
    kills: Record<number, number>; // ID -> Kills
    deaths: Record<number, number>; // ID -> Deaths
  };
  teamBDetails?: {
    pokemonUsed: number[];
    kills: Record<number, number>;
    deaths: Record<number, number>;
  };
}

export interface Transaction {
  id: string;
  date: number;
  teamId: string;
  teamName: string;
  type: 'ADD' | 'DROP' | 'MATCH_REPORT';
  pokemonName: string;
  points: number;
}

export interface LeagueState {
  id?: string; // Firestore Doc ID
  joinCode: string; // 6-char code for joining
  commissionerId: string; // UID of creator
  maxPlayers: number;
  
  name: string;
  logoUrl?: string; 
  teams: Team[];
  pokemonPool: Pokemon[]; // The custom pool for this league
  transactions: Transaction[]; // Log of all moves
  phase: 'setup' | 'draft' | 'season' | 'playoffs' | 'completed';
  championId?: string;
  currentWeek: number;
  draftConfig: {
    totalBudget: number;
    maxPokemon: number;
    pickOrder: string[]; // Array of Team IDs
    currentPickIndex: number;
    direction: 'forward' | 'backward';
    lastPickTime: number; // Timestamp
  };
  schedule: Matchup[];
}

export const TYPES = [
  'Normal', 'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 
  'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 
  'Dragon', 'Steel', 'Dark', 'Fairy'
];
