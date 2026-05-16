/**
 * handler.js
 * Entry point for the GitHub Actions workflow.
 * Reads the WIW shift pickup event from EVENT_PAYLOAD and creates the appropriate Asana task.
 */

const wiw = require('./wiwClient');
const { createDroppedShiftTask, createOpenShiftTask } = require('./asanaClient');

async function main() {
  const payload = JSON.parse(process.env.EVENT_PAYLOAD || '{}');
  const { pickup_type, shift_id, picking_user_id, dropping_user_id } = payload;

  if (!pickup_type || !shift_id || !picking_user_id) {
    console.log('Missing required payload fields (pickup_type, shift_id, picking_user_id). Skipping.');
    return;
  }

  await wiw.login();

  const [shift, pickingUser] = await Promise.all([
    wiw.getShift(shift_id),
    wiw.getUser(picking_user_id),
  ]);

  if (!wiw.isProvider(pickingUser)) {
    console.log(`${pickingUser.first_name} ${pickingUser.last_name} is not an Esti or LMT. Skipping.`);
    return;
  }

  const pickingName     = `${pickingUser.first_name} ${pickingUser.last_name}`;
  const pickingPosition = wiw.positionLabel(pickingUser);
  const shiftDate       = shift.start_time.split('T')[0];
  const shiftTime       = wiw.formatShiftTime(shift);
  const hours           = wiw.shiftHours(shift);
  const now             = new Date();

  console.log(`Processing ${pickup_type} pickup: ${pickingName} (${pickingPosition}), ${shiftDate} ${shiftTime} (${hours} hrs)`);

  if (pickup_type === 'dropped') {
    if (!dropping_user_id) {
      console.log('pickup_type=dropped but dropping_user_id is missing. Skipping.');
      return;
    }

    const [droppingUser, droppingShiftsToday] = await Promise.all([
      wiw.getUser(dropping_user_id),
      wiw.getUserShiftsOnDate(dropping_user_id, shiftDate),
    ]);

    const droppingName     = `${droppingUser.first_name} ${droppingUser.last_name}`;
    const droppingPosition = wiw.positionLabel(droppingUser);
    // The dropped shift has already been reassigned in WIW, so any remaining
    // shifts on this date still belong to the dropping provider.
    const droppingHasRemainingShift = droppingShiftsToday.length > 0;

    const { task } = await createDroppedShiftTask({
      droppingProvider: { name: droppingName, position: droppingPosition },
      pickingProvider:  { name: pickingName,  position: pickingPosition  },
      shiftDate,
      shiftTime,
      shiftHours: hours,
      droppingHasRemainingShift,
      now,
    });
    console.log(`Asana task created: ${task?.data?.permalink_url || '(no url)'}`);

  } else if (pickup_type === 'open') {
    const pickingShiftsToday = await wiw.getUserShiftsOnDate(picking_user_id, shiftDate);
    // 2+ shifts on the same date means back-to-back — Sofie needs to add a break
    const isBackToBack = pickingShiftsToday.length >= 2;

    const { task } = await createOpenShiftTask({
      provider: { name: pickingName, position: pickingPosition },
      shiftDate,
      shiftTime,
      shiftHours: hours,
      isBackToBack,
      now,
    });
    console.log(`Asana task created: ${task?.data?.permalink_url || '(no url)'}`);

  } else {
    console.log(`Unknown pickup_type: "${pickup_type}". Skipping.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
