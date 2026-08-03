// UI da integração com Google Agenda: status/conectar na Agenda, botão de
// enviar por missão, envio em lote do dia. Depende de window.PdmGCal (dados/
// API) e de pdmToast/pdmCloseModal/pdmRenderAll/pdmOpenMissionDetail.

(function () {
  function pdmRenderGCalStatus() {
    const el = document.getElementById('pdmGCalStatus');
    if (!el || !window.PdmGCal) return;
    if (PdmGCal.isConnected()) {
      el.innerHTML =
        '<span class="pdm-mission-badge" style="border-color:var(--gold);color:var(--gold-pale);">Google Agenda conectado</span>' +
        '<button class="pdm-head-btn" onclick="pdmGCalPushToday()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
          'Enviar hoje' +
        '</button>' +
        '<button class="pdm-btn-ghost" style="margin-top:0;" onclick="pdmGCalDisconnect()">Desconectar</button>';
    } else {
      el.innerHTML =
        '<button class="pdm-head-btn" onclick="pdmGCalConnectFlow()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
          'Conectar Google Agenda' +
        '</button>';
    }
  }

  function pdmOpenGCalConfigModal() {
    document.getElementById('pdmGCalConfigModal').classList.add('open');
  }

  function pdmSubmitGCalConfig() {
    const input = document.getElementById('gcalClientIdInput');
    const id = input.value.trim();
    if (!id) { pdmToast('Cole o Client ID do Google Cloud.'); return; }
    PdmGCal.setClientId(id);
    pdmCloseModal('pdmGCalConfigModal');
    pdmGCalConnectFlow();
  }

  function pdmGCalConnectFlow() {
    if (!window.PdmGCal) return;
    if (!PdmGCal.isConfigured()) { pdmOpenGCalConfigModal(); return; }
    PdmGCal.connect().then(() => {
      pdmToast('Google Agenda conectado.');
      pdmRenderGCalStatus();
    }).catch(() => {
      pdmToast('Não deu pra conectar ao Google Agenda agora.');
    });
  }

  function pdmGCalDisconnect() {
    PdmGCal.disconnect();
    pdmRenderGCalStatus();
    pdmToast('Desconectado do Google Agenda.');
  }

  async function pdmGCalPushToday() {
    const missions = PdmHM.listMissionsForDate(todayISO()).filter((m) => m.status !== 'cancelada');
    if (!missions.length) { pdmToast('Nenhuma missão hoje pra enviar.'); return; }
    let ok = 0, fail = 0;
    for (const m of missions) {
      try {
        const eventId = await PdmGCal.pushMission(m);
        PdmHM.setMissionGCalEventId(m.id, eventId);
        ok++;
      } catch (e) { fail++; }
    }
    window.pdmRenderAll();
    pdmToast(ok + ' missão(ões) enviada(s) pro Google Agenda' + (fail ? ' — ' + fail + ' falharam.' : '.'));
  }

  async function pdmUIPushMissionToGCal(id) {
    const m = PdmHM.getMission(id);
    if (!m || !window.PdmGCal) return;
    if (!PdmGCal.isConfigured()) { pdmCloseModal('pdmMissionModal'); pdmOpenGCalConfigModal(); return; }
    pdmToast('Enviando pro Google Agenda...');
    try {
      const eventId = await PdmGCal.pushMission(m);
      PdmHM.setMissionGCalEventId(id, eventId);
      pdmToast('Missão enviada pro Google Agenda.');
      if (document.getElementById('pdmMissionModal').classList.contains('open')) pdmOpenMissionDetail(id);
    } catch (e) {
      pdmToast('Não deu pra enviar essa missão agora.');
    }
  }

  Object.assign(window, {
    pdmRenderGCalStatus, pdmOpenGCalConfigModal, pdmSubmitGCalConfig,
    pdmGCalConnectFlow, pdmGCalDisconnect, pdmGCalPushToday, pdmUIPushMissionToGCal,
  });
})();
