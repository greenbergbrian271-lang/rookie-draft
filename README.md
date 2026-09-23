# Rookie Draft Production App

Production-oriented Next.js replacement for the legacy Rookie Draft Google Sheets workflow.

## Architecture
- Next.js App Router
- Google authentication via Auth.js
- Neon Postgres for cross-device persistence
- Server-side API routes for players, notes, settings and PFF imports
- PFF CSV processor embedded in Data Center
- Historical rankings table designed for 2022+ migration

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill values.
3. Run `db/schema.sql` against Neon.
4. `npm run dev`

## Safety / migration
Legacy Rookie Draft workbooks are read-only migration/reference sources. This application does not write back to them.

## PFF parity
The Data Center preserves the processor's position thresholds, PFF field mappings, percentage formatting, team normalization and derived-stat calculations. The original processor should remain available during parity testing until representative CSV fixtures have been compared field-by-field.


