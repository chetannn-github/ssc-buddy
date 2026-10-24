import { collection, doc, onSnapshot } from "firebase/firestore";
import { createUseLeaderboardXp } from "../../../shared/create-use-leaderboard-xp";

// Resolve the SDK from the mobile app, matching getFirebaseFirestore().
export const useLeaderboardXp = createUseLeaderboardXp({ collection, doc, onSnapshot });
