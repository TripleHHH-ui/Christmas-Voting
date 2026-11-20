// Results dashboard logic.
// The leaderboard is public (GET /api/votes/results returns totals only — never who voted for
// whom). Resetting the votes is the one action that still needs the organiser PIN.
document.addEventListener('DOMContentLoaded', () => {
  initFx();
  const AUTO_REFRESH_MS = 20000;

  function showError(msg, detail) {
    document.getElementById('errorArea').innerHTML =
      `<div class="error-banner" role="alert"><strong>Something's not right</strong>${escapeHtml(msg)}${detail ? '<br><span class="muted">' + escapeHtml(detail) + '</span>' : ''}</div>`;
  }
  function clearError() { document.getElementById('errorArea').innerHTML = ''; }

  // ---- Leaderboard ----
  let lastComputed = null;   // rows from the server: {name, points, firsts, seconds, thirds, place, tied}

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
      const data = await VoteStorage.getResults();
      lastComputed = Array.isArray(data && data.leaderboard) ? data.leaderboard : [];
      renderLeaderboard(lastComputed, (data && data.voterCount) || 0);
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
  setInterval(() => {
    if (document.hidden) return;
    if (!document.getElementById('resetModal').hidden) return;
    loadAndRender(true);
  }, AUTO_REFRESH_MS);

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

  // ---- Reset flow (the only action that still needs the organiser PIN) ----
  const resetModal = document.getElementById('resetModal');
  const resetInput = document.getElementById('resetConfirmInput');
  const resetPinInput = document.getElementById('resetPinInput');
  document.getElementById('btnResetOpen').addEventListener('click', () => {
    resetModal.hidden = false;
    resetInput.value = '';
    resetPinInput.value = '';
    resetModal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resetPinInput.focus({ preventScroll: true });
  });
  document.getElementById('btnResetCancel').addEventListener('click', () => {
    resetModal.hidden = true;
  });
  [resetPinInput, resetInput].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btnResetConfirm').click();
  }));
  document.getElementById('btnResetConfirm').addEventListener('click', async () => {
    const btn = document.getElementById('btnResetConfirm');
    const resetPin = resetPinInput.value.trim();
    if (!resetPin) {
      showError('Enter the organiser PIN to reset the votes.');
      return;
    }
    if (resetInput.value.trim() !== 'RESET') {
      showError('Type RESET exactly to confirm.');
      return;
    }
    btn.disabled = true;
    try {
      await VoteStorage.resetVotes(resetPin);
      resetModal.hidden = true;
      resetPinInput.value = '';
      loadAndRender();
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so votes could not be reset.', err.detail);
      } else if (err.status === 401) {
        showError('Incorrect PIN, so the votes were not reset.');
      } else if (err.status === 429) {
        showError('Too many wrong PIN attempts.', err.message);
      } else {
        showError('Unexpected error resetting votes.', err.message);
      }
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Reveal: opens as its own full-screen page in a new tab ----
  document.getElementById('btnReveal').addEventListener('click', () => {
    if (!lastComputed || buildRevealQueue(lastComputed).length === 0) {
      showError('There are no votes yet, so there is nothing to reveal.');
      return;
    }
    clearError();
    const tab = window.open('reveal.html', '_blank');
    if (!tab) {
      showError('Your browser blocked the new tab.', 'Allow pop-ups for this site, or open /reveal.html yourself.');
    }
  });

  // ---- Start ----
  loadAndRender();
});
