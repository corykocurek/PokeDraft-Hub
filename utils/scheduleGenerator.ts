import { Team, Matchup } from '../types';

export const generateSchedule = (teams: Team[]): Matchup[] => {
  const schedule: Matchup[] = [];
  if (teams.length < 2) return schedule;

  const teamIds = teams.map(t => t.id);
  // Add dummy team if odd number
  if (teamIds.length % 2 !== 0) {
    teamIds.push('BYE');
  }

  const numRounds = teamIds.length - 1;
  const halfSize = teamIds.length / 2;
  const rounds = [];

  const teamIdsCopy = [...teamIds]; // Mutable copy for rotation

  for (let round = 0; round < numRounds; round++) {
    const roundMatches: Matchup[] = [];
    
    for (let i = 0; i < halfSize; i++) {
      const teamA = teamIdsCopy[i];
      const teamB = teamIdsCopy[teamIdsCopy.length - 1 - i];

      if (teamA !== 'BYE' && teamB !== 'BYE') {
        roundMatches.push({
          id: `wk${round + 1}-${teamA}-${teamB}`,
          week: round + 1,
          teamAId: teamA,
          teamBId: teamB,
          completed: false
        });
      }
    }
    rounds.push(roundMatches);

    // Rotate array, keeping first element fixed
    const first = teamIdsCopy[0];
    const tail = teamIdsCopy.slice(1);
    tail.unshift(tail.pop()!);
    teamIdsCopy.length = 0;
    teamIdsCopy.push(first, ...tail);
  }

  // Flatten
  rounds.forEach(r => schedule.push(...r));
  return schedule;
};