// Shared scoring logic, used by results.js (leaderboard) and reveal.js (Top 3 reveal).
// Depends on ATTENDEES from data.js.

function computeLeaderboard(votesMap) {
  const totals = {};
  ATTENDEES.forEach(n => { totals[n] = { name: n, points: 0, firsts: 0, seconds: 0, thirds: 0 }; });
  const pointsForRank = [3, 2, 1];
  Object.entries(votesMap || {}).forEach(([voter, picks]) => {
    if (!Array.isArray(picks)) return;
    // Defensive: ignore duplicate picks and self-votes even if the backend let them through.
    const seen = new Set();
    let idx = 0;
    picks.forEach(name => {
      if (idx > 2 || !totals[name] || name === voter || seen.has(name)) return;
      seen.add(name);
      totals[name].points += pointsForRank[idx];
      if (idx === 0) totals[name].firsts++;
      else if (idx === 1) totals[name].seconds++;
      else totals[name].thirds++;
      idx++;
    });
  });
  const arr = Object.values(totals);
  arr.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.firsts !== a.firsts) return b.firsts - a.firsts;
    if (b.seconds !== a.seconds) return b.seconds - a.seconds;
    return a.name.localeCompare(b.name);
  });
  // Assign places with ties. People with 0 points have not placed at all
  // (otherwise, before any votes, all 44 would show as "1st (tie)").
  let place = 0;
  let prevKey = null;
  arr.forEach((row, i) => {
    if (row.points === 0) {
      row.place = null;
      return;
    }
    const key = `${row.points}-${row.firsts}-${row.seconds}`;
    if (key !== prevKey) {
      place = i + 1;
      prevKey = key;
    }
    row.place = place;
  });
  // mark ties (share same place with another row)
  const placeCounts = {};
  arr.forEach(r => { if (r.place !== null) placeCounts[r.place] = (placeCounts[r.place] || 0) + 1; });
  arr.forEach(r => { r.tied = r.place !== null && placeCounts[r.place] > 1; });
  return arr;
}

// Groups the top 3 places for the reveal, in reveal order (3rd -> 2nd -> 1st).
// Tied people share a group. Returns [] when nobody has any points yet.
function buildRevealQueue(leaderboard) {
  const top3 = (leaderboard || []).filter(r => r.place !== null && r.place <= 3);
  const places = [...new Set(top3.map(r => r.place))].sort((a, b) => b - a);
  return places.map(p => top3.filter(r => r.place === p));
}
