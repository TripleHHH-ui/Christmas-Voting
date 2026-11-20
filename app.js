// Voting page logic.
document.addEventListener('DOMContentLoaded', () => {
  initFx();

  const LOCAL_VOTED_KEY = 'ghmg_already_voted_name';

  const state = {
    voter: null,
    picks: [] // ordered array of names, rank = index+1
  };

  const steps = ['welcome', 'voter', 'rank', 'review', 'confirm'];
  function showStep(name) {
    steps.forEach(s => {
      document.getElementById('step-' + s).hidden = (s !== name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showError(msg, detail) {
    const area = document.getElementById('errorArea');
    area.innerHTML = `<div class="error-banner"><strong>Something's not right</strong>${msg}${detail ? '<br><span class="muted">' + detail + '</span>' : ''}</div>`;
  }
  function clearError() {
    document.getElementById('errorArea').innerHTML = '';
  }

  // ---- Step 0 ----
  document.getElementById('btnStart').addEventListener('click', () => {
    const already = localStorage.getItem(LOCAL_VOTED_KEY);
    if (already) {
      showError(`It looks like "${already}" already voted from this phone.`, 'If this is wrong, please see the organiser.');
    }
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
      card.addEventListener('click', () => selectVoter(name));
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
    renderCandList('');
    const note = document.getElementById('selfNote');
    note.hidden = false;
    showStep('rank');
  }

  // ---- Step 2: rank candidates ----
  const candSearch = document.getElementById('candSearch');
  const candListEl = document.getElementById('candList');
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
      if (!isSelf) {
        card.addEventListener('click', () => toggleCandidate(name));
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
    } else {
      if (state.picks.length >= 3) return;
      state.picks.push(name);
    }
    renderCandList(candSearch.value);
  }

  function movePick(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.picks.length) return;
    [state.picks[idx], state.picks[newIdx]] = [state.picks[newIdx], state.picks[idx]];
    renderCandList(candSearch.value);
  }
  function removePick(idx) {
    state.picks.splice(idx, 1);
    renderCandList(candSearch.value);
  }

  // ---- Nav area (continue to review) ----
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

  function goToReview() {
    const reviewVoter = document.getElementById('reviewVoter');
    reviewVoter.textContent = `Voting as: ${state.voter}`;
    const list = document.getElementById('reviewList');
    list.innerHTML = '';
    state.picks.forEach((name, idx) => {
      const row = document.createElement('div');
      row.className = 'pick-row';
      row.innerHTML = `
        <span class="badge ${RANK_CLASSES[idx]}">${RANK_LABELS[idx]}</span>
        <span class="name">${escapeHtml(name)}</span>
        <div class="ctrls">
          <button class="icon-btn" data-act="up" ${idx === 0 ? 'disabled' : ''} title="Move up">↑</button>
          <button class="icon-btn" data-act="down" ${idx === state.picks.length - 1 ? 'disabled' : ''} title="Move down">↓</button>
          <button class="icon-btn" data-act="remove" title="Remove">✕</button>
        </div>`;
      row.querySelector('[data-act="up"]').addEventListener('click', () => { movePick(idx, -1); goToReview(); });
      row.querySelector('[data-act="down"]').addEventListener('click', () => { movePick(idx, 1); goToReview(); });
      row.querySelector('[data-act="remove"]').addEventListener('click', () => { removePick(idx); goToReview(); });
      list.appendChild(row);
    });
    navArea.innerHTML = '';
    showStep('review');
  }

  document.getElementById('btnBackToRank').addEventListener('click', () => {
    renderCandList(candSearch.value);
    showStep('rank');
  });

  // ---- Step 3: submit ----
  document.getElementById('btnSubmit').addEventListener('click', async () => {
    clearError();
    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      await VoteStorage.submitVote(state.voter, state.picks);
      localStorage.setItem(LOCAL_VOTED_KEY, state.voter);
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
      btn.disabled = false;
      btn.textContent = 'Submit Vote 🎁';
    }
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
});
