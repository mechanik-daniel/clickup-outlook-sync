import 'dotenv/config';
import { fetchOutlookEvents } from './outlook.js';
import { writeFileSync } from 'fs';

async function main() {
  const events = await fetchOutlookEvents();
  writeFileSync('../staging/outlook_events.json', JSON.stringify(events, null, 2));
  console.log('Outlook events written to staging/outlook_events.json');
}

main();
