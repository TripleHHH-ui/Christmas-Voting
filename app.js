// Voting page logic.
document.addEventListener('DOMContentLoaded', () => {
  initFx();

  const LOCAL_VOTED_KEY = 'ghmg_already_voted_name';

  // localStorage can throw (private mode, blocked storage) — never let that break voting.
  function readVotedName() {
    try { return localStorage.getItem(LOCAL_VOTED_KEY); } catch (_) { return null; }
  }
  function rememberVoted(name) {
    try { localStorage.setItem(LOCAL_VOTED_KEY, name); } catch (_) { /* server is the source of truth */ }
  }

  const state = {
    voter: null,
    picks: [] // ordered array of names, rank = index+1
  };

  const steps = ['welcome', 'voter', 'rank', 'review', 'confirm'];
  function showStep(name) {
    steps.forEach(s => {
      document.getElementById('step-' + s).hidden = (s !== name);
    });
    renderNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showError(msg, detail) {
    const area = document.getElementById('errorArea');
    area.innerHTML = `<div class="error-banner" role="alert"><strong>Something's not right</strong>${escapeHtml(msg)}${detail ? '<br><span class="muted">' + escapeHtml(detail) + '</span>' : ''}</div>`;
  }
  function clearError() {
    document.getElementById('errorArea').innerHTML = '';
  }

  // Make a div behave like a button for keyboard / screen-reader users.
  function makeActivatable(el, handler) {
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.addEventListener('click', handler);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  }

  // ---- Voting deadline ----
  // The server tells us when voting closes (and enforces it on submit). If it can't be
  // reached, the static wording in index.html stays and the server still checks on submit.
  const deadlineNote = document.getElementById('deadlineNote');
  const btnStart = document.getElementById('btnStart');
  let deadlineMs = null;
  let clockSkew = 0; // server time minus this device's clock, so a wrong phone clock doesn't matter
  function applyClosed() {
    deadlineNote.innerHTML = '🔒 <strong>Voting is closed.</strong> Thank you for taking part!';
    btnStart.disabled = true;
    if (document.getElementById('step-welcome').hidden) {
      showError('Voting has just closed, so new votes can no longer be submitted.');
    }
  }
  function checkDeadline() {
    if (deadlineMs !== null && Date.now() + clockSkew > deadlineMs) applyClosed();
  }
  VoteStorage.getConfig().then(cfg => {
    if (!cfg || !cfg.deadline) return;
    deadlineMs = Date.parse(cfg.deadline);
    clockSkew = cfg.serverTime ? Date.parse(cfg.serverTime) - Date.now() : 0;
    if (cfg.deadlineText) document.getElementById('deadlineText').textContent = cfg.deadlineText;
    if (cfg.closed) applyClosed();
    else setInterval(checkDeadline, 15000);
  }).catch(() => { /* keep the static text */ });

  // ---- Step 0 ----
  document.getElementById('btnStart').addEventListener('click', () => {
    const already = readVotedName();
    if (already) {
      // Block the flow: this phone has already submitted a vote.
      showError(`It looks like "${already}" already voted from this phone.`, 'If this is wrong, please see the organiser.');
      return;
    }
    clearError();
    voterSearch.value = '';
    renderVoterList('');
    showStep('voter');
  });

  // ---- Step 1: pick voter ----
  const voterSearch = document.getElementById('voterSearch');
  const voterListEl = document.getElementById('voterList');

  function renderVoterList(query) {
    const q = query.trim().toLowerCase();
    const matches = ATTENDEES.filter(n => n.toLowerCase().includes(q));
    voterListEl.innerHTML = '';
    matches.forEach(name => {
      const card = document.createElement('div');
      card.className = 'name-card';
      card.innerHTML = `<span class="name">${escapeHtml(name)}</span>`;
      makeActivatable(card, () => selectVoter(name));
      voterListEl.appendChild(card);
    });
    if (matches.length === 0) {
      voterListEl.innerHTML = '<p class="muted center">No names match.</p>';
    }
  }
  voterSearch.addEventListener('input', () => renderVoterList(voterSearch.value));

  function selectVoter(name) {
    state.voter = name;
    state.picks = [];
    clearError();
    candSearch.value = '';
    document.getElementById('rankVoter').textContent = `Voting as: ${name}`;
    document.getElementById('selfNote').hidden = false;
    document.getElementById('pickHint').textContent = '';
    renderCandList('');
    showStep('rank');
  }

  document.getElementById('btnBackToVoter').addEventListener('click', () => {
    state.voter = null;
    state.picks = [];
    voterSearch.value = '';
    renderVoterList('');
    showStep('voter');
  });

  // ---- Step 2: rank candidates ----
  const candSearch = document.getElementById('candSearch');
  const candListEl = document.getElementById('candList');
  const pickHint = document.getElementById('pickHint');
  const RANK_LABELS = ['1st · 3 pts', '2nd · 2 pts', '3rd · 1 pt'];
  const RANK_CLASSES = ['badge-1', 'badge-2', 'badge-3'];

  function renderCandList(query) {
    const q = query.trim().toLowerCase();
    const matches = ATTENDEES.filter(n => n.toLowerCase().includes(q));
    candListEl.innerHTML = '';
    matches.forEach(name => {
      const isSelf = name === state.voter;
      const pickIdx = state.picks.indexOf(name);
      const card = document.createElement('div');
      card.className = 'name-card' + (isSelf ? ' disabled' : '') + (pickIdx >= 0 ? ' selected' : '');
      let badge = '';
      if (pickIdx >= 0) {
        badge = `<span class="badge ${RANK_CLASSES[pickIdx]}">${RANK_LABELS[pickIdx]}</span>`;
      } else if (isSelf) {
        badge = `<span class="hint">You can't vote for yourself</span>`;
      }
      card.innerHTML = `<span class="name">${escapeHtml(name)}</span>${badge}`;
      if (isSelf) {
        card.setAttribute('aria-disabled', 'true');
      } else {
        makeActivatable(card, () => toggleCandidate(name));
        card.setAttribute('aria-pressed', pickIdx >= 0 ? 'true' : 'false');
      }
      candListEl.appendChild(card);
    });
    if (matches.length === 0) {
      candListEl.innerHTML = '<p class="muted center">No names match.</p>';
    }
    renderNav();
  }
  candSearch.addEventListener('input', () => renderCandList(candSearch.value));

  function toggleCandidate(name) {
    const idx = state.picks.indexOf(name);
    if (idx >= 0) {
      state.picks.splice(idx, 1);
      pickHint.textContent = '';
    } else {
      if (state.picks.length >= 3) {
        pickHint.textContent = 'You already have 3 picks — tap one of them to remove it first.';
        return;
      }
      state.picks.push(name);
      pickHint.textContent = '';
    }
    renderCandList(candSearch.value);
  }

  function movePick(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.picks.length) return;
    [state.picks[idx], state.picks[newIdx]] = [state.picks[newIdx], state.picks[idx]];
  }
  function removePick(idx) {
    state.picks.splice(idx, 1);
  }

  // ---- Nav area (continue to review) ----
  // Rendered from showStep() as well, so the button is present as soon as the
  // rank screen opens (previously it only appeared after the first tap).
  const navArea = document.getElementById('navArea');
  function renderNav() {
    navArea.innerHTML = '';
    const rankVisible = !document.getElementById('step-rank').hidden;
    if (rankVisible) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = `Review Picks (${state.picks.length}/3) →`;
      btn.disabled = state.picks.length === 0;
      btn.addEventListener('click', goToReview);
      navArea.appendChild(btn);
    }
  }

  function renderReview() {
    document.getElementById('reviewVoter').textContent = `Voting as: ${state.voter}`;
    const list = document.getElementById('reviewList');
    list.innerHTML = '';
    state.picks.forEach((name, idx) => {
      const row = document.createElement('div');
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="badge ${RANK_CLASSES[idx]}">${RANK_LABELS[idx]}</span>
        <span class="name">${escapeHtml(name)}</span>
        <div class="ctrls">
          <button class="icon-btn" data-act="up" ${idx === 0 ? 'disabled' : ''} title="Move up" aria-label="Move ${escapeHtml(name)} up">↑</button>
          <button class="icon-btn" data-act="down" ${idx === state.picks.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move ${escapeHtml(name)} down">↓</button>
          <button class="icon-btn" data-act="remove" title="Remove" aria-label="Remove ${escapeHtml(name)}">✕</button>
        </div>`;
      row.querySelector('[data-act="up"]').addEventListener('click', () => { movePick(idx, -1); renderReview(); });
      row.querySelector('[data-act="down"]').addEventListener('click', () => { movePick(idx, 1); renderReview(); });
      row.querySelector('[data-act="remove"]').addEventListener('click', () => { removePick(idx); renderReview(); });
      list.appendChild(row);
    });
    // An empty ballot must never be submittable.
    const empty = state.picks.length === 0;
    if (empty) {
      list.innerHTML = '<p class="muted center">You have no picks left. Go back and choose at least one person.</p>';
    }
    document.getElementById('btnSubmit').disabled = empty;
  }

  function goToReview() {
    if (state.picks.length === 0) return;
    clearError();
    renderReview();
    showStep('review');
  }

  document.getElementById('btnBackToRank').addEventListener('click', () => {
    clearError();
    renderCandList(candSearch.value);
    showStep('rank');
  });

  // ---- Step 3: submit ----
  let submitting = false;
  document.getElementById('btnSubmit').addEventListener('click', async () => {
    if (submitting || state.picks.length === 0 || !state.voter) return;
    submitting = true;
    clearError();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    let ok = false;
    try {
      await VoteStorage.submitVote(state.voter, state.picks.slice());
      ok = true;
      rememberVoted(state.voter);
      showStep('confirm');
      fireConfetti(document.body, 50);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable right now, so your vote was NOT recorded.', err.detail || 'Please tell the organiser — votes cannot be saved without the shared server.');
      } else if (err.isServerRejection) {
        showError(err.message);
      } else {
        showError('Unexpected error submitting your vote.', err.message);
      }
    } finally {
      submitting = false;
      btn.textContent = 'Submit Vote 🎁';
      // After a successful vote keep the button locked; otherwise let them retry.
      btn.disabled = ok || state.picks.length === 0;
    }
  });
});
