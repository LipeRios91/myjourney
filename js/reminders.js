// Lembretes de missões — melhor esforço via Notification API.
//
// LIMITAÇÃO IMPORTANTE: isso só dispara enquanto o app está aberto (aba/app em
// primeiro ou segundo plano vivo no navegador). PWA sem backend não tem como
// mandar notificação push de verdade com o app fechado — isso exigiria um
// servidor de push (Web Push) e está fora do escopo atual. Ver CLAUDE.md.

(function () {
  let scheduledTimers = [];

  function clearScheduled() {
    scheduledTimers.forEach((t) => clearTimeout(t));
    scheduledTimers = [];
  }

  function minutesFor(reminder) {
    if (!reminder || reminder.type === 'none') return null;
    if (reminder.type === '10min') return 10;
    if (reminder.type === '30min') return 30;
    if (reminder.type === '1h') return 60;
    if (reminder.type === 'custom') return reminder.customMinutes || 10;
    return null;
  }

  async function scheduleTodayReminders() {
    clearScheduled();
    if (!('Notification' in window) || !window.PdmHM) return;
    if (Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch (e) { /* ignora — usuário pode negar */ }
    }
    if (Notification.permission !== 'granted') return;

    const missions = window.PdmHM.listMissionsForDate(todayISO());
    const now = Date.now();
    missions.forEach((m) => {
      if (!m.time || ['concluida', 'cancelada'].includes(m.status)) return;
      const habit = m.habitId ? window.PdmHM.getHabit(m.habitId) : null;
      const mins = minutesFor(habit ? habit.reminder : null);
      if (mins == null) return;
      const [h, mi] = m.time.split(':').map(Number);
      const target = new Date();
      target.setHours(h, mi, 0, 0);
      const delay = target.getTime() - mins * 60000 - now;
      if (delay <= 0 || delay > 24 * 3600000) return;
      const timer = setTimeout(() => {
        try { new Notification('Passe do Mestre', { body: m.name + ' às ' + m.time, tag: m.id }); }
        catch (e) { /* navegador pode bloquear notificação com a aba em foco */ }
      }, delay);
      scheduledTimers.push(timer);
    });
  }

  window.PdmReminders = { scheduleTodayReminders };
})();
