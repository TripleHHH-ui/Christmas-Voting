// Results / organiser dashboard logic.
document.addEventListener('DOMContentLoaded', () => {
  initFx();
  const PIN = '2026';

  function showError(msg, detail) {
    document.getElementById('errorArea').innerHTML =
      `<div class="error-banner"><strong>Something's not right</strong>${msg}${detail ? '<br><span class="muted">' + detail + '</span>' : ''}</div>`;
  }
  function clearError() { document.getElementById('errorArea').innerHTML = ''; }

  // ---- PIN gate ----
  document.getElementById('btnPinSubmit').addEventListener('click', unlockWithPin);
  document.getElementById('pinInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') unlockWithPin();
  });
  function unlockWithPin() {
    const val = document.getElementById('pinInput').value.trim();
    if (val === PIN) {
      document.getElementById('pinGate').hidden = true;
      document.getElementById('dashboard').hidden = false;
      loadAndRender();
    } else {
      document.getElementById('pinError').textContent = 'Incorrect PIN.';
    }
  }

  // ---- Core computation ----
  let lastState = null; // { votes: {voter: [picks]} }
  let lastComputed = null;

  function computeLeaderboard(votesMap) {
    const totals = {};
    ATTENDEES.forEach(n => { totals[n] = { name: n, points: 0, firsts: 0, seconds: 0, thirds: 0 }; });
    const pointsForRank = [3, 2, 1];
    Object.values(votesMap || {}).forEach(picks => {
      (picks || []).forEach((name, idx) => {
        if (!totals[name] || idx > 2) return;
        totals[name].points += pointsForRank[idx];
        if (idx === 0) totals[name].firsts++;
        else if (idx === 1) totals[name].seconds++;
        else totals[name].thirds++;
      });
    });
    const arr = Object.values(totals);
    arr.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.firsts !== a.firsts) return b.firsts - a.firsts;
      if (b.seconds !== a.seconds) return b.seconds - a.seconds;
      return a.name.localeCompare(b.name);
    });
    // assign places with ties
    let place = 0;
    let prevKey = null;
    arr.forEach((row, i) => {
      const key = `${row.points}-${row.firsts}-${row.seconds}`;
      if (key !== prevKey) {
        place = i + 1;
        prevKey = key;
      }
      row.place = place;
    });
    // mark ties (share same place with another row)
    const placeCounts = {};
    arr.forEach(r => { placeCounts[r.place] = (placeCounts[r.place] || 0) + 1; });
    arr.forEach(r => { r.tied = placeCounts[r.place] > 1; });
    return arr;
  }

  function renderLeaderboard(arr, voterCount) {
    document.getElementById('statVoters').textContent = voterCount;
    document.getElementById('statTotal').textContent = TOTAL_ATTENDEES;
    document.getElementById('statRemaining').textContent = Math.max(0, TOTAL_ATTENDEES - voterCount);

    let html = `<table class="leaderboard"><thead><tr>
      <th>Place</th><th>Name</th><th>Points</th><th>1st</th><th>2nd</th><th>3rd</th>
    </tr></thead><tbody>`;
    arr.forEach(row => {
      const rankClass = row.place === 1 ? 'rank-1' : row.place === 2 ? 'rank-2' : row.place === 3 ? 'rank-3' : '';
      const tieClass = row.tied ? ' tie' : '';
      html += `<tr class="${rankClass}${tieClass}">
        <td>${row.place}${row.tied ? ' (tie)' : ''}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${row.points}</td>
        <td>${row.firsts}</td>
        <td>${row.seconds}</td>
        <td>${row.thirds}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('leaderboardWrap').innerHTML = html;
  }

  async function loadAndRender() {
    clearError();
    document.getElementById('leaderboardWrap').innerHTML = '<p class="muted center">Loading…</p>';
    try {
      const state = await VoteStorage.getState();
      lastState = state;
      const arr = computeLeaderboard(state.votes || {});
      lastComputed = arr;
      const voterCount = Object.keys(state.votes || {}).length;
      renderLeaderboard(arr, voterCount);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so results cannot be loaded.', err.detail || 'Check that the shared server backend is running.');
      } else {
        showError('Unexpected error loading results.', err.message);
      }
      document.getElementById('leaderboardWrap').innerHTML = '';
    }
  }

  document.getElementById('btnRefresh').addEventListener('click', loadAndRender);

  // ---- CSV export ----
  document.getElementById('btnExport').addEventListener('click', () => {
    if (!lastComputed) return;
    let csv = 'Name,Total Points,1st Picks,2nd Picks,3rd Picks\n';
    lastComputed.forEach(row => {
      csv += `"${row.name.replace(/"/g, '""')}",${row.points},${row.firsts},${row.seconds},${row.thirds}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'golden-hour-midnight-glamour-results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // ---- Reset flow ----
  document.getElementById('btnResetOpen').addEventListener('click', () => {
    document.getElementById('resetModal').hidden = false;
    document.getElementById('resetConfirmInput').value = '';
  });
  document.getElementById('btnResetCancel').addEventListener('click', () => {
    document.getElementById('resetModal').hidden = true;
  });
  document.getElementById('btnResetConfirm').addEventListener('click', async () => {
    if (document.getElementById('resetConfirmInput').value.trim() !== 'RESET') {
      showError('Type RESET exactly to confirm.');
      return;
    }
    try {
      await VoteStorage.resetVotes();
      document.getElementById('resetModal').hidden = true;
      loadAndRender();
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so votes could not be reset.', err.detail);
      } else {
        showError('Unexpected error resetting votes.', err.message);
      }
    }
  });

  // ---- Reveal mode ----
  let revealQueue = [];
  let revealIdx = -1;

  document.getElementById('btnReveal').addEventListener('click', () => {
    if (!lastComputed || lastComputed.length === 0) return;
    const top3 = lastComputed.filter(r => r.place <= 3 && r.points > 0);
    // order: 3rd, 2nd, 1st (by place descending within distinct places present)
    const places = [...new Set(top3.map(r => r.place))].sort((a, b) => b - a);
    revealQueue = [];
    places.forEach(p => {
      revealQueue.push(top3.filter(r => r.place === p));
    });
    revealIdx = -1;
    document.getElementById('revealLabel').textContent = 'Get ready…';
    document.getElementById('revealName').textContent = '\u00a0';
    document.getElementById('revealPts').textContent = '';
    document.getElementById('revealOverlay').hidden = false;
    document.getElementById('dashboard').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btnRevealNext').addEventListener('click', () => {
    revealIdx++;
    if (revealIdx >= revealQueue.length) {
      document.getElementById('revealLabel').textContent = 'That\'s everyone! 🎄';
      document.getElementById('revealName').textContent = '🎉';
      document.getElementById('revealPts').textContent = '';
      return;
    }
    const group = revealQueue[revealIdx];
    const place = group[0].place;
    const label = place === 1 ? '🥇 First Place' : place === 2 ? '🥈 Second Place' : '🥉 Third Place';
    document.getElementById('revealLabel').textContent = label;
    document.getElementById('revealName').textContent = group.map(g => g.name).join(' & ');
    document.getElementById('revealPts').textContent = group[0].points + ' pts' + (group.length > 1 ? ' (tie)' : '');
    fireConfetti(document.getElementById('revealOverlay'), 70);
  });

  document.getElementById('btnRevealClose').addEventListener('click', () => {
    document.getElementById('revealOverlay').hidden = true;
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
});
