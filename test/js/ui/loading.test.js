import { describe, it, expect, beforeEach } from 'vitest';
import { showLoading, hideLoading, setSubmitDisabled } from '../../../public/js/ui/loading.js';

describe('ui/loading', () => {
  let container;
  let button;

  beforeEach(() => {
    // jsdom provides document
    container = document.createElement('div');
    container.classList.add('hidden');
    button = document.createElement('button');
  });

  describe('showLoading', () => {
    it('sets innerHTML with shimmer span', () => {
      showLoading(container, 'Loading...');
      expect(container.innerHTML).toBe('<span class="shimmer">Loading...</span>');
    });

    it('removes hidden class', () => {
      showLoading(container, 'Loading...');
      expect(container.classList.contains('hidden')).toBe(false);
    });

    it('handles different text', () => {
      showLoading(container, 'Curating Context For Cloned Session...');
      expect(container.querySelector('.shimmer').textContent).toBe('Curating Context For Cloned Session...');
    });
  });

  describe('hideLoading', () => {
    it('adds hidden class', () => {
      container.classList.remove('hidden');
      hideLoading(container);
      expect(container.classList.contains('hidden')).toBe(true);
    });

    it('clears innerHTML', () => {
      container.innerHTML = '<span>something</span>';
      hideLoading(container);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('setSubmitDisabled', () => {
    it('sets disabled to true', () => {
      setSubmitDisabled(button, true);
      expect(button.disabled).toBe(true);
    });

    it('sets disabled to false', () => {
      button.disabled = true;
      setSubmitDisabled(button, false);
      expect(button.disabled).toBe(false);
    });
  });
});
