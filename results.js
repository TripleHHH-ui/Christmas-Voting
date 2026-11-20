// Results dashboard logic.
// The leaderboard is public (GET /api/votes/results and the live stream return totals only —
// never who voted for whom). Two things still need the organiser PIN: seeing the names of who has /
// hasn't voted, and resetting the votes.
document.addEventListener('DOMContentLoaded', () => {
  initFx();

  const $ = id => document.getElementById(id);
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FALLBACK_POLL_MS = 15000;   // only used when the live stream is not connected
  const SAFETY_RECONCILE_MS = 60000; // even when live, re-sync now and then in case an event was missed

  function showError(msg, detail) {
    $('errorArea').innerHTML =
      `<div class="error-banner" role="alert"><strong>Something's not right</strong>${escapeHtml(msg)}${detail ? '<br><span class="muted">' + escapeHtml(detail) + '</span>' : ''}</div>`;
  }
  function clearError() { $('errorArea').innerHTML = ''; loadErrorShown = false; }
  // A load/connection error stays up until the next successful update; other messages (e.g. "Type RESET")
  // are left alone by background updates.
  let loadErrorShown = false;
  function clearLoadError() { if (loadErrorShown) clearError(); }

  // =====================================================================
  //  Live leaderboard
  // =====================================================================
  let lastComputed = null;      // rows from the server: {name, points, firsts, seconds, thirds, place, tied}
  let prevRows = null;          // Map name -> {points, place} from the previous update (null = first render)
  let prevVoterCount = 0;
  let prevLeaderKey = '';
  let lastUpdateAt = 0;
  let toastTimer = null;

  // ---- small helpers ----
  function animateNumber(el, to) {
    const from = Number(el.dataset.val || 0);
    el.dataset.val = String(to);
    if (el._raf) cancelAnimationFrame(el._raf);
    if (el._fin) clearTimeout(el._fin);
    if (REDUCED || from === to) { el.textContent = to; return; }
    const dur = 700;
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
    // requestAnimationFrame pauses in background tabs: guarantee the final number is always right.
    el._fin = setTimeout(() => { el.textContent = to; }, dur + 150);
  }

  function toast(msg) {
    const t = $('liveToast');
    t.innerHTML = '';
    const s = document.createElement('span');
    s.textContent = msg;
    t.appendChild(s);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.innerHTML = ''; }, 4500);
  }

  function setLive(state) {
    const labels = { live: 'Live', connecting: 'Connecting…', reconnecting: 'Reconnecting…', polling: 'Auto-refresh' };
    $('liveBadge').dataset.state = state;
    $('liveText').textContent = labels[state] || state;
  }

  // ---- full table (hidden by default; keeps every name incl. 0-point people) ----
  function renderTable(arr) {
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
    $('leaderboardWrap').innerHTML = html;
  }

  // ---- podium (places 1-3; people tied on a place share its pillar) ----
  function renderPodium(rows) {
    [1, 2, 3].forEach(place => {
      const group = rows.filter(r => r.place === place);
      const pod = document.querySelector('.pod-' + place);
      const namesEl = $('podNames' + place);
      const key = group.map(g => g.name).join('|');
      if (namesEl.dataset.key !== key) {
        namesEl.dataset.key = key;
        namesEl.innerHTML = '';
        group.forEach(g => {
          const s = document.createElement('span');
          s.textContent = g.name;
          namesEl.appendChild(s);
        });
        // re-trigger the pop-in animation
        namesEl.classList.remove('pop');
        void namesEl.offsetWidth;
        if (group.length) namesEl.classList.add('pop');
      }
      pod.classList.toggle('filled', group.length > 0);
      animateNumber($('podPts' + place), group.length ? group[0].points : 0);
    });
  }

  // ---- ranked list for everyone below the podium, with animated re-ordering (FLIP) ----
  const rowEls = new Map();
  function makeRow() {
    const el = document.createElement('div');
    el.className = 'lb-row';
    el.innerHTML = '<span class="lb-rank"></span><span class="lb-name"></span><span class="lb-move"></span>' +
                   '<span class="lb-pts"><span class="v">0</span><small>pts</small></span>';
    return el;
  }
  function renderList(rows, first) {
    const list = $('lbList');
    const items = rows.filter(r => r.place !== null && r.place > 3);

    // FLIP step 1: remember where each existing row is
    const before = new Map();
    rowEls.forEach((el, name) => before.set(name, el.getBoundingClientRect().top));

    const keep = new Set(items.map(r => r.name));
    rowEls.forEach((el, name) => { if (!keep.has(name)) { el.remove(); rowEls.delete(name); } });

    items.forEach(r => {
      let el = rowEls.get(r.name);
      const prev = prevRows && prevRows.get(r.name);
      if (!el) {
        el = makeRow();
        rowEls.set(r.name, el);
        if (!first && !REDUCED) {
          el.classList.add('enter');
          setTimeout(() => el.classList.remove('enter'), 700);
        }
      }
      el.querySelector('.lb-rank').textContent = (r.tied ? 'T' : '') + r.place;
      el.querySelector('.lb-name').textContent = r.name;
      animateNumber(el.querySelector('.v'), r.points);
      el.querySelector('small').textContent = r.points === 1 ? 'pt' : 'pts';

      // rank movement arrow (shown for a few seconds)
      const mv = el.querySelector('.lb-move');
      if (!first && prev) {
        let text = '', cls = '';
        if (prev.place === null) { text = 'NEW'; cls = 'new'; }
        else if (prev.place > r.place) { text = '▲ ' + (prev.place - r.place); cls = 'up'; }
        else if (prev.place < r.place) { text = '▼ ' + (r.place - prev.place); cls = 'down'; }
        if (text) {
          mv.textContent = text; mv.className = 'lb-move ' + cls;
          clearTimeout(el._moveTimer);
          el._moveTimer = setTimeout(() => { mv.textContent = ''; mv.className = 'lb-move'; }, 6000);
        }
        if (r.points > prev.points && !REDUCED) {
          el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
          setTimeout(() => el.classList.remove('bump'), 1400);
        }
      }
      list.appendChild(el);   // appending in sorted order re-orders the DOM
    });

    // FLIP step 2: slide rows from their old position to the new one
    if (!REDUCED && !document.hidden) {
      items.forEach(r => {
        const el = rowEls.get(r.name);
        if (!before.has(r.name)) return;
        const dy = before.get(r.name) - el.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        el.style.transition = 'none';
        el.style.transform = `translateY(${dy}px)`;
        void el.offsetHeight;
        el.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.9, 0.25, 1.1)';
        el.style.transform = '';
      });
    }
  }

  // ---- apply one set of results (from the stream or a refresh) ----
  function applyData(data) {
    const rows = Array.isArray(data && data.leaderboard) ? data.leaderboard : [];
    const voterCount = (data && data.voterCount) || 0;
    const first = prevRows === null;
    lastComputed = rows;
    lastUpdateAt = Date.now();

    $('statVoters').textContent = voterCount;
    $('statTotal').textContent = TOTAL_ATTENDEES;
    $('statRemaining').textContent = Math.max(0, TOTAL_ATTENDEES - voterCount);

    renderTable(rows);
    renderPodium(rows);
    renderList(rows, first);
    $('lbEmpty').hidden = rows.some(r => r.points > 0);

    // celebrate changes (never on the first render or after a reset)
    const leaderKey = rows.filter(r => r.place === 1).map(r => r.name).join(' & ');
    if (!first && voterCount > prevVoterCount) {
      if (leaderKey && leaderKey !== prevLeaderKey) {
        toast('👑 ' + leaderKey + (rows.filter(r => r.place === 1).length > 1 ? ' share the lead!' : ' takes the lead!'));
        if (typeof fireConfetti === 'function' && !REDUCED) fireConfetti(document.body, 45);
      } else {
        toast('🗳️ A new vote just came in!');
      }
    }
    prevLeaderKey = leaderKey;
    prevVoterCount = voterCount;
    prevRows = new Map(rows.map(r => [r.name, { points: r.points, place: r.place }]));

    // keep an open names panel live too
    if (!$('votersPanel').hidden && organiserPin) loadVoters();
  }

  let loading = false;
  async function loadAndRender(silent) {
    if (loading) return;
    loading = true;
    if (!silent) clearError();
    try {
      applyData(await VoteStorage.getResults());
      clearLoadError();
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so results cannot be loaded.', err.detail || 'Check that the shared server backend is running.'); loadErrorShown = true;
      } else {
        showError('Unexpected error loading results.', err.message); loadErrorShown = true;
      }
    } finally {
      loading = false;
    }
  }
  $('btnRefresh').addEventListener('click', () => loadAndRender());

  // ---- live connection (Server-Sent Events) with polling as a safety net ----
  let liveState = 'connecting';
  function connectLive() {
    if (!('EventSource' in window)) { liveState = 'polling'; setLive('polling'); return; }
    const es = new EventSource('api/votes/stream');
    es.addEventListener('update', e => {
      try { applyData(JSON.parse(e.data)); clearLoadError(); } catch (_) { /* ignore a bad frame */ }
      liveState = 'live'; setLive('live');
    });
    es.onopen = () => { liveState = 'live'; setLive('live'); };
    es.onerror = () => {
      // readyState 2 = closed for good; otherwise the browser retries by itself
      liveState = es.readyState === 2 ? 'polling' : 'reconnecting';
      setLive(liveState);
    };
  }
  setInterval(() => {
    if (document.hidden) return;
    if (!$('resetModal').hidden) return;
    const stale = Date.now() - lastUpdateAt;
    if (liveState !== 'live' ? stale > FALLBACK_POLL_MS - 1000 : stale > SAFETY_RECONCILE_MS) loadAndRender(true);
  }, FALLBACK_POLL_MS);

  // ---- show / hide the full table ----
  $('btnToggleTable').addEventListener('click', () => {
    const wrap = $('leaderboardWrap');
    wrap.hidden = !wrap.hidden;
    $('btnToggleTable').textContent = wrap.hidden ? 'Show full table' : 'Hide full table';
  });

  // =====================================================================
  //  Who has / hasn't voted (names only, needs the organiser PIN)
  // =====================================================================
  let organiserPin = null;      // kept in memory only
  let votersMode = 'remaining'; // 'remaining' | 'voted'
  let lastVoters = null;

  function renderVoters() {
    if (!lastVoters) return;
    const names = votersMode === 'remaining' ? lastVoters.notVoted : lastVoters.voted;
    $('votersTitle').textContent = votersMode === 'remaining' ? `Haven't voted yet (${names.length})` : `Already voted (${names.length})`;
    $('votersCount').textContent = `${names.length} of ${lastVoters.total}`;
    const list = $('votersList');
    list.innerHTML = '';
    if (names.length === 0) {
      const p = document.createElement('p');
      p.className = 'muted center';
      p.textContent = votersMode === 'remaining' ? '🎉 Everyone has voted!' : 'Nobody has voted yet.';
      list.appendChild(p);
    }
    names.forEach(n => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = n;
      list.appendChild(chip);
    });
    $('btnVotersCopy').hidden = names.length === 0;
    $('votersBody').hidden = false;
  }

  async function loadVoters() {
    try {
      lastVoters = await VoteStorage.getVoters(organiserPin);
      $('votersError').textContent = '';
      $('votersPinForm').hidden = true;
      renderVoters();
    } catch (err) {
      if (err.status === 401 || err.status === 429) {
        organiserPin = null;
        $('votersBody').hidden = true;
        $('votersPinForm').hidden = false;
        $('votersError').textContent = err.status === 401 ? 'Incorrect PIN.' : err.message;
        $('votersPinInput').select();
      } else if (err instanceof StorageUnavailableError) {
        $('votersError').textContent = 'Shared vote storage is unavailable right now.';
      } else {
        $('votersError').textContent = err.message;
      }
    }
  }

  function openVoters(mode) {
    votersMode = mode;
    $('votersTitle').textContent = mode === 'remaining' ? "Haven't voted yet" : 'Already voted';
    $('votersPanel').hidden = false;
    $('votersError').textContent = '';
    $('votersPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (organiserPin) {
      $('votersPinForm').hidden = true;
      if (lastVoters) renderVoters();
      loadVoters();
    } else {
      $('votersBody').hidden = true;
      $('votersPinForm').hidden = false;
      $('votersPinInput').focus({ preventScroll: true });
    }
  }

  $('btnStatRemaining').addEventListener('click', () => openVoters('remaining'));
  $('btnStatVoters').addEventListener('click', () => openVoters('voted'));
  $('btnVotersClose').addEventListener('click', () => { $('votersPanel').hidden = true; });
  $('votersPinForm').addEventListener('submit', e => {
    e.preventDefault();
    const val = $('votersPinInput').value.trim();
    if (!val) { $('votersError').textContent = 'Enter the PIN.'; return; }
    organiserPin = val;
    $('votersPinInput').value = '';
    loadVoters();
  });
  $('btnVotersCopy').addEventListener('click', async () => {
    if (!lastVoters) return;
    const names = votersMode === 'remaining' ? lastVoters.notVoted : lastVoters.voted;
    try {
      await navigator.clipboard.writeText(names.join('\n'));
      $('btnVotersCopy').textContent = 'Copied ✓';
      setTimeout(() => { $('btnVotersCopy').textContent = 'Copy names'; }, 1500);
    } catch (_) {
      $('votersError').textContent = 'Copying is not available in this browser.';
    }
  });

  // =====================================================================
  //  CSV export, reset, reveal
  // =====================================================================
  $('btnExport').addEventListener('click', () => {
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

  // ---- Reset flow (needs the organiser PIN) ----
  const resetModal = $('resetModal');
  const resetInput = $('resetConfirmInput');
  const resetPinInput = $('resetPinInput');
  $('btnResetOpen').addEventListener('click', () => {
    resetModal.hidden = false;
    resetInput.value = '';
    resetPinInput.value = '';
    resetModal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    resetPinInput.focus({ preventScroll: true });
  });
  $('btnResetCancel').addEventListener('click', () => { resetModal.hidden = true; });
  [resetPinInput, resetInput].forEach(el => el.addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btnResetConfirm').click();
  }));
  $('btnResetConfirm').addEventListener('click', async () => {
    const btn = $('btnResetConfirm');
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
  $('btnReveal').addEventListener('click', () => {
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
  setLive('connecting');
  loadAndRender();
  connectLive();
});
