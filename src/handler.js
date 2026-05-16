/**
 * handler.js
 * Polling orchestrator. Runs on a GitHub Actions cron schedule.
 * Fetches recent WIW shift pickups and creates Asana tasks for each one.
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

  const pickingName     = `${pickingUser.first_name} ${pickingUser.last_name}`;
  const pickingPosition = wiw.positionLabel(pickingUser);
  const droppingName    = `${droppingUser.first_name} ${droppingUser.last_name}`;
  const droppingPosition = wiw.positionLabel(droppingUser);
  const shiftDate       = shift.start_time.split('T')[0];
  const shiftTime       = wiw.formatShiftTime(shift);
  const hours           = wiw.shiftHours(shift);

  const droppingShiftsToday     = await wiw.getUserShiftsOnDate(droppingUserId, shiftDate);
  const droppingHasRemainingShift = droppingShiftsToday.length > 0;

  console.log(`  Swap ${swap.id}: ${droppingName} → ${pickingName}, ${shiftDate} ${shiftTime} (${hours} hrs)`);

  const task = await createDroppedShiftTask({
    droppingProvider: { name: droppingName, position: droppingPosition },
    pickingProvider:  { name: pickingName,  position: pickingPosition  },
    shiftDate,
    shiftTime,
    shiftHours: hours,
    droppingHasRemainingShift,
    now: new Date(),
  });

  if (task) console.log(`    Asana task: ${task?.data?.permalink_url || '(no url)'}`);
}

async function processOpenShift(shift, userCache) {
  const user = await userCache.get(shift.user_id);

  if (!wiw.isProvider(user)) {
    console.log(`  Shift ${shift.id}: user ${user?.first_name} is not Esti/LMT, skipping`);
    return;
  }

  const name     = `${user.first_name} ${user.last_name}`;
  const position = wiw.positionLabel(user);
  const shiftDate = shift.start_time.split('T')[0];
  const shiftTime = wiw.formatShiftTime(shift);
  const hours     = wiw.shiftHours(shift);

  const shiftsToday  = await wiw.getUserShiftsOnDate(shift.user_id, shiftDate);
  const isBackToBack = shiftsToday.length >= 2;

  console.log(`  Open shift ${shift.id}: ${name} (${position}), ${shiftDate} ${shiftTime} (${hours} hrs)`);

  const task = await createOpenShiftTask({
    provider: { name, position },
    shiftDate,
    shiftTime,
    shiftHours: hours,
    isBackToBack,
    now: new Date(),
  });

  if (task) console.log(`    Asana task: ${task?.data?.permalink_url || '(no url)'}`);
}

// Simple user cache to avoid redundant WIW API calls within one run.
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

  // --- Dropped shifts (swaps) ---
  const swaps = await wiw.getRecentApprovedSwaps();
  console.log(`Found ${swaps.length} recent approved swap(s).`);
  for (const swap of swaps) {
    try {
      await processDroppedShift(swap, userCache);
    } catch (err) {
      console.error(`  Swap ${swap.id}: ERROR - ${err.message}`);
    }
  }

  // --- Open shift pickups ---
  // Exclude shifts already handled as swaps to avoid double-processing.
  const swapShiftIds    = new Set(swaps.map(s => s.shift_id));
  const recentShifts    = await wiw.getRecentlyAssignedShifts();
  const openShiftPickups = recentShifts.filter(s => !swapShiftIds.has(s.id));
  console.log(`Found ${openShiftPickups.length} recent open shift pickup(s).`);
  for (const shift of openShiftPickups) {
    try {
      await processOpenShift(shift, userCache);
    } catch (err) {
      console.error(`  Shift ${shift.id}: ERROR - ${err.message}`);
    }
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
