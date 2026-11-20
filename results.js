// Results / organiser dashboard logic.
document.addEventListener('DOMContentLoaded', () => {
  initFx();
  const PIN = '2026';
  const AUTO_REFRESH_MS = 20000;

  function showError(msg, detail) {
    document.getElementById('errorArea').innerHTML =
      `<div class="error-banner" role="alert"><strong>Something's not right</strong>${escapeHtml(msg)}${detail ? '<br><span class="muted">' + escapeHtml(detail) + '</span>' : ''}</div>`;
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
      document.getElementById('pinError').textContent = '';
      document.getElementById('pinInput').value = '';
      document.getElementById('pinGate').hidden = true;
      document.getElementById('dashboard').hidden = false;
      loadAndRender();
      startAutoRefresh();
    } else {
      document.getElementById('pinError').textContent = 'Incorrect PIN.';
      document.getElementById('pinInput').select();
    }
  }

  // ---- Core computation ----
  let lastComputed = null;

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
      const placeText = row.place === null ? '–' : row.place + (row.tied ? ' (tie)' : '');
      html += `<tr class="${rankClass}${tieClass}">
        <td>${placeText}</td>
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

  let loading = false;
  // silent = background refresh: no "Loading…" flash, keep the old table on failure.
  async function loadAndRender(silent) {
    if (loading) return;
    loading = true;
    clearError();
    if (!silent) {
      document.getElementById('leaderboardWrap').innerHTML = '<p class="muted center">Loading…</p>';
    }
    try {
      const state = await VoteStorage.getState();
      const votes = (state && state.votes) || {};
      lastComputed = computeLeaderboard(votes);
      renderLeaderboard(lastComputed, Object.keys(votes).length);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so results cannot be loaded.', err.detail || 'Check that the shared server backend is running.');
      } else {
        showError('Unexpected error loading results.', err.message);
      }
      if (!silent) document.getElementById('leaderboardWrap').innerHTML = '';
    } finally {
      loading = false;
    }
  }

  document.getElementById('btnRefresh').addEventListener('click', () => loadAndRender());

  // "Live" leaderboard: refresh quietly while the tab is visible.
  let refreshTimer = null;
  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => {
      if (document.hidden) return;
      if (!document.getElementById('resetModal').hidden) return;
      loadAndRender(true);
    }, AUTO_REFRESH_MS);
  }

  // ---- CSV export ----
  document.getElementById('btnExport').addEventListener('click', () => {
    if (!lastComputed) return;
    let csv = 'Name,Total Points,1st Picks,2nd Picks,3rd Picks\n';
    lastComputed.forEach(row => {
      csv += `"${row.name.replace(/"/g, '""')}",${row.points},${row.firsts},${row.seconds},${row.thirds}\n`;
    });
    // BOM so Excel reads the file as UTF-8.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'golden-hour-midnight-glamour-results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // ---- Reset flow ----
  const resetModal = document.getElementById('resetModal');
  const resetInput = document.getElementById('resetConfirmInput');
  document.getElementById('btnResetOpen').addEventListener('click', () => {
    resetModal.hidden = false;
    resetInput.value = '';
    resetModal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resetInput.focus({ preventScroll: true });
  });
  document.getElementById('btnResetCancel').addEventListener('click', () => {
    resetModal.hidden = true;
  });
  resetInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnResetConfirm').click();
  });
  document.getElementById('btnResetConfirm').addEventListener('click', async () => {
    const btn = document.getElementById('btnResetConfirm');
    if (resetInput.value.trim() !== 'RESET') {
      showError('Type RESET exactly to confirm.');
      return;
    }
    btn.disabled = true;
    try {
      await VoteStorage.resetVotes();
      resetModal.hidden = true;
      loadAndRender();
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so votes could not be reset.', err.detail);
      } else {
        showError('Unexpected error resetting votes.', err.message);
      }
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Reveal mode ----
  let revealQueue = [];
  let revealIdx = -1;
  const revealOverlay = document.getElementById('revealOverlay');
  const btnRevealNext = document.getElementById('btnRevealNext');

  document.getElementById('btnReveal').addEventListener('click', async () => {
    // Use the freshest numbers for the big reveal.
    await loadAndRender(true);
    if (!lastComputed) return;
    const top3 = lastComputed.filter(r => r.place !== null && r.place <= 3);
    if (top3.length === 0) {
      showError('There are no votes yet, so there is nothing to reveal.');
      return;
    }
    // order: 3rd, 2nd, 1st (by place descending within distinct places present)
    const places = [...new Set(top3.map(r => r.place))].sort((a, b) => b - a);
    revealQueue = places.map(p => top3.filter(r => r.place === p));
    revealIdx = -1;
    document.getElementById('revealLabel').textContent = 'Get ready…';
    document.getElementById('revealName').textContent = ' ';
    document.getElementById('revealPts').textContent = '';
    btnRevealNext.disabled = false;
    revealOverlay.hidden = false;
    revealOverlay.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  btnRevealNext.addEventListener('click', () => {
    revealIdx++;
    if (revealIdx >= revealQueue.length) {
      document.getElementById('revealLabel').textContent = 'That\'s everyone! 🎄';
      document.getElementById('revealName').textContent = '🎉';
      document.getElementById('revealPts').textContent = '';
      btnRevealNext.disabled = true;
      return;
    }
    const group = revealQueue[revealIdx];
    const place = group[0].place;
    const label = place === 1 ? '🥇 First Place' : place === 2 ? '🥈 Second Place' : '🥉 Third Place';
    document.getElementById('revealLabel').textContent = label;
    document.getElementById('revealName').textContent = group.map(g => g.name).join(' & ');
    document.getElementById('revealPts').textContent = group[0].points + ' pts' + (group.length > 1 ? ' (tie)' : '');
    fireConfetti(revealOverlay, 70);
  });

  document.getElementById('btnRevealClose').addEventListener('click', () => {
    revealOverlay.hidden = true;
  });
});
