// UI da sincronização em nuvem: painel/status na view Perfil + modal de
// configuração do projeto Firebase. Depende de window.PdmSync (dados/API) e
// de pdmToast/pdmCloseModal/pdmConfirmGeneric/pdmRenderAll.

(function () {
  function pdmRenderSyncStatus() {
    const el = document.getElementById('pdmSyncStatus');
    if (!el || !window.PdmSync) return;
    if (!PdmSync.isConfigured()) {
      el.innerHTML =
        '<button class="pdm-head-btn" onclick="pdmOpenSyncConfigModal()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/></svg>' +
          'Configurar sincronização' +
        '</button>';
    } else if (!PdmSync.isSignedIn()) {
      // Com a config embutida (js/sync-defaults.js) este é o estado normal de
      // um aparelho novo ou recém-limpo: já sabe onde está a nuvem, só falta
      // provar quem é.
      el.innerHTML =
        '<span class="pdm-mission-badge" style="border-color:var(--line);color:var(--dim);">Pronto — falta entrar</span>' +
        '<button class="pdm-head-btn" onclick="pdmSyncConnectFlow()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>' +
          'Entrar com Google' +
        '</button>';
    } else {
      el.innerHTML =
        '<span class="pdm-mission-badge" style="border-color:var(--gold);color:var(--gold-pale);">Sincronizado — ' + (PdmSync.getUserEmail() || '') + '</span>' +
        '<button class="pdm-btn-ghost" style="margin-top:0;" onclick="pdmSyncDisconnect()">Desconectar</button>';
    }
  }

  function pdmOpenSyncConfigModal() {
    // getStoredConfig (não getConfig): a config embutida no app não deve
    // aparecer aqui como se o usuário a tivesse digitado.
    const cfg = PdmSync.getStoredConfig() || {};
    ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].forEach((f) => {
      const input = document.getElementById('syncCfg_' + f);
      if (input) input.value = cfg[f] || '';
    });
    document.getElementById('pdmSyncConfigModal').classList.add('open');
  }

  function pdmSubmitSyncConfig() {
    const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const cfg = {};
    let missing = false;
    fields.forEach((f) => {
      const v = (document.getElementById('syncCfg_' + f).value || '').trim();
      if (!v) missing = true;
      cfg[f] = v;
    });
    if (missing) { pdmToast('Preencha todos os campos da configuração do Firebase.'); return; }
    PdmSync.setConfig(cfg);
    pdmCloseModal('pdmSyncConfigModal');
    pdmSyncConnectFlow();
  }

  function pdmSyncConnectFlow() {
    if (!window.PdmSync) return;
    if (!PdmSync.isConfigured()) { pdmOpenSyncConfigModal(); return; }
    const doConnect = () => {
      pdmToast('Conectando...');
      PdmSync.connect().then((res) => {
        pdmRenderSyncStatus();
        window.pdmRenderAll();
        const action = res && res.sync ? res.sync.action : null;
        if (action === 'conflict') {
          // Dado dos dois lados: quem decide é o usuário, não o app.
          if (window.pdmOpenSyncConflictModal) window.pdmOpenSyncConflictModal();
          return;
        }
        if (action === 'pull' && res.sync.restored) pdmToast('Dados restaurados da nuvem.');
        else if (action === 'push' && res.sync.restoredCloud) pdmToast('Seus dados foram enviados pra nuvem.');
        else pdmToast('Sincronização conectada.');
      }).catch(() => {
        pdmToast('Não deu pra conectar a sincronização agora.');
      });
    };
    pdmConfirmGeneric(
      'Conectar sincronização',
      'Seu progresso passa a ter uma cópia na sua conta Google. Se já houver dados dos dois lados (aqui e na nuvem), o app pergunta qual manter antes de substituir qualquer coisa — nada é apagado sem você escolher.',
      doConnect
    );
  }

  function pdmSyncDisconnect() {
    PdmSync.disconnect().then(() => {
      pdmRenderSyncStatus();
      pdmToast('Desconectado da sincronização.');
    });
  }

  Object.assign(window, {
    pdmRenderSyncStatus, pdmOpenSyncConfigModal, pdmSubmitSyncConfig,
    pdmSyncConnectFlow, pdmSyncDisconnect,
  });
})();
