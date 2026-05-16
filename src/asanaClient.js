/**
 * asanaClient.js
 * Creates Asana tasks when a WIW shift is picked up.
 * All tasks assigned to servicesdirector@skinandsagespa.com (Sofie LaCarrubba).
 * Includes deduplication: checks for an existing task by name before creating.
 */

const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';

const SPA_OPERATIONS_PROJECT_GID = process.env.ASANA_PROJECT_GID        || '1211852426828244';
const ASSIGNEE_GID               = process.env.ASANA_ASSIGNEE_GID       || '1211841527818964'; // servicesdirector@skinandsagespa.com (Sofie LaCarrubba)
const PRIORITY_FIELD_GID         = process.env.ASANA_PRIORITY_FIELD_GID || '1204876556629872';
const PRIORITY_HIGH_OPTION_GID   = process.env.ASANA_PRIORITY_HIGH_GID  || '1204876556629873';

let _workspaceGid = null;

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

async function getWorkspaceGid() {
  if (_workspaceGid) return _workspaceGid;
  const res  = await fetch(`${ASANA_BASE_URL}/projects/${SPA_OPERATIONS_PROJECT_GID}?opt_fields=workspace`, { headers: getHeaders() });
  const data = await res.json();
  _workspaceGid = data?.data?.workspace?.gid;
  if (!_workspaceGid) throw new Error('Could not resolve Asana workspace GID from project');
  return _workspaceGid;
}

// Returns true if a task with this exact name already exists in the project.
async function taskExists(name) {
  const wsGid = await getWorkspaceGid();
  const params = new URLSearchParams({
    'projects.any': SPA_OPERATIONS_PROJECT_GID,
    text: name,
    opt_fields: 'name',
    limit: '5',
  });
  const res  = await fetch(`${ASANA_BASE_URL}/workspaces/${wsGid}/tasks/search?${params}`, { headers: getHeaders() });
  const data = await res.json();
  return (data.data || []).some(t => t.name === name);
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
 * Returns null if a task with this name already exists (dedup).
 */
async function createDroppedShiftTask({
  droppingProvider,           // { name, position }
  pickingProvider,            // { name, position }
  shiftDate,                  // YYYY-MM-DD
  shiftTime,                  // "9:00 AM – 3:00 PM"
  shiftHours,                 // numeric, e.g. 6
  droppingHasRemainingShift,  // boolean
  now,
}) {
  const name  = `Shift Dropped - Close Books in Mangomint – ${droppingProvider.name} (${shiftDate})`;
  const today = formatDate(now);

  if (await taskExists(name)) {
    console.log(`  Skipping (task already exists): ${name}`);
    return null;
  }

  const mangomintNote = droppingHasRemainingShift
    ? `Note: ${droppingProvider.name} still has another shift on ${shiftDate} — adjust hours only, do not mark "Not Working."`
    : `Note: ${droppingProvider.name} has no other shifts on ${shiftDate} — mark schedule as "Not Working."`;

  return createTask({
    name,
    notes: [
      `Dropping Provider: ${droppingProvider.name} (${droppingProvider.position})`,
      `Picking Provider:  ${pickingProvider.name} (${pickingProvider.position})`,
      `Shift Date: ${shiftDate}  ${shiftTime}  (${shiftHours} hrs)`,
      '',
      mangomintNote,
    ].join('\n'),
    dueDate: today,
  });
}

/**
 * Open shift picked up.
 * One task with step-by-step instructions for Sofie.
 * Returns null if a task with this name already exists (dedup).
 */
async function createOpenShiftTask({
  provider,       // { name, position }
  shiftDate,      // YYYY-MM-DD
  shiftTime,      // "9:00 AM – 3:00 PM"
  shiftHours,     // numeric, e.g. 6
  isBackToBack,   // boolean
  now,
}) {
  const name  = `Schedule Update – ${provider.name} picked up open shift (${shiftDate})`;
  const today = formatDate(now);

  if (await taskExists(name)) {
    console.log(`  Skipping (task already exists): ${name}`);
    return null;
  }

  const steps = [
    `1. Adjust ${provider.name}'s schedule in Mangomint to reflect the picked-up shift on ${shiftDate} (${shiftTime}, ${shiftHours} hrs).`,
  ];
  if (isBackToBack) {
    steps.push(`2. ${provider.name} is now working 2 shifts back-to-back on ${shiftDate}. Add a 30-min break at 1:00 PM or 4:45 PM.`);
  }

  return createTask({
    name,
    notes: [
      `Provider: ${provider.name} (${provider.position})`,
      `Shift Date: ${shiftDate}  ${shiftTime}  (${shiftHours} hrs)`,
      '',
      'Action Required:',
      ...steps,
    ].join('\n'),
    dueDate: today,
  });
}

module.exports = { createDroppedShiftTask, createOpenShiftTask };
