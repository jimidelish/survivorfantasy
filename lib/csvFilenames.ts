// Naming scheme the admin page relies on:
//   survivors_s{season}.csv  e.g. survivors_s51.csv
// (event_types used to have a CSV upload too — scoring changes are now made
// directly on the Scoring Guide page instead, see app/scoring/page.tsx.)

const SURVIVORS_PATTERN = /^survivors_s(\d+)\.csv$/i;

export function parseSurvivorsFilename(filename: string): number | null {
  const match = filename.trim().match(SURVIVORS_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}
