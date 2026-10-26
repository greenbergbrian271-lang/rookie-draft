import type {CompProfile} from "@/lib/comp-profiles/types";
import {compProfiles2022} from "@/lib/comp-profiles/2022";
import {compProfiles2023} from "@/lib/comp-profiles/2023";
import {compProfiles2024} from "@/lib/comp-profiles/2024";
import {compProfiles2025} from "@/lib/comp-profiles/2025";

/** Analytics-only comp profiles (no scouting profile). Add each backfilled class here. */
export const allCompProfiles:CompProfile[]=[...compProfiles2022,...compProfiles2023,...compProfiles2024,...compProfiles2025];
