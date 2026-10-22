/* Cookie-independent JSON POST with bounded read retries.
   Writes keep their original tokens and are never replayed automatically. */
(function () {
  'use strict';
  const config = window.TICKET_CONFIG;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const readActions = new Set(['health', 'public', 'restore', 'guestbook']);
  const transientErrors = new Set(['CONNECT', 'TIMEOUT', 'NETWORK', 'BUSY', 'SERVER', 'RESPONSE']);
  // Share simultaneous reads across the ticket and guestbook controllers.
  const inFlightReads = new Map();
  const uuid = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  };
  function youtubeUrl(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(u.hostname) || u.username || u.password) return null;
      return u.href;
    } catch { return null; }
  }
  class TicketAPI {
    constructor() {
      this.preview = !config.endpoint;
      this.pending = new Map();
      this.generation = 0;
      this.connection = null;
      this.remote = null;
      this.remoteOrigin = null;
      this.needsReconnect = false;
      this.listener = event => this.onMessage(event);
      window.addEventListener('message', this.listener);
    }
    disconnect(generation, reason) {
      if (generation !== this.generation) return;
      clearTimeout(this.connectTimer);
      const rejectReady = this.rejectReady;
      this.resolveReady = this.rejectReady = null;
      this.connection = null;
      this.remote = this.remoteOrigin = null;
      this.iframe?.remove();
      this.iframe = null;
      if (rejectReady) rejectReady(reason);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error(reason.code, pending.action === 'issue'
          ? '발급 결과를 확인하지 못했어요. 같은 정보로 다시 누르면 중복 발급 없이 확인합니다.'
          : '서버 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.'));
      }
      this.pending.clear();
    }
    connect() {
      if (this.connection) return this.connection;
      let url;
      try {
        url = new URL(config.endpoint);
        if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw new Error();
      } catch { return Promise.reject(error('CONFIG', '발급 서버 주소를 확인해 주세요.')); }
      if (!/^https?:/.test(location.protocol)) return Promise.reject(error('CONFIG', '웹 주소에서 페이지를 열어 주세요.'));
      const generation = ++this.generation;
      this.needsReconnect = false;
      this.channel = uuid();
      url.searchParams.set('origin', location.origin);
      url.searchParams.set('channel', this.channel);
      this.connection = new Promise((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
        this.connectTimer = setTimeout(() => {
          this.disconnect(generation, error('CONNECT', '등록 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        }, 15000);
        const frame = document.createElement('iframe');
        this.iframe = frame;
        frame.title = '티켓 발급 서버 연결';
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        // Keep the bridge rendered without adding a visible or focusable element.
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        frame.referrerPolicy = 'no-referrer';
        frame.src = url.href;
        frame.addEventListener('error', () => {
          this.disconnect(generation, error('CONNECT', '등록 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        });
        document.body.append(frame);
      });
      return this.connection;
    }
    onMessage(event) {
      const data = event.data;
      if (!data || data.channel !== this.channel || data.type !== 'jukebox-bridge') return;
      let host;
      try { host = new URL(event.origin).hostname; } catch { return; }
      if (!event.origin.startsWith('https://') || !(host === 'script.googleusercontent.com' || host.endsWith('-script.googleusercontent.com'))) return;
      if (data.ready && this.resolveReady) {
        this.remote = event.source;
        this.remoteOrigin = event.origin;
        clearTimeout(this.connectTimer);
        const resolve = this.resolveReady;
        this.resolveReady = this.rejectReady = null;
        this.remote.postMessage({ type: 'jukebox-connect', channel: this.channel }, this.remoteOrigin);
        resolve();
        return;
      }
      if (event.source !== this.remote || event.origin !== this.remoteOrigin) return;
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.requestId);
      if (data.result?.ok === true) pending.resolve(data.result.data);
      else pending.reject(error(data.result?.code || 'SERVER', data.result?.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.'));
      this.resetWhenIdle();
    }
    resetWhenIdle() {
      // Leave the Google frame alive until every other in-flight request settles.
      if (this.needsReconnect && this.pending.size === 0) {
        this.disconnect(this.generation, error('TIMEOUT', '서버 연결을 새로 확인합니다.'));
      }
    }
    async sendBridge(action, payload) {
      await this.connect();
      const requestId = uuid();
      const generation = this.generation;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const pending = this.pending.get(requestId);
          if (!pending || generation !== this.generation) return;
          this.pending.delete(requestId);
          this.needsReconnect = true;
          pending.reject(error('TIMEOUT', action === 'issue'
            ? '발급 결과를 확인하지 못했어요. 같은 브라우저에서 다시 확인해 주세요.'
            : '서버 응답이 늦어졌어요. 잠시 후 다시 확인해 주세요.'));
          this.resetWhenIdle();
        }, ['public', 'restore'].includes(action) ? 20000 : 40000);
        this.pending.set(requestId, { resolve, reject, timer, action });
        try {
          this.remote.postMessage({ type: 'jukebox-request', channel: this.channel, requestId, action, payload }, this.remoteOrigin);
        } catch {
          this.disconnect(generation, error('CONNECT', '등록 서버에 연결하지 못했어요.'));
        }
      });
    }
    async sendHTTP(action, payload = {}, timeoutMs) {
      let endpoint;
      try {
        endpoint = new URL(config.endpoint);
        if (endpoint.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(endpoint.pathname)) throw new Error();
      } catch { throw error('CONFIG', '발급 서버 주소를 확인해 주세요.'); }
      const requestId = uuid();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),
        timeoutMs || (readActions.has(action) ? 20000 : 40000));
      try {
        // A simple POST avoids OPTIONS preflight and does not depend on Google cookies.
        // Tokens and personal input stay in the POST body, never in the URL.
        const response = await fetch(endpoint.href, {
          method: 'POST', mode: 'cors', credentials: 'omit', redirect: 'follow',
          referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ protocol: 'jukebox-http-v1', requestId, action, payload, pageOrigin: location.origin }),
          signal: controller.signal
        });
        if (!response.ok) throw error(response.status === 429 ? 'BUSY' : 'NETWORK', '서버 연결이 늦어지고 있어요. 잠시 후 다시 확인해 주세요.');
        let result;
        try { result = JSON.parse(await response.text()); }
        catch { throw error('RESPONSE', '서버 응답을 읽지 못했어요. 잠시 후 다시 확인해 주세요.'); }
        if (result?.protocol !== 'jukebox-http-v1' || result.requestId !== requestId) {
          throw error('RESPONSE', '발급 서버의 응답을 확인하지 못했어요.');
        }
        if (result.ok !== true) throw error(result.code || 'SERVER', result.message || '요청을 처리하지 못했어요.');
        return result.data;
      } catch (e) {
        if (controller.signal.aborted) throw error('TIMEOUT', '서버 응답이 늦어졌어요. 잠시 후 다시 확인해 주세요.');
        if (typeof e.code === 'string') throw e;
        throw error('NETWORK', '발급 서버에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.');
      } finally { clearTimeout(timer); }
    }
    async send(action, payload, timeoutMs) {
      const mode = config.directRequests ? 'http' : 'bridge';
      document.documentElement?.setAttribute('data-ticket-transport', mode);
      // The deployed server supports HTTP. A separate health probe doubles the
      // first lookup and a temporary probe failure used to pin this page to an iframe.
      return mode === 'http' ? this.sendHTTP(action, payload, timeoutMs) : this.sendBridge(action, payload);
    }
    async issue(payload, onRecovery = () => {}) {
      try { return await this.request('issue', payload); }
      catch (issueError) {
        if (!transientErrors.has(issueError.code)) throw issueError;
        onRecovery();
        // The write may already be committed. Look it up by the same stored token.
        // Never manufacture a successful ticket or create a second issuance here.
        try {
          const ticket = await this.request('restore', { token: payload.token });
          if (ticket) return ticket;
        } catch {}
        throw error(issueError.code,
          '발급 여부를 확인하지 못했어요. 잠시 후 이 브라우저에서 ‘내 티켓 다시 확인’을 눌러 주세요.');
      }
    }
    request(action, payload = {}) {
      if (this.preview) {
        if (action === 'public') return Promise.resolve({ issued: null, capacity: config.capacity, tracks: [] });
        if (action === 'guestbook') return Promise.resolve({ messages: [] });
        return Promise.reject(error('PREVIEW', '미리보기에서는 실제 발급을 하지 않습니다.'));
      }
      const read = readActions.has(action);
      const key = read ? JSON.stringify([config.endpoint, action, payload]) : null;
      if (read && inFlightReads.has(key)) return inFlightReads.get(key);
      const execute = async () => {
        const attempts = read ? 2 : 1;
        for (let attempt = 0; attempt < attempts; attempt++) {
          try { return await this.send(action, payload, read ? (attempt ? 20000 : 12000) : 40000); }
          catch (e) {
            if (attempt + 1 >= attempts || !transientErrors.has(e.code)) throw e;
            // A short pause recovers transient HTTP failures without creating a
            // second write. Bridge reconnection retains its existing safeguards.
            if (config.directRequests) await new Promise(resolve => setTimeout(resolve, 600));
          }
        }
      };
      const result = execute();
      if (!read) return result;
      const shared = result.finally(() => { if (inFlightReads.get(key) === shared) inFlightReads.delete(key); });
      inFlightReads.set(key, shared);
      return shared;
    }
  }
  window.Jukebox = { TicketAPI, youtubeUrl, uuid };
})();
