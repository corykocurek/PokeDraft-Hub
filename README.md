# Backend Suggestions & Project Clarifications

## User Accounts & Multi-Device Setup (Firebase)
To support users logging in from different computers and persistent drafts, I recommend the following architecture:

1.  **Authentication**: 
    *   Use **Firebase Authentication**.
    *   When the Commissioner invites a coach, create a record in a `coaches` collection linking their `email` to a specific `teamId`.
    *   On the frontend, when a user logs in via Google/Email, query the `coaches` collection to find which `teamId` belongs to them.
    *   Store this `teamId` in the local application state (React Context/State).

2.  **Database Security (Firestore Rules)**:
    *   **Drafting**: Only allow a write to the `league/draft/picks` collection if:
        *   `request.auth.uid == resource.data.ownerId`
        *   AND `resource.data.teamId == currentPickTeamId`
    *   This prevents users from hacking the client to pick when it's not their turn.

## Auto-Draft 24-Hour Timer Logic
Since client-side timers stop when the browser closes, you need a server-side trigger for the 24-hour rule.

1.  **Cloud Functions (Recommended)**:
    *   Write a Firebase Cloud Function that runs on a schedule (e.g., every 15 minutes).
    *   The function checks `league.draftConfig.lastPickTime`.
    *   If `Date.now() - lastPickTime > 24 hours`, the function:
        1.  Finds the highest-rated available Pokemon that fits the team's remaining budget.
        2.  Writes the pick to the database.
        3.  Updates `currentPickIndex` and `lastPickTime`.

2.  **Mock Implementation Notes**:
    *   The current client-side application mocks this by using a `setInterval` in `DraftView`. 
    *   If you log in as the Commissioner, you have a manual "Force Auto-Pick" button to override a user who is taking too long during testing.

## Backend Recommendations (Original)
To achieve persistence across multiple users and devices without maintaining a complex dedicated server, I recommend **Firebase** or **Supabase**.

1.  **Database (Firestore or Supabase DB):**
    *   Store `League` documents containing the teams, draft state, and settings.
    *   Store `Matches` as a separate collection to handle the large amount of analytical data (kills, deaths, replays).
2.  **Real-time Synchronization:**
    *   **Crucial for the Draft:** When User A picks a Pokemon, User B needs to see it gone instantly.
    *   Firebase `onSnapshot` or Supabase `Realtime` subscriptions are perfect for this.
3.  **Authentication:**
    *   Simple email/password or Google Auth allows users to "claim" a team and prevents unauthorized roster edits.
4.  **State Management:**
    *   The frontend (built here) is ready to hook into these services. You would replace the `localStorage` logic in `App.tsx` with API calls to these services.

## Clarifying Questions
1.  **Playoff Tie-Breakers:** How are playoff seeds determined if records are tied? (e.g., Head-to-head record, kill/death differential, or total wins in the best-of-3 sets?)
2.  **Pokemon Data Source:** Should the app fetch real data from PokeAPI, or will you provide a custom JSON to handle custom "League stats" and point values?
3.  **Battle Format:** Is this Singles (6v6) or Doubles (VGC)? This heavily impacts the "Move Pool" and "Speed Tier" analysis features.
4.  **Transaction Priority:** For Free Agency, is there a waiver wire order based on inverse standings, or is it First-Come-First-Serve (FAAB)?
5.  **Roster Constraints:** Are there distinct tiers (OU, UU, RU) that limit drafting (e.g., "Max 2 OU Pokemon"), or is the 75-point budget the *only* restriction?
6.  **Match Reporting:** Do both players need to verify a match result, or does the Commissioner have the final say to prevent disputes?