// UI de proteção de dados — painel "Seus dados" em Configurações e o modal
// de conflito de sincronização.
//
// Consome window.PdmBackup (arquivo de backup, peso do dado, armazenamento
// persistente) e window.PdmSync (conflito pendente, reenvio pra nuvem).
// Nenhuma regra própria aqui: este arquivo só pergunta, mostra e confirma.

(function () {
  // ---------------------------------------------------------------
  // PAINEL "SEUS DADOS" (view config)
  // ---------------------------------------------------------------
  function pdmRenderBackupStatus() {
    const el = document.getElementById('pdmBackupStatus');
    if (!el || !window.PdmBackup) return;

    const weight = PdmBackup.weightOfLocal();
    const parts = PdmBackup.describeLocal();
    const days = PdmBackup.daysSinceLastExport();

    // O indicador principal é a NUVEM (salva sozinha a cada mudança), não o
    // arquivo. O backup manual é rede de segurança extra, então não deve
    // cobrar o usuário como se fosse tarefa obrigatória — só avisa quando a
    // nuvem não está protegendo nada.
    const cloudOn = !!(window.PdmSync && PdmSync.isSignedIn());
    let badge;
    if (cloudOn) {
      badge = '<span class="pdm-mission-badge" style="border-color:var(--gold);color:var(--gold-pale);">✓ Salvando na nuvem automaticamente</span>';
    } else if (weight === 0) {
      badge = '<span class="pdm-mission-badge" style="border-color:var(--line);color:var(--dim);">Nada salvo neste aparelho</span>';
    } else {
      badge = '<span class="pdm-mission-badge" style="border-color:var(--rose);color:var(--rose-pale);">Só neste aparelho — sem cópia na nuvem</span>';
    }
    const backupLine = days === null
      ? 'Nenhum backup em arquivo ainda.'
      : (days === 0 ? 'Último backup em arquivo: hoje.' : 'Último backup em arquivo: há ' + days + (days === 1 ? ' dia' : ' dias') + '.');

    el.innerHTML =
      badge +
      '<button class="pdm-head-btn" onclick="pdmExportBackup()">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>' +
        'Baixar backup' +
      '</button>' +
      '<button class="pdm-head-btn" onclick="pdmOpenImportBackup()">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 21h14"/></svg>' +
        'Restaurar backup' +
      '</button>' +
      '<div class="pdm-backup-detail">' +
        (weight > 0
          ? 'Neste aparelho agora: ' + escapeHtml(parts.join(' · ') || weight + ' itens') + '. '
          : 'Nenhum dado neste aparelho ainda. ') +
        escapeHtml(backupLine) +
      '</div>';

    renderStorageLine();
  }

  async function renderStorageLine() {
    const el = document.getElementById('pdmStorageStatus');
    if (!el || !window.PdmBackup) return;
    const st = await PdmBackup.getStorageStatus();
    const usage = st.usageMb != null ? st.usageMb + ' MB usados' : null;
    if (!st.supported) {
      el.innerHTML = '<div class="pdm-backup-detail">Este navegador não informa se o armazenamento é permanente. Mantenha backups em dia.</div>';
      return;
    }
    el.innerHTML = '<div class="pdm-backup-detail">' +
      (st.persisted
        ? '✓ Armazenamento marcado como permanente — o navegador não vai descartar seus dados sozinho.'
        : '⚠ Armazenamento não é permanente: o navegador pode descartar os dados se faltar espaço ou se o app ficar muito tempo sem ser aberto. Instalar o app na tela inicial costuma resolver.') +
      (usage ? ' (' + usage + ')' : '') +
      '</div>';
  }

  // ---------------------------------------------------------------
  // EXPORTAR
  // ---------------------------------------------------------------
  function pdmExportBackup() {
    if (!window.PdmBackup) return;
    const weight = PdmBackup.weightOfLocal();
    if (weight === 0) {
      pdmToast('Não há dados pra exportar ainda.');
      return;
    }
    try {
      PdmBackup.exportToFile();
      pdmToast('Backup baixado. Guarde num lugar seguro.');
      pdmRenderBackupStatus();
    } catch (e) {
      pdmToast('Não deu pra gerar o backup agora.');
    }
  }

  // ---------------------------------------------------------------
  // IMPORTAR — nunca aplica direto: valida, mostra o que tem dentro e o que
  // vai ser substituído, e só então o usuário confirma.
  // ---------------------------------------------------------------
  function pdmOpenImportBackup() {
    const input = document.getElementById('pdmBackupFileInput');
    if (input) { input.value = ''; input.click(); }
  }

  async function pdmHandleBackupFile(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file || !window.PdmBackup) return;
    let obj;
    try {
      obj = await PdmBackup.readBackupFile(file);
    } catch (e) {
      pdmToast(String((e && e.message) || 'Arquivo inválido.'));
      return;
    }
    const check = PdmBackup.validateBackup(obj);
    if (!check.ok) { pdmToast(check.error); return; }

    const currentWeight = PdmBackup.weightOfLocal();
    const when = check.exportedAt
      ? isoToDate(String(check.exportedAt).slice(0, 10)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : 'data desconhecida';
    const inside = check.describe.length ? check.describe.join(' · ') : (check.weight + ' itens');

    let text = 'Backup de ' + when + ', contendo: ' + inside + '.';
    if (currentWeight > 0) {
      text += '\n\nIsso SUBSTITUI o que está neste aparelho agora (' +
        (PdmBackup.describeLocal().join(' · ') || currentWeight + ' itens') + ').';
      if (check.weight < currentWeight) {
        text += ' Atenção: o backup tem MENOS dados do que você tem agora.';
      }
    }
    if (window.PdmSync && PdmSync.isSignedIn()) {
      text += '\n\nDepois de restaurar, esses dados também vão pra nuvem, substituindo o que está lá.';
    }

    pdmConfirmGeneric('Restaurar backup', text, () => applyImport(obj));
  }

  async function applyImport(obj) {
    const res = PdmBackup.applyBackup(obj);
    if (!res.ok) { pdmToast(res.error || 'Não deu pra restaurar.'); return; }

    // Restaurar é destrutivo de propósito — libera a janela pro push chegar
    // na nuvem mesmo que o backup tenha menos dado que o estado atual.
    if (window.PdmSync && PdmSync.isSignedIn()) {
      PdmSync.allowDestructive();
      try { await PdmSync.pushAll(); }
      catch (e) { /* best effort */ }
      finally { PdmSync.endDestructive(); }
    }
    pdmToast('Backup restaurado. Recarregando...');
    // Recarrega em vez de re-renderizar: todos os módulos de dados já
    // rodaram init() com o estado antigo em memória, então a única forma
    // honesta de aplicar o novo estado é reiniciar o app.
    setTimeout(() => window.location.reload(), 900);
  }

  // ---------------------------------------------------------------
  // CONFLITO DE SINCRONIZAÇÃO — os dois lados têm dado e o app não decide
  // sozinho (foi adivinhar que causou a perda real; ver js/sync.js).
  // ---------------------------------------------------------------
  function pdmOpenSyncConflictModal() {
    if (!window.PdmSync) return;
    const c = PdmSync.getPendingConflict();
    if (!c) return;
    const body = document.getElementById('pdmSyncConflictBody');
    if (!body) return;

    // A orientação vem ANTES das opções de propósito: é ela que faz o
    // usuário escolher certo, então não pode ficar abaixo dos botões (onde
    // o scroll do modal a esconderia).
    const hint = c.reason === 'nuvem-menor'
      ? '<p class="pdm-conflict-hint">A nuvem tem bem menos dados que este aparelho. Isso costuma acontecer quando outro aparelho foi aberto depois de perder os dados dele — nesse caso, <b>mantenha este aparelho</b>.</p>'
      : '<p class="pdm-conflict-hint">Este aparelho ainda não tinha sincronizado com essa conta. Mantenha o lado que tem o progresso que você reconhece como seu.</p>';

    body.innerHTML =
      '<p>Há dados diferentes aqui e na nuvem. Escolha qual manter — o outro lado fica guardado no histórico da nuvem, não some pra sempre.</p>' +
      hint +
      '<div class="pdm-conflict-grid">' +
        '<div class="pdm-conflict-side">' +
          '<div class="pdm-conflict-title">Neste aparelho</div>' +
          '<b>' + c.localWeight + '</b><span>itens</span>' +
          '<div class="pdm-backup-detail">' + escapeHtml(c.localDescribe.join(' · ') || 'sem detalhe') + '</div>' +
          '<button class="pdm-btn" onclick="pdmResolveSyncConflict(\'local\')">Manter este aparelho</button>' +
        '</div>' +
        '<div class="pdm-conflict-side">' +
          '<div class="pdm-conflict-title">Na nuvem</div>' +
          '<b>' + c.cloudWeight + '</b><span>itens</span>' +
          '<div class="pdm-backup-detail">' + escapeHtml(c.cloudDescribe.join(' · ') || 'sem detalhe') + '</div>' +
          '<button class="pdm-btn-ghost" onclick="pdmResolveSyncConflict(\'cloud\')">Usar o da nuvem</button>' +
        '</div>' +
      '</div>' +
      '<p class="pdm-backup-detail">Na dúvida, baixe um backup deste aparelho antes de escolher (Configurações → Seus dados).</p>';

    pdmOpenModal('pdmSyncConflictModal');
  }

  // ---------------------------------------------------------------
  // RECUPERAÇÃO — estado "aparelho sem dado nenhum, mas o app sabe onde
  // está a nuvem". É exatamente o que sobra depois de limpar os dados do
  // navegador. Tem prioridade sobre o Onboarding: sem isso, o usuário seria
  // levado a criar um objetivo novo enquanto o progresso real dele espera
  // na nuvem.
  // ---------------------------------------------------------------
  function pdmOpenRecoveryScreen() {
    pdmOpenModal('pdmRecoveryModal');
  }

  function pdmRecoverFromCloud() {
    if (!window.PdmSync) return;
    const btn = document.getElementById('pdmRecoveryBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    PdmSync.connect().then((res) => {
      // PWA instalado: saiu por redirecionamento. A página vai embora; na
      // volta o boot completa o login e já restaura (PdmSync.init()).
      if (res && res.redirecting) {
        if (btn) btn.textContent = 'Abrindo o Google...';
        return;
      }
      const action = res && res.sync ? res.sync.action : null;
      if (action === 'conflict') {
        pdmCloseModal('pdmRecoveryModal');
        pdmOpenSyncConflictModal();
        return;
      }
      if (action === 'pull' && res.sync.restored) {
        pdmCloseModal('pdmRecoveryModal');
        pdmToast('Dados restaurados. Recarregando...');
        // Os módulos já rodaram init() com o estado vazio em memória —
        // recarregar é a única forma honesta de aplicar o que veio da nuvem.
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      // Entrou, mas não havia nada na nuvem pra essa conta.
      pdmCloseModal('pdmRecoveryModal');
      if (window.pdmRenderSyncStatus) window.pdmRenderSyncStatus();
      pdmToast('Conta conectada, mas não há dados salvos nela.');
      if (window.PdmOnboarding && !window.PdmOnboarding.isResolved() && window.pdmStartOnboarding) {
        window.pdmStartOnboarding();
      }
    }).catch((e) => {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar com Google'; }
      pdmToast(window.pdmSyncLoginErrorMessage
        ? window.pdmSyncLoginErrorMessage(e)
        : 'Não deu pra entrar agora. Tente de novo.');
    });
  }

  // "Começar do zero" na tela de recuperação: não é destrutivo (não há o que
  // destruir — o aparelho está vazio), só segue pro onboarding normal.
  function pdmSkipRecovery() {
    pdmCloseModal('pdmRecoveryModal');
    if (window.PdmOnboarding && !window.PdmOnboarding.isResolved() && window.pdmStartOnboarding) {
      window.pdmStartOnboarding();
    }
  }

  // Sair sem escolher é seguro: nada foi sobrescrito e a sincronização fica
  // pausada (PdmSync.ready continua false) até a próxima abertura do app, em
  // vez de deixar uma escrita qualquer decidir por você.
  function pdmPostponeSyncConflict() {
    pdmCloseModal('pdmSyncConflictModal');
    pdmToast('Sincronização pausada até você escolher.');
  }

  function pdmResolveSyncConflict(choice) {
    if (!window.PdmSync) return;
    PdmSync.resolveConflict(choice).then((res) => {
      pdmCloseModal('pdmSyncConflictModal');
      if (!res.ok) { pdmToast('Não deu pra resolver agora.'); return; }
      if (choice === 'cloud') {
        pdmToast('Usando os dados da nuvem. Recarregando...');
        setTimeout(() => window.location.reload(), 900);
      } else {
        pdmToast('Este aparelho virou a referência. Nuvem atualizada.');
        if (window.pdmRenderSyncStatus) window.pdmRenderSyncStatus();
      }
    });
  }

  Object.assign(window, {
    pdmRenderBackupStatus, pdmExportBackup, pdmOpenImportBackup, pdmHandleBackupFile,
    pdmOpenSyncConflictModal, pdmResolveSyncConflict, pdmPostponeSyncConflict,
    pdmOpenRecoveryScreen, pdmRecoverFromCloud, pdmSkipRecovery,
  });
})();
