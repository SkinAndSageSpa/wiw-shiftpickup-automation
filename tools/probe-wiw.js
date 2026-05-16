/**
 * probe-wiw.js
 * Local diagnostic — logs in to WIW and dumps shifts for a given date.
 * Usage: WIW_API_KEY=... WIW_EMAIL=... WIW_PASSWORD=... node tools/probe-wiw.js [YYYY-MM-DD]
 */

const wiw = require('../src/wiwClient');

async function main() {
  const date = process.argv[2] || new Date().toISOString().split('T')[0];
  console.log(`Probing WIW for date: ${date}`);

  const session = await wiw.login();
  console.log('Login OK');

  const authHeaders = {
    'W-Token': session.token,
    'W-UserId': String(session.userId),
    'Content-Type': 'application/json',
  };

  const usersRes = await fetch('https://api.wheniwork.com/2/users', { headers: authHeaders });
  const { users } = await usersRes.json();
  const providers = (users || []).filter(wiw.isProvider);
  console.log(`\nProviders (${providers.length}):`);
  for (const u of providers) {
    console.log(`  ${u.id}  ${u.first_name} ${u.last_name}  positions=${JSON.stringify(u.positions)}`);
  }

  const shiftsRes = await fetch(
    `https://api.wheniwork.com/2/shifts?start=${date}&end=${date}&location_id=${wiw.PROVIDER_LOCATION_ID}`,
    { headers: authHeaders },
  );
  const { shifts } = await shiftsRes.json();
  console.log(`\nShifts on ${date} (${(shifts || []).length}):`);
  for (const s of shifts || []) {
    const hrs = wiw.shiftHours(s);
    console.log(`  shift_id=${s.id}  user_id=${s.user_id}  position_id=${s.position_id}  ${wiw.formatShiftTime(s)}  (${hrs} hrs)`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
