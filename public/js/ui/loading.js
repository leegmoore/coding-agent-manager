/**
 * Shows loading state with shimmer text
 * @param {HTMLElement} container - Container element
 * @param {string} text - Loading text
 */
export function showLoading(container, text) {
  container.innerHTML = `<span class="shimmer">${text}</span>`;
  container.classList.remove('hidden');
}

/**
 * Hides loading state
 * @param {HTMLElement} container - Container element
 */
export function hideLoading(container) {
  container.classList.add('hidden');
  container.innerHTML = '';
}

/**
 * Disables/enables form submit button
 * @param {HTMLButtonElement} button - Submit button
 * @param {boolean} disabled - Disabled state
 */
export function setSubmitDisabled(button, disabled) {
  button.disabled = disabled;
}
