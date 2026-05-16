# wiw-shiftpickup-automation

Automated Asana task creation for WIW shift pickups — Skin & Sage Spa.
Applies to **Estheticians and Massage Therapists only**.

---

## How It Works

When a provider picks up a dropped or open shift in When I Work, a webhook fires to this repo via GitHub's `repository_dispatch` API. GitHub Actions creates an Asana task for Sofie (servicesdirector@skinandsagespa.com) with the details she needs to update Mangomint.

### Dropped Shift Picked Up

The shift is automatically reassigned in WIW. One Asana task is created:

**"Shift Dropped - Close Books in Mangomint – [Dropping Provider] ([Date])"**
- Due: same day | Priority: High | Assigned to: Sofie LaCarrubba
- Notes: dropping provider name + position, picking provider name + position, shift date, time, and hours
- If dropping provider still has another shift that day → instructs Sofie to adjust hours only (not mark "Not Working")
- If dropping provider has no other shifts that day → instructs Sofie to mark schedule as "Not Working"

Sofie handles in Mangomint:
1. Update dropping provider's schedule (Not Working or adjust hours)
2. Reassign dropping provider's 30-min breaks to picking provider
3. Reassign existing appointments to picking provider
4. If Mangomint won't allow an appointment reassignment → create a new Asana task: "Reassign Appointments for Provider Time Off" (due tomorrow, high priority, self-assigned)
5. Open the books for the picking provider

### Open Shift Picked Up

The shift is automatically assigned in WIW. One Asana task is created:

**"Schedule Update – [Provider] picked up open shift ([Date])"**
- Due: same day | Priority: High | Assigned to: Sofie LaCarrubba
- Notes: provider name, position, shift date, time, and hours
- Step-by-step action list for Sofie
- If provider is now working 2 shifts back-to-back → instructs Sofie to add a 30-min break at 1:00 PM or 4:45 PM

---

## Account-Specific Constants

| Constant | Value | Source |
|---|---|---|
| Esthetician position id | `11742907` | `/2/positions` |
| Massage Therapist position id | `11742908` | `/2/positions` |
| Provider Schedule location id | `5837840` | `/2/locations` |
| Asana Spa Operations project | `1211852426828244` | Asana lookup |
| Asana assignee (servicesdirector) | `1211841527818964` (Sofie LaCarrubba) | Asana lookup |

---

## Webhook Payload

Configure WIW to fire a `repository_dispatch` event of type `wiw_shift_pickup`.

**Dropped shift picked up:**
```json
{
  "pickup_type": "dropped",
  "shift_id": 12345,
  "picking_user_id": 67890,
  "dropping_user_id": 11111
}
```

**Open shift picked up:**
```json
{
  "pickup_type": "open",
  "shift_id": 12345,
  "picking_user_id": 67890
}
```

---

## Setup

### 1. Add GitHub Secrets

Repo → Settings → Secrets and variables → Actions → New repository secret.

| Secret | Value |
|---|---|
| `WIW_API_KEY` | When I Work developer/API key |
| `WIW_EMAIL` | Email for the WIW account that authenticates the API session |
| `WIW_PASSWORD` | Password for that account |
| `ASANA_ACCESS_TOKEN` | Asana Personal Access Token |

### 2. Configure the WIW Webhook

```
POST https://api.github.com/repos/SkinAndSageSpa/wiw-shiftpickup-automation/dispatches
```

Headers:
```
Authorization: Bearer <GITHUB_PAT>
Accept: application/vnd.github+json
Content-Type: application/json
```

Body: see Webhook Payload section above.

A GitHub Personal Access Token with `repo` scope is required. Store it in WIW's webhook config; do not commit it.

### 3. Install & Test Locally

```
npm install
npm test
```

To validate the live WIW API connection:

```
node tools/probe-wiw.js [YYYY-MM-DD]
```

---

## File Structure

```
.github/
  workflows/
    shift-pickup.yml          GitHub Actions workflow
src/
  handler.js                  Main orchestrator
  wiwClient.js                When I Work API client
  asanaClient.js              Asana task creation
  shiftLogic.test.js          Unit tests (pure logic)
tools/
  probe-wiw.js                Local diagnostic / API explorer
package.json
README.md
```
