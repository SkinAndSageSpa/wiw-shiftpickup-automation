/**
 * probe-wiw.js
 * Local diagnostic — logs in to WIW and dumps shifts, swaps, and open shift requests.
 * Usage: WIW_API_KEY=... WIW_EMAIL=... WIW_PASSWORD=... node tools/probe-wiw.js [YYYY-MM-DD]
 */

const wiw = require('../src/wiwClient');

async function get(path) {
  const s = await wiw.login();
  const res = await fetch(`https://api.wheniwork.com/2${path}`, {
    headers: { 'W-Token': s.token, 'W-UserId': String(s.userId), 'Content-Type': 'application/json' },
  });
  return res.json();
}

async function main() {
  const date = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  console.log(`Probing WIW for date: ${date}\n`);

  await wiw.login();

  // Providers
  const { users } = await get('/users');
  const providers = (users || []).filter(wiw.isProvider);
  console.log(`=== Providers (${providers.length}) ===`);
  for (const u of providers) {
    console.log(`  id=${u.id}  ${u.first_name} ${u.last_name}  positions=${JSON.stringify(u.positions)}`);
  }

  // Shifts on date
  const { shifts } = await get(`/shifts?start=${date}&end=${date}&location_id=${wiw.PROVIDER_LOCATION_ID}`);
  console.log(`\n=== Shifts on ${date} (${(shifts || []).length}) ===`);
  for (const s of shifts || []) {
    console.log(`  shift_id=${s.id}  user_id=${s.user_id}  position_id=${s.position_id}  ${wiw.formatShiftTime(s)}  updated_at=${s.updated_at}`);
  }

  // Recent approved swaps
  const end60 = new Date(Date.now() + 60 * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const swapData = await get(`/swaps?status=2&start=${date}&end=${end60}`);
  console.log(`\n=== Approved swaps (${(swapData.swaps || []).length}) ===`);
  for (const s of swapData.swaps || []) {
    console.log(`  swap_id=${s.id}  shift_id=${s.shift_id}  creator_id=${s.creator_id}  user_id=${s.user_id}  updated_at=${s.updated_at}`);
  }

  // Open shift requests
  const osrData = await get(`/openshiftrequests?start=${date}&end=${end60}`);
  console.log(`\n=== Open shift requests — raw response keys: ${Object.keys(osrData).join(', ')} ===`);
  const requests = osrData.open_shift_requests || osrData.openshiftrequests || osrData.requests || [];
  console.log(`  Count: ${requests.length}`);
  if (requests.length > 0) {
    console.log('  First entry (full object):');
    console.log(JSON.stringify(requests[0], null, 4));
  } else {
    console.log('  Full response:');
    console.log(JSON.stringify(osrData, null, 2));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
