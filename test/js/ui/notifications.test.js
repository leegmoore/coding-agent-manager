import { describe, it, expect, beforeEach } from 'vitest';
import { hideAll, showSuccess, showError } from '../../../public/js/ui/notifications.js';

describe('ui/notifications', () => {
  let successContainer;
  let errorContainer;
  let loadingContainer;

  beforeEach(() => {
    // Create success container with required children
    successContainer = document.createElement('div');
    successContainer.innerHTML = `
      <span id="new-session-id"></span>
      <code id="resume-command"></code>
      <ul id="stats-list"></ul>
    `;

    // Create error container with required children
    errorContainer = document.createElement('div');
    errorContainer.innerHTML = `<p id="error-message"></p>`;

    // Create loading container
    loadingContainer = document.createElement('div');
  });

  describe('hideAll', () => {
    it('adds hidden class to all containers', () => {
      successContainer.classList.remove('hidden');
      errorContainer.classList.remove('hidden');
      loadingContainer.classList.remove('hidden');

      hideAll({
        success: successContainer,
        error: errorContainer,
        loading: loadingContainer,
      });

      expect(successContainer.classList.contains('hidden')).toBe(true);
      expect(errorContainer.classList.contains('hidden')).toBe(true);
      expect(loadingContainer.classList.contains('hidden')).toBe(true);
    });
  });

  describe('showSuccess', () => {
    it('renders session ID', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid-1234',
        command: 'claude --resume test-uuid-1234',
        stats: [],
      });

      expect(successContainer.querySelector('#new-session-id').textContent).toBe('test-uuid-1234');
    });

    it('renders resume command', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid-1234',
        command: 'claude --dangerously-skip-permissions --resume test-uuid-1234',
        stats: [],
      });

      expect(successContainer.querySelector('#resume-command').textContent)
        .toBe('claude --dangerously-skip-permissions --resume test-uuid-1234');
    });

    it('renders stats list', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid-1234',
        command: 'cmd',
        stats: [
          { label: 'Original turns', value: 18 },
          { label: 'Tool calls removed', value: 5 },
        ],
      });

      const statsList = successContainer.querySelector('#stats-list');
      expect(statsList.children.length).toBe(2);
      expect(statsList.children[0].textContent).toBe('Original turns: 18');
      expect(statsList.children[1].textContent).toBe('Tool calls removed: 5');
    });

    it('removes hidden class', () => {
      successContainer.classList.add('hidden');

      showSuccess(successContainer, {
        sessionId: 'test',
        command: 'test',
        stats: [],
      });

      expect(successContainer.classList.contains('hidden')).toBe(false);
    });

    it('handles empty stats array', () => {
      showSuccess(successContainer, {
        sessionId: 'test-uuid',
        command: 'claude --resume test-uuid',
        stats: [],
      });

      const statsList = successContainer.querySelector('#stats-list');
      expect(statsList.children.length).toBe(0);
      expect(statsList.innerHTML).toBe('');
    });
  });

  describe('showError', () => {
    it('renders error message', () => {
      showError(errorContainer, 'Something went wrong');

      expect(errorContainer.querySelector('#error-message').textContent)
        .toBe('Something went wrong');
    });

    it('removes hidden class', () => {
      errorContainer.classList.add('hidden');

      showError(errorContainer, 'Error');

      expect(errorContainer.classList.contains('hidden')).toBe(false);
    });
  });
});
