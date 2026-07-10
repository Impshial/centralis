(function initUsefulThings() {
  const usefulThingsSupabase = window.centralisSupabase;

  const els = {
    tabs: Array.from(document.querySelectorAll("[data-useful-tab]")),
    panels: Array.from(document.querySelectorAll("[data-useful-panel]")),
    modeSelect: document.querySelector("[data-text-converter-mode]"),
    richWrap: document.querySelector("[data-rich-input-wrap]"),
    richEditor: document.querySelector("[data-text-rich-editor]"),
    rawInput: document.querySelector("[data-text-raw-input]"),
    output: document.querySelector("[data-text-output]"),
    status: document.querySelector("[data-text-converter-status]"),
    conversionButtons: Array.from(document.querySelectorAll("[data-convert-target]")),
    richCommandButtons: Array.from(document.querySelectorAll("[data-rich-command]")),
    richBlockButtons: Array.from(document.querySelectorAll("[data-rich-block]")),
    richHeading: document.querySelector("[data-rich-heading]"),
    richLinkButton: document.querySelector("[data-rich-link]"),
    richInlineCodeButton: document.querySelector("[data-rich-inline-code]"),
    calculatorGrid: document.querySelector("[data-calculator-grid]"),
    calculatorAddMenu: document.querySelector("[data-calculator-add-menu]"),
    calculatorMenuTrigger: document.querySelector("[data-calculator-menu-trigger]"),
    calculatorMenuPanel: document.querySelector("[data-calculator-menu-panel]"),
    calculatorTypeButtons: Array.from(document.querySelectorAll("[data-add-calculator-type]")),
  };

  if (!els.modeSelect || !els.richEditor || !els.rawInput || !els.output) {
    return;
  }

  let isConverting = false;
  let nextCalculatorId = 1;
  let activeCalculatorId = null;
  const calculators = new Map();

  const calculatorMemoryButtons = [
    { label: "MC", action: "memory-clear", title: "Clear memory" },
    { label: "MR", action: "memory-recall", title: "Recall memory" },
    { label: "M+", action: "memory-add", title: "Add current value to memory" },
    { label: "M−", action: "memory-subtract", title: "Subtract current value from memory" },
    { label: "MS", action: "memory-store", title: "Store current value in memory" },
    { label: "M∨", action: "memory-show", title: "Show memory" },
  ];

  const calculatorKeys = [
    { label: "(", insert: "(", title: "Open parenthesis", className: "is-command" },
    { label: ")", insert: ")", title: "Close parenthesis", className: "is-command" },
    { label: "%", insert: "%", title: "Percent", className: "is-command" },
    { label: "⌫", action: "backspace", title: "Backspace", className: "is-command" },
    { label: "CE", action: "clear-entry", title: "Clear entry", className: "is-command" },
    { label: "C", action: "clear", title: "Clear", className: "is-command" },
    { label: "1/x", action: "reciprocal", title: "Reciprocal", className: "is-command" },
    { label: "÷", insert: "/", title: "Divide", className: "is-command" },
    { label: "x²", action: "square", title: "Square", className: "is-command" },
    { label: "√x", action: "sqrt", title: "Square root", className: "is-command" },
    { label: "+/-", action: "toggle-sign", title: "Toggle sign", className: "is-command" },
    { label: "×", insert: "*", title: "Multiply", className: "is-command" },
    { label: "7", insert: "7", title: "Seven" },
    { label: "8", insert: "8", title: "Eight" },
    { label: "9", insert: "9", title: "Nine" },
    { label: "−", insert: "-", title: "Subtract", className: "is-command" },
    { label: "4", insert: "4", title: "Four" },
    { label: "5", insert: "5", title: "Five" },
    { label: "6", insert: "6", title: "Six" },
    { label: "+", insert: "+", title: "Add", className: "is-command" },
    { label: "1", insert: "1", title: "One" },
    { label: "2", insert: "2", title: "Two" },
    { label: "3", insert: "3", title: "Three" },
    { label: "=", action: "equals", title: "Equals", className: "is-equals" },
    { label: "0", insert: "0", title: "Zero", className: "is-zero" },
    { label: ".", insert: ".", title: "Decimal point" },
  ];

  const scientificCalculatorKeys = [
    { label: "sin", action: "sin", title: "Sine", className: "is-command" },
    { label: "cos", action: "cos", title: "Cosine", className: "is-command" },
    { label: "tan", action: "tan", title: "Tangent", className: "is-command" },
    { label: "π", insert: "pi", title: "Pi", className: "is-command" },
    { label: "log", action: "log", title: "Base-10 logarithm", className: "is-command" },
    { label: "ln", action: "ln", title: "Natural logarithm", className: "is-command" },
    { label: "e", insert: "e", title: "Euler's number", className: "is-command" },
    { label: "^", insert: "^", title: "Power", className: "is-command" },
    ...calculatorKeys,
  ];

  const calculatorRegistry = {
    standard: {
      category: "Core",
      label: "Standard",
      render: renderStandardCalculator,
      initialize: initializeStandardCalculator,
    },
    "date-time": {
      category: "Date & Time",
      label: "Date & Time",
      render: renderDateTimeCalculator,
      initialize: initializeDateTimeCalculator,
    },
    bmi: {
      category: "Health",
      label: "BMI",
      render: renderBmiCalculator,
      initialize: initializeBmiCalculator,
    },
  };

  function setStatus(message, type = "") {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
  }

  function setConverting(nextValue) {
    isConverting = nextValue;
    els.conversionButtons.forEach((button) => {
      button.disabled = nextValue;
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatCalculatorNumber(value) {
    if (!Number.isFinite(value)) {
      throw new Error("Result is out of range.");
    }

    const normalized = Object.is(value, -0) ? 0 : value;
    const absolute = Math.abs(normalized);
    if (absolute !== 0 && (absolute >= 1e12 || absolute < 1e-9)) {
      return normalized.toExponential(8).replace(/\.?0+e/, "e");
    }

    return String(Number.parseFloat(normalized.toPrecision(12)));
  }

  function stripCalculatorEquals(value) {
    return String(value || "").split("=")[0].trim();
  }

  function tokenizeCalculatorExpression(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      if (input.slice(index, index + 4).toLowerCase() === "sqrt") {
        tokens.push({ type: "sqrt", value: "sqrt" });
        index += 4;
        continue;
      }

      const functionMatch = input.slice(index).match(/^(?:sin|cos|tan|log|ln)\b/i);
      if (functionMatch) {
        tokens.push({ type: "function", value: functionMatch[0].toLowerCase() });
        index += functionMatch[0].length;
        continue;
      }

      if (input.slice(index, index + 2).toLowerCase() === "pi") {
        tokens.push({ type: "number", value: Math.PI });
        index += 2;
        continue;
      }

      if (char === "π") {
        tokens.push({ type: "number", value: Math.PI });
        index += 1;
        continue;
      }

      if (char.toLowerCase() === "e") {
        tokens.push({ type: "number", value: Math.E });
        index += 1;
        continue;
      }

      if (char === "√") {
        tokens.push({ type: "sqrt", value: "sqrt" });
        index += 1;
        continue;
      }

      if (/\d|\./.test(char)) {
        const numberMatch = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
        const numberText = numberMatch?.[0] || "";

        if (!numberText) {
          throw new Error("That decimal needs a number.");
        }

        tokens.push({ type: "number", value: Number(numberText) });
        index += numberText.length;
        continue;
      }

      const operatorMap = {
        "+": "+",
        "-": "-",
        "−": "-",
        "–": "-",
        "—": "-",
        "*": "*",
        "×": "*",
        "x": "*",
        "X": "*",
        "/": "/",
        "÷": "/",
        "^": "^",
      };

      if (operatorMap[char]) {
        tokens.push({ type: "operator", value: operatorMap[char] });
        index += 1;
        continue;
      }

      if (char === "(" || char === ")") {
        tokens.push({ type: "paren", value: char });
        index += 1;
        continue;
      }

      if (char === "%") {
        tokens.push({ type: "percent", value: "%" });
        index += 1;
        continue;
      }

      throw new Error(`Unsupported character: ${char}`);
    }

    return tokens;
  }

  function parseCalculatorExpression(input) {
    const expression = stripCalculatorEquals(input);
    if (!expression) {
      return 0;
    }

    const tokens = tokenizeCalculatorExpression(expression);
    let position = 0;

    function peek() {
      return tokens[position];
    }

    function consume() {
      const token = tokens[position];
      position += 1;
      return token;
    }

    function consumeValue(type, value = null) {
      const token = peek();
      if (!token || token.type !== type || (value !== null && token.value !== value)) {
        throw new Error("That expression is incomplete.");
      }
      return consume();
    }

    function parsePrimary() {
      const token = peek();
      if (!token) {
        throw new Error("That expression is incomplete.");
      }

      if (token.type === "number") {
        consume();
        return token.value;
      }

      if (token.type === "sqrt") {
        consume();
        consumeValue("paren", "(");
        const value = parseExpression();
        consumeValue("paren", ")");
        if (value < 0) {
          throw new Error("Cannot take the square root of a negative number.");
        }
        return Math.sqrt(value);
      }

      if (token.type === "function") {
        const functionName = consume().value;
        consumeValue("paren", "(");
        const value = parseExpression();
        consumeValue("paren", ")");
        if (functionName === "sin") return Math.sin(value);
        if (functionName === "cos") return Math.cos(value);
        if (functionName === "tan") return Math.tan(value);
        if (functionName === "log") {
          if (value <= 0) throw new Error("Log requires a positive number.");
          return Math.log10(value);
        }
        if (functionName === "ln") {
          if (value <= 0) throw new Error("Ln requires a positive number.");
          return Math.log(value);
        }
      }

      if (token.type === "paren" && token.value === "(") {
        consume();
        const value = parseExpression();
        consumeValue("paren", ")");
        return value;
      }

      throw new Error("That expression is incomplete.");
    }

    function parseFactor() {
      let sign = 1;
      while (peek()?.type === "operator" && (peek().value === "+" || peek().value === "-")) {
        if (consume().value === "-") sign *= -1;
      }

      let value = sign * parsePrimary();
      while (peek()?.type === "percent") {
        consume();
        value /= 100;
      }
      return value;
    }

    function parsePower() {
      let value = parseFactor();
      if (peek()?.type === "operator" && peek().value === "^") {
        consume();
        value = value ** parsePower();
      }
      return value;
    }

    function parseTerm() {
      let value = parsePower();
      while (peek()?.type === "operator" && (peek().value === "*" || peek().value === "/")) {
        const operator = consume().value;
        const right = parsePower();
        if (operator === "*") {
          value *= right;
        } else {
          if (Math.abs(right) < Number.EPSILON) {
            throw new Error("Cannot divide by zero.");
          }
          value /= right;
        }
      }
      return value;
    }

    function parseExpression() {
      let value = parseTerm();
      while (peek()?.type === "operator" && (peek().value === "+" || peek().value === "-")) {
        const operator = consume().value;
        const right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }

    const result = parseExpression();
    if (position < tokens.length) {
      throw new Error("That expression has extra characters.");
    }
    if (!Number.isFinite(result)) {
      throw new Error("Result is out of range.");
    }

    return result;
  }

  function renderCalculatorButton(button, buttonClass = "calculator-key") {
    const attributes = [
      `class="${buttonClass}${button.className ? ` ${button.className}` : ""}"`,
      "type=\"button\"",
      `title="${escapeHtml(button.title || button.label)}"`,
      `aria-label="${escapeHtml(button.title || button.label)}"`,
    ];

    if (button.action) {
      attributes.push(`data-calculator-action="${escapeHtml(button.action)}"`);
    }

    if (button.insert) {
      attributes.push(`data-calculator-insert="${escapeHtml(button.insert)}"`);
    }

    return `<button ${attributes.join(" ")}>${escapeHtml(button.label)}</button>`;
  }

  function renderStandardCalculator(definition) {
    return `
      <div class="calculator-titlebar">
        <label class="calculator-title-select-label">
          <span class="sr-only">Calculator mode</span>
          <select class="calculator-title-select" data-calculator-mode-select aria-label="Calculator mode">
            <option value="standard" selected>${escapeHtml(definition.label)}</option>
            <option value="scientific">Scientific</option>
          </select>
        </label>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="calculator-display">
        <input class="calculator-equation" data-calculator-equation type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Calculator equation">
        <div class="calculator-result" data-calculator-result aria-live="polite">0</div>
        <p class="calculator-status" data-calculator-status role="status" aria-live="polite" hidden></p>
      </div>
      <div class="calculator-memory-row" aria-label="Memory controls">
        ${calculatorMemoryButtons.map((button) => renderCalculatorButton(button, "calculator-memory-button")).join("")}
      </div>
      <div class="calculator-keypad" data-calculator-keypad-mode="standard" aria-label="Calculator keypad">
        ${calculatorKeys.map((button) => renderCalculatorButton(button)).join("")}
      </div>
      <div class="calculator-keypad scientific-keypad" data-calculator-keypad-mode="scientific" aria-label="Scientific calculator keypad" hidden>
        ${scientificCalculatorKeys.map((button) => renderCalculatorButton(button)).join("")}
      </div>
    `;
  }

  function renderScientificCalculator(definition) {
    return `
      <div class="calculator-titlebar">
        <strong>${escapeHtml(definition.label)}</strong>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="calculator-display">
        <input class="calculator-equation" data-calculator-equation type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Scientific calculator equation">
        <div class="calculator-result" data-calculator-result aria-live="polite">0</div>
        <p class="calculator-status" data-calculator-status role="status" aria-live="polite" hidden></p>
      </div>
      <div class="calculator-memory-row" aria-label="Memory controls">
        ${calculatorMemoryButtons.map((button) => renderCalculatorButton(button, "calculator-memory-button")).join("")}
      </div>
      <div class="calculator-keypad scientific-keypad" aria-label="Scientific calculator keypad">
        ${scientificCalculatorKeys.map((button) => renderCalculatorButton(button)).join("")}
      </div>
    `;
  }

  function renderBmiCalculator(definition, id) {
    return `
      <div class="calculator-titlebar">
        <strong>${escapeHtml(definition.label)}</strong>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="bmi-body">
        <div class="bmi-mode-tabs" role="tablist" aria-label="BMI unit modes">
          <button class="is-active" type="button" data-bmi-mode-button="us" aria-pressed="true">US</button>
          <button type="button" data-bmi-mode-button="metric" aria-pressed="false">Metric</button>
        </div>
        <section class="bmi-panel" data-bmi-panel="us" aria-label="US BMI calculator">
          <div class="bmi-fields bmi-fields-two">
            <div class="bmi-field">
              <label for="bmi-feet-${id}">Feet</label>
              <input id="bmi-feet-${id}" type="number" min="0" step="1" inputmode="numeric" data-bmi-field="feet">
            </div>
            <div class="bmi-field">
              <label for="bmi-inches-${id}">Inches</label>
              <input id="bmi-inches-${id}" type="number" min="0" step="0.1" inputmode="decimal" data-bmi-field="inches">
            </div>
            <div class="bmi-field bmi-field-span">
              <label for="bmi-pounds-${id}">Weight (lb)</label>
              <input id="bmi-pounds-${id}" type="number" min="0" step="0.1" inputmode="decimal" data-bmi-field="pounds">
            </div>
          </div>
        </section>
        <section class="bmi-panel" data-bmi-panel="metric" aria-label="Metric BMI calculator" hidden>
          <div class="bmi-fields">
            <div class="bmi-field">
              <label for="bmi-centimeters-${id}">Height (cm)</label>
              <input id="bmi-centimeters-${id}" type="number" min="0" step="0.1" inputmode="decimal" data-bmi-field="centimeters">
            </div>
            <div class="bmi-field">
              <label for="bmi-kilograms-${id}">Weight (kg)</label>
              <input id="bmi-kilograms-${id}" type="number" min="0" step="0.1" inputmode="decimal" data-bmi-field="kilograms">
            </div>
          </div>
        </section>
        <div class="bmi-result" data-bmi-result>
          <strong>Enter values</strong>
          <span>BMI will calculate automatically.</span>
        </div>
        <p class="bmi-note" data-bmi-note role="status" aria-live="polite"></p>
      </div>
    `;
  }

  function renderDateTimeCalculator(definition, id) {
    return `
      <div class="calculator-titlebar">
        <strong>${escapeHtml(definition.label)}</strong>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="date-time-body">
        <div class="date-time-mode-tabs" role="tablist" aria-label="Date and time calculator modes">
          <button class="is-active" type="button" data-date-time-mode-button="difference" aria-pressed="true">Date Difference</button>
          <button type="button" data-date-time-mode-button="duration" aria-pressed="false">Time Duration</button>
          <button type="button" data-date-time-mode-button="timezone" aria-pressed="false">Time Zone</button>
        </div>
        <section class="date-time-mode-panel" data-date-time-panel="difference" aria-label="Date difference calculator">
          <div class="date-time-fields">
            <div class="date-time-field">
              <label for="date-difference-start-${id}">Start Date</label>
              <input id="date-difference-start-${id}" type="date" data-date-field="difference-start">
            </div>
            <div class="date-time-field">
              <label for="date-difference-end-${id}">End Date</label>
              <input id="date-difference-end-${id}" type="date" data-date-field="difference-end">
            </div>
          </div>
          <div class="date-time-result" data-date-difference-result>
            <strong>Choose dates</strong>
            <span>Enter a start and end date.</span>
          </div>
        </section>
        <section class="date-time-mode-panel" data-date-time-panel="duration" aria-label="Time duration calculator" hidden>
          <div class="date-time-fields">
            <div class="date-time-field">
              <label for="time-duration-start-date-${id}">Start Date</label>
              <input id="time-duration-start-date-${id}" type="date" data-date-field="duration-start-date">
            </div>
            <div class="date-time-field">
              <label for="time-duration-start-time-${id}">Start Time</label>
              <input id="time-duration-start-time-${id}" type="time" data-date-field="duration-start-time">
            </div>
            <div class="date-time-field">
              <label for="time-duration-end-date-${id}">End Date</label>
              <input id="time-duration-end-date-${id}" type="date" data-date-field="duration-end-date">
            </div>
            <div class="date-time-field">
              <label for="time-duration-end-time-${id}">End Time</label>
              <input id="time-duration-end-time-${id}" type="time" data-date-field="duration-end-time">
            </div>
          </div>
          <div class="date-time-result" data-time-duration-result>
            <strong>Choose times</strong>
            <span>Enter start and end date/time values.</span>
          </div>
        </section>
        <section class="date-time-mode-panel" data-date-time-panel="timezone" aria-label="Time zone calculator" hidden>
          <div class="date-time-fields">
            <div class="date-time-field">
              <label for="time-zone-date-${id}">Date</label>
              <input id="time-zone-date-${id}" type="date" data-date-field="timezone-date">
            </div>
            <div class="date-time-field">
              <label for="time-zone-time-${id}">Time</label>
              <input id="time-zone-time-${id}" type="time" data-date-field="timezone-time">
            </div>
            <div class="date-time-field">
              <label for="time-zone-from-${id}">From Time Zone</label>
              <select id="time-zone-from-${id}" data-date-field="timezone-from">
                ${renderTimeZoneOptions(getUserTimeZone())}
              </select>
            </div>
            <div class="date-time-field">
              <label for="time-zone-to-${id}">To Time Zone</label>
              <select id="time-zone-to-${id}" data-date-field="timezone-to">
                ${renderTimeZoneOptions(getDefaultTargetTimeZone())}
              </select>
            </div>
          </div>
          <div class="date-time-result" data-time-zone-result>
            <strong>Choose time zones</strong>
            <span>Enter a date, time, and two time zones.</span>
          </div>
        </section>
        <p class="date-time-note" data-date-time-note role="status" aria-live="polite"></p>
      </div>
    `;
  }

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function parseDateOnly(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcDay = Date.UTC(year, month - 1, day) / 86400000;
    return { year, month, day, utcDay };
  }

  function parseLocalDateTime(dateValue, timeValue) {
    const date = parseDateOnly(dateValue);
    const timeMatch = String(timeValue || "").match(/^(\d{2}):(\d{2})$/);
    if (!date || !timeMatch) return null;

    return new Date(
      date.year,
      date.month - 1,
      date.day,
      Number(timeMatch[1]),
      Number(timeMatch[2]),
      0,
      0,
    );
  }

  function getUserTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }

  function getDefaultTargetTimeZone() {
    const localZone = getUserTimeZone();
    return localZone === "UTC" ? "America/New_York" : "UTC";
  }

  function getSupportedTimeZones() {
    const fallbackZones = [
      "UTC",
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "Europe/London",
      "Europe/Paris",
      "Europe/Berlin",
      "Asia/Tokyo",
      "Asia/Shanghai",
      "Asia/Kolkata",
      "Australia/Sydney",
    ];
    const supportedZones = typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : fallbackZones;
    return Array.from(new Set(["UTC", getUserTimeZone(), ...supportedZones])).sort((left, right) => {
      if (left === "UTC") return -1;
      if (right === "UTC") return 1;
      return left.localeCompare(right);
    });
  }

  function formatTimeZoneLabel(timeZone) {
    return timeZone.replaceAll("_", " ");
  }

  function renderTimeZoneOptions(selectedZone) {
    return getSupportedTimeZones()
      .map((timeZone) => {
        const selected = timeZone === selectedZone ? " selected" : "";
        return `<option value="${escapeHtml(timeZone)}"${selected}>${escapeHtml(formatTimeZoneLabel(timeZone))}</option>`;
      })
      .join("");
  }

  function getTimeZoneParts(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  }

  function getTimeZoneOffsetMs(date, timeZone) {
    const parts = getTimeZoneParts(date, timeZone);
    const zonedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return zonedUtc - date.getTime();
  }

  function parseDateTimeInTimeZone(dateValue, timeValue, timeZone) {
    const date = parseDateOnly(dateValue);
    const timeMatch = String(timeValue || "").match(/^(\d{2}):(\d{2})$/);
    if (!date || !timeMatch || !timeZone) return null;

    const wallTimeUtc = Date.UTC(date.year, date.month - 1, date.day, Number(timeMatch[1]), Number(timeMatch[2]), 0, 0);
    let utcTime = wallTimeUtc;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      utcTime = wallTimeUtc - getTimeZoneOffsetMs(new Date(utcTime), timeZone);
    }
    return new Date(utcTime);
  }

  function formatDateTimeForZone(date, timeZone) {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  }

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function toTimeInputValue(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function getCalendarDateDifference(startDate, endDate) {
    let years = endDate.year - startDate.year;
    let months = endDate.month - startDate.month;
    let days = endDate.day - startDate.day;

    if (days < 0) {
      months -= 1;
      const previousMonth = endDate.month === 1 ? 12 : endDate.month - 1;
      const previousMonthYear = endDate.month === 1 ? endDate.year - 1 : endDate.year;
      days += daysInMonth(previousMonthYear, previousMonth);
    }

    if (months < 0) {
      years -= 1;
      months += 12;
    }

    return { years, months, days };
  }

  function pluralize(value, word) {
    return `${value} ${word}${value === 1 ? "" : "s"}`;
  }

  function formatDurationHours(totalMinutes) {
    const totalHours = totalMinutes / 60;
    if (Number.isInteger(totalHours)) return String(totalHours);
    return String(Number.parseFloat(totalHours.toFixed(2)));
  }

  function formatBmi(value) {
    return String(Number.parseFloat(value.toFixed(1)));
  }

  function getBmiCategory(value) {
    if (value < 18.5) return "Underweight";
    if (value < 25) return "Normal weight";
    if (value < 30) return "Overweight";
    return "Obesity";
  }

  function setDateTimeNote(calculator, message, type = "") {
    if (!calculator.dateTimeNote) return;
    calculator.dateTimeNote.textContent = message || "";
    calculator.dateTimeNote.classList.toggle("is-error", type === "error");
  }

  function setDateTimeResult(container, heading, detail) {
    if (!container) return;
    const headingElement = container.querySelector("strong");
    const detailElement = container.querySelector("span");
    if (headingElement) headingElement.textContent = heading;
    if (detailElement) detailElement.textContent = detail;
  }

  function getDateTimeResultText(container) {
    if (!container) return "";
    const heading = container.querySelector("strong")?.textContent?.trim() || "";
    const detail = container.querySelector("span")?.textContent?.trim() || "";
    return [heading, detail].filter(Boolean).join("\n");
  }

  function updateDateDifference(calculator) {
    const startDate = parseDateOnly(calculator.dateFields.differenceStart.value);
    const endDate = parseDateOnly(calculator.dateFields.differenceEnd.value);

    if (!startDate || !endDate) {
      setDateTimeResult(calculator.dateDifferenceResult, "Choose dates", "Enter a start and end date.");
      setDateTimeNote(calculator, "");
      return;
    }

    const isReversed = startDate.utcDay > endDate.utcDay;
    const normalizedStart = isReversed ? endDate : startDate;
    const normalizedEnd = isReversed ? startDate : endDate;
    const totalDays = normalizedEnd.utcDay - normalizedStart.utcDay;
    const calendarDiff = getCalendarDateDifference(normalizedStart, normalizedEnd);

    setDateTimeResult(
      calculator.dateDifferenceResult,
      pluralize(totalDays, "day"),
      [
        pluralize(calendarDiff.years, "year"),
        pluralize(calendarDiff.months, "month"),
        pluralize(calendarDiff.days, "day"),
      ].join(", "),
    );
    setDateTimeNote(calculator, isReversed ? "Dates were reversed; showing absolute difference." : "");
  }

  function updateTimeDuration(calculator) {
    const startDate = calculator.dateFields.durationStartDate.value;
    const startTime = calculator.dateFields.durationStartTime.value;
    const endDate = calculator.dateFields.durationEndDate.value;
    const endTime = calculator.dateFields.durationEndTime.value;
    const start = parseLocalDateTime(startDate, startTime);
    const end = parseLocalDateTime(endDate, endTime);

    if (!start || !end) {
      setDateTimeResult(calculator.timeDurationResult, "Choose times", "Enter start and end date/time values.");
      setDateTimeNote(calculator, "");
      return;
    }

    const durationMs = end.getTime() - start.getTime();
    if (durationMs < 0) {
      setDateTimeResult(calculator.timeDurationResult, "Invalid range", "End date/time must be after start date/time.");
      setDateTimeNote(calculator, "End date/time is before start date/time.", "error");
      return;
    }

    const totalMinutes = Math.floor(durationMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    setDateTimeResult(
      calculator.timeDurationResult,
      `${days}d ${hours}h ${minutes}m`,
      `Total hours: ${formatDurationHours(totalMinutes)} • Total minutes: ${totalMinutes}`,
    );
    setDateTimeNote(calculator, "");
  }

  function updateTimeZone(calculator) {
    const dateValue = calculator.dateFields.timezoneDate.value;
    const timeValue = calculator.dateFields.timezoneTime.value;
    const fromTimeZone = calculator.dateFields.timezoneFrom.value;
    const toTimeZone = calculator.dateFields.timezoneTo.value;
    const sourceDate = parseDateTimeInTimeZone(dateValue, timeValue, fromTimeZone);

    if (!sourceDate) {
      setDateTimeResult(calculator.timeZoneResult, "Choose time zones", "Enter a date, time, and two time zones.");
      setDateTimeNote(calculator, "");
      return;
    }

    setDateTimeResult(
      calculator.timeZoneResult,
      formatDateTimeForZone(sourceDate, toTimeZone),
      `From ${formatDateTimeForZone(sourceDate, fromTimeZone)}`,
    );
    setDateTimeNote(calculator, "");
  }

  function updateDateTimeCalculator(calculator) {
    if (calculator.dateTimeMode === "timezone") {
      updateTimeZone(calculator);
      return;
    }

    if (calculator.dateTimeMode === "duration") {
      updateTimeDuration(calculator);
      return;
    }
    updateDateDifference(calculator);
  }

  function setDateTimeMode(calculator, mode) {
    calculator.dateTimeMode = ["duration", "timezone"].includes(mode) ? mode : "difference";
    calculator.dateTimeModeButtons.forEach((button) => {
      const isActive = button.dataset.dateTimeModeButton === calculator.dateTimeMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    calculator.dateTimePanels.forEach((panel) => {
      panel.hidden = panel.dataset.dateTimePanel !== calculator.dateTimeMode;
    });
    updateDateTimeCalculator(calculator);
  }

  function setCalculatorMode(calculator, mode) {
    calculator.calculatorMode = mode === "scientific" ? "scientific" : "standard";
    calculator.element.classList.toggle("scientific-calculator", calculator.calculatorMode === "scientific");

    if (calculator.modeSelect && calculator.modeSelect.value !== calculator.calculatorMode) {
      calculator.modeSelect.value = calculator.calculatorMode;
    }

    calculator.keypads?.forEach((keypad) => {
      keypad.hidden = keypad.dataset.calculatorKeypadMode !== calculator.calculatorMode;
    });
  }

  function initializeStandardCalculator(calculator) {
    const element = calculator.element;
    calculator.calculatorMode = "standard";
    calculator.expression = "";
    calculator.result = "0";
    calculator.memory = 0;
    calculator.justEvaluated = false;
    calculator.modeSelect = element.querySelector("[data-calculator-mode-select]");
    calculator.keypads = Array.from(element.querySelectorAll("[data-calculator-keypad-mode]"));
    calculator.equationInput = element.querySelector("[data-calculator-equation]");
    calculator.resultDisplay = element.querySelector("[data-calculator-result]");
    calculator.status = element.querySelector("[data-calculator-status]");
    calculator.memoryButtons = Array.from(element.querySelectorAll(".calculator-memory-button"));

    calculator.modeSelect?.addEventListener("change", () => {
      setCalculatorMode(calculator, calculator.modeSelect.value);
      calculator.equationInput?.focus({ preventScroll: true });
    });

    calculator.equationInput.addEventListener("input", () => {
      calculator.expression = calculator.equationInput.value;
      calculator.justEvaluated = calculator.expression.trimEnd().endsWith("=");
      setCalculatorMessage(calculator, "");
    });

    calculator.equationInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleCalculatorAction(calculator, "equals");
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleCalculatorAction(calculator, "clear");
      }
    });

    element.querySelectorAll("[data-calculator-insert]").forEach((button) => {
      button.addEventListener("click", () => {
        insertCalculatorText(calculator, button.dataset.calculatorInsert);
      });
    });

    element.querySelectorAll("[data-calculator-action]").forEach((button) => {
      button.addEventListener("click", () => {
        handleCalculatorAction(calculator, button.dataset.calculatorAction);
      });
    });

    setCalculatorMode(calculator, "standard");
    syncCalculator(calculator);
  }

  function initializeDateTimeCalculator(calculator) {
    const element = calculator.element;
    calculator.dateTimeMode = "difference";
    calculator.dateTimeModeButtons = Array.from(element.querySelectorAll("[data-date-time-mode-button]"));
    calculator.dateTimePanels = Array.from(element.querySelectorAll("[data-date-time-panel]"));
    calculator.dateTimeNote = element.querySelector("[data-date-time-note]");
    calculator.dateDifferenceResult = element.querySelector("[data-date-difference-result]");
    calculator.timeDurationResult = element.querySelector("[data-time-duration-result]");
    calculator.timeZoneResult = element.querySelector("[data-time-zone-result]");
    calculator.dateFields = {
      differenceStart: element.querySelector("[data-date-field=\"difference-start\"]"),
      differenceEnd: element.querySelector("[data-date-field=\"difference-end\"]"),
      durationStartDate: element.querySelector("[data-date-field=\"duration-start-date\"]"),
      durationStartTime: element.querySelector("[data-date-field=\"duration-start-time\"]"),
      durationEndDate: element.querySelector("[data-date-field=\"duration-end-date\"]"),
      durationEndTime: element.querySelector("[data-date-field=\"duration-end-time\"]"),
      timezoneDate: element.querySelector("[data-date-field=\"timezone-date\"]"),
      timezoneTime: element.querySelector("[data-date-field=\"timezone-time\"]"),
      timezoneFrom: element.querySelector("[data-date-field=\"timezone-from\"]"),
      timezoneTo: element.querySelector("[data-date-field=\"timezone-to\"]"),
    };

    const now = new Date();
    calculator.dateFields.timezoneDate.value = toDateInputValue(now);
    calculator.dateFields.timezoneTime.value = toTimeInputValue(now);

    calculator.dateTimeModeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setDateTimeMode(calculator, button.dataset.dateTimeModeButton);
      });
    });

    Object.values(calculator.dateFields).forEach((field) => {
      if (!field) return;
      field.addEventListener("input", () => updateDateTimeCalculator(calculator));
      field.addEventListener("change", () => updateDateTimeCalculator(calculator));
    });

    updateDateTimeCalculator(calculator);
  }

  function setBmiResult(calculator, heading, detail) {
    if (!calculator.bmiResult) return;
    const headingElement = calculator.bmiResult.querySelector("strong");
    const detailElement = calculator.bmiResult.querySelector("span");
    if (headingElement) headingElement.textContent = heading;
    if (detailElement) detailElement.textContent = detail;
  }

  function setBmiNote(calculator, message, type = "") {
    if (!calculator.bmiNote) return;
    calculator.bmiNote.textContent = message || "";
    calculator.bmiNote.classList.toggle("is-error", type === "error");
  }

  function updateBmiCalculator(calculator) {
    let bmi = null;

    if (calculator.bmiMode === "metric") {
      const centimeters = Number(calculator.bmiFields.centimeters.value);
      const kilograms = Number(calculator.bmiFields.kilograms.value);
      if (centimeters > 0 && kilograms > 0) {
        const meters = centimeters / 100;
        bmi = kilograms / (meters * meters);
      }
    } else {
      const feet = Number(calculator.bmiFields.feet.value);
      const inches = Number(calculator.bmiFields.inches.value);
      const pounds = Number(calculator.bmiFields.pounds.value);
      const totalInches = feet * 12 + inches;
      if (totalInches > 0 && pounds > 0) {
        bmi = (pounds / (totalInches * totalInches)) * 703;
      }
    }

    if (!Number.isFinite(bmi) || bmi === null) {
      setBmiResult(calculator, "Enter values", "BMI will calculate automatically.");
      setBmiNote(calculator, "");
      return;
    }

    setBmiResult(calculator, formatBmi(bmi), getBmiCategory(bmi));
    setBmiNote(calculator, "BMI is a screening estimate, not a medical diagnosis.");
  }

  function setBmiMode(calculator, mode) {
    calculator.bmiMode = mode === "metric" ? "metric" : "us";
    calculator.bmiModeButtons.forEach((button) => {
      const isActive = button.dataset.bmiModeButton === calculator.bmiMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    calculator.bmiPanels.forEach((panel) => {
      panel.hidden = panel.dataset.bmiPanel !== calculator.bmiMode;
    });
    updateBmiCalculator(calculator);
  }

  function initializeBmiCalculator(calculator) {
    const element = calculator.element;
    calculator.bmiMode = "us";
    calculator.bmiModeButtons = Array.from(element.querySelectorAll("[data-bmi-mode-button]"));
    calculator.bmiPanels = Array.from(element.querySelectorAll("[data-bmi-panel]"));
    calculator.bmiResult = element.querySelector("[data-bmi-result]");
    calculator.bmiNote = element.querySelector("[data-bmi-note]");
    calculator.bmiFields = {
      feet: element.querySelector("[data-bmi-field=\"feet\"]"),
      inches: element.querySelector("[data-bmi-field=\"inches\"]"),
      pounds: element.querySelector("[data-bmi-field=\"pounds\"]"),
      centimeters: element.querySelector("[data-bmi-field=\"centimeters\"]"),
      kilograms: element.querySelector("[data-bmi-field=\"kilograms\"]"),
    };

    calculator.bmiModeButtons.forEach((button) => {
      button.addEventListener("click", () => setBmiMode(calculator, button.dataset.bmiModeButton));
    });

    Object.values(calculator.bmiFields).forEach((field) => {
      if (!field) return;
      field.addEventListener("input", () => updateBmiCalculator(calculator));
      field.addEventListener("change", () => updateBmiCalculator(calculator));
    });

    updateBmiCalculator(calculator);
  }

  function getCalculatorCopyText(calculator) {
    if (calculator.type === "date-time") {
      const modeLabels = {
        difference: "Date Difference",
        duration: "Time Duration",
        timezone: "Time Zone",
      };
      const resultContainer = calculator.dateTimeMode === "duration"
        ? calculator.timeDurationResult
        : calculator.dateTimeMode === "timezone"
          ? calculator.timeZoneResult
          : calculator.dateDifferenceResult;
      const note = calculator.dateTimeNote?.textContent?.trim() || "";
      return [
        `Date & Time — ${modeLabels[calculator.dateTimeMode] || "Date Difference"}`,
        getDateTimeResultText(resultContainer),
        note,
      ].filter(Boolean).join("\n");
    }

    if (calculator.type === "bmi") {
      const heading = calculator.bmiResult?.querySelector("strong")?.textContent?.trim() || "";
      const detail = calculator.bmiResult?.querySelector("span")?.textContent?.trim() || "";
      const note = calculator.bmiNote?.textContent?.trim() || "";
      return ["BMI", heading, detail, note].filter(Boolean).join("\n");
    }

    const equation = calculator.equationInput?.value?.trim() || "";
    const result = calculator.resultDisplay?.textContent?.trim() || calculator.result || "0";
    return equation ? `${equation} ${result}`.trim() : result;
  }

  function setCalculatorCopyMessage(calculator, message, type = "info") {
    if (calculator.type === "date-time") {
      setDateTimeNote(calculator, message, type === "error" ? "error" : "");
      return;
    }

    if (calculator.type === "bmi") {
      setBmiNote(calculator, message, type === "error" ? "error" : "");
      return;
    }
    setCalculatorMessage(calculator, message, type);
  }

  async function copyCalculatorResult(calculator) {
    const copyText = getCalculatorCopyText(calculator);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = copyText;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.append(textArea);
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      setCalculatorCopyMessage(calculator, "Copied.");
    } catch (error) {
      setCalculatorCopyMessage(calculator, "Could not copy.", "error");
    }
  }

  function setActiveCalculator(id) {
    activeCalculatorId = id;
    calculators.forEach((calculator) => {
      calculator.element.classList.toggle("is-active", calculator.id === id);
    });
  }

  function setCalculatorMessage(calculator, message, type = "error") {
    calculator.status.textContent = message || "";
    calculator.status.hidden = !message;
    calculator.status.classList.toggle("is-info", type === "info");
  }

  function updateCalculatorMemoryButtons(calculator) {
    const hasMemory = Math.abs(calculator.memory) > Number.EPSILON;
    calculator.memoryButtons.forEach((button) => {
      const action = button.dataset.calculatorAction;
      if (action === "memory-clear" || action === "memory-recall" || action === "memory-show") {
        button.disabled = !hasMemory;
      }
    });
  }

  function syncCalculator(calculator, { focus = false, cursor = null } = {}) {
    calculator.equationInput.value = calculator.expression;
    calculator.resultDisplay.textContent = calculator.result || "0";
    updateCalculatorMemoryButtons(calculator);

    if (focus) {
      calculator.equationInput.focus({ preventScroll: true });
      const nextCursor = cursor ?? calculator.equationInput.value.length;
      calculator.equationInput.setSelectionRange(nextCursor, nextCursor);
    }
  }

  function getCalculatorNumericValue(calculator) {
    const expression = stripCalculatorEquals(calculator.equationInput.value);
    if (expression) {
      return parseCalculatorExpression(expression);
    }
    return Number(calculator.result || 0);
  }

  function evaluateCalculator(calculator) {
    const expression = stripCalculatorEquals(calculator.equationInput.value);
    const result = parseCalculatorExpression(expression);
    calculator.result = formatCalculatorNumber(result);
    calculator.expression = `${expression || "0"} =`;
    calculator.justEvaluated = true;
    setCalculatorMessage(calculator, "");
    syncCalculator(calculator, { focus: true });
  }

  function insertCalculatorText(calculator, rawValue) {
    const isOperator = ["+", "-", "*", "/"].includes(rawValue);
    const insertion = isOperator ? ` ${rawValue} ` : rawValue;
    let currentValue = stripCalculatorEquals(calculator.equationInput.value);
    let selectionStart = calculator.equationInput.selectionStart ?? currentValue.length;
    let selectionEnd = calculator.equationInput.selectionEnd ?? selectionStart;

    if (calculator.justEvaluated) {
      currentValue = isOperator ? calculator.result : "";
      selectionStart = currentValue.length;
      selectionEnd = currentValue.length;
      calculator.justEvaluated = false;
    }

    const nextValue = `${currentValue.slice(0, selectionStart)}${insertion}${currentValue.slice(selectionEnd)}`;
    const nextCursor = selectionStart + insertion.length;
    calculator.expression = nextValue;
    setCalculatorMessage(calculator, "");
    syncCalculator(calculator, { focus: true, cursor: nextCursor });
  }

  function clearCalculatorEntry(value) {
    const expression = stripCalculatorEquals(value).trimEnd();
    if (!expression) return "";

    const withoutTrailingOperator = expression.replace(/\s*[+\-*/]\s*$/, "");
    if (withoutTrailingOperator !== expression) return withoutTrailingOperator.trimEnd();

    return expression
      .replace(/(?:sqrt\s*\()?-?\d*\.?\d+%?\)?\s*$/i, "")
      .trimEnd();
  }

  function toggleCalculatorSign(value) {
    const expression = stripCalculatorEquals(value).trimEnd();
    if (!expression) return "-";

    const match = expression.match(/-?\d*\.?\d+\s*$/);
    if (!match) {
      return `-(${expression})`;
    }

    const numberText = match[0].trim();
    const start = match.index ?? expression.length;
    const toggled = numberText.startsWith("-") ? numberText.slice(1) : `-${numberText}`;
    return `${expression.slice(0, start)}${toggled}`;
  }

  function runCalculatorUnary(calculator, operation) {
    const value = getCalculatorNumericValue(calculator);
    let result;
    let expression;

    if (operation === "reciprocal") {
      if (Math.abs(value) < Number.EPSILON) {
        throw new Error("Cannot divide by zero.");
      }
      result = 1 / value;
      expression = `1 / (${formatCalculatorNumber(value)}) =`;
    } else if (operation === "square") {
      result = value * value;
      const displayValue = formatCalculatorNumber(value);
      expression = `(${displayValue} * ${displayValue}) =`;
    } else {
      if (value < 0) {
        throw new Error("Cannot take the square root of a negative number.");
      }
      result = Math.sqrt(value);
      expression = `sqrt(${formatCalculatorNumber(value)}) =`;
    }

    calculator.result = formatCalculatorNumber(result);
    calculator.expression = expression;
    calculator.justEvaluated = true;
    setCalculatorMessage(calculator, "");
    syncCalculator(calculator, { focus: true });
  }

  function handleCalculatorAction(calculator, action) {
    try {
      if (action === "equals") {
        evaluateCalculator(calculator);
        return;
      }

      if (action === "clear") {
        calculator.expression = "";
        calculator.result = "0";
        calculator.justEvaluated = false;
        setCalculatorMessage(calculator, "");
        syncCalculator(calculator, { focus: true });
        return;
      }

      if (action === "clear-entry") {
        calculator.expression = clearCalculatorEntry(calculator.equationInput.value);
        calculator.justEvaluated = false;
        setCalculatorMessage(calculator, "");
        syncCalculator(calculator, { focus: true });
        return;
      }

      if (action === "backspace") {
        calculator.expression = stripCalculatorEquals(calculator.equationInput.value).slice(0, -1).trimEnd();
        calculator.justEvaluated = false;
        setCalculatorMessage(calculator, "");
        syncCalculator(calculator, { focus: true });
        return;
      }

      if (action === "toggle-sign") {
        calculator.expression = toggleCalculatorSign(calculator.equationInput.value);
        calculator.justEvaluated = false;
        setCalculatorMessage(calculator, "");
        syncCalculator(calculator, { focus: true });
        return;
      }

      if (action === "reciprocal" || action === "square" || action === "sqrt") {
        runCalculatorUnary(calculator, action);
        return;
      }

      if (["sin", "cos", "tan", "log", "ln"].includes(action)) {
        const currentValue = stripCalculatorEquals(calculator.equationInput.value);
        const wrappedValue = currentValue || calculator.result || "0";
        calculator.expression = `${action}(${wrappedValue})`;
        calculator.justEvaluated = false;
        setCalculatorMessage(calculator, "");
        syncCalculator(calculator, { focus: true });
        return;
      }

      if (action === "memory-clear") {
        calculator.memory = 0;
        setCalculatorMessage(calculator, "Memory cleared.", "info");
        updateCalculatorMemoryButtons(calculator);
        return;
      }

      if (action === "memory-recall") {
        insertCalculatorText(calculator, formatCalculatorNumber(calculator.memory));
        return;
      }

      if (action === "memory-add" || action === "memory-subtract" || action === "memory-store") {
        const value = getCalculatorNumericValue(calculator);
        if (action === "memory-add") calculator.memory += value;
        if (action === "memory-subtract") calculator.memory -= value;
        if (action === "memory-store") calculator.memory = value;
        setCalculatorMessage(calculator, `Memory: ${formatCalculatorNumber(calculator.memory)}`, "info");
        updateCalculatorMemoryButtons(calculator);
        return;
      }

      if (action === "memory-show") {
        setCalculatorMessage(calculator, `Memory: ${formatCalculatorNumber(calculator.memory)}`, "info");
      }
    } catch (error) {
      setCalculatorMessage(calculator, error instanceof Error ? error.message : "Could not calculate.");
    }
  }

  function closeCalculator(id) {
    const calculator = calculators.get(id);
    if (!calculator) return;

    calculator.element.remove();
    calculators.delete(id);

    if (activeCalculatorId === id) {
      const remainingIds = Array.from(calculators.keys());
      activeCalculatorId = null;
      if (remainingIds.length) {
        setActiveCalculator(remainingIds[remainingIds.length - 1]);
      }
    }
  }

  function setCalculatorMenuOpen(isOpen) {
    if (!els.calculatorMenuTrigger || !els.calculatorMenuPanel) return;
    els.calculatorMenuTrigger.setAttribute("aria-expanded", String(isOpen));
    els.calculatorMenuPanel.hidden = !isOpen;
  }

  function isCalculatorMenuOpen() {
    return Boolean(els.calculatorMenuPanel && !els.calculatorMenuPanel.hidden);
  }

  function toggleCalculatorMenu() {
    setCalculatorMenuOpen(!isCalculatorMenuOpen());
  }

  function createCalculator(type = "standard") {
    if (!els.calculatorGrid) return null;

    const definition = calculatorRegistry[type] || calculatorRegistry.standard;
    const calculatorType = calculatorRegistry[type] ? type : "standard";

    const id = nextCalculatorId;
    nextCalculatorId += 1;

    const element = document.createElement("section");
    element.className = "calculator-window";
    element.tabIndex = 0;
    element.dataset.calculatorId = String(id);
    element.dataset.calculatorType = calculatorType;
    element.setAttribute("aria-label", `${definition.label} calculator ${id}`);
    element.innerHTML = `
      <div class="calculator-titlebar">
        <strong>${escapeHtml(definition.label)}</strong>
        <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
      </div>
      <div class="calculator-display">
        <input class="calculator-equation" data-calculator-equation type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Calculator equation">
        <div class="calculator-result" data-calculator-result aria-live="polite">0</div>
        <p class="calculator-status" data-calculator-status role="status" aria-live="polite" hidden></p>
      </div>
      <div class="calculator-memory-row" aria-label="Memory controls">
        ${calculatorMemoryButtons.map((button) => renderCalculatorButton(button, "calculator-memory-button")).join("")}
      </div>
      <div class="calculator-keypad" aria-label="Calculator keypad">
        ${calculatorKeys.map((button) => renderCalculatorButton(button)).join("")}
      </div>
    `;

    const calculator = {
      id,
      element,
      expression: "",
      result: "0",
      memory: 0,
      justEvaluated: false,
      equationInput: element.querySelector("[data-calculator-equation]"),
      resultDisplay: element.querySelector("[data-calculator-result]"),
      status: element.querySelector("[data-calculator-status]"),
      memoryButtons: Array.from(element.querySelectorAll(".calculator-memory-button")),
    };

    calculators.set(id, calculator);
    els.calculatorGrid.append(element);

    element.addEventListener("pointerdown", () => setActiveCalculator(id));
    element.addEventListener("focusin", () => setActiveCalculator(id));

    element.querySelector("[data-calculator-close]").addEventListener("click", (event) => {
      event.stopPropagation();
      closeCalculator(id);
    });

    calculator.equationInput.addEventListener("input", () => {
      calculator.expression = calculator.equationInput.value;
      calculator.justEvaluated = calculator.expression.trimEnd().endsWith("=");
      setCalculatorMessage(calculator, "");
    });

    calculator.equationInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleCalculatorAction(calculator, "equals");
      }

      if (event.key === "Escape") {
        event.preventDefault();
        handleCalculatorAction(calculator, "clear");
      }
    });

    element.querySelectorAll("[data-calculator-insert]").forEach((button) => {
      button.addEventListener("click", () => {
        insertCalculatorText(calculator, button.dataset.calculatorInsert);
      });
    });

    element.querySelectorAll("[data-calculator-action]").forEach((button) => {
      button.addEventListener("click", () => {
        handleCalculatorAction(calculator, button.dataset.calculatorAction);
      });
    });

    syncCalculator(calculator);
    setActiveCalculator(id);
    return calculator;
  }

  function createCalculatorCard(type = "standard") {
    if (!els.calculatorGrid) return null;

    const definition = calculatorRegistry[type] || calculatorRegistry.standard;
    const calculatorType = calculatorRegistry[type] ? type : "standard";
    const id = nextCalculatorId;
    nextCalculatorId += 1;

    const element = document.createElement("section");
    const typeClassMap = {
      "date-time": "date-time-calculator",
      bmi: "bmi-calculator",
    };
    element.className = `calculator-window${typeClassMap[calculatorType] ? ` ${typeClassMap[calculatorType]}` : ""}`;
    element.tabIndex = 0;
    element.dataset.calculatorId = String(id);
    element.dataset.calculatorType = calculatorType;
    element.setAttribute("aria-label", `${definition.label} calculator ${id}`);
    element.innerHTML = definition.render(definition, id);

    const calculator = {
      id,
      type: calculatorType,
      element,
    };

    calculators.set(id, calculator);
    els.calculatorGrid.append(element);

    element.addEventListener("pointerdown", () => setActiveCalculator(id));
    element.addEventListener("focusin", () => setActiveCalculator(id));

    element.querySelector("[data-calculator-close]").addEventListener("click", (event) => {
      event.stopPropagation();
      closeCalculator(id);
    });

    element.querySelector("[data-calculator-copy]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      copyCalculatorResult(calculator);
    });

    definition.initialize(calculator);
    setActiveCalculator(id);
    return calculator;
  }

  function sanitizeRichHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";
    const blockedSelector = [
      "script",
      "style",
      "noscript",
      "template",
      "iframe",
      "object",
      "embed",
      "svg",
      "canvas",
      "form",
      "input",
      "button",
      "select",
      "textarea",
    ].join(",");

    template.content.querySelectorAll(blockedSelector).forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value || "";

        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "href" && node.tagName.toLowerCase() === "a") {
          const cleanValue = value.trim();
          if (/^(https?:|mailto:|#)/i.test(cleanValue)) {
            node.setAttribute("href", cleanValue);
            node.setAttribute("rel", "noopener noreferrer");
          } else {
            node.removeAttribute(attribute.name);
          }
          return;
        }

        if (name === "style") {
          const match = value.match(/text-align\s*:\s*(left|right|center|justify)/i);
          if (match) {
            node.setAttribute("style", `text-align: ${match[1].toLowerCase()};`);
          } else {
            node.removeAttribute(attribute.name);
          }
          return;
        }

        node.removeAttribute(attribute.name);
      });
    });

    return template.innerHTML.trim();
  }

  function getCurrentMode() {
    return els.modeSelect.value === "raw" ? "raw" : "wysiwyg";
  }

  function getRichEditorText() {
    return (els.richEditor.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getConverterInput() {
    if (getCurrentMode() === "raw") {
      return els.rawInput.value.trim();
    }

    const sanitizedHtml = sanitizeRichHtml(els.richEditor.innerHTML);
    return getRichEditorText() ? sanitizedHtml : "";
  }

  function switchInputMode(mode) {
    const nextMode = mode === "raw" ? "raw" : "wysiwyg";
    if (nextMode === "raw" && !els.rawInput.value.trim() && getRichEditorText()) {
      els.rawInput.value = els.richEditor.innerText.trim();
    }

    if (nextMode === "wysiwyg" && !getRichEditorText() && els.rawInput.value.trim()) {
      els.richEditor.textContent = els.rawInput.value;
    }

    els.modeSelect.value = nextMode;
    els.richWrap.hidden = nextMode === "raw";
    els.rawInput.hidden = nextMode !== "raw";
    setStatus("");
  }

  function focusRichEditor() {
    els.richEditor.focus({ preventScroll: true });
  }

  function runRichCommand(command, value = null) {
    focusRichEditor();
    document.execCommand(command, false, value);
  }

  function selectionIsInsideRichEditor() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const anchor = selection.anchorNode;
    return Boolean(anchor && els.richEditor.contains(anchor));
  }

  function insertHtmlAtSelection(html) {
    focusRichEditor();
    document.execCommand("insertHTML", false, html);
  }

  function insertInlineCode() {
    const selection = window.getSelection();
    const selectedText = selectionIsInsideRichEditor() ? selection.toString() : "";
    insertHtmlAtSelection(`<code>${escapeHtml(selectedText || "code")}</code>`);
  }

  function createLink() {
    if (!selectionIsInsideRichEditor()) {
      focusRichEditor();
    }

    const url = window.prompt("Enter the link URL:");
    if (!url) return;
    const cleanUrl = url.trim();
    if (!/^(https?:|mailto:)/i.test(cleanUrl)) {
      setStatus("Links must start with http://, https://, or mailto:.", "error");
      return;
    }

    runRichCommand("createLink", cleanUrl);
  }

  async function getFunctionResponse(name, options = {}) {
    if (!usefulThingsSupabase) {
      throw new Error("Supabase is not initialized.");
    }

    const { data: sessionData, error: sessionError } = await usefulThingsSupabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      throw sessionError || new Error("You must be signed in.");
    }

    const config = window.CENTRALIS_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) {
      throw new Error("Supabase configuration is missing.");
    }

    return fetch(`${config.url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: config.publishableKey,
        ...(options.headers || {}),
      },
      body: options.body,
    });
  }

  async function parseFunctionError(response, fallback) {
    try {
      const payload = await response.json();
      return payload?.error || payload?.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function convertText(targetFormat) {
    if (isConverting) return;

    const input = getConverterInput();
    if (!input) {
      setStatus("Add text on the left before converting.", "error");
      return;
    }

    setConverting(true);
    setStatus(`Converting to ${targetFormat.replaceAll("-", " ")}...`);

    try {
      const response = await getFunctionResponse("convert-text-format", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: getCurrentMode(),
          targetFormat,
          input,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseFunctionError(response, "Could not convert text."));
      }

      const payload = await response.json();
      els.output.value = String(payload.output || "").trim();
      setStatus("Conversion complete.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Could not convert text.", "error");
    } finally {
      setConverting(false);
    }
  }

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.usefulTab;
      els.tabs.forEach((button) => {
        const isActive = button === tab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      els.panels.forEach((panel) => {
        const isActive = panel.dataset.usefulPanel === tabName;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      });
    });
  });

  if (els.calculatorGrid) {
    createCalculatorCard("standard");

    if (els.calculatorMenuTrigger && els.calculatorMenuPanel) {
      els.calculatorMenuTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleCalculatorMenu();
      });

      els.calculatorTypeButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          createCalculatorCard(button.dataset.addCalculatorType || "standard");
          setCalculatorMenuOpen(false);
        });
      });

      document.addEventListener("click", (event) => {
        if (!isCalculatorMenuOpen()) return;
        if (els.calculatorAddMenu && els.calculatorAddMenu.contains(event.target)) return;
        setCalculatorMenuOpen(false);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isCalculatorMenuOpen()) {
          setCalculatorMenuOpen(false);
          els.calculatorMenuTrigger.focus({ preventScroll: true });
        }
      });
    }
  }

  els.modeSelect.addEventListener("change", () => {
    switchInputMode(els.modeSelect.value);
  });

  els.richCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      runRichCommand(button.dataset.richCommand);
    });
  });

  els.richBlockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      runRichCommand("formatBlock", button.dataset.richBlock);
    });
  });

  if (els.richHeading) {
    els.richHeading.addEventListener("change", () => {
      runRichCommand("formatBlock", els.richHeading.value);
      els.richHeading.value = "P";
    });
  }

  if (els.richLinkButton) {
    els.richLinkButton.addEventListener("click", createLink);
  }

  if (els.richInlineCodeButton) {
    els.richInlineCodeButton.addEventListener("click", insertInlineCode);
  }

  els.conversionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      convertText(button.dataset.convertTarget);
    });
  });

  switchInputMode("wysiwyg");
})();
