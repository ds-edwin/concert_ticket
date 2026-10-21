/* A Google Apps Script iframe bridge avoids opaque no-cors responses.
   Only a confirmed server response is treated as a successful issue. */
(function () {
  'use strict';
  const config = window.TICKET_CONFIG;
  const error = (code, message) => Object.assign(new Error(message), { code });
  const uuid = () => crypto.randomUUID();
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
      this.channel = uuid();
      this.connection = null;
      this.remote = null;
      this.remoteOrigin = null;
      this.listener = event => this.onMessage(event);
      window.addEventListener('message', this.listener);
    }
    connect() {
      if (this.connection) return this.connection;
      this.connection = new Promise((resolve, reject) => {
        let url;
        try {
          url = new URL(config.endpoint);
          if (url.origin !== 'https://script.google.com' || !/^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) throw new Error();
        } catch { reject(error('CONFIG', '발급 서버 주소를 확인해 주세요.')); return; }
        if (!/^https?:/.test(location.protocol)) { reject(error('CONFIG', '웹 주소에서 페이지를 열어 주세요.')); return; }
        url.searchParams.set('origin', location.origin);
        url.searchParams.set('channel', this.channel);
        this.resolveReady = resolve;
        this.connectTimer = setTimeout(() => {
          this.connection = null;
          this.iframe?.remove();
          this.iframe = null;
          this.resolveReady = null;
          reject(error('CONNECT', '발급 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        }, 25000);
        this.iframe = document.createElement('iframe');
        this.iframe.title = '티켓 발급 서버 연결';
        this.iframe.hidden = true;
        this.iframe.referrerPolicy = 'no-referrer';
        this.iframe.src = url.href;
        document.body.append(this.iframe);
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
        this.resolveReady();
        this.resolveReady = null;
        this.remote.postMessage({ type: 'jukebox-connect', channel: this.channel }, this.remoteOrigin);
        return;
      }
      if (event.source !== this.remote || event.origin !== this.remoteOrigin) return;
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(data.requestId);
      if (data.result?.ok === true) pending.resolve(data.result.data);
      else pending.reject(error(data.result?.code || 'SERVER', data.result?.message || '요청을 처리하지 못했어요. 다시 시도해 주세요.'));
    }
    async request(action, payload = {}) {
      if (this.preview) {
        if (action === 'public') return { issued: null, capacity: config.capacity, tracks: [] };
        throw error('PREVIEW', '미리보기에서는 실제 발급을 하지 않습니다.');
      }
      await this.connect();
      const requestId = uuid();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(requestId);
          reject(error('TIMEOUT', '처리 결과를 확인하지 못했어요. 같은 정보로 다시 누르면 중복 발급 없이 결과를 확인합니다.'));
        }, 40000);
        this.pending.set(requestId, { resolve, reject, timer });
        this.remote.postMessage({ type: 'jukebox-request', channel: this.channel, requestId, action, payload }, this.remoteOrigin);
      });
    }
  }
  window.Jukebox = { TicketAPI, youtubeUrl, uuid };
})();
