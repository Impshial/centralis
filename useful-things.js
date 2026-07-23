(function initUsefulThings() {
  const usefulThingsSupabase = window.centralisSupabase;

  const els = {
    tabs: Array.from(document.querySelectorAll("[data-useful-tab]")),
    panels: Array.from(document.querySelectorAll("[data-useful-panel]")),
    adminOnly: Array.from(document.querySelectorAll("[data-admin-only]")),
    modeSelect: document.querySelector("[data-text-converter-mode]"),
    clearInputButton: document.querySelector("[data-text-clear-input]"),
    saveInputButton: document.querySelector("[data-text-save-input]"),
    richWrap: document.querySelector("[data-rich-input-wrap]"),
    richEditor: document.querySelector("[data-text-rich-editor]"),
    rawInput: document.querySelector("[data-text-raw-input]"),
    output: document.querySelector("[data-text-output]"),
    saveOutputButton: document.querySelector("[data-text-save-output]"),
    outputBusy: document.querySelector("[data-text-output-busy]"),
    outputFormat: document.querySelector("[data-text-output-format]"),
    outputCopyButton: document.querySelector("[data-text-output-copy]"),
    outputCopyMenu: document.querySelector("[data-text-output-copy-menu]"),
    outputCopyMenuTrigger: document.querySelector("[data-text-output-copy-menu-trigger]"),
    outputCopyMenuPanel: document.querySelector("[data-text-output-copy-menu-panel]"),
    outputCopyOptionButtons: Array.from(document.querySelectorAll("[data-text-copy-option]")),
    showPromptButton: document.querySelector("[data-text-show-prompt]"),
    promptModal: document.querySelector("[data-text-converter-prompt-modal]"),
    promptTextarea: document.querySelector("[data-text-converter-prompt-textarea]"),
    promptCloseButtons: Array.from(document.querySelectorAll("[data-text-converter-prompt-close]")),
    status: document.querySelector("[data-text-converter-status]"),
    conversionButtons: Array.from(document.querySelectorAll("[data-convert-target]")),
    instructionModal: document.querySelector("[data-text-converter-instructions-modal]"),
    instructionTextarea: document.querySelector("[data-text-converter-instructions-textarea]"),
    instructionSubtitle: document.querySelector("[data-text-converter-instructions-subtitle]"),
    instructionCancelButton: document.querySelector("[data-text-converter-instructions-cancel]"),
    instructionConfirmButton: document.querySelector("[data-text-converter-instructions-confirm]"),
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
    generatorGrid: document.querySelector("[data-generator-grid]"),
    generatorAddMenu: document.querySelector("[data-generator-add-menu]"),
    generatorMenuTrigger: document.querySelector("[data-generator-menu-trigger]"),
    generatorMenuPanel: document.querySelector("[data-generator-menu-panel]"),
    generatorTypeButtons: Array.from(document.querySelectorAll("[data-add-generator-type]")),
    storageBrowser: document.querySelector("[data-storage-browser]"),
    storageTree: document.querySelector("[data-storage-tree]"),
    storageBreadcrumbs: document.querySelector("[data-storage-breadcrumbs]"),
    storageStatus: document.querySelector("[data-storage-status]"),
    storageItems: document.querySelector("[data-storage-items]"),
    storageViewButtons: Array.from(document.querySelectorAll("[data-storage-view]")),
    storageLoadMore: document.querySelector("[data-storage-load-more]"),
    storagePreviewEmpty: document.querySelector("[data-storage-preview-empty]"),
    storagePreviewContent: document.querySelector("[data-storage-preview-content]"),
    storageImagePreview: document.querySelector("[data-storage-image-preview]"),
    storagePreviewImage: document.querySelector("[data-storage-preview-image]"),
    storageFilePreviewIcon: document.querySelector("[data-storage-file-preview-icon]"),
    storageFileMetadata: document.querySelector("[data-storage-file-metadata]"),
    storageOpenButton: document.querySelector("[data-storage-open]"),
    storageDownloadButton: document.querySelector("[data-storage-download]"),
    storageResizers: Array.from(document.querySelectorAll("[data-storage-resizer]")),
    storageMigrationOpenButton: document.querySelector("[data-storage-migration-open]"),
    storageMigrationModal: document.querySelector("[data-storage-migration-modal]"),
    storageMigrationCloseButton: document.querySelector("[data-storage-migration-close]"),
    storageMigrationDryRunButton: document.querySelector("[data-storage-migration-dry-run]"),
    storageMigrationStartButton: document.querySelector("[data-storage-migration-start]"),
    storageMigrationStatus: document.querySelector("[data-storage-migration-status]"),
    storageMigrationDetails: document.querySelector("[data-storage-migration-details]"),
    storageMigrationSummary: document.querySelector("[data-storage-migration-summary]"),
    storageMigrationResults: document.querySelector("[data-storage-migration-results]"),
  };

  if (!els.modeSelect || !els.richEditor || !els.rawInput || !els.output) {
    return;
  }

  let isConverting = false;
  let activeInputMode = "wysiwyg";
  let pendingConversion = null;
  let lastConverterPrompt = "";
  let outputCopyResetTimer = null;
  let nextCalculatorId = 1;
  let activeCalculatorId = null;
  const calculators = new Map();
  let nextGeneratorId = 1;
  let activeGeneratorId = null;
  const generators = new Map();
  let storageAccessAllowed = false;
  const storageState = {
    loaded: false,
    loading: false,
    buckets: [],
    bucket: "",
    prefix: "",
    foldersByPath: new Map(),
    objects: [],
    nextContinuationToken: null,
    selected: null,
    view: "grid",
    imageUrls: new Map(),
    leftWidth: 250,
    rightWidth: 300,
  };
  const storageMigrationState = {
    busy: false,
    dryRunComplete: false,
    results: [],
  };

  const converterTargetLabels = {
    markdown: "Markdown",
    html: "HTML",
    "plain-text": "Plain Text",
    json: "JSON",
    yaml: "YAML",
    xml: "XML",
    csv: "CSV",
    tsv: "TSV",
    "sql-inserts": "SQL Inserts",
    "sql-schema": "SQL Schema",
    outline: "Outline",
    "bullet-list": "Bullet List",
    "numbered-list": "Numbered List",
    summary: "Summary",
    custom: "Custom",
  };

  const customConverterInstructions = [
    "Convert the provided source using the following instructions:",
    "",
    "The source is a sanitized WYSIWYG HTML fragment. Preserve the meaning and useful structure, not irrelevant editor artifacts.",
    "",
    "Return a concise plain-text summary only.",
    "",
    "Return only the converted output. Do not explain the conversion. Do not add markdown fences unless the requested output format itself is Markdown.",
    "",
    "If the source is ambiguous, make the smallest reasonable inference needed to produce the requested format.",
  ].join("\n");

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

  const measurementCategories = {
    length: {
      label: "Length",
      baseUnit: "m",
      units: [
        { key: "m", label: "Meters", factor: 1 },
        { key: "km", label: "Kilometers", factor: 1000 },
        { key: "cm", label: "Centimeters", factor: 0.01 },
        { key: "mm", label: "Millimeters", factor: 0.001 },
        { key: "in", label: "Inches", factor: 0.0254 },
        { key: "ft", label: "Feet", factor: 0.3048 },
        { key: "yd", label: "Yards", factor: 0.9144 },
        { key: "mi", label: "Miles", factor: 1609.344 },
      ],
    },
    weight: {
      label: "Weight / Mass",
      baseUnit: "kg",
      units: [
        { key: "kg", label: "Kilograms", factor: 1 },
        { key: "g", label: "Grams", factor: 0.001 },
        { key: "mg", label: "Milligrams", factor: 0.000001 },
        { key: "oz", label: "Ounces", factor: 0.028349523125 },
        { key: "lb", label: "Pounds", factor: 0.45359237 },
        { key: "st", label: "Stone", factor: 6.35029318 },
        { key: "ton-us", label: "US Tons", factor: 907.18474 },
      ],
    },
    volume: {
      label: "Volume",
      baseUnit: "l",
      units: [
        { key: "l", label: "Liters", factor: 1 },
        { key: "ml", label: "Milliliters", factor: 0.001 },
        { key: "m3", label: "Cubic Meters", factor: 1000 },
        { key: "gal-us", label: "US Gallons", factor: 3.785411784 },
        { key: "qt-us", label: "US Quarts", factor: 0.946352946 },
        { key: "pt-us", label: "US Pints", factor: 0.473176473 },
        { key: "cup-us", label: "US Cups", factor: 0.2365882365 },
        { key: "floz-us", label: "US Fluid Ounces", factor: 0.0295735295625 },
      ],
    },
    area: {
      label: "Area",
      baseUnit: "m2",
      units: [
        { key: "m2", label: "Square Meters", factor: 1 },
        { key: "km2", label: "Square Kilometers", factor: 1000000 },
        { key: "cm2", label: "Square Centimeters", factor: 0.0001 },
        { key: "ft2", label: "Square Feet", factor: 0.09290304 },
        { key: "yd2", label: "Square Yards", factor: 0.83612736 },
        { key: "acre", label: "Acres", factor: 4046.8564224 },
        { key: "mi2", label: "Square Miles", factor: 2589988.110336 },
      ],
    },
    temperature: {
      label: "Temperature",
      baseUnit: "c",
      units: [
        { key: "c", label: "Celsius" },
        { key: "f", label: "Fahrenheit" },
        { key: "k", label: "Kelvin" },
      ],
    },
  };

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
    measurements: {
      category: "Conversions",
      label: "Measurements",
      render: renderMeasurementsCalculator,
      initialize: initializeMeasurementsCalculator,
    },
    resolution: {
      category: "Conversions",
      label: "Resolution",
      render: renderResolutionCalculator,
      initialize: initializeResolutionCalculator,
    },
  };

  const generatorRegistry = {
    uuid: {
      label: "UUID Generator",
      render: renderUuidGenerator,
      initialize: initializeUuidGenerator,
    },
    password: {
      label: "Password Generator",
      render: renderPasswordGenerator,
      initialize: initializePasswordGenerator,
    },
    "random-number": {
      label: "Random Numbers",
      render: renderRandomNumberGenerator,
      initialize: initializeRandomNumberGenerator,
    },
    dice: {
      label: "Dice Roller",
      render: renderDiceGenerator,
      initialize: initializeDiceGenerator,
    },
    lorem: {
      label: "Lorem Ipsum",
      render: renderLoremGenerator,
      initialize: initializeLoremGenerator,
    },
    palette: {
      label: "Color Palette",
      render: renderPaletteGenerator,
      initialize: initializePaletteGenerator,
    },
  };

  const loremWords = [
    "lorem",
    "ipsum",
    "dolor",
    "sit",
    "amet",
    "consectetur",
    "adipiscing",
    "elit",
    "sed",
    "do",
    "eiusmod",
    "tempor",
    "incididunt",
    "ut",
    "labore",
    "et",
    "dolore",
    "magna",
    "aliqua",
    "enim",
    "ad",
    "minim",
    "veniam",
    "quis",
    "nostrud",
    "exercitation",
    "ullamco",
    "laboris",
    "nisi",
    "aliquip",
    "ex",
    "ea",
    "commodo",
    "consequat",
  ];

  function setStatus(message, type = "") {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
  }

  function getConverterTargetLabel(targetFormat) {
    return converterTargetLabels[targetFormat] || String(targetFormat || "").replaceAll("-", " ");
  }

  function setOutputFormat(targetFormat) {
    if (!els.outputFormat) return;
    const targetLabel = getConverterTargetLabel(targetFormat);
    els.outputFormat.textContent = targetLabel || "";
    els.outputFormat.hidden = !targetLabel;
  }

  function setConverting(nextValue, targetFormat = "") {
    isConverting = nextValue;
    els.conversionButtons.forEach((button) => {
      button.disabled = nextValue;
    });
    if (els.outputBusy) {
      const targetLabel = getConverterTargetLabel(targetFormat);
      els.outputBusy.textContent = nextValue && targetLabel ? `Converting to ${targetLabel}...` : "Converting...";
      els.outputBusy.hidden = !nextValue;
    }
  }

  function setOutputCopyButtonState(message, type = "info") {
    if (!els.outputCopyButton) return;

    window.clearTimeout(outputCopyResetTimer);
    els.outputCopyButton.textContent = message || "Copy";
    els.outputCopyButton.classList.toggle("is-copied", type !== "error");
    els.outputCopyButton.classList.toggle("is-copy-error", type === "error");

    outputCopyResetTimer = window.setTimeout(() => {
      els.outputCopyButton.textContent = "Copy";
      els.outputCopyButton.classList.remove("is-copied", "is-copy-error");
      outputCopyResetTimer = null;
    }, 2000);
  }

  async function writeClipboardText(copyText) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyText);
      return;
    }

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

  async function copyTextWithFeedback(copyText, emptyMessage = "Empty") {
    if (!String(copyText || "").trim()) {
      setOutputCopyButtonState(emptyMessage, "error");
      return;
    }

    try {
      await writeClipboardText(copyText);
      setOutputCopyButtonState("Copied");
    } catch (error) {
      setOutputCopyButtonState("Error", "error");
    }
  }

  function copyOutputText() {
    setOutputCopyMenuOpen(false);
    copyTextWithFeedback(els.output.value || "");
  }

  function copyConverterPrompt() {
    setOutputCopyMenuOpen(false);
    copyTextWithFeedback(lastConverterPrompt, "No Prompt");
  }

  function openConverterPromptDialog() {
    if (!els.promptModal || !els.promptTextarea) return;
    els.promptTextarea.value = lastConverterPrompt.trim()
      ? lastConverterPrompt
      : "No prompt has been recorded yet. Run a conversion first.";
    els.promptModal.hidden = false;
  }

  function closeConverterPromptDialog() {
    if (els.promptModal) {
      els.promptModal.hidden = true;
    }
  }

  function isOutputCopyMenuOpen() {
    return Boolean(els.outputCopyMenuPanel && !els.outputCopyMenuPanel.hidden);
  }

  function setOutputCopyMenuOpen(open) {
    if (!els.outputCopyMenuPanel || !els.outputCopyMenuTrigger) return;
    els.outputCopyMenuPanel.hidden = !open;
    els.outputCopyMenuTrigger.setAttribute("aria-expanded", String(open));
  }

  function toggleOutputCopyMenu() {
    setOutputCopyMenuOpen(!isOutputCopyMenuOpen());
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
    if (absolute !== 0 && (absolute >= 1e16 || absolute < 1e-12)) {
      return normalized.toExponential(8).replace(/\.?0+e/, "e");
    }

    return String(Number.parseFloat(normalized.toPrecision(16)));
  }

  function formatCompactCalculatorNumber(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return String(value || "");
    const normalized = Object.is(numericValue, -0) ? 0 : numericValue;
    return normalized.toExponential(8).replace(/\.?0+e/, "e");
  }

  function fitCalculatorResultDisplay(calculator) {
    const display = calculator?.resultDisplay;
    if (!display) return;

    display.style.removeProperty("--calculator-result-font-size");

    if (!display.clientWidth || !display.textContent) return;

    const styles = window.getComputedStyle(display);
    const maxSize = Number.parseFloat(styles.fontSize) || 48;
    const minSize = Number.parseFloat(styles.getPropertyValue("--calculator-result-min-font-size")) || 18;
    let nextSize = maxSize;

    while (display.scrollWidth > display.clientWidth && nextSize > minSize) {
      nextSize = Math.max(minSize, nextSize - 1);
      display.style.setProperty("--calculator-result-font-size", `${nextSize}px`);
    }

    if (display.scrollWidth > display.clientWidth) {
      const compactValue = formatCompactCalculatorNumber(display.textContent);
      if (compactValue && compactValue !== display.textContent) {
        display.textContent = compactValue;
        display.style.removeProperty("--calculator-result-font-size");

        nextSize = Number.parseFloat(window.getComputedStyle(display).fontSize) || maxSize;
        while (display.scrollWidth > display.clientWidth && nextSize > minSize) {
          nextSize = Math.max(minSize, nextSize - 1);
          display.style.setProperty("--calculator-result-font-size", `${nextSize}px`);
        }
      }
    }
  }

  let calculatorResultFitFrame = null;

  function fitAllCalculatorResults() {
    calculators.forEach((calculator) => {
      fitCalculatorResultDisplay(calculator);
    });
  }

  function scheduleCalculatorResultsFit() {
    if (calculatorResultFitFrame) {
      window.cancelAnimationFrame(calculatorResultFitFrame);
    }

    calculatorResultFitFrame = window.requestAnimationFrame(() => {
      calculatorResultFitFrame = null;
      fitAllCalculatorResults();
    });
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
        <label class="calculator-title-select-label">
          <span class="sr-only">BMI calculator mode</span>
          <select class="calculator-title-select" data-bmi-mode-select aria-label="BMI calculator mode">
            <option value="us" selected>${escapeHtml(definition.label)} — US</option>
            <option value="metric">${escapeHtml(definition.label)} — Metric</option>
          </select>
        </label>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="bmi-body">
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

  function renderMeasurementUnitOptions(categoryKey) {
    return (measurementCategories[categoryKey]?.units || [])
      .map((unit) => `<option value="${escapeHtml(unit.key)}">${escapeHtml(unit.label)}</option>`)
      .join("");
  }

  function renderMeasurementsCalculator(definition, id) {
    return `
      <div class="calculator-titlebar">
        <label class="calculator-title-select-label">
          <span class="sr-only">Measurement category</span>
          <select class="calculator-title-select" data-measurement-category-select aria-label="Measurement category">
            ${Object.entries(measurementCategories).map(([key, category]) => (
              `<option value="${escapeHtml(key)}"${key === "length" ? " selected" : ""}>${escapeHtml(category.label)}</option>`
            )).join("")}
          </select>
        </label>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="measurements-body">
        <div class="measurements-field">
          <label for="measurement-value-${id}">Number of Units</label>
          <input id="measurement-value-${id}" type="number" step="any" inputmode="decimal" data-measurement-field="value" placeholder="0">
        </div>
        <div class="measurements-row">
          <div class="measurements-field">
            <label for="measurement-from-${id}">From</label>
            <select id="measurement-from-${id}" data-measurement-field="from">${renderMeasurementUnitOptions("length")}</select>
          </div>
          <button class="measurements-swap" type="button" data-measurement-swap aria-label="Swap measurement units">⇄</button>
          <div class="measurements-field">
            <label for="measurement-to-${id}">To</label>
            <select id="measurement-to-${id}" data-measurement-field="to">${renderMeasurementUnitOptions("length")}</select>
          </div>
        </div>
        <div class="measurements-result" data-measurement-result>
          <strong>Enter value</strong>
          <span>Choose units to convert.</span>
        </div>
        <p class="measurements-note" data-measurement-note role="status" aria-live="polite"></p>
      </div>
    `;
  }

  function renderResolutionCalculator(definition, id) {
    return `
      <div class="calculator-titlebar">
        <label class="calculator-title-select-label">
          <span class="sr-only">Calculator type</span>
          <select class="calculator-title-select" data-resolution-title-select aria-label="Calculator type">
            <option selected>${escapeHtml(definition.label)} Scale</option>
          </select>
        </label>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="resolution-body">
        <section class="resolution-section">
          <p class="resolution-section-label">Original Resolution</p>
          <div class="resolution-fields resolution-fields-two">
            <div class="resolution-field">
              <label for="resolution-width-${id}">Width</label>
              <input id="resolution-width-${id}" type="number" min="1" step="1" inputmode="numeric" value="1920" data-resolution-field="width">
            </div>
            <div class="resolution-field">
              <label for="resolution-height-${id}">Height</label>
              <input id="resolution-height-${id}" type="number" min="1" step="1" inputmode="numeric" value="1080" data-resolution-field="height">
            </div>
          </div>
          <div class="resolution-field">
            <label for="resolution-scale-${id}">Scale (%)</label>
            <input id="resolution-scale-${id}" type="number" min="0.01" step="0.01" inputmode="decimal" value="100" data-resolution-field="scale">
          </div>
        </section>
        <section class="resolution-section resolution-scaled-section">
          <p class="resolution-section-label">Scaled Resolution</p>
          <div class="resolution-result" data-resolution-result>
            <strong>1920 × 1080</strong>
            <span>2,073,600 pixels · 16:9</span>
          </div>
        </section>
        <section class="resolution-section">
          <div class="resolution-field">
            <label for="resolution-ppi-${id}">Pixel Density (PPI, optional)</label>
            <input id="resolution-ppi-${id}" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="e.g. 300" data-resolution-field="ppi">
          </div>
          <div class="resolution-physical" data-resolution-physical hidden></div>
        </section>
        <p class="resolution-note" data-resolution-note role="status" aria-live="polite"></p>
      </div>
    `;
  }

  function renderDateTimeCalculator(definition, id) {
    return `
      <div class="calculator-titlebar">
        <label class="calculator-title-select-label">
          <span class="sr-only">Date and time calculator mode</span>
          <select class="calculator-title-select" data-date-time-mode-select aria-label="Date and time calculator mode">
            <option value="difference" selected>Date Difference</option>
            <option value="duration">Time Duration</option>
            <option value="timezone">Time Zone</option>
          </select>
        </label>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-calculator-copy>Copy</button>
          <button class="calculator-close" type="button" data-calculator-close aria-label="Close calculator">×</button>
        </div>
      </div>
      <div class="date-time-body">
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

  function renderGeneratorTitlebar(definition) {
    return `
      <div class="calculator-titlebar">
        <label class="calculator-title-select-label">
          <span class="sr-only">Generator type</span>
          <select class="calculator-title-select" data-generator-title-select aria-label="Generator type">
            <option selected>${escapeHtml(definition.label)}</option>
          </select>
        </label>
        <div class="calculator-titlebar-actions">
          <button class="calculator-copy" type="button" data-generator-copy>Copy</button>
          <button class="calculator-close" type="button" data-generator-close aria-label="Close generator">&times;</button>
        </div>
      </div>
    `;
  }

  function renderUuidGenerator(definition, id) {
    return `
      ${renderGeneratorTitlebar(definition)}
      <div class="generator-body">
        <div class="generator-fields">
          <div class="generator-field">
            <label for="uuid-count-${id}">Count</label>
            <input id="uuid-count-${id}" type="number" min="1" max="100" step="1" value="1" data-uuid-field="count">
          </div>
        </div>
        <div class="generator-output generator-output-uuid" data-generator-output aria-live="polite"></div>
        <div class="generator-actions">
          <button class="primary-action" type="button" data-generator-action="generate">Generate UUID</button>
        </div>
      </div>
    `;
  }

  function renderPasswordGenerator(definition, id) {
    return `
      ${renderGeneratorTitlebar(definition)}
      <div class="generator-body">
        <div class="generator-fields">
          <div class="generator-field">
            <label for="password-length-${id}">Length</label>
            <input id="password-length-${id}" type="number" min="4" max="128" step="1" value="16" data-password-field="length">
          </div>
          <div class="generator-options">
            <p class="generator-options-title">Include</p>
            <div class="generator-checks">
              <label><input type="checkbox" data-password-field="lowercase" checked> Lowercase</label>
              <label><input type="checkbox" data-password-field="uppercase" checked> Uppercase</label>
              <label><input type="checkbox" data-password-field="numbers" checked> Numbers</label>
              <label><input type="checkbox" data-password-field="symbols" checked> Symbols</label>
            </div>
          </div>
        </div>
        <div class="generator-output" data-generator-output aria-live="polite"></div>
        <div class="generator-actions">
          <button class="primary-action" type="button" data-generator-action="generate">Generate Password</button>
        </div>
      </div>
    `;
  }

  function renderRandomNumberGenerator(definition, id) {
    return `
      ${renderGeneratorTitlebar(definition)}
      <div class="generator-body">
        <div class="generator-fields generator-fields-two">
          <div class="generator-field">
            <label for="random-min-${id}">Min</label>
            <input id="random-min-${id}" type="number" step="any" value="1" data-random-number-field="min">
          </div>
          <div class="generator-field">
            <label for="random-max-${id}">Max</label>
            <input id="random-max-${id}" type="number" step="any" value="100" data-random-number-field="max">
          </div>
          <div class="generator-field">
            <label for="random-count-${id}">Count</label>
            <input id="random-count-${id}" type="number" min="1" max="100" step="1" value="5" data-random-number-field="count">
          </div>
          <label class="generator-checkbox">
            <input type="checkbox" data-random-number-field="integer" checked>
            Integers
          </label>
        </div>
        <div class="generator-output" data-generator-output aria-live="polite"></div>
        <div class="generator-actions">
          <button class="primary-action" type="button" data-generator-action="generate">Generate Numbers</button>
        </div>
      </div>
    `;
  }

  function renderDiceGenerator(definition, id) {
    return `
      ${renderGeneratorTitlebar(definition)}
      <div class="generator-body">
        <div class="generator-fields generator-fields-two">
          <div class="generator-field">
            <label for="dice-count-${id}">Dice</label>
            <input id="dice-count-${id}" type="number" min="1" max="100" step="1" value="2" data-dice-field="count">
          </div>
          <div class="generator-field">
            <label for="dice-sides-${id}">Sides</label>
            <input id="dice-sides-${id}" type="number" min="2" max="1000" step="1" value="6" data-dice-field="sides">
          </div>
          <div class="generator-field">
            <label for="dice-modifier-${id}">Modifier</label>
            <input id="dice-modifier-${id}" type="number" step="1" value="0" data-dice-field="modifier">
          </div>
          <label class="generator-checkbox">
            <input type="checkbox" data-dice-field="percentile">
            Percentile
          </label>
        </div>
        <div class="generator-output is-large" data-generator-output aria-live="polite"></div>
        <div class="generator-actions">
          <button class="primary-action" type="button" data-generator-action="generate">Roll Dice</button>
        </div>
      </div>
    `;
  }

  function renderLoremGenerator(definition, id) {
    return `
      ${renderGeneratorTitlebar(definition)}
      <div class="generator-body">
        <div class="generator-fields">
          <div class="generator-field">
            <label for="lorem-paragraphs-${id}">Paragraphs</label>
            <input id="lorem-paragraphs-${id}" type="number" min="1" max="12" step="1" value="3" data-lorem-field="paragraphs">
          </div>
        </div>
        <div class="generator-output" data-generator-output aria-live="polite"></div>
        <div class="generator-actions">
          <button class="primary-action" type="button" data-generator-action="generate">Generate Lorem Ipsum</button>
        </div>
      </div>
    `;
  }

  function renderPaletteGenerator(definition, id) {
    return `
      ${renderGeneratorTitlebar(definition)}
      <div class="generator-body">
        <div class="generator-fields">
          <div class="generator-field">
            <label for="palette-count-${id}">Colors</label>
            <input id="palette-count-${id}" type="number" min="2" max="12" step="1" value="5" data-palette-field="count">
          </div>
        </div>
        <div class="generator-palette" data-generator-palette aria-live="polite"></div>
        <div class="generator-actions">
          <button class="primary-action" type="button" data-generator-action="generate">Generate Palette</button>
        </div>
      </div>
    `;
  }

  function randomFraction() {
    if (window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] / 4294967296;
    }
    return Math.random();
  }

  function randomInteger(min, max) {
    return Math.floor(randomFraction() * (max - min + 1)) + min;
  }

  function clampInteger(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function setGeneratorNote(generator, message, type = "") {
    if (!generator.note) return;
    generator.note.textContent = message || "";
    generator.note.classList.toggle("is-error", type === "error");
  }

  function setGeneratorError(generator, message) {
    setGeneratorOutput(generator, message || "Could not generate value.", "");
  }

  function setGeneratorOutput(generator, output, copyText = output) {
    if (generator.output) {
      generator.output.textContent = output || "";
    }
    generator.copyText = copyText || output || "";
  }

  function createUuid() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) => (
      (Number(character) ^ randomInteger(0, 255) & 15 >> Number(character) / 4).toString(16)
    ));
  }

  function generateUuid(generator) {
    const count = clampInteger(generator.fields?.count?.value, 1, 100, 1);
    if (generator.fields?.count) {
      generator.fields.count.value = String(count);
    }

    const uuids = Array.from({ length: count }, createUuid);
    setGeneratorOutput(generator, uuids.join("\n"));
    setGeneratorNote(generator, `${count} version 4 UUID${count === 1 ? "" : "s"}.`);
  }

  function generatePassword(generator) {
    const length = clampInteger(generator.fields.length.value, 4, 128, 16);
    generator.fields.length.value = String(length);

    const sets = [
      { enabled: generator.fields.lowercase.checked, chars: "abcdefghijklmnopqrstuvwxyz" },
      { enabled: generator.fields.uppercase.checked, chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
      { enabled: generator.fields.numbers.checked, chars: "0123456789" },
      { enabled: generator.fields.symbols.checked, chars: "!@#$%^&*()-_=+[]{};:,.<>?" },
    ].filter((set) => set.enabled);

    if (!sets.length) {
      setGeneratorError(generator, "Choose at least one character set.");
      setGeneratorNote(generator, "Choose at least one character set.", "error");
      return;
    }

    const required = sets.map((set) => set.chars[randomInteger(0, set.chars.length - 1)]);
    const allChars = sets.map((set) => set.chars).join("");
    const characters = [...required];
    while (characters.length < length) {
      characters.push(allChars[randomInteger(0, allChars.length - 1)]);
    }

    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInteger(0, index);
      [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }

    setGeneratorOutput(generator, characters.join(""));
    setGeneratorNote(generator, `${length} characters.`);
  }

  function generateRandomNumbers(generator) {
    const min = Number(generator.fields.min.value);
    const max = Number(generator.fields.max.value);
    const count = clampInteger(generator.fields.count.value, 1, 100, 5);
    generator.fields.count.value = String(count);

    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      setGeneratorError(generator, "Enter a valid min/max range.");
      setGeneratorNote(generator, "Enter a valid min/max range.", "error");
      return;
    }

    if (generator.fields.integer.checked && Math.ceil(min) > Math.floor(max)) {
      setGeneratorError(generator, "Integer mode needs at least one whole number in range.");
      setGeneratorNote(generator, "Integer mode needs at least one whole number in range.", "error");
      return;
    }

    const values = Array.from({ length: count }, () => {
      if (generator.fields.integer.checked) {
        return String(randomInteger(Math.ceil(min), Math.floor(max)));
      }
      return String(Number.parseFloat((min + randomFraction() * (max - min)).toFixed(4)));
    });

    setGeneratorOutput(generator, values.join("\n"));
    setGeneratorNote(generator, `${count} value${count === 1 ? "" : "s"} generated.`);
  }

  function generateDice(generator) {
    const isPercentile = Boolean(generator.fields.percentile?.checked);
    const modifier = clampInteger(generator.fields.modifier.value, -9999, 9999, 0);
    generator.fields.modifier.value = String(modifier);

    const modifierText = modifier === 0 ? "" : ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`;

    if (isPercentile) {
      const tens = randomInteger(0, 9) * 10;
      const ones = randomInteger(0, 9);
      const percentileValue = tens === 0 && ones === 0 ? 100 : tens + ones;
      const total = percentileValue + modifier;
      const tensLabel = String(tens).padStart(2, "0");
      const output = `${total}\nPercentile${modifierText} = ${tensLabel} + ${ones}${modifierText}`;

      setGeneratorOutput(generator, output);
      setGeneratorNote(generator, `Rolled percentile dice: ${tensLabel} and ${ones}.`);
      return;
    }

    const count = clampInteger(generator.fields.count.value, 1, 100, 2);
    const sides = clampInteger(generator.fields.sides.value, 2, 1000, 6);
    generator.fields.count.value = String(count);
    generator.fields.sides.value = String(sides);

    const rolls = Array.from({ length: count }, () => randomInteger(1, sides));
    const subtotal = rolls.reduce((sum, value) => sum + value, 0);
    const total = subtotal + modifier;
    const output = `${total}\n${count}d${sides}${modifierText} = ${rolls.join(" + ")}${modifierText}`;

    setGeneratorOutput(generator, output);
    setGeneratorNote(generator, `Rolled ${count}d${sides}.`);
  }

  function syncDicePercentileFields(generator) {
    const isPercentile = Boolean(generator.fields.percentile?.checked);
    generator.fields.count.disabled = isPercentile;
    generator.fields.sides.disabled = isPercentile;
  }

  function buildLoremSentence(wordCount) {
    const words = Array.from({ length: wordCount }, () => loremWords[randomInteger(0, loremWords.length - 1)]);
    const sentence = words.join(" ");
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }

  function generateLorem(generator) {
    const paragraphCount = clampInteger(generator.fields.paragraphs.value, 1, 12, 3);
    generator.fields.paragraphs.value = String(paragraphCount);

    const paragraphs = Array.from({ length: paragraphCount }, () => {
      const sentenceCount = randomInteger(4, 7);
      return Array.from({ length: sentenceCount }, () => buildLoremSentence(randomInteger(8, 16))).join(" ");
    });

    setGeneratorOutput(generator, paragraphs.join("\n\n"));
    setGeneratorNote(generator, `${paragraphCount} paragraph${paragraphCount === 1 ? "" : "s"}.`);
  }

  function generateHexColor() {
    const value = randomInteger(0, 0xffffff);
    return `#${value.toString(16).padStart(6, "0").toUpperCase()}`;
  }

  function generatePalette(generator) {
    const count = clampInteger(generator.fields.count.value, 2, 12, 5);
    generator.fields.count.value = String(count);
    const colors = Array.from({ length: count }, generateHexColor);
    generator.colors = colors;
    generator.copyText = colors.join("\n");

    if (generator.palette) {
      generator.palette.innerHTML = colors.map((color) => `
        <div class="generator-swatch">
          <span class="generator-swatch-color" style="background: ${escapeHtml(color)}"></span>
          <span>${escapeHtml(color)}</span>
        </div>
      `).join("");
    }

    setGeneratorNote(generator, `${count} colors generated.`);
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
    if (calculator.dateTimeModeSelect && calculator.dateTimeModeSelect.value !== calculator.dateTimeMode) {
      calculator.dateTimeModeSelect.value = calculator.dateTimeMode;
    }
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
    fitCalculatorResultDisplay(calculator);
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
    calculator.dateTimeModeSelect = element.querySelector("[data-date-time-mode-select]");
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

    calculator.dateTimeModeSelect?.addEventListener("change", () => {
      setDateTimeMode(calculator, calculator.dateTimeModeSelect.value);
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
    if (calculator.bmiModeSelect && calculator.bmiModeSelect.value !== calculator.bmiMode) {
      calculator.bmiModeSelect.value = calculator.bmiMode;
    }
    calculator.bmiPanels.forEach((panel) => {
      panel.hidden = panel.dataset.bmiPanel !== calculator.bmiMode;
    });
    updateBmiCalculator(calculator);
  }

  function initializeBmiCalculator(calculator) {
    const element = calculator.element;
    calculator.bmiMode = "us";
    calculator.bmiModeSelect = element.querySelector("[data-bmi-mode-select]");
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

    calculator.bmiModeSelect?.addEventListener("change", () => {
      setBmiMode(calculator, calculator.bmiModeSelect.value);
    });

    Object.values(calculator.bmiFields).forEach((field) => {
      if (!field) return;
      field.addEventListener("input", () => updateBmiCalculator(calculator));
      field.addEventListener("change", () => updateBmiCalculator(calculator));
    });

    setBmiMode(calculator, "us");
  }

  function setMeasurementResult(calculator, heading, detail) {
    if (!calculator.measurementResult) return;
    const headingElement = calculator.measurementResult.querySelector("strong");
    const detailElement = calculator.measurementResult.querySelector("span");
    if (headingElement) headingElement.textContent = heading;
    if (detailElement) detailElement.textContent = detail;
  }

  function formatResolutionNumber(value, maximumFractionDigits = 2) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
  }

  function getResolutionAspectRatio(width, height) {
    const greatestCommonDivisor = (first, second) => {
      let a = Math.abs(Math.round(first));
      let b = Math.abs(Math.round(second));
      while (b) [a, b] = [b, a % b];
      return a || 1;
    };
    const divisor = greatestCommonDivisor(width, height);
    return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
  }

  function setResolutionResult(calculator, heading, detail) {
    if (!calculator.resolutionResult) return;
    calculator.resolutionResult.querySelector("strong").textContent = heading;
    calculator.resolutionResult.querySelector("span").textContent = detail;
  }

  function setResolutionNote(calculator, message, type = "") {
    if (!calculator.resolutionNote) return;
    calculator.resolutionNote.textContent = message || "";
    calculator.resolutionNote.classList.toggle("is-error", type === "error");
  }

  function updateResolutionCalculator(calculator) {
    const width = Number(calculator.resolutionFields.width.value);
    const height = Number(calculator.resolutionFields.height.value);
    const scale = Number(calculator.resolutionFields.scale.value);
    const ppiText = calculator.resolutionFields.ppi.value.trim();
    const ppi = Number(ppiText);

    calculator.resolutionPhysical.hidden = true;
    calculator.resolutionPhysical.textContent = "";

    if (!(width > 0) || !(height > 0) || !(scale > 0)) {
      setResolutionResult(calculator, "Enter resolution", "Add a width, height, and scale percentage.");
      setResolutionNote(calculator, "");
      return;
    }

    const scaleFactor = Math.sqrt(scale / 100);
    const scaledWidth = Math.max(1, Math.round(width * scaleFactor));
    const scaledHeight = Math.max(1, Math.round(height * scaleFactor));
    const originalPixels = width * height;
    const scaledPixels = scaledWidth * scaledHeight;
    const aspectRatio = getResolutionAspectRatio(width, height);

    calculator.resolutionValues = { width, height, scale, scaledWidth, scaledHeight, originalPixels, scaledPixels, aspectRatio, ppi: ppiText ? ppi : null };
    setResolutionResult(
      calculator,
      `${formatResolutionNumber(scaledWidth, 0)} × ${formatResolutionNumber(scaledHeight, 0)}`,
      `${formatResolutionNumber(scaledPixels, 0)} pixels · ${aspectRatio} · ${formatResolutionNumber(scale)}% of original pixels`,
    );

    if (ppiText) {
      if (!(ppi > 0)) {
        setResolutionNote(calculator, "Pixel density must be greater than zero.", "error");
        return;
      }
      const physicalWidth = scaledWidth / ppi;
      const physicalHeight = scaledHeight / ppi;
      const diagonal = Math.hypot(physicalWidth, physicalHeight);
      calculator.resolutionPhysical.textContent = `${formatResolutionNumber(physicalWidth)} in × ${formatResolutionNumber(physicalHeight)} in · ${formatResolutionNumber(diagonal)} in diagonal`;
      calculator.resolutionPhysical.hidden = false;
    }

    setResolutionNote(calculator, `${formatResolutionNumber(width, 0)} × ${formatResolutionNumber(height, 0)} = ${formatResolutionNumber(originalPixels, 0)} original pixels.`);
  }

  function initializeResolutionCalculator(calculator) {
    const element = calculator.element;
    calculator.resolutionResult = element.querySelector("[data-resolution-result]");
    calculator.resolutionNote = element.querySelector("[data-resolution-note]");
    calculator.resolutionPhysical = element.querySelector("[data-resolution-physical]");
    calculator.resolutionFields = {
      width: element.querySelector('[data-resolution-field="width"]'),
      height: element.querySelector('[data-resolution-field="height"]'),
      scale: element.querySelector('[data-resolution-field="scale"]'),
      ppi: element.querySelector('[data-resolution-field="ppi"]'),
    };
    Object.values(calculator.resolutionFields).forEach((field) => {
      field?.addEventListener("input", () => updateResolutionCalculator(calculator));
      field?.addEventListener("change", () => updateResolutionCalculator(calculator));
    });
    updateResolutionCalculator(calculator);
  }

  function setMeasurementNote(calculator, message, type = "") {
    if (!calculator.measurementNote) return;
    calculator.measurementNote.textContent = message || "";
    calculator.measurementNote.classList.toggle("is-error", type === "error");
  }

  function getMeasurementUnit(categoryKey, unitKey) {
    return measurementCategories[categoryKey]?.units.find((unit) => unit.key === unitKey) || null;
  }

  function convertTemperature(value, fromUnit, toUnit) {
    let celsius;
    if (fromUnit === "f") celsius = (value - 32) * (5 / 9);
    else if (fromUnit === "k") {
      if (value < 0) throw new Error("Kelvin cannot be below zero.");
      celsius = value - 273.15;
    } else {
      celsius = value;
    }

    if (toUnit === "f") return (celsius * 9 / 5) + 32;
    if (toUnit === "k") {
      const kelvin = celsius + 273.15;
      if (kelvin < 0) throw new Error("Result is below absolute zero.");
      return kelvin;
    }
    return celsius;
  }

  function convertMeasurementValue(categoryKey, value, fromUnitKey, toUnitKey) {
    if (categoryKey === "temperature") {
      return convertTemperature(value, fromUnitKey, toUnitKey);
    }

    const fromUnit = getMeasurementUnit(categoryKey, fromUnitKey);
    const toUnit = getMeasurementUnit(categoryKey, toUnitKey);
    if (!fromUnit || !toUnit) {
      throw new Error("Choose valid measurement units.");
    }
    return (value * fromUnit.factor) / toUnit.factor;
  }

  function getDefaultMeasurementUnits(categoryKey) {
    const defaults = {
      length: ["m", "ft"],
      weight: ["kg", "lb"],
      volume: ["l", "gal-us"],
      area: ["m2", "ft2"],
      temperature: ["c", "f"],
    };
    return defaults[categoryKey] || [
      measurementCategories[categoryKey]?.units[0]?.key,
      measurementCategories[categoryKey]?.units[1]?.key,
    ];
  }

  function formatMeasurementNumber(value) {
    if (!Number.isFinite(value)) {
      throw new Error("Result is out of range.");
    }
    const normalized = Object.is(value, -0) ? 0 : value;
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 4,
      minimumFractionDigits: 0,
    }).format(normalized);
  }

  function setMeasurementCategory(calculator, categoryKey) {
    calculator.measurementCategory = measurementCategories[categoryKey] ? categoryKey : "length";

    if (calculator.measurementCategorySelect && calculator.measurementCategorySelect.value !== calculator.measurementCategory) {
      calculator.measurementCategorySelect.value = calculator.measurementCategory;
    }

    const [defaultFrom, defaultTo] = getDefaultMeasurementUnits(calculator.measurementCategory);
    const options = renderMeasurementUnitOptions(calculator.measurementCategory);
    calculator.measurementFields.from.innerHTML = options;
    calculator.measurementFields.to.innerHTML = options;
    calculator.measurementFields.from.value = defaultFrom;
    calculator.measurementFields.to.value = defaultTo || defaultFrom;
    updateMeasurementsCalculator(calculator);
  }

  function updateMeasurementsCalculator(calculator) {
    const valueText = calculator.measurementFields.value.value.trim();
    const value = Number(valueText);
    const fromUnitKey = calculator.measurementFields.from.value;
    const toUnitKey = calculator.measurementFields.to.value;
    const fromUnit = getMeasurementUnit(calculator.measurementCategory, fromUnitKey);
    const toUnit = getMeasurementUnit(calculator.measurementCategory, toUnitKey);

    if (!valueText || !Number.isFinite(value)) {
      setMeasurementResult(calculator, "Enter value", "Choose units to convert.");
      setMeasurementNote(calculator, "");
      return;
    }

    try {
      const convertedValue = convertMeasurementValue(calculator.measurementCategory, value, fromUnitKey, toUnitKey);
      const formattedInput = formatMeasurementNumber(value);
      const formattedOutput = formatMeasurementNumber(convertedValue);
      setMeasurementResult(
        calculator,
        formattedOutput,
        `${formattedInput} ${fromUnit?.label || ""} = ${formattedOutput} ${toUnit?.label || ""}`,
      );
      setMeasurementNote(calculator, "");
    } catch (error) {
      setMeasurementResult(calculator, "Invalid conversion", error instanceof Error ? error.message : "Could not convert measurement.");
      setMeasurementNote(calculator, error instanceof Error ? error.message : "Could not convert measurement.", "error");
    }
  }

  function initializeMeasurementsCalculator(calculator) {
    const element = calculator.element;
    calculator.measurementCategory = "length";
    calculator.measurementCategorySelect = element.querySelector("[data-measurement-category-select]");
    calculator.measurementResult = element.querySelector("[data-measurement-result]");
    calculator.measurementNote = element.querySelector("[data-measurement-note]");
    calculator.measurementFields = {
      value: element.querySelector("[data-measurement-field=\"value\"]"),
      from: element.querySelector("[data-measurement-field=\"from\"]"),
      to: element.querySelector("[data-measurement-field=\"to\"]"),
    };

    calculator.measurementCategorySelect?.addEventListener("change", () => {
      setMeasurementCategory(calculator, calculator.measurementCategorySelect.value);
    });

    Object.values(calculator.measurementFields).forEach((field) => {
      if (!field) return;
      field.addEventListener("input", () => updateMeasurementsCalculator(calculator));
      field.addEventListener("change", () => updateMeasurementsCalculator(calculator));
    });

    element.querySelector("[data-measurement-swap]")?.addEventListener("click", () => {
      const fromValue = calculator.measurementFields.from.value;
      calculator.measurementFields.from.value = calculator.measurementFields.to.value;
      calculator.measurementFields.to.value = fromValue;
      updateMeasurementsCalculator(calculator);
    });

    setMeasurementCategory(calculator, "length");
  }

  function initializeUuidGenerator(generator) {
    generator.output = generator.element.querySelector("[data-generator-output]");
    generator.note = generator.element.querySelector("[data-generator-note]");
    generator.fields = {
      count: generator.element.querySelector("[data-uuid-field=\"count\"]"),
    };
    generator.element.querySelector("[data-generator-action=\"generate\"]")?.addEventListener("click", () => generateUuid(generator));
    generateUuid(generator);
  }

  function initializePasswordGenerator(generator) {
    generator.output = generator.element.querySelector("[data-generator-output]");
    generator.note = generator.element.querySelector("[data-generator-note]");
    generator.fields = {
      length: generator.element.querySelector("[data-password-field=\"length\"]"),
      lowercase: generator.element.querySelector("[data-password-field=\"lowercase\"]"),
      uppercase: generator.element.querySelector("[data-password-field=\"uppercase\"]"),
      numbers: generator.element.querySelector("[data-password-field=\"numbers\"]"),
      symbols: generator.element.querySelector("[data-password-field=\"symbols\"]"),
    };
    generator.element.querySelector("[data-generator-action=\"generate\"]")?.addEventListener("click", () => generatePassword(generator));
    generatePassword(generator);
  }

  function initializeRandomNumberGenerator(generator) {
    generator.output = generator.element.querySelector("[data-generator-output]");
    generator.note = generator.element.querySelector("[data-generator-note]");
    generator.fields = {
      min: generator.element.querySelector("[data-random-number-field=\"min\"]"),
      max: generator.element.querySelector("[data-random-number-field=\"max\"]"),
      count: generator.element.querySelector("[data-random-number-field=\"count\"]"),
      integer: generator.element.querySelector("[data-random-number-field=\"integer\"]"),
    };
    generator.element.querySelector("[data-generator-action=\"generate\"]")?.addEventListener("click", () => generateRandomNumbers(generator));
    generateRandomNumbers(generator);
  }

  function initializeDiceGenerator(generator) {
    generator.output = generator.element.querySelector("[data-generator-output]");
    generator.note = generator.element.querySelector("[data-generator-note]");
    generator.fields = {
      count: generator.element.querySelector("[data-dice-field=\"count\"]"),
      sides: generator.element.querySelector("[data-dice-field=\"sides\"]"),
      modifier: generator.element.querySelector("[data-dice-field=\"modifier\"]"),
      percentile: generator.element.querySelector("[data-dice-field=\"percentile\"]"),
    };
    generator.element.querySelector("[data-generator-action=\"generate\"]")?.addEventListener("click", () => generateDice(generator));
    generator.fields.percentile?.addEventListener("change", () => {
      syncDicePercentileFields(generator);
    });
    syncDicePercentileFields(generator);
    generateDice(generator);
  }

  function initializeLoremGenerator(generator) {
    generator.output = generator.element.querySelector("[data-generator-output]");
    generator.note = generator.element.querySelector("[data-generator-note]");
    generator.fields = {
      paragraphs: generator.element.querySelector("[data-lorem-field=\"paragraphs\"]"),
    };
    generator.element.querySelector("[data-generator-action=\"generate\"]")?.addEventListener("click", () => generateLorem(generator));
    generateLorem(generator);
  }

  function initializePaletteGenerator(generator) {
    generator.palette = generator.element.querySelector("[data-generator-palette]");
    generator.note = generator.element.querySelector("[data-generator-note]");
    generator.fields = {
      count: generator.element.querySelector("[data-palette-field=\"count\"]"),
    };
    generator.element.querySelector("[data-generator-action=\"generate\"]")?.addEventListener("click", () => generatePalette(generator));
    generatePalette(generator);
  }

  function getGeneratorCopyText(generator) {
    if (generator.type === "palette") {
      return generator.copyText || generator.colors?.join("\n") || "";
    }
    return generator.copyText || generator.output?.textContent?.trim() || "";
  }

  function setGeneratorCopyMessage(generator, message, type = "info") {
    const button = generator.copyButton || generator.element?.querySelector("[data-generator-copy]");
    if (!button) return;

    window.clearTimeout(generator.copyResetTimer);
    button.textContent = message || "Copy";
    button.classList.toggle("is-copied", type !== "error");
    button.classList.toggle("is-copy-error", type === "error");

    generator.copyResetTimer = window.setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("is-copied", "is-copy-error");
      generator.copyResetTimer = null;
    }, 2000);
  }

  async function copyGeneratorResult(generator) {
    const copyText = getGeneratorCopyText(generator);
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
      setGeneratorCopyMessage(generator, "Copied");
    } catch (error) {
      setGeneratorCopyMessage(generator, "Error", "error");
    }
  }

  function setActiveGenerator(id) {
    activeGeneratorId = id;
    generators.forEach((generator) => {
      generator.element.classList.toggle("is-active", generator.id === id);
    });
  }

  function closeGenerator(id) {
    const generator = generators.get(id);
    if (!generator) return;

    window.clearTimeout(generator.copyResetTimer);
    generator.element.remove();
    generators.delete(id);

    if (activeGeneratorId === id) {
      const remainingIds = Array.from(generators.keys());
      activeGeneratorId = null;
      if (remainingIds.length) {
        setActiveGenerator(remainingIds[remainingIds.length - 1]);
      }
    }
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

    if (calculator.type === "measurements") {
      const category = measurementCategories[calculator.measurementCategory]?.label || "Measurements";
      const heading = calculator.measurementResult?.querySelector("strong")?.textContent?.trim() || "";
      const detail = calculator.measurementResult?.querySelector("span")?.textContent?.trim() || "";
      const note = calculator.measurementNote?.textContent?.trim() || "";
      return [category, heading, detail, note].filter(Boolean).join("\n");
    }

    if (calculator.type === "resolution") {
      const values = calculator.resolutionValues;
      const heading = calculator.resolutionResult?.querySelector("strong")?.textContent?.trim() || "";
      const detail = calculator.resolutionResult?.querySelector("span")?.textContent?.trim() || "";
      const physical = calculator.resolutionPhysical?.textContent?.trim() || "";
      if (!values) return ["Resolution Scale", heading, detail, physical].filter(Boolean).join("\n");
      return [
        "Resolution Scale",
        `Original: ${values.width} × ${values.height}`,
        `Scale: ${formatResolutionNumber(values.scale)}% of original pixels`,
        `Scaled: ${heading}`,
        detail,
        physical,
      ].filter(Boolean).join("\n");
    }

    const equation = calculator.equationInput?.value?.trim() || "";
    const result = calculator.resultDisplay?.textContent?.trim() || calculator.result || "0";
    return equation ? `${equation} ${result}`.trim() : result;
  }

  function setCalculatorCopyMessage(calculator, message, type = "info") {
    const button = calculator.copyButton || calculator.element?.querySelector("[data-calculator-copy]");
    if (!button) return;

    window.clearTimeout(calculator.copyResetTimer);
    button.textContent = message || "Copy";
    button.classList.toggle("is-copied", type !== "error");
    button.classList.toggle("is-copy-error", type === "error");

    calculator.copyResetTimer = window.setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("is-copied", "is-copy-error");
      calculator.copyResetTimer = null;
    }, 2000);
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
      setCalculatorCopyMessage(calculator, "Copied");
    } catch (error) {
      setCalculatorCopyMessage(calculator, "Error", "error");
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
    fitCalculatorResultDisplay(calculator);
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

  function setGeneratorMenuOpen(isOpen) {
    if (!els.generatorMenuTrigger || !els.generatorMenuPanel) return;
    els.generatorMenuTrigger.setAttribute("aria-expanded", String(isOpen));
    els.generatorMenuPanel.hidden = !isOpen;
  }

  function isGeneratorMenuOpen() {
    return Boolean(els.generatorMenuPanel && !els.generatorMenuPanel.hidden);
  }

  function toggleGeneratorMenu() {
    setGeneratorMenuOpen(!isGeneratorMenuOpen());
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
      measurements: "measurements-calculator",
      resolution: "resolution-calculator",
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
      copyButton: element.querySelector("[data-calculator-copy]"),
      copyResetTimer: null,
    };

    calculators.set(id, calculator);
    els.calculatorGrid.append(element);

    element.addEventListener("pointerdown", () => setActiveCalculator(id));
    element.addEventListener("focusin", () => setActiveCalculator(id));

    element.querySelector("[data-calculator-close]").addEventListener("click", (event) => {
      event.stopPropagation();
      closeCalculator(id);
    });

    calculator.copyButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      copyCalculatorResult(calculator);
    });

    definition.initialize(calculator);
    setActiveCalculator(id);
    return calculator;
  }

  function createGeneratorCard(type = "uuid") {
    if (!els.generatorGrid) return null;

    const definition = generatorRegistry[type] || generatorRegistry.uuid;
    const generatorType = generatorRegistry[type] ? type : "uuid";
    const id = nextGeneratorId;
    nextGeneratorId += 1;

    const element = document.createElement("section");
    element.className = "calculator-window generator-card";
    element.tabIndex = 0;
    element.dataset.generatorId = String(id);
    element.dataset.generatorType = generatorType;
    element.setAttribute("aria-label", `${definition.label} ${id}`);
    element.innerHTML = definition.render(definition, id);

    const generator = {
      id,
      type: generatorType,
      element,
      copyButton: element.querySelector("[data-generator-copy]"),
      copyResetTimer: null,
      copyText: "",
    };

    generators.set(id, generator);
    els.generatorGrid.append(element);

    element.addEventListener("pointerdown", () => setActiveGenerator(id));
    element.addEventListener("focusin", () => setActiveGenerator(id));

    element.querySelector("[data-generator-close]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      closeGenerator(id);
    });

    generator.copyButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      copyGeneratorResult(generator);
    });

    definition.initialize(generator);
    setActiveGenerator(id);
    return generator;
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
    return activeInputMode;
  }

  function getConverterTargetInstructions(targetFormat) {
    switch (targetFormat) {
      case "markdown":
        return "Return valid Markdown that preserves headings, paragraphs, emphasis, links, quotes, lists, code, and tables when present.";
      case "html":
        return "Return an HTML fragment only. Do not include a full document, script tags, style tags, event handlers, markdown fences, or commentary.";
      case "plain-text":
        return "Return clean plain text with readable paragraph breaks and no markup.";
      case "json":
        return "Return valid JSON only. Infer a practical object or array shape from the source. Do not include markdown fences.";
      case "yaml":
        return "Return valid YAML only. Infer a practical structure from the source. Do not include markdown fences.";
      case "xml":
        return "Return well-formed XML only, using a sensible root element. Do not include markdown fences.";
      case "csv":
        return "Return CSV only. Include a header row when tabular fields can be inferred. Quote fields when needed.";
      case "tsv":
        return "Return tab-separated values only. Include a header row when tabular fields can be inferred.";
      case "sql-inserts":
        return "Return SQL INSERT statements only. Use the table name converted_items. Infer sensible snake_case columns. Quote strings safely and use NULL when needed.";
      case "sql-schema":
        return "Return SQL DDL only. Infer sensible snake_case table and column names, practical SQL data types, and CREATE TABLE statements from the source. Include a primary key only when clearly appropriate. Do not include INSERT statements, markdown fences, or commentary.";
      case "outline":
        return "Return a concise hierarchical outline using indented levels.";
      case "bullet-list":
        return "Return a concise bullet list only.";
      case "numbered-list":
        return "Return a concise numbered list only.";
      case "summary":
        return "Return a concise plain-text summary only.";
      case "custom":
        return "Return only the converted output.";
      default:
        return "Return only the converted output.";
    }
  }

  function buildConverterInstructions(inputMode, targetFormat) {
    if (targetFormat === "custom") {
      return customConverterInstructions;
    }

    const targetLabel = converterTargetLabels[targetFormat] || targetFormat;
    const sourceDescription = inputMode === "wysiwyg"
      ? "The source is a sanitized WYSIWYG HTML fragment. Preserve the meaning and useful structure, not irrelevant editor artifacts."
      : "The source is raw text. Preserve the meaning and useful structure.";

    return [
      `Convert the provided source into ${targetLabel}.`,
      sourceDescription,
      getConverterTargetInstructions(targetFormat),
      "Return only the converted output. Do not explain the conversion. Do not add markdown fences unless the requested output format itself is Markdown.",
      "If the source is ambiguous, make the smallest reasonable inference needed to produce the requested format.",
    ].join("\n\n");
  }

  function buildDisplayedConverterPrompt({ inputMode, targetFormat, input, instructions }) {
    const promptInstructions = String(instructions || buildConverterInstructions(inputMode, targetFormat));
    return [
      "System:\nYou are a precise text conversion engine. Return only the requested converted output with no commentary.",
      `User:\n${promptInstructions}\n\nSource:\n${input}`,
    ].join("\n\n");
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

  function setRichEditorPlainText(value) {
    els.richEditor.innerHTML = escapeHtml(value).replace(/\r?\n/g, "<br>");
  }

  function richHtmlToMarkdown(html) {
    const template = document.createElement("template");
    template.innerHTML = sanitizeRichHtml(html || "");

    function renderChildren(node) {
      return Array.from(node.childNodes).map(renderNode).join("");
    }

    function renderList(node, ordered) {
      return Array.from(node.children)
        .filter((child) => child.tagName === "LI")
        .map((item, index) => {
          const marker = ordered ? `${index + 1}.` : "-";
          const content = renderChildren(item).trim().replace(/\n+/g, "\n  ");
          return `${marker} ${content}`;
        })
        .join("\n");
    }

    function renderNode(node) {
      if (node.nodeType === 3) {
        return (node.nodeValue || "").replace(/\u00a0/g, " ");
      }

      if (node.nodeType !== 1) return "";

      const tagName = node.tagName.toLowerCase();
      const content = renderChildren(node);

      switch (tagName) {
        case "br": return "\n";
        case "strong":
        case "b": return `**${content.trim()}**`;
        case "em":
        case "i": return `*${content.trim()}*`;
        case "s":
        case "strike":
        case "del": return `~~${content.trim()}~~`;
        case "code": return `\`${content.replace(/`/g, "\\`")}\``;
        case "a": {
          const href = node.getAttribute("href");
          return href ? `[${content.trim()}](${href})` : content;
        }
        case "h1": return `# ${content.trim()}\n\n`;
        case "h2": return `## ${content.trim()}\n\n`;
        case "h3": return `### ${content.trim()}\n\n`;
        case "h4": return `#### ${content.trim()}\n\n`;
        case "h5": return `##### ${content.trim()}\n\n`;
        case "h6": return `###### ${content.trim()}\n\n`;
        case "p":
        case "div": return `${content.trim()}\n\n`;
        case "blockquote": return content.trim().split(/\n+/).map((line) => `> ${line}`).join("\n") + "\n\n";
        case "pre": return `\`\`\`\n${(node.textContent || "").trim()}\n\`\`\`\n\n`;
        case "ul": return `${renderList(node, false)}\n\n`;
        case "ol": return `${renderList(node, true)}\n\n`;
        case "hr": return "---\n\n";
        default: return content;
      }
    }

    return renderChildren(template.content).replace(/\n{3,}/g, "\n\n").trim();
  }

  function downloadTextFile(contents, filename) {
    const blob = new Blob([contents], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  function saveConverterInput() {
    const isRaw = getCurrentMode() === "raw";
    const contents = isRaw ? els.rawInput.value : richHtmlToMarkdown(els.richEditor.innerHTML);

    if (!contents.trim()) {
      setStatus("Add text before saving.", "error");
      return;
    }

    downloadTextFile(contents, `centralis-text-converter-input.${isRaw ? "txt" : "md"}`);
  }

  function saveConverterOutput() {
    const contents = els.output.value;
    if (!contents.trim()) {
      setStatus("There is no output to save.", "error");
      return;
    }

    downloadTextFile(contents, "centralis-text-converter-output.txt");
  }

  function clearConverterInput() {
    els.rawInput.value = "";
    els.richEditor.innerHTML = "";
    setStatus("");

    if (getCurrentMode() === "raw") {
      els.rawInput.focus({ preventScroll: true });
      return;
    }

    els.richEditor.focus({ preventScroll: true });
  }

  function switchInputMode(mode) {
    const nextMode = mode === "raw" ? "raw" : "wysiwyg";

    if (nextMode !== activeInputMode) {
      if (activeInputMode === "wysiwyg" && nextMode === "raw") {
        els.rawInput.value = els.richEditor.innerText.trim();
      }

      if (activeInputMode === "raw" && nextMode === "wysiwyg") {
        setRichEditorPlainText(els.rawInput.value);
      }
    }

    activeInputMode = nextMode;

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

  function openConverterInstructionsDialog(targetFormat) {
    if (isConverting) return;

    const input = getConverterInput();
    if (!input) {
      setStatus("Add text on the left before converting.", "error");
      return;
    }

    if (!els.instructionModal || !els.instructionTextarea) {
      convertText(targetFormat, {
        input,
        inputMode: getCurrentMode(),
        instructions: buildConverterInstructions(getCurrentMode(), targetFormat),
      });
      return;
    }

    const inputMode = getCurrentMode();
    const targetLabel = getConverterTargetLabel(targetFormat);
    pendingConversion = { input, inputMode, targetFormat };
    els.instructionTextarea.value = buildConverterInstructions(inputMode, targetFormat);
    if (els.instructionSubtitle) {
      els.instructionSubtitle.textContent = `Review instructions for ${targetLabel}. The source text is not shown here.`;
    }
    els.instructionModal.hidden = false;
    requestAnimationFrame(() => els.instructionTextarea.focus({ preventScroll: true }));
  }

  function closeConverterInstructionsDialog() {
    pendingConversion = null;
    if (els.instructionModal) {
      els.instructionModal.hidden = true;
    }
  }

  function confirmConverterInstructionsDialog() {
    const conversion = pendingConversion;
    const instructions = els.instructionTextarea?.value ?? "";
    closeConverterInstructionsDialog();
    if (!conversion) return;
    convertText(conversion.targetFormat, {
      input: conversion.input,
      inputMode: conversion.inputMode,
      instructions,
    });
  }

  async function convertText(targetFormat, options = {}) {
    if (isConverting) return;

    const input = options.input ?? getConverterInput();
    if (!input) {
      setStatus("Add text on the left before converting.", "error");
      return;
    }

    const inputMode = options.inputMode ?? getCurrentMode();
    const promptInstructions = Object.prototype.hasOwnProperty.call(options, "instructions")
      ? String(options.instructions ?? "")
      : buildConverterInstructions(inputMode, targetFormat);
    const promptUsed = buildDisplayedConverterPrompt({
      inputMode,
      targetFormat,
      input,
      instructions: promptInstructions,
    });
    const requestTargetFormat = targetFormat === "custom" ? "plain-text" : targetFormat;
    const requestBody = {
      inputMode,
      targetFormat: requestTargetFormat,
      input,
    };
    if (promptInstructions) {
      requestBody.instructions = promptInstructions;
    }

    setOutputFormat(targetFormat);
    setConverting(true, targetFormat);
    setStatus(`Converting to ${getConverterTargetLabel(targetFormat)}...`);

    try {
      const response = await getFunctionResponse("convert-text-format", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(await parseFunctionError(response, "Could not convert text."));
      }

      const payload = await response.json();
      els.output.value = String(payload.output || "").trim();
      lastConverterPrompt = promptUsed;
      setStatus("Conversion complete.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Could not convert text.", "error");
    } finally {
      setConverting(false);
    }
  }

  function isImageStorageObject(key = "", contentType = "") {
    return /^image\//i.test(contentType) || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(key);
  }

  function getStorageFileName(key = "") {
    return key.split("/").filter(Boolean).pop() || key;
  }

  function getStorageFolderName(prefix = "") {
    return prefix.replace(/\/+$/, "").split("/").filter(Boolean).pop() || prefix;
  }

  function formatStorageBytes(value) {
    const bytes = Number(value || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const amount = bytes / 1024 ** index;
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
  }

  function setStorageStatus(message = "") {
    if (els.storageStatus) els.storageStatus.textContent = message;
  }

  function isUsefulAdmin(user = window.centralisCurrentAppUser) {
    return user?.admin === true;
  }

  function activateUsefulTab(tabName) {
    let tab = els.tabs.find((candidate) => candidate.dataset.usefulTab === tabName && !candidate.hidden);
    if (!tab) {
      tab = els.tabs.find((candidate) => candidate.dataset.usefulTab === "text-converter") || els.tabs.find((candidate) => !candidate.hidden);
    }
    if (!tab) return;

    const activeTabName = tab.dataset.usefulTab;
    els.tabs.forEach((button) => {
      const isActive = button === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });
    els.panels.forEach((panel) => {
      const isActive = panel.dataset.usefulPanel === activeTabName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
    if (activeTabName === "calculators") {
      scheduleCalculatorResultsFit();
    }
    if (activeTabName === "storage") {
      initializeStorageBrowser();
    }
  }

  function syncUsefulAdminVisibility(user = window.centralisCurrentAppUser) {
    storageAccessAllowed = isUsefulAdmin(user);
    const activePanel = els.panels.find((panel) => panel.classList.contains("is-active"));
    const nextTab = !storageAccessAllowed && activePanel?.dataset.usefulPanel === "storage"
      ? "text-converter"
      : activePanel?.dataset.usefulPanel || "text-converter";

    els.adminOnly.forEach((element) => {
      element.hidden = !storageAccessAllowed;
    });

    activateUsefulTab(nextTab);
  }

  function setStorageMigrationBusy(busy) {
    storageMigrationState.busy = busy;
    if (els.storageMigrationCloseButton) els.storageMigrationCloseButton.disabled = busy;
    if (els.storageMigrationDryRunButton) els.storageMigrationDryRunButton.disabled = busy;
    if (els.storageMigrationStartButton) {
      els.storageMigrationStartButton.disabled = busy || !storageMigrationState.dryRunComplete;
    }
  }

  function renderStorageMigrationProgress(message) {
    if (els.storageMigrationStatus) els.storageMigrationStatus.textContent = message;
    const resultCount = storageMigrationState.results.length;
    if (!els.storageMigrationDetails || !els.storageMigrationSummary || !els.storageMigrationResults) return;
    els.storageMigrationDetails.hidden = resultCount === 0;
    if (!resultCount) return;
    const counts = storageMigrationState.results.reduce((totals, result) => {
      const status = String(result.status || "unknown");
      totals[status] = (totals[status] || 0) + 1;
      return totals;
    }, {});
    const countText = Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(", ");
    els.storageMigrationSummary.textContent = `Details (${resultCount} records: ${countText})`;
    els.storageMigrationResults.innerHTML = storageMigrationState.results.slice(-100).map((result) => {
      const id = escapeHtml(String(result.id || "Unknown image"));
      const status = escapeHtml(String(result.status || "unknown"));
      const detail = escapeHtml(String(result.reason || result.error || result.newKey || ""));
      return `<li><strong>${status}</strong><span>${id}${detail ? ` — ${detail}` : ""}</span></li>`;
    }).join("");
  }

  function openStorageMigrationDialog() {
    if (!els.storageMigrationModal) return;
    storageMigrationState.results = [];
    storageMigrationState.dryRunComplete = false;
    renderStorageMigrationProgress("Ready to run a dry run.");
    setStorageMigrationBusy(false);
    els.storageMigrationModal.hidden = false;
    requestAnimationFrame(() => els.storageMigrationDryRunButton?.focus({ preventScroll: true }));
  }

  function closeStorageMigrationDialog() {
    if (!els.storageMigrationModal || storageMigrationState.busy) return;
    els.storageMigrationModal.hidden = true;
  }

  async function runStorageImageMigration(dryRun) {
    if (storageMigrationState.busy) return;
    if (!dryRun && !window.confirm("Start the full image migration? Verified old image objects will be deleted after their database URLs are updated.")) {
      return;
    }
    storageMigrationState.results = [];
    storageMigrationState.dryRunComplete = false;
    setStorageMigrationBusy(true);
    let afterId = "";
    let batch = 0;
    try {
      while (true) {
        batch += 1;
        renderStorageMigrationProgress(`${dryRun ? "Checking" : "Migrating"} batch ${batch}…`);
        const payload = await getStorageResponse("migrate-centralis-image-storage", {
          dryRun,
          limit: 50,
          afterId: afterId || undefined,
        });
        const batchResults = Array.isArray(payload.results) ? payload.results : [];
        storageMigrationState.results.push(...batchResults);
        const nextAfterId = String(payload.nextAfterId || "");
        renderStorageMigrationProgress(`${dryRun ? "Checked" : "Migrated"} ${storageMigrationState.results.length} image records across ${batch} batch${batch === 1 ? "" : "es"}.`);
        if (!nextAfterId || nextAfterId === afterId || !Number(payload.processed || 0)) break;
        afterId = nextAfterId;
      }
      if (dryRun) {
        storageMigrationState.dryRunComplete = true;
        renderStorageMigrationProgress(`Dry run complete. Checked ${storageMigrationState.results.length} image records. Review the details, then start the full migration.`);
      } else {
        const migrated = storageMigrationState.results.filter((result) => result.status === "migrated").length;
        const failed = storageMigrationState.results.filter((result) => result.status === "failed").length;
        renderStorageMigrationProgress(`Migration complete. ${migrated} image${migrated === 1 ? "" : "s"} migrated${failed ? `; ${failed} failed` : ""}.`);
      }
    } catch (error) {
      renderStorageMigrationProgress(error instanceof Error ? error.message : "Could not run the image migration.");
    } finally {
      setStorageMigrationBusy(false);
    }
  }

  async function getStorageResponse(name, body) {
    const response = await getFunctionResponse(name, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await parseFunctionError(response, "Storage request failed."));
    return response.json();
  }

  function renderStorageTree() {
    if (!els.storageTree) return;
    const activePath = `${storageState.bucket}/${storageState.prefix}`;
    const markup = storageState.buckets.map((bucket) => {
      const isActiveBucket = bucket === storageState.bucket;
      const treeKey = `${bucket}/`;
      const folders = storageState.foldersByPath.get(treeKey) || [];
      const childButtons = isActiveBucket ? folders.map((folder) => `
        <button type="button" class="storage-tree-folder${`${bucket}/${folder}` === activePath ? " is-active" : ""}" style="--storage-indent: 26px" data-storage-folder="${escapeHtml(folder)}">
          <ph-folder weight="fill" aria-hidden="true"></ph-folder><span>${escapeHtml(getStorageFolderName(folder))}</span>
        </button>`).join("") : "";
      return `
        <button type="button" class="storage-tree-bucket${isActiveBucket && !storageState.prefix ? " is-active" : ""}" data-storage-bucket="${escapeHtml(bucket)}">
          <ph-database weight="bold" aria-hidden="true"></ph-database><span>${escapeHtml(bucket)}</span>
        </button>${childButtons}`;
    }).join("");
    els.storageTree.innerHTML = markup || '<p class="storage-status">No accessible buckets were found.</p>';
  }

  function renderStorageBreadcrumbs() {
    if (!els.storageBreadcrumbs) return;
    if (!storageState.bucket) {
      els.storageBreadcrumbs.innerHTML = "";
      return;
    }
    const segments = storageState.prefix.split("/").filter(Boolean);
    const pieces = [`<button type="button" data-storage-path="">${escapeHtml(storageState.bucket)}</button>`];
    let current = "";
    segments.forEach((segment) => {
      current += `${segment}/`;
      pieces.push(`<span>/</span><button type="button" data-storage-path="${escapeHtml(current)}">${escapeHtml(segment)}</button>`);
    });
    els.storageBreadcrumbs.innerHTML = pieces.join("");
  }

  function renderStorageItems() {
    if (!els.storageItems) return;
    els.storageItems.classList.toggle("is-grid", storageState.view === "grid");
    els.storageItems.classList.toggle("is-list", storageState.view === "list");
    const folders = storageState.foldersByPath.get(`${storageState.bucket}/${storageState.prefix}`) || [];
    const foldersMarkup = folders.map((folder) => `
      <button type="button" class="storage-item storage-folder-item" data-storage-folder="${escapeHtml(folder)}">
        <span class="storage-item-thumb"><ph-folder weight="fill" aria-hidden="true"></ph-folder></span>
        <span class="storage-item-name">${escapeHtml(getStorageFolderName(folder))}</span>
        <span class="storage-item-meta">Folder</span>
      </button>`).join("");
    const objectMarkup = storageState.objects.map((object) => {
      const isImage = isImageStorageObject(object.key, object.contentType);
      return `
        <button type="button" class="storage-item${storageState.selected?.key === object.key ? " is-selected" : ""}" data-storage-object="${escapeHtml(object.key)}">
          <span class="storage-item-thumb" data-storage-thumbnail="${escapeHtml(object.key)}">${isImage ? '<ph-image weight="duotone" aria-hidden="true"></ph-image>' : '<ph-file weight="duotone" aria-hidden="true"></ph-file>'}</span>
          <span class="storage-item-name">${escapeHtml(getStorageFileName(object.key))}</span>
          <span class="storage-item-meta">${escapeHtml(formatStorageBytes(object.size))}</span>
        </button>`;
    }).join("");
    els.storageItems.innerHTML = foldersMarkup + objectMarkup || '<p class="storage-status">This folder is empty.</p>';
    if (els.storageLoadMore) els.storageLoadMore.hidden = !storageState.nextContinuationToken;
    hydrateStorageThumbnails();
  }

  async function getStorageObjectUrl(object, download = false) {
    const payload = await getStorageResponse("get-storage-object-url", {
      bucket: storageState.bucket,
      key: object.key,
      download,
    });
    return payload;
  }

  async function hydrateStorageThumbnails() {
    const images = storageState.objects.filter((object) => isImageStorageObject(object.key, object.contentType));
    await Promise.all(images.map(async (object) => {
      const slot = els.storageItems?.querySelector(`[data-storage-thumbnail="${CSS.escape(object.key)}"]`);
      const cachedUrl = storageState.imageUrls.get(object.key);
      if (cachedUrl) {
        if (slot) slot.innerHTML = `<img src="${escapeHtml(cachedUrl)}" alt="">`;
        return;
      }
      try {
        const payload = await getStorageObjectUrl(object);
        storageState.imageUrls.set(object.key, payload.url);
        if (slot) slot.innerHTML = `<img src="${escapeHtml(payload.url)}" alt="">`;
      } catch {
        // An unreadable image remains represented by its generic icon.
      }
    }));
  }

  function renderStoragePreview() {
    const object = storageState.selected;
    const hasObject = Boolean(object);
    if (els.storagePreviewEmpty) els.storagePreviewEmpty.hidden = hasObject;
    if (els.storagePreviewContent) els.storagePreviewContent.hidden = !hasObject;
    if (!object || !els.storageFileMetadata) return;
    const isImage = isImageStorageObject(object.key, object.contentType);
    if (els.storageImagePreview) els.storageImagePreview.hidden = !isImage;
    if (els.storageFilePreviewIcon) {
      els.storageFilePreviewIcon.hidden = isImage;
      els.storageFilePreviewIcon.innerHTML = '<ph-file weight="duotone" aria-hidden="true"></ph-file>';
    }
    if (els.storagePreviewImage && isImage) {
      els.storagePreviewImage.src = storageState.imageUrls.get(object.key) || "";
      els.storagePreviewImage.alt = getStorageFileName(object.key);
    }
    const modified = object.lastModified ? new Date(object.lastModified).toLocaleString() : "Unknown";
    els.storageFileMetadata.innerHTML = `
      <div><dt>Filename</dt><dd>${escapeHtml(getStorageFileName(object.key))}</dd></div>
      <div><dt>Path</dt><dd>${escapeHtml(object.key)}</dd></div>
      <div><dt>Size</dt><dd>${escapeHtml(formatStorageBytes(object.size))}</dd></div>
      <div><dt>Type</dt><dd>${escapeHtml(object.contentType || "Unknown")}</dd></div>
      <div><dt>Modified</dt><dd>${escapeHtml(modified)}</dd></div>`;
    if (els.storageOpenButton) els.storageOpenButton.hidden = !isImage;
  }

  function updateStorageItemSelection(selectedKey) {
    els.storageItems?.querySelectorAll("[data-storage-object]").forEach((item) => {
      item.classList.toggle("is-selected", item.dataset.storageObject === selectedKey);
    });
  }

  async function selectStorageObject(key) {
    const object = storageState.objects.find((item) => item.key === key);
    if (!object) return;
    storageState.selected = object;
    updateStorageItemSelection(key);
    setStorageStatus("Loading file details...");
    try {
      const payload = await getStorageObjectUrl(object);
      Object.assign(object, payload.metadata || {});
      if (isImageStorageObject(object.key, object.contentType)) storageState.imageUrls.set(object.key, payload.url);
      renderStoragePreview();
      setStorageStatus("");
    } catch (error) {
      setStorageStatus(error instanceof Error ? error.message : "Could not load file details.");
    }
  }

  async function loadStoragePath(bucket, prefix = "", options = {}) {
    if (!bucket || storageState.loading) return;
    storageState.loading = true;
    setStorageStatus("Loading images…");
    try {
      const payload = await getStorageResponse("browse-storage", {
        action: "objects",
        bucket,
        prefix,
        continuationToken: options.append ? storageState.nextContinuationToken : undefined,
      });
      storageState.bucket = bucket;
      storageState.prefix = prefix;
      storageState.foldersByPath.set(`${bucket}/${prefix}`, payload.folders || []);
      storageState.objects = options.append ? [...storageState.objects, ...(payload.objects || [])] : (payload.objects || []);
      storageState.nextContinuationToken = payload.nextContinuationToken || null;
      storageState.selected = null;
      renderStorageTree();
      renderStorageBreadcrumbs();
      renderStorageItems();
      renderStoragePreview();
      setStorageStatus("");
    } catch (error) {
      setStorageStatus(error instanceof Error ? error.message : "Could not load storage.");
    } finally {
      storageState.loading = false;
    }
  }

  async function initializeStorageBrowser() {
    if (!storageAccessAllowed) return;
    if (!els.storageBrowser || storageState.loaded || storageState.loading) return;
    storageState.loading = true;
    setStorageStatus("Loading buckets...");
    try {
      const payload = await getStorageResponse("browse-storage", { action: "buckets" });
      storageState.buckets = payload.buckets || [];
      storageState.loaded = true;
      storageState.loading = false;
      renderStorageTree();
      if (storageState.buckets[0]) await loadStoragePath(storageState.buckets[0]);
      else setStorageStatus("No accessible buckets were found.");
    } catch (error) {
      storageState.loading = false;
      setStorageStatus(error instanceof Error ? error.message : "Could not load storage buckets.");
    }
  }

  function bindStorageBrowser() {
    if (!els.storageBrowser) return;
    els.storageMigrationOpenButton?.addEventListener("click", openStorageMigrationDialog);
    els.storageMigrationCloseButton?.addEventListener("click", closeStorageMigrationDialog);
    els.storageMigrationDryRunButton?.addEventListener("click", () => runStorageImageMigration(true));
    els.storageMigrationStartButton?.addEventListener("click", () => runStorageImageMigration(false));
    els.storageMigrationModal?.addEventListener("click", (event) => {
      if (event.target === els.storageMigrationModal) closeStorageMigrationDialog();
    });
    els.storageTree?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-storage-bucket], [data-storage-folder]");
      if (!button) return;
      if (button.dataset.storageBucket) loadStoragePath(button.dataset.storageBucket, "");
      if (button.dataset.storageFolder) loadStoragePath(storageState.bucket, button.dataset.storageFolder);
    });
    els.storageBreadcrumbs?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-storage-path]");
      if (button) loadStoragePath(storageState.bucket, button.dataset.storagePath || "");
    });
    els.storageItems?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-storage-folder], [data-storage-object]");
      if (!button) return;
      if (button.dataset.storageFolder) loadStoragePath(storageState.bucket, button.dataset.storageFolder);
      if (button.dataset.storageObject) selectStorageObject(button.dataset.storageObject);
    });
    els.storageViewButtons.forEach((button) => button.addEventListener("click", () => {
      storageState.view = button.dataset.storageView || "grid";
      els.storageViewButtons.forEach((current) => current.classList.toggle("is-active", current === button));
      renderStorageItems();
    }));
    els.storageLoadMore?.addEventListener("click", () => {
      if (storageState.nextContinuationToken) loadStoragePath(storageState.bucket, storageState.prefix, { append: true });
    });
    els.storageOpenButton?.addEventListener("click", () => {
      const url = storageState.selected && storageState.imageUrls.get(storageState.selected.key);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    });
    els.storageDownloadButton?.addEventListener("click", async () => {
      if (!storageState.selected) return;
      try {
        const payload = await getStorageObjectUrl(storageState.selected, true);
        const link = document.createElement("a");
        link.href = payload.url;
        link.download = getStorageFileName(storageState.selected.key);
        document.body.append(link);
        link.click();
        link.remove();
      } catch (error) {
        setStorageStatus(error instanceof Error ? error.message : "Could not start download.");
      }
    });
    els.storageResizers.forEach((resizer) => resizer.addEventListener("pointerdown", (event) => {
      const side = resizer.dataset.storageResizer;
      const startX = event.clientX;
      const startWidth = side === "left" ? storageState.leftWidth : storageState.rightWidth;
      resizer.setPointerCapture(event.pointerId);
      resizer.classList.add("is-dragging");
      const move = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const next = side === "left" ? startWidth + delta : startWidth - delta;
        const bounded = Math.min(side === "left" ? 420 : 600, Math.max(side === "left" ? 180 : 200, next));
        if (side === "left") storageState.leftWidth = bounded;
        else storageState.rightWidth = bounded;
        els.storageBrowser.style.setProperty(side === "left" ? "--storage-tree-width" : "--storage-preview-width", `${bounded}px`);
      };
      const end = () => {
        resizer.classList.remove("is-dragging");
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", end);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", end, { once: true });
    }));
  }

  bindStorageBrowser();
  syncUsefulAdminVisibility();
  window.addEventListener("centralis:current-user-changed", (event) => {
    syncUsefulAdminVisibility(event.detail?.user);
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateUsefulTab(tab.dataset.usefulTab);
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

  if (els.generatorGrid) {
    createGeneratorCard("dice");

    if (els.generatorMenuTrigger && els.generatorMenuPanel) {
      els.generatorMenuTrigger.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleGeneratorMenu();
      });

      els.generatorTypeButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          createGeneratorCard(button.dataset.addGeneratorType || "uuid");
          setGeneratorMenuOpen(false);
        });
      });

      document.addEventListener("click", (event) => {
        if (!isGeneratorMenuOpen()) return;
        if (els.generatorAddMenu && els.generatorAddMenu.contains(event.target)) return;
        setGeneratorMenuOpen(false);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isGeneratorMenuOpen()) {
          setGeneratorMenuOpen(false);
          els.generatorMenuTrigger.focus({ preventScroll: true });
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
      openConverterInstructionsDialog(button.dataset.convertTarget);
    });
  });

  els.instructionCancelButton?.addEventListener("click", closeConverterInstructionsDialog);
  els.instructionConfirmButton?.addEventListener("click", confirmConverterInstructionsDialog);
  els.instructionModal?.addEventListener("click", (event) => {
    if (event.target === els.instructionModal) {
      closeConverterInstructionsDialog();
    }
  });
  els.showPromptButton?.addEventListener("click", openConverterPromptDialog);
  els.promptCloseButtons.forEach((button) => {
    button.addEventListener("click", closeConverterPromptDialog);
  });
  els.promptModal?.addEventListener("click", (event) => {
    if (event.target === els.promptModal) {
      closeConverterPromptDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.instructionModal && !els.instructionModal.hidden) {
      closeConverterInstructionsDialog();
    }
    if (event.key === "Escape" && els.promptModal && !els.promptModal.hidden) {
      closeConverterPromptDialog();
    }
    if (event.key === "Escape" && isOutputCopyMenuOpen()) {
      setOutputCopyMenuOpen(false);
      els.outputCopyMenuTrigger?.focus({ preventScroll: true });
    }
  });

  els.outputCopyMenuTrigger?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleOutputCopyMenu();
  });

  els.outputCopyOptionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.dataset.textCopyOption === "prompt") {
        copyConverterPrompt();
        return;
      }
      copyOutputText();
    });
  });

  document.addEventListener("click", (event) => {
    if (!isOutputCopyMenuOpen()) return;
    if (els.outputCopyMenu && els.outputCopyMenu.contains(event.target)) return;
    setOutputCopyMenuOpen(false);
  });

  els.outputCopyButton?.addEventListener("click", copyOutputText);
  els.clearInputButton?.addEventListener("click", clearConverterInput);
  els.saveInputButton?.addEventListener("click", saveConverterInput);
  els.saveOutputButton?.addEventListener("click", saveConverterOutput);

  window.addEventListener("resize", scheduleCalculatorResultsFit);

  switchInputMode("wysiwyg");
})();
