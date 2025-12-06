import { validateUUID } from '../lib/validation.js';
import { extractSessionId, formatStats, formatCompressionStats } from '../lib/transforms.js';
import { validateBands, buildCompressionBands, formatBandPreview } from '../lib/compression.js';
import { post, ApiError } from '../api/client.js';
import { showLoading, hideLoading, setSubmitDisabled } from '../ui/loading.js';
import { hideAll, showSuccess, showError } from '../ui/notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM queries
  const form = document.getElementById('clone-form');
  const submitBtn = document.getElementById('submit-btn');
  const copyBtn = document.getElementById('copy-btn');

  const containers = {
    loading: document.getElementById('loading'),
    success: document.getElementById('success-result'),
    error: document.getElementById('error-result'),
  };

  // Compression elements
  const band1Input = document.getElementById('band1');
  const band2Input = document.getElementById('band2');
  const bandPreview = document.getElementById('band-preview');
  const bandErrors = document.getElementById('band-errors');
  const debugLogCheckbox = document.getElementById('debugLog');
  const compressionStatsDiv = document.getElementById('compression-stats');
  const compressionStatsList = document.getElementById('compression-stats-list');
  const debugLogLinkDiv = document.getElementById('debug-log-link');
  const debugLogAnchor = document.getElementById('debug-log-anchor');

  // Verify required elements exist
  if (!form || !submitBtn || !containers.loading || !containers.success || !containers.error) {
    console.error('Missing required DOM elements');
    return;
  }

  // Hide all results initially
  hideAll(containers);

  // Guard against double submission
  let isSubmitting = false;

  /**
   * Updates band validation and preview in real-time
   */
  function updateBandValidation() {
    const band1 = band1Input.value;
    const band2 = band2Input.value;

    const result = validateBands(band1, band2);

    // Update preview
    bandPreview.textContent = formatBandPreview(band1, band2);

    // Update errors
    if (result.valid) {
      bandErrors.classList.add('hidden');
      bandErrors.textContent = '';
      submitBtn.disabled = false;
    } else {
      bandErrors.classList.remove('hidden');
      bandErrors.textContent = result.errors.join('. ');
      submitBtn.disabled = true;
    }
  }

  band1Input.addEventListener('input', updateBandValidation);
  band2Input.addEventListener('input', updateBandValidation);

  /**
   * Opens debug log in a new window with rendered markdown
   */
  async function openDebugLog(path) {
    try {
      const response = await fetch(path);
      const markdown = await response.text();
      const html = marked.parse(markdown);

      const newWindow = window.open('', '_blank');
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Compression Debug Log</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
            pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
            code { background: #f5f5f5; padding: 2px 4px; }
            h1, h2, h3 { color: #333; }
          </style>
        </head>
        <body>${html}</body>
        </html>
      `);
      newWindow.document.close();
    } catch (err) {
      console.error('Failed to load debug log:', err);
      alert('Failed to load debug log');
    }
  }

  /**
   * Handles form submission
   */
  async function handleSubmit(e) {
    e.preventDefault();

    // Prevent double submission from overlapping form/button events
    if (isSubmitting) return;
    isSubmitting = true;

    const formData = new FormData(form);
    const sessionId = formData.get('sessionId')?.trim() || '';

    // Client-side validation
    if (!validateUUID(sessionId)) {
      hideAll(containers);
      showError(containers.error, 'Invalid session ID format. Please enter a valid UUID.');
      isSubmitting = false;
      return;
    }

    // Show loading state
    hideAll(containers);
    showLoading(containers.loading, 'Curating Context For Cloned Session...');
    setSubmitDisabled(submitBtn, true);

    try {
      // Build request body with compression options
      const compressionBands = buildCompressionBands(band1Input.value, band2Input.value);
      const debugLog = debugLogCheckbox.checked;

      const result = await post('/api/v2/clone', {
        sessionId,
        toolRemoval: formData.get('toolRemoval'),
        thinkingRemoval: formData.get('thinkingRemoval'),
        compressionBands,
        debugLog,
      });

      if (!result.success) {
        throw new Error('Clone operation failed. Please try again.');
      }
      if (!result.outputPath || !result.stats) {
        throw new Error('Invalid response from server');
      }

      const newSessionId = extractSessionId(result.outputPath);
      const command = `claude --dangerously-skip-permissions --resume ${newSessionId}`;

      hideLoading(containers.loading);
      showSuccess(containers.success, {
        sessionId: newSessionId,
        command,
        stats: formatStats(result.stats),
      });

      // Display compression stats if present
      if (result.stats.compression) {
        const compressionStats = formatCompressionStats(result.stats.compression);
        compressionStatsList.innerHTML = compressionStats
          .map(s => `<li>${s.label}: ${s.value}</li>`)
          .join('');
        compressionStatsDiv.classList.remove('hidden');
      } else {
        compressionStatsDiv.classList.add('hidden');
      }

      // Show debug log link if applicable
      if (debugLog && result.debugLogPath) {
        debugLogAnchor.href = '#';
        debugLogAnchor.onclick = (e) => {
          e.preventDefault();
          openDebugLog(result.debugLogPath);
        };
        debugLogLinkDiv.classList.remove('hidden');
      } else {
        debugLogLinkDiv.classList.add('hidden');
      }

      // Scroll to result
      setTimeout(() => {
        containers.success.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);

    } catch (err) {
      hideLoading(containers.loading);

      let message;
      if (err instanceof ApiError) {
        message = err.message;
      } else if (err.message.includes('fetch')) {
        message = `Network error: ${err.message}. Please check your connection.`;
      } else {
        message = err.message || 'An unexpected error occurred';
      }

      showError(containers.error, message);
      containers.error.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      setSubmitDisabled(submitBtn, false);
      isSubmitting = false;
    }
  }

  /**
   * Handles copy to clipboard
   */
  async function handleCopy() {
    const resumeCommand = document.getElementById('resume-command');
    const command = resumeCommand?.textContent || '';

    try {
      await navigator.clipboard.writeText(command);

      // Visual feedback
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('bg-green-600', 'hover:bg-green-700');
      copyBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');

      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        copyBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback: select text for manual copy (Ctrl+C)
      if (resumeCommand && window.getSelection) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(resumeCommand);
        selection.removeAllRanges();
        selection.addRange(range);
        // Alert user to copy manually
        copyBtn.textContent = 'Select & Copy';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      }
    }
  }

  // Event listeners
  // Note: We attach handleSubmit to both form submit and button click.
  // The button has type="button" (not submit), so both won't fire together.
  // This preserves legacy behavior and handles edge cases where form submit
  // might not trigger. The e.preventDefault() ensures no double execution.
  form.addEventListener('submit', handleSubmit);
  submitBtn.addEventListener('click', handleSubmit);

  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopy);
  }
});
