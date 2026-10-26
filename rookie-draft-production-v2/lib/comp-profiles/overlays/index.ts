import type {CompOverlay} from "@/lib/comp-profiles/types";
import {compOverlays2022} from "@/lib/comp-profiles/overlays/2022";

/** Comp-only stats/analytics for already-scouted players (backfilled from PFF). Never shown on cards or used for grades. */
export const allCompOverlays:CompOverlay[]=[...compOverlays2022];
