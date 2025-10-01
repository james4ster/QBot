import 'dotenv/config';
import { assignPick } from './sheets.js';

async function test() {
  try {
    const managerName = 'Yoda';
    const playerName = 'Theoren Fleury';

    // Wrap the assignPick call in a try/catch to capture errors but still log data
    const pick = await assignPick(managerName, playerName, false); // dryRun=true

    // Normalize the manager field for logging
    if (pick && pick.manager) {
      pick.manager = pick.manager.replace(/"/g, '').trim();
    }

    console.log('Dry run complete. Pick object:', pick);
  } catch (err) {
    console.error('❌ Test failed, but here is what was attempted:', err);
  }
}

test();
