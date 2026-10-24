import type {CompProfile} from "@/lib/comp-profiles/types";
import {compProfiles2025} from "@/lib/comp-profiles/2025";

/** Analytics-only comp profiles (no scouting profile). Add each backfilled class here. */
export const allCompProfiles:CompProfile[]=[...compProfiles2025];
