/**
 * Hides all result containers
 * @param {Object} containers - {success, error, loading}
 */
export function hideAll(containers) {
  Object.values(containers).forEach(el => {
    el.classList.add('hidden');
  });
}

/**
 * Shows success result
 * @param {HTMLElement} container - Success container
 * @param {Object} data - {sessionId, command, stats}
 */
export function showSuccess(container, { sessionId, command, stats }) {
  container.querySelector('#new-session-id').textContent = sessionId;
  container.querySelector('#resume-command').textContent = command;

  const statsList = container.querySelector('#stats-list');
  statsList.innerHTML = stats
    .map(s => `<li>${s.label}: ${s.value}</li>`)
    .join('');

  container.classList.remove('hidden');
}

/**
 * Shows error result
 * @param {HTMLElement} container - Error container
 * @param {string} message - Error message
 */
export function showError(container, message) {
  container.querySelector('#error-message').textContent = message;
  container.classList.remove('hidden');
}
