/**
 * handler.js
 * Polling orchestrator. Runs on a GitHub Actions cron schedule.
 *
 * Dropped shifts: detected via WIW /2/swaps (approved swap requests).
 * Open shifts: not yet implemented — WIW's updated_at on regular shifts
 *   cannot reliably distinguish a pickup from a routine schedule edit.
 *   Pending investigation of a dedicated WIW open-shift-request endpoint.
 */

const wiw = require('./wiwClient');
const { createDroppedShiftTask, createOpenShiftTask } = require('./asanaClient');

async function processDroppedShift(swap, userCache) {
  const pickingUserId  = swap.user_id;
  const droppingUserId = swap.creator_id;

  if (!pickingUserId || !droppingUserId) {
    console.log(`  Swap ${swap.id}: missing user IDs, skipping`);
    return;
  }

  const [pickingUser, droppingUser, shift] = await Promise.all([
    userCache.get(pickingUserId),
    userCache.get(droppingUserId),
    wiw.getShift(swap.shift_id),
  ]);

  if (!wiw.isProvider(pickingUser)) {
    console.log(`  Swap ${swap.id}: picking user ${pickingUser?.first_name} is not Esti/LMT, skipping`);
    return;
  }

  const pickingName      = `${pickingUser.first_name} ${pickingUser.last_name}`;
  const pickingPosition  = wiw.positionLabel(pickingUser);
  const droppingName     = `${droppingUser.first_name} ${droppingUser.last_name}`;
  const droppingPosition = wiw.positionLabel(droppingUser);

  const shiftDate    = wiw.shiftDateKey(shift);
  const shiftDisplay = `${wiw.formatShiftDate(shift)} ${wiw.formatShiftTime(shift)}`;
  const hours        = wiw.shiftHours(shift);

  const droppingShiftsToday       = await wiw.getUserShiftsOnDate(droppingUserId, shiftDate);
  const droppingHasRemainingShift = droppingShiftsToday.length > 0;

  console.log(`  Swap ${swap.id}: ${droppingName} → ${pickingName}, ${shiftDisplay} (${hours} hrs)`);

  const task = await createDroppedShiftTask({
    droppingProvider: { name: droppingName, position: droppingPosition },
    pickingProvider:  { name: pickingName,  position: pickingPosition  },
    shiftDate,
    shiftDisplay,
    shiftHours: hours,
    droppingHasRemainingShift,
    now: new Date(),
  });

  if (task) console.log(`    Asana task: ${task?.data?.permalink_url || '(no url)'}`);
}

function makeUserCache() {
  const cache = new Map();
  return {
    async get(userId) {
      if (!cache.has(userId)) cache.set(userId, await wiw.getUser(userId));
      return cache.get(userId);
    },
  };
}

async function main() {
  console.log(`[${new Date().toISOString()}] Polling WIW for recent shift pickups...`);

  await wiw.login();
  const userCache = makeUserCache();

  const swaps = await wiw.getRecentApprovedSwaps();
  console.log(`Found ${swaps.length} recent approved swap(s).`);
  for (const swap of swaps) {
    try { await processDroppedShift(swap, userCache); }
    catch (err) { console.error(`  Swap ${swap.id}: ERROR - ${err.message}`); }
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
