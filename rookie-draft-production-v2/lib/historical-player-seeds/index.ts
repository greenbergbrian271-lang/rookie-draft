import y2020 from "./2020";
import y2021 from "./2021";
import y2022 from "./2022";
import y2023 from "./2023";
import y2024 from "./2024";
import y2025 from "./2025";
import y2026 from "./2026";

export type HistoricalPlayerSeed={
  name:string;
  position:"QB"|"RB"|"WR"|"TE";
  college?:string;
  status:"TO_SCOUT"|"WATCHED";
};

export const historicalPlayerSeeds:Record<number,readonly HistoricalPlayerSeed[]>={
  2020:y2020,
  2021:y2021,
  2022:y2022,
  2023:y2023,
  2024:y2024,
  2025:y2025,
  2026:y2026,
};
