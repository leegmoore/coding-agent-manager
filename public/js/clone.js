document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("clone-form");
  const submitBtn = document.getElementById("submit-btn");
  const loading = document.getElementById("loading");
  const successResult = document.getElementById("success-result");
  const errorResult = document.getElementById("error-result");
  const errorMessage = document.getElementById("error-message");
  
  // Verify all elements exist
  if (!form || !submitBtn || !loading || !successResult || !errorResult || !errorMessage) {
    console.error("Missing required DOM elements:", {
      form: !!form,
      submitBtn: !!submitBtn,
      loading: !!loading,
      successResult: !!successResult,
      errorResult: !!errorResult,
      errorMessage: !!errorMessage,
    });
    return;
  }
  
  // Get elements that are inside the success result (may be hidden initially)
  const newSessionId = document.getElementById("new-session-id");
  const statsList = document.getElementById("stats-list");
  const resumeCommand = document.getElementById("resume-command");
  const copyBtn = document.getElementById("copy-btn");
  
  if (!newSessionId || !statsList || !resumeCommand || !copyBtn) {
    console.error("Missing success result DOM elements:", {
      newSessionId: !!newSessionId,
      statsList: !!statsList,
      resumeCommand: !!resumeCommand,
      copyBtn: !!copyBtn,
    });
  }

  // Hide results initially
  function hideAllResults() {
    successResult.classList.add("hidden");
    errorResult.classList.add("hidden");
    loading.classList.add("hidden");
  }
  
  // Ensure success div starts hidden on page load
  hideAllResults();

  // Show loading state
  function showLoading() {
    hideAllResults();
    loading.classList.remove("hidden");
    submitBtn.disabled = true;
  }

  // Show success result
  function showSuccess(data) {
    console.log("=== showSuccess START ===");
    console.log("showSuccess called with data:", JSON.stringify(data, null, 2));
    
    // Hide loading and error first
    loading.classList.add("hidden");
    errorResult.classList.add("hidden");
    submitBtn.disabled = false;

    // Validate data structure
    if (!data.outputPath) {
      console.error("Missing outputPath in response:", data);
      showError("Invalid response: missing output path");
      return;
    }

    if (!data.stats) {
      console.error("Missing stats in response:", data);
      showError("Invalid response: missing stats");
      return;
    }

    // Extract session ID from output path (filename without .jsonl)
    const pathParts = data.outputPath.split("/");
    const filename = pathParts[pathParts.length - 1];
    const sessionId = filename.replace(/\.jsonl$/, "");
    const command = `claude --dangerously-skip-permissions --resume ${sessionId}`;
    
    console.log("Extracted session ID:", sessionId);
    console.log("Command:", command);
    
    // Get elements BEFORE showing (they exist in DOM even when hidden)
    const newSessionIdEl = document.getElementById("new-session-id");
    const statsListEl = document.getElementById("stats-list");
    const resumeCommandEl = document.getElementById("resume-command");
    
    if (!newSessionIdEl || !statsListEl || !resumeCommandEl) {
      console.error("Missing elements:", {
        newSessionIdEl: !!newSessionIdEl,
        statsListEl: !!statsListEl,
        resumeCommandEl: !!resumeCommandEl,
      });
      showError("UI error: missing elements. Please refresh the page.");
      return;
    }
    
    // Hide success div FIRST before clearing/setting content
    successResult.classList.add("hidden");
    successResult.style.display = "none";
    
    // Clear any previous content
    newSessionIdEl.textContent = "";
    newSessionIdEl.innerHTML = "";
    resumeCommandEl.textContent = "";
    resumeCommandEl.innerHTML = "";
    statsListEl.innerHTML = "";
    
    // Set the content while div is hidden
    newSessionIdEl.textContent = sessionId;
    newSessionIdEl.innerHTML = sessionId;
    resumeCommandEl.textContent = command;
    resumeCommandEl.innerHTML = command;
    
    // Set stats
    statsListEl.innerHTML = `
      <li>Original turns: ${data.stats.originalTurnCount}</li>
      <li>Output turns: ${data.stats.outputTurnCount}</li>
      <li>Tool calls removed: ${data.stats.toolCallsRemoved}</li>
      <li>Thinking blocks removed: ${data.stats.thinkingBlocksRemoved}</li>
    `;
    
    // Verify content was set
    if (newSessionIdEl.textContent !== sessionId && newSessionIdEl.innerHTML !== sessionId) {
      console.error("Failed to set newSessionIdEl content!");
      newSessionIdEl.textContent = sessionId;
      newSessionIdEl.innerHTML = sessionId;
    }
    if (resumeCommandEl.textContent !== command && resumeCommandEl.innerHTML !== command) {
      console.error("Failed to set resumeCommandEl content!");
      resumeCommandEl.textContent = command;
      resumeCommandEl.innerHTML = command;
    }
    
    // Force a reflow to ensure rendering
    void newSessionIdEl.offsetHeight;
    void resumeCommandEl.offsetHeight;
    
    // NOW show the success result - remove ALL hiding mechanisms
    successResult.classList.remove("hidden");
    successResult.style.display = "block";
    successResult.style.visibility = "visible";
    successResult.style.opacity = "1";
    
    // Ensure elements are visible
    newSessionIdEl.style.display = "block";
    newSessionIdEl.style.visibility = "visible";
    resumeCommandEl.style.display = "block";
    resumeCommandEl.style.visibility = "visible";
    
    // Final verification - content MUST be there
    const finalSessionId = newSessionIdEl.textContent || newSessionIdEl.innerHTML || sessionId;
    const finalCommand = resumeCommandEl.textContent || resumeCommandEl.innerHTML || command;
    
    if (finalSessionId !== sessionId || finalCommand !== command) {
      console.error("Content verification failed! Forcing set...");
      newSessionIdEl.textContent = sessionId;
      newSessionIdEl.innerHTML = sessionId;
      resumeCommandEl.textContent = command;
      resumeCommandEl.innerHTML = command;
    }
    
    console.log("=== showSuccess END ===");
    console.log("Final check - newSessionIdEl.innerHTML:", newSessionIdEl.innerHTML);
    console.log("Final check - resumeCommandEl.innerHTML:", resumeCommandEl.innerHTML);
    console.log("Final check - success div visible:", !successResult.classList.contains("hidden"));

    // Scroll to result
    setTimeout(() => {
      successResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }
  
  // Expose showSuccess for testing
  window.testShowSuccess = function() {
    const testData = {
      success: true,
      outputPath: "/Users/leemoore/.claude/projects/-Users-leemoore/test-uuid-1234.jsonl",
      stats: {
        originalTurnCount: 18,
        outputTurnCount: 18,
        toolCallsRemoved: 5,
        thinkingBlocksRemoved: 3
      }
    };
    console.log("Testing showSuccess with:", testData);
    showSuccess(testData);
  };

  // Show error result
  function showError(message) {
    hideAllResults();
    loading.classList.add("hidden");
    submitBtn.disabled = false;
    errorMessage.textContent = message;
    errorResult.classList.remove("hidden");

    // Scroll to error
    errorResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Copy to clipboard
  copyBtn.addEventListener("click", async () => {
    const resumeCommandEl = document.getElementById("resume-command");
    const command = resumeCommandEl ? (resumeCommandEl.textContent || resumeCommandEl.innerText) : "";
    try {
      await navigator.clipboard.writeText(command);
      const originalText = copyBtn.textContent;
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("bg-green-600", "hover:bg-green-700");
      copyBtn.classList.remove("bg-blue-600", "hover:bg-blue-700");
      
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.classList.remove("bg-green-600", "hover:bg-green-700");
        copyBtn.classList.add("bg-blue-600", "hover:bg-blue-700");
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Fallback: select text
      const range = document.createRange();
      range.selectNode(resumeCommand);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });

  // Form submission - handle both form submit and button click
  async function handleClone() {

    const formData = new FormData(form);
    const data = {
      sessionId: formData.get("sessionId").trim(),
      toolRemoval: formData.get("toolRemoval"),
      thinkingRemoval: formData.get("thinkingRemoval"),
    };

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(data.sessionId)) {
      showError("Invalid session ID format. Please enter a valid UUID.");
      return;
    }

    showLoading();

    try {
      const response = await fetch("/api/clone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      let result;
      try {
        result = await response.json();
        console.log("API response:", result);
      } catch (parseError) {
        console.error("Failed to parse JSON response:", parseError);
        const text = await response.text();
        console.error("Response text:", text);
        showError("Invalid response from server. Please check the console.");
        return;
      }

      if (!response.ok) {
        // Handle error response
        const errorMsg = result.error?.message || `Server error: ${response.statusText}`;
        showError(errorMsg);
        return;
      }

      // Success
      if (result.success) {
        console.log("Clone successful:", result);
        console.log("Calling showSuccess with:", JSON.stringify(result, null, 2));
        showSuccess(result);
      } else {
        showError("Clone operation failed. Please try again.");
      }
    } catch (err) {
      console.error("Request failed:", err);
      showError(`Network error: ${err.message}. Please check your connection and try again.`);
    }
  }

  // Prevent form submission and handle via JavaScript
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleClone();
  });

  // Also handle button click directly
  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleClone();
  });
});

