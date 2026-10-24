import { collection, doc, onSnapshot } from "firebase/firestore";
import { createUseLeaderboardXp } from "./create-use-leaderboard-xp";

// Web and desktop use their own Firebase SDK; mobile supplies its local SDK.
export const useLeaderboardXp = createUseLeaderboardXp({ collection, doc, onSnapshot });
