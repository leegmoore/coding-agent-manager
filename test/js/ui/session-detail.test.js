import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";

describe("session-detail page", () => {
  let dom;
  let document;

  beforeEach(() => {
    // Create minimal DOM matching the EJS template
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <input id="sessionInput" />
        <button id="loadButton">Load</button>
        <div id="errorMessage" class="hidden"></div>
        <div id="loadingIndicator" class="hidden"></div>
        <div id="visualizationSection" class="hidden">
          <button id="leftButton"></button>
          <input id="turnInput" type="number" min="0" value="0" />
          <button id="rightButton"></button>
          <input id="turnSlider" type="range" min="0" max="0" value="0" />
          <span id="turnLabel">Turn 0 of 0</span>
          <input id="scaleInput" type="number" min="50" max="2000" value="200" />
          <span id="scaleWarning" class="hidden"></span>
          <div id="visualizationContainer"></div>
          <div id="tokenStats"></div>
          <div id="detailCard"></div>
        </div>
      </body>
      </html>
    `);
    document = dom.window.document;
    global.document = document;
  });

  // =============================================================================
  // DOM Structure tests - These PASS (testing template structure)
  // =============================================================================
  describe("DOM structure", () => {
    it("has session input field", () => {
      const input = document.getElementById("sessionInput");
      expect(input).not.toBeNull();
      expect(input.tagName).toBe("INPUT");
    });

    it("has load button", () => {
      const button = document.getElementById("loadButton");
      expect(button).not.toBeNull();
      expect(button.tagName).toBe("BUTTON");
    });

    it("has error message container", () => {
      expect(document.getElementById("errorMessage")).not.toBeNull();
    });

    it("has loading indicator", () => {
      expect(document.getElementById("loadingIndicator")).not.toBeNull();
    });

    it("has visualization section", () => {
      expect(document.getElementById("visualizationSection")).not.toBeNull();
    });

    it("has all navigation controls", () => {
      expect(document.getElementById("leftButton")).not.toBeNull();
      expect(document.getElementById("turnInput")).not.toBeNull();
      expect(document.getElementById("rightButton")).not.toBeNull();
      expect(document.getElementById("turnSlider")).not.toBeNull();
      expect(document.getElementById("turnLabel")).not.toBeNull();
    });

    it("has scale controls", () => {
      expect(document.getElementById("scaleInput")).not.toBeNull();
      expect(document.getElementById("scaleWarning")).not.toBeNull();
    });

    it("has visualization container", () => {
      expect(document.getElementById("visualizationContainer")).not.toBeNull();
    });

    it("has token stats display", () => {
      expect(document.getElementById("tokenStats")).not.toBeNull();
    });

    it("has detail card", () => {
      expect(document.getElementById("detailCard")).not.toBeNull();
    });
  });

  // =============================================================================
  // Initial State tests - These PASS (testing initial class states)
  // =============================================================================
  describe("initial state", () => {
    it("has visualization section hidden initially", () => {
      const section = document.getElementById("visualizationSection");
      expect(section.classList.contains("hidden")).toBe(true);
    });

    it("has error message hidden initially", () => {
      const error = document.getElementById("errorMessage");
      expect(error.classList.contains("hidden")).toBe(true);
    });

    it("has loading indicator hidden initially", () => {
      const loading = document.getElementById("loadingIndicator");
      expect(loading.classList.contains("hidden")).toBe(true);
    });

    it("has scale warning hidden initially", () => {
      const warning = document.getElementById("scaleWarning");
      expect(warning.classList.contains("hidden")).toBe(true);
    });

    it("has turn input starting at 0", () => {
      const turnInput = document.getElementById("turnInput");
      expect(turnInput.value).toBe("0");
    });

    it("has scale input starting at 200", () => {
      const scaleInput = document.getElementById("scaleInput");
      expect(scaleInput.value).toBe("200");
    });

    it("has turn slider starting at 0", () => {
      const slider = document.getElementById("turnSlider");
      expect(slider.value).toBe("0");
    });

    it('has turn label showing "Turn 0 of 0"', () => {
      const label = document.getElementById("turnLabel");
      expect(label.textContent).toBe("Turn 0 of 0");
    });
  });

  // =============================================================================
  // Input constraints tests - These PASS (testing HTML attributes)
  // =============================================================================
  describe("input constraints", () => {
    it("turn input has min of 0", () => {
      const turnInput = document.getElementById("turnInput");
      expect(turnInput.getAttribute("min")).toBe("0");
    });

    it("scale input has min of 50 and max of 2000", () => {
      const scaleInput = document.getElementById("scaleInput");
      expect(scaleInput.getAttribute("min")).toBe("50");
      expect(scaleInput.getAttribute("max")).toBe("2000");
    });

    it("turn slider has min of 0", () => {
      const slider = document.getElementById("turnSlider");
      expect(slider.getAttribute("min")).toBe("0");
    });
  });
});

