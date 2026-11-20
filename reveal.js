// Top 3 reveal page: opened from results.html in its own tab (good for a projector).
document.addEventListener('DOMContentLoaded', () => {
  initFx();

  // No PIN here: the reveal only ever receives the Top 3 names + points (GET /api/votes/reveal).
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const btnNext = $('btnRevealNext');
  const btnRefresh = $('btnRefresh');

  let queue = [];   // [[row, ...tied rows], ...] in reveal order: 3rd -> 2nd -> 1st
  let idx = -1;     // -1 = nothing revealed yet; queue.length = podium shown

  function showError(msg, detail) {
    $('errorArea').innerHTML =
      `<div class="error-banner" role="alert"><strong>Something's not right</strong>${escapeHtml(msg)}${detail ? '<br><span class="muted">' + escapeHtml(detail) + '</span>' : ''}</div>`;
  }
  function clearError() { $('errorArea').innerHTML = ''; }

  // Returns 'ok' | 'error'
  async function load() {
    clearError();
    try {
      const data = await VoteStorage.getReveal();
      queue = Array.isArray(data && data.groups) ? data.groups : [];
      resetStage();
      return 'ok';
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        showError('Shared vote storage is unavailable, so the results cannot be loaded.', err.detail);
      } else {
        showError('Unexpected error loading results.', err.message);
      }
      return 'error';
    }
  }

  function renderDots() {
    const dots = $('dots');
    dots.innerHTML = '';
    queue.forEach((_, i) => {
      const d = document.createElement('span');
      d.className = 'dot' + (i <= idx ? ' on' : '');
      dots.appendChild(d);
    });
  }

  function resetStage() {
    idx = -1;
    $('podium').hidden = true;
    $('podium').innerHTML = '';
    $('revealName').hidden = false;
    $('revealPts').hidden = false;
    $('revealName').textContent = ' ';
    $('revealPts').textContent = '';
    btnRefresh.hidden = false;
    if (queue.length === 0) {
      $('revealLabel').textContent = 'No votes yet';
      $('revealPts').textContent = 'Come back once people have voted, then refresh.';
      btnNext.disabled = true;
    } else {
      $('revealLabel').textContent = 'Get ready…';
      btnNext.textContent = 'Reveal Next 🎄';
      btnNext.disabled = false;
    }
    renderDots();
    stage.hidden = false;
  }

  function placeLabel(place) {
    return place === 1 ? '🥇 First Place' : place === 2 ? '🥈 Second Place' : '🥉 Third Place';
  }

  function showPodium() {
    // 1st -> 3rd, top to bottom
    const podium = $('podium');
    podium.innerHTML = '';
    queue.slice().reverse().forEach(group => {
      const place = group[0].place;
      const row = document.createElement('div');
      row.className = 'podium-row';
      const badge = document.createElement('span');
      badge.className = 'badge badge-' + Math.min(place, 3);
      badge.textContent = place === 1 ? '🥇 1st' : place === 2 ? '🥈 2nd' : '🥉 3rd';
      const name = document.createElement('span');
      name.className = 'podium-name';
      name.textContent = group.map(g => g.name).join(' & ');
      const pts = document.createElement('span');
      pts.className = 'muted';
      pts.textContent = group[0].points + ' pts' + (group.length > 1 ? ' (tie)' : '');
      row.append(badge, name, pts);
      podium.appendChild(row);
    });
    $('revealLabel').textContent = 'Congratulations! 🎉';
    $('revealName').hidden = true;
    $('revealPts').hidden = true;
    podium.hidden = false;
  }

  function revealNext() {
    if (btnNext.disabled || queue.length === 0) return;
    btnRefresh.hidden = true;   // refreshing mid-reveal would change the order
    idx++;
    if (idx < queue.length) {
      const group = queue[idx];
      $('revealLabel').textContent = placeLabel(group[0].place);
      $('revealName').textContent = group.map(g => g.name).join(' & ');
      $('revealPts').textContent = group[0].points + ' pts' + (group.length > 1 ? ' (tie)' : '');
      fireConfetti(document.body, 90);
      btnNext.textContent = idx === queue.length - 1 ? 'Show Podium 🏆' : 'Reveal Next 🎄';
    } else {
      showPodium();
      fireConfetti(document.body, 140);
      btnNext.disabled = true;
    }
    renderDots();
  }

  btnNext.addEventListener('click', revealNext);
  document.addEventListener('keydown', e => {
    if (stage.hidden) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'A') return;   // buttons handle Space/Enter themselves
    if (e.key === ' ' || e.key === 'ArrowRight') {
      e.preventDefault();
      revealNext();
    }
  });

  btnRefresh.addEventListener('click', load);

  $('btnFullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  });

  $('btnClose').addEventListener('click', () => {
    window.close();   // only works for tabs opened by script
    setTimeout(() => { window.location.href = 'results.html'; }, 150);
  });

  // ---- Start ----
  load();
});
