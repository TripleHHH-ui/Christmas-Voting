// Results / organiser dashboard logic.
document.addEventListener('DOMContentLoaded', () => {
  initFx();
  // The organiser PIN is verified by the server (never stored in this public file).
  let pin = null;
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
  async function unlockWithPin() {
    const input = document.getElementById('pinInput');
    const btn = document.getElementById('btnPinSubmit');
    const pinError = document.getElementById('pinError');
    const val = input.value.trim();
    if (!val) {
      pinError.textContent = 'Enter the PIN.';
      return;
    }
    btn.disabled = true;
    pin = val;
    const result = await loadAndRender();
    btn.disabled = false;
    if (result === 'ok') {
      pinError.textContent = '';
      input.value = '';
      document.getElementById('pinGate').hidden = true;
      document.getElementById('dashboard').hidden = false;
      startAutoRefresh();
    } else if (result === 'auth') {
      pinError.textContent = 'Incorrect PIN.';
      input.select();
    }
    // 'error' (storage unavailable etc.): the red banner above explains why.
  }

  // Back to the PIN screen (wrong/changed PIN detected after unlocking).
  function lockDashboard(message) {
    pin = null;
    document.getElementById('dashboard').hidden = true;
    document.getElementById('resetModal').hidden = true;
    document.getElementById('pinGate').hidden = false;
    document.getElementById('pinError').textContent = message;
  }

  // ---- Core computation ----
  let lastComputed = null;

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
  // Returns 'ok' | 'auth' (server rejected the PIN) | 'error' | 'busy'.
  async function loadAndRender(silent) {
    if (loading) return 'busy';
    loading = true;
    clearError();
    if (!silent) {
      document.getElementById('leaderboardWrap').innerHTML = '<p class="muted center">Loading…</p>';
    }
    try {
      const state = await VoteStorage.getState(pin);
      const votes = (state && state.votes) || {};
      lastComputed = computeLeaderboard(votes);
      renderLeaderboard(lastComputed, Object.keys(votes).length);
      return 'ok';
    } catch (err) {
      if (err.status === 401 || err.status === 429) {
        document.getElementById('leaderboardWrap').innerHTML = '';
        if (document.getElementById('pinGate').hidden) {
          lockDashboard(err.message);
        } else {
          document.getElementById('pinError').textContent = err.message;
        }
        return err.status === 401 ? 'auth' : 'error';
      }
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so results cannot be loaded.', err.detail || 'Check that the shared server backend is running.');
      } else {
        showError('Unexpected error loading results.', err.message);
      }
      if (!silent) document.getElementById('leaderboardWrap').innerHTML = '';
      return 'error';
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
      if (document.hidden || !pin) return;
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
      await VoteStorage.resetVotes(pin);
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

  // ---- Reveal: opens as its own full-screen page in a new tab ----
  document.getElementById('btnReveal').addEventListener('click', () => {
    if (!lastComputed || buildRevealQueue(lastComputed).length === 0) {
      showError('There are no votes yet, so there is nothing to reveal.');
      return;
    }
    clearError();
    // Hand the PIN to the new tab (sessionStorage is copied to tabs opened with window.open).
    // If the browser doesn't copy it, the reveal page simply asks for the PIN itself.
    try { sessionStorage.setItem('ghmg_organiser_pin', pin); } catch (_) { /* reveal page will ask */ }
    const tab = window.open('reveal.html', '_blank');
    if (!tab) {
      showError('Your browser blocked the new tab.', 'Allow pop-ups for this site, or open /reveal.html yourself.');
    }
  });
});
