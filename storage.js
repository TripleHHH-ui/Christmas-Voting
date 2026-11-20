// Shared same-origin server storage client.
// IMPORTANT: Per spec, this app must NEVER silently fall back to per-device
// (localStorage-only) vote storage. If the shared same-origin backend is not
// reachable, every call here throws StorageUnavailableError and the UI must
// show a clear blocking error to the user instead of proceeding.
//
// This client expects a same-origin JSON API:
//   GET  /api/votes/state   -> { votes: { "<voterName>": ["pick1","pick2","pick3"] }, updatedAt }
//   POST /api/votes/submit  body { voter, picks }   -> { ok: true, state }
//   POST /api/votes/reset   body { confirm: "RESET" } -> { ok: true, state }
// If this endpoint does not exist on the current deployment, all requests
// will fail (404 / network error) and StorageUnavailableError is surfaced.

class StorageUnavailableError extends Error {
  constructor(detail) {
    super('Shared vote storage is unavailable.');
    this.detail = detail;
  }
}

const VoteStorage = (() => {
  const BASE = 'api/votes';

  async function call(path, opts) {
    let res;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: opts && opts.method ? opts.method : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: opts && opts.body ? JSON.stringify(opts.body) : undefined
      });
    } catch (err) {
      throw new StorageUnavailableError('Network error contacting shared storage: ' + err.message);
    }
    if (!res.ok) {
      let msg = `Server returned ${res.status}`;
      try {
        const j = await res.json();
        if (j && j.error) msg = j.error;
      } catch (_) { /* ignore */ }
      if (res.status === 404 || res.status === 501) {
        throw new StorageUnavailableError('Shared storage endpoint not found (' + res.status + ').');
      }
      const e = new Error(msg);
      e.isServerRejection = true;
      throw e;
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw new StorageUnavailableError('Shared storage returned an invalid response.');
    }
    return data;
  }

  return {
    async getState() {
      return call('state');
    },
    async submitVote(voter, picks) {
      return call('submit', { method: 'POST', body: { voter, picks } });
    },
    async resetVotes() {
      return call('reset', { method: 'POST', body: { confirm: 'RESET' } });
    }
  };
})();
