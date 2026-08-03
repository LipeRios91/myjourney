// Integração com Google Agenda — UNIDIRECIONAL (app -> Google), por enquanto.
//
// Não existe backend nesta aplicação (ver CLAUDE.md), então isso usa OAuth
// de "cliente público" via Google Identity Services (GIS), que funciona
// inteiramente no navegador: o app pede um access token de curta duração
// direto do Google, sem precisar de client secret nem servidor.
//
// Limitações conscientes desta v1:
// - Só EMPURRA missões pro Google Agenda (cria/atualiza eventos). Não hoje
//   traz de volta edições feitas direto no Google Agenda — isso seria
//   sincronização bidirecional de verdade, que precisaria de webhooks
//   (push notifications da API do Google), e webhook exige um endpoint de
//   servidor pra receber a notificação. Sem backend, não dá pra fazer isso
//   agora — ver CLAUDE.md.
// - O token dura ~1h. Sem backend não dá pra guardar um refresh token com
//   segurança, então cada sessão do navegador pode pedir login de novo
//   (geralmente silencioso, se o usuário continua logado no Google).

(function () {
  const CLIENT_ID_KEY = 'mestre-gcal-client-id';
  const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;

  function getClientId() { return (localStorage.getItem(CLIENT_ID_KEY) || '').trim(); }
  function setClientId(id) { localStorage.setItem(CLIENT_ID_KEY, (id || '').trim()); }
  function isConfigured() { return !!getClientId(); }
  function isConnected() { return !!accessToken && Date.now() < tokenExpiresAt; }

  function loadGis() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('gis-load-failed'));
      document.head.appendChild(script);
    });
  }

  // interactive=true mostra o popup de login/consentimento do Google;
  // interactive=false tenta renovar o token em silêncio (funciona se o
  // usuário já autorizou antes e continua logado no Google no navegador).
  async function ensureToken(interactive) {
    if (isConnected()) return accessToken;
    const clientId = getClientId();
    if (!clientId) throw new Error('no-client-id');
    await loadGis();
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp && resp.error) { reject(new Error(resp.error)); return; }
          accessToken = resp.access_token;
          tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3000) * 1000) - 60000;
          resolve(accessToken);
        },
        error_callback: (err) => reject(err || new Error('gis-error')),
      });
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    });
  }

  async function connect() { await ensureToken(true); }

  function disconnect() {
    if (accessToken && window.google && window.google.accounts) {
      try { google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) { /* ignora */ }
    }
    accessToken = null;
    tokenExpiresAt = 0;
  }

  async function apiFetch(path, options) {
    await ensureToken(false);
    options = options || {};
    const headers = Object.assign({ Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, options.headers || {});
    const res = await fetch('https://www.googleapis.com/calendar/v3' + path, Object.assign({}, options, { headers }));
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error('gcal-api-' + res.status + ': ' + bodyText.slice(0, 200));
    }
    return res.status === 204 ? null : res.json();
  }

  function addMinutes(hhmm, minutes) {
    const [h, m] = hhmm.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const wrapped = ((total % 1440) + 1440) % 1440;
    return String(Math.floor(wrapped / 60)).padStart(2, '0') + ':' + String(wrapped % 60).padStart(2, '0');
  }

  function missionToEventBody(m) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let start, end;
    if (m.time) {
      start = { dateTime: m.date + 'T' + m.time + ':00', timeZone: tz };
      end = { dateTime: m.date + 'T' + addMinutes(m.time, m.durationMin || 30) + ':00', timeZone: tz };
    } else {
      start = { date: m.date };
      end = { date: m.date };
    }
    const descParts = [];
    if (m.description) descParts.push(m.description);
    if (m.notes) descParts.push('Observações: ' + m.notes);
    descParts.push('Criado pelo Passe do Mestre.');
    return { summary: m.name, description: descParts.join('\n\n'), start, end };
  }

  // Cria (ou atualiza, se já enviada antes) o evento no Google Agenda
  // correspondente a uma missão. Retorna o id do evento.
  async function pushMission(mission) {
    const body = missionToEventBody(mission);
    if (mission.gcalEventId) {
      try {
        const updated = await apiFetch('/calendars/primary/events/' + mission.gcalEventId, { method: 'PATCH', body: JSON.stringify(body) });
        return updated.id;
      } catch (e) {
        // evento pode ter sido apagado direto no Google — cria um novo
        if (!String(e.message).includes('gcal-api-404')) throw e;
      }
    }
    const created = await apiFetch('/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
    return created.id;
  }

  window.PdmGCal = {
    isConfigured, isConnected, getClientId, setClientId,
    connect, disconnect, pushMission,
  };
})();
