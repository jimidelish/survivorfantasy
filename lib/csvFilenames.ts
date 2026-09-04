// Naming scheme the admin page relies on:
//   survivors_s{season}.csv    e.g. survivors_s51.csv
//   event_types_s{season}.csv  e.g. event_types_s51.csv
// (event_types is global, not season-scoped — the season number in that
// filename is just for the uploader's own record-keeping.)

const SURVIVORS_PATTERN = /^survivors_s(\d+)\.csv$/i;
const EVENT_TYPES_PATTERN = /^event_types_s(\d+)\.csv$/i;

export function parseSurvivorsFilename(filename: string): number | null {
  const match = filename.trim().match(SURVIVORS_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}

export function parseEventTypesFilename(filename: string): number | null {
  const match = filename.trim().match(EVENT_TYPES_PATTERN);
  return match ? parseInt(match[1], 10) : null;
}
