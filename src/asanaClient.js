/**
 * asanaClient.js
 * Creates Asana tasks when a WIW shift is picked up.
 * All tasks assigned to servicesdirector@skinandsagespa.com (Sofie LaCarrubba).
 */

const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';

const SPA_OPERATIONS_PROJECT_GID = process.env.ASANA_PROJECT_GID        || '1211852426828244';
const ASSIGNEE_GID               = process.env.ASANA_ASSIGNEE_GID       || '1211841527818964'; // servicesdirector@skinandsagespa.com (Sofie LaCarrubba)
const PRIORITY_FIELD_GID         = process.env.ASANA_PRIORITY_FIELD_GID || '1204876556629872';
const PRIORITY_HIGH_OPTION_GID   = process.env.ASANA_PRIORITY_HIGH_GID  || '1204876556629873';

function getHeaders() {
  const token = process.env.ASANA_ACCESS_TOKEN;
  if (!token) throw new Error('ASANA_ACCESS_TOKEN is not set.');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

async function createTask({ name, notes, dueDate }) {
  const res = await fetch(`${ASANA_BASE_URL}/tasks`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      data: {
        name,
        notes,
        due_on: dueDate,
        assignee: ASSIGNEE_GID,
        projects: [SPA_OPERATIONS_PROJECT_GID],
        custom_fields: {
          [PRIORITY_FIELD_GID]: PRIORITY_HIGH_OPTION_GID,
        },
      },
    }),
  });
  return res.json();
}

/**
 * Dropped shift picked up.
 * One task with a brief summary: who dropped, who picked up, date, time, hours.
 */
async function createDroppedShiftTask({
  droppingProvider,           // { name, position }
  pickingProvider,            // { name, position }
  shiftDate,                  // YYYY-MM-DD
  shiftTime,                  // "9:00 AM – 3:00 PM"
  shiftHours,                 // numeric, e.g. 6
  droppingHasRemainingShift,  // boolean — dropping provider still has another shift that day
  now,
}) {
  const today = formatDate(now);

  const mangomintNote = droppingHasRemainingShift
    ? `Note: ${droppingProvider.name} still has another shift on ${shiftDate} — adjust hours only, do not mark "Not Working."`
    : `Note: ${droppingProvider.name} has no other shifts on ${shiftDate} — mark schedule as "Not Working."`;

  const task = await createTask({
    name: `Shift Dropped - Close Books in Mangomint – ${droppingProvider.name} (${shiftDate})`,
    notes: [
      `Dropping Provider: ${droppingProvider.name} (${droppingProvider.position})`,
      `Picking Provider:  ${pickingProvider.name} (${pickingProvider.position})`,
      `Shift Date: ${shiftDate}  ${shiftTime}  (${shiftHours} hrs)`,
      '',
      mangomintNote,
    ].join('\n'),
    dueDate: today,
  });

  return { task };
}

/**
 * Open shift picked up.
 * One task with step-by-step instructions for Sofie.
 */
async function createOpenShiftTask({
  provider,       // { name, position }
  shiftDate,      // YYYY-MM-DD
  shiftTime,      // "9:00 AM – 3:00 PM"
  shiftHours,     // numeric, e.g. 6
  isBackToBack,   // boolean
  now,
}) {
  const today = formatDate(now);

  const steps = [
    `1. Adjust ${provider.name}'s schedule in Mangomint to reflect the picked-up shift on ${shiftDate} (${shiftTime}, ${shiftHours} hrs).`,
  ];
  if (isBackToBack) {
    steps.push(`2. ${provider.name} is now working 2 shifts back-to-back on ${shiftDate}. Add a 30-min break at 1:00 PM or 4:45 PM.`);
  }

  const task = await createTask({
    name: `Schedule Update – ${provider.name} picked up open shift (${shiftDate})`,
    notes: [
      `Provider: ${provider.name} (${provider.position})`,
      `Shift Date: ${shiftDate}  ${shiftTime}  (${shiftHours} hrs)`,
      '',
      'Action Required:',
      ...steps,
    ].join('\n'),
    dueDate: today,
  });

  return { task };
}

module.exports = { createDroppedShiftTask, createOpenShiftTask };
