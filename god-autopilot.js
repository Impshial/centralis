(function initGodAutopilot() {
  const startButton = document.querySelector("[data-god-autopilot-start]");
  const stopButton = document.querySelector("[data-god-autopilot-stop]");
  const statusElement = document.querySelector("[data-god-autopilot-status]");
  const logElement = document.querySelector("[data-god-autopilot-log]");
  const canvasLink = document.querySelector("[data-god-autopilot-canvas]");
  const params = new URLSearchParams(window.location.search);
  const evolutionId = params.get("evolution_id") || sessionStorage.getItem("centralis-current-god-evolution-id") || "";
  const MAX_CYCLES = 10;

  let currentUser = window.centralisCurrentAppUser || null;
  let shouldStop = false;
  let isRunning = false;
  let lastLayoutColumns = new Map();

  if (evolutionId) {
    sessionStorage.setItem("centralis-current-god-evolution-id", evolutionId);
    if (canvasLink) canvasLink.href = `god-canvas.html?evolution_id=${encodeURIComponent(evolutionId)}`;
  }

  function setStatus(message, type = "") {
    if (!statusElement) return;
    statusElement.textContent = message || "";
    statusElement.classList.toggle("is-error", type === "error");
    statusElement.classList.toggle("is-success", type === "success");
  }

  function log(message, type = "") {
    if (!logElement) return;
    const item = document.createElement("li");
    item.textContent = message;
    if (type) item.className = `is-${type}`;
    logElement.prepend(item);
  }

  function createId() {
    return window.crypto?.randomUUID ? window.crypto.randomUUID() : `god-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeNovelty(value) {
    if (value === null || value === undefined || value === "") return 50;
    return Math.max(0, Math.min(100, Number(value)));
  }

  function normalizeStepYears(value, totalSteps) {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: Math.max(1, Number(totalSteps) || 3) }, (_, index) => {
      const numberValue = Math.round(Number(source[index]));
      if (!Number.isFinite(numberValue)) return 1000000;
      return Math.min(5000000, Math.max(1000000, numberValue));
    });
  }

  function customTraitsFor(row) {
    const values = Array.isArray(row?.custom_evolution_traits) ? row.custom_evolution_traits : [];
    const traits = values.map((item) => String(item || "").trim()).filter(Boolean);
    const legacy = String(row?.custom_evolution_trait || "").trim();
    if (legacy && !traits.some((item) => item.toLowerCase() === legacy.toLowerCase())) traits.push(legacy);
    return traits.slice(0, 12);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function sortRows(items, parent = null) {
    return items.sort((left, right) => {
      const parentBranch = parent?.branch_group || "main";
      const leftKeepsLane = left.branch_group === parentBranch || left.branch_group === "main";
      const rightKeepsLane = right.branch_group === parentBranch || right.branch_group === "main";
      return Number(rightKeepsLane) - Number(leftKeepsLane)
        || Number(left.depth_index ?? left.step_index ?? 0) - Number(right.depth_index ?? right.step_index ?? 0)
        || Number(left.sort_order || 0) - Number(right.sort_order || 0)
        || String(left.name).localeCompare(String(right.name));
    });
  }

  function layoutSpecies(rows) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const childrenByParent = new Map();
    rows.forEach((row) => {
      if (!row.parent_species_id || !byId.has(row.parent_species_id)) return;
      const group = childrenByParent.get(row.parent_species_id) || [];
      group.push(row);
      childrenByParent.set(row.parent_species_id, group);
    });
    const roots = sortRows(rows.filter((row) => !row.parent_species_id || !byId.has(row.parent_species_id)));
    const columnById = new Map();
    const assignColumns = (row, column) => {
      const currentColumn = Math.max(column, columnById.get(row.id) ?? 0);
      columnById.set(row.id, currentColumn);
      sortRows([...(childrenByParent.get(row.id) || [])], row).forEach((child) => assignColumns(child, currentColumn + 1));
    };
    roots.forEach((rootRow) => assignColumns(rootRow, 0));
    lastLayoutColumns = columnById;

    const positions = new Map();
    const occupied = new Map();
    const columnGap = 420;
    const rowGap = 500;
    const reserveY = (x, preferredY) => {
      const key = Math.round(x / columnGap);
      const used = occupied.get(key) || [];
      let y = preferredY;
      let attempts = 0;
      while (used.some((existing) => Math.abs(existing - y) < rowGap * 0.82)) {
        attempts += 1;
        const direction = attempts % 2 ? 1 : -1;
        const distance = Math.ceil(attempts / 2) * rowGap;
        y = preferredY + direction * distance;
      }
      used.push(y);
      occupied.set(key, used);
      return y;
    };
    const placeBranch = (row, preferredY) => {
      const column = columnById.get(row.id) ?? 0;
      const x = 80 + column * columnGap;
      const y = reserveY(x, preferredY);
      positions.set(row.id, { x, y });
      const children = sortRows([...(childrenByParent.get(row.id) || [])], row);
      children.forEach((child, index) => {
        const branchIndex = index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 1 : -1);
        placeBranch(child, y + branchIndex * rowGap);
      });
    };
    let rootY = 80;
    roots.forEach((rootRow) => {
      placeBranch(rootRow, rootY);
      rootY += rowGap * 1.35;
    });
    return positions;
  }

  async function loadEvolution() {
    const { data, error } = await window.centralisSupabase
      .from("god_evolutions")
      .select("*")
      .eq("id", evolutionId)
      .eq("user_id", currentUser.id)
      .eq("deleted", false)
      .single();
    if (error) throw error;
    return data;
  }

  async function loadSpecies() {
    const { data, error } = await window.centralisSupabase
      .from("god_species")
      .select("*")
      .eq("evolution_id", evolutionId)
      .eq("user_id", currentUser.id)
      .eq("deleted", false)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function pickFromLatestBatch(rows) {
    const viable = rows.filter((row) => row.status !== "extinct" && row.can_evolve !== false);
    if (!viable.length) return null;
    const eventIds = viable
      .map((row) => row.origin_event_id)
      .filter(Boolean);
    if (eventIds.length) {
      const latestEventId = viable
        .filter((row) => row.origin_event_id)
        .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))[0]?.origin_event_id;
      const latestBatch = viable.filter((row) => row.origin_event_id === latestEventId);
      if (latestBatch.length) return latestBatch[Math.floor(Math.random() * latestBatch.length)];
    }
    const leafRows = viable.filter((row) => !rows.some((child) => child.parent_species_id === row.id));
    const candidates = leafRows.length ? leafRows : viable;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  async function persistLayout(rows) {
    const positions = layoutSpecies(rows);
    await Promise.all(rows.map((row) => {
      const position = positions.get(row.id) || { x: Number(row.position_x || 0), y: Number(row.position_y || 0) };
      return window.centralisSupabase
        .from("god_species")
        .update({
          position_x: Math.round(position.x),
          position_y: Math.round(position.y),
          depth_index: lastLayoutColumns.get(row.id) ?? row.depth_index,
        })
        .eq("id", row.id)
        .eq("user_id", currentUser.id)
        .eq("deleted", false);
    }));
  }

  async function generateImage(row, rows = []) {
    if (row.status === "extinct") return;
    const parentSpecies = row.parent_species_id ? rows.find((item) => item.id === row.parent_species_id) || null : null;
    const { error } = await window.centralisSupabase.functions.invoke("generate-god-species-image", {
      body: {
        speciesId: row.id,
        name: row.name,
        scientificName: row.scientific_name || "",
        classification: row.classification || "",
        category: row.category || "",
        habitat: row.habitat,
        overview: row.overview,
        newlyEvolvedTraits: row.newly_evolved_traits || [],
        completeTraits: row.complete_traits || {},
        inheritedTraits: row.inherited_traits || [],
        lostTraits: row.lost_traits || [],
        ecology: row.ecology || {},
        populationCondition: row.population_condition || {},
        visualGenome: row.visual_genome || {},
        parentSpecies: parentSpecies ? {
          id: parentSpecies.id,
          name: parentSpecies.name,
          scientificName: parentSpecies.scientific_name || "",
          habitat: parentSpecies.habitat || "",
          overview: parentSpecies.overview || "",
          completeTraits: parentSpecies.complete_traits || {},
          newlyEvolvedTraits: parentSpecies.newly_evolved_traits || [],
          visualGenome: parentSpecies.visual_genome || {},
          imagePrompt: parentSpecies.image_prompt || "",
        } : null,
        promptOverride: row.image_prompt || "",
        highResolution: false,
        makePrimary: false,
      },
    });
    if (error) throw error;
  }

  async function runCycle(cycleNumber, evolution, rows) {
    const parent = pickFromLatestBatch(rows);
    if (!parent) throw new Error("No living evolvable species found.");
    const branchOnly = rows.some((row) => row.parent_species_id === parent.id);
    log(`Cycle ${cycleNumber}: ${branchOnly ? "adding branch from" : "evolving"} ${parent.name}.`);

    const { data, error } = await window.centralisSupabase.functions.invoke("generate-god-evolution", {
      body: {
        evolutionId: evolution.id,
        evolutionName: evolution.name,
        worldSummary: evolution.world_summary,
        parentSpecies: parent,
        branchOnly,
        existingSpecies: rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          step_index: row.step_index,
          elapsed_years: Number(row.elapsed_years || 0),
        })),
        novelty: parent.novelty,
        environmentalPressures: Array.isArray(parent.pressures) ? parent.pressures : [],
        adaptationBias: parent.adaptation_bias || "",
        customEvolutionTraits: customTraitsFor(parent),
        customEvolutionTrait: customTraitsFor(parent)[0] || "",
      },
    });
    if (error) throw error;
    const generated = data?.evolution;
    if (!generated?.species?.length) throw new Error("No descendants were generated.");
    if (Array.isArray(data?.speciesRows) && data.speciesRows.length) {
      const nextRows = [...rows, ...data.speciesRows];
      await persistLayout(nextRows);
      await Promise.allSettled(data.speciesRows.map((row) => generateImage(row, nextRows)));
      log(`Cycle ${cycleNumber}: added ${data.speciesRows.length} species from ${parent.name}.`, "success");
      return nextRows;
    }

    const eventId = createId();
    const totalSteps = Number(generated.total_steps || 3);
    const stepYears = normalizeStepYears(generated.step_years, totalSteps);
    const totalYears = stepYears.reduce((sum, value) => sum + value, 0);
    const { error: eventError } = await window.centralisSupabase.from("god_evolution_events").insert({
      id: eventId,
      evolution_id: evolution.id,
      user_id: currentUser.id,
      parent_species_id: parent.id,
      total_steps: totalSteps,
      step_years: stepYears,
      total_years: totalYears,
      novelty: normalizeNovelty(parent.novelty),
      environmental_pressures: Array.isArray(parent.pressures) ? parent.pressures : [],
      adaptation_bias: parent.adaptation_bias || null,
      custom_evolution_traits: customTraitsFor(parent),
      custom_evolution_trait: customTraitsFor(parent)[0] || null,
      summary: generated.summary || null,
      environment_shift: generated.environment_shift || {},
      generated_payload: generated,
    });
    if (eventError) throw eventError;

    const idByTemp = new Map();
    const baseDepth = Number(parent.depth_index || parent.step_index || 0);
    const baseElapsedYears = Number(parent.elapsed_years || 0);
    const insertRows = generated.species.map((item, index) => {
      const id = createId();
      idByTemp.set(item.temp_id, id);
      const relativeStep = Math.max(1, Number(item.step_index || index + 1));
      const elapsedYears = baseElapsedYears + stepYears.slice(0, relativeStep).reduce((sum, value) => sum + value, 0);
      const yearsSinceParent = normalizeStepYears([item.years_since_parent || stepYears[Math.max(0, relativeStep - 1)]], 1)[0];
      return {
        id,
        evolution_id: evolution.id,
        user_id: currentUser.id,
        parent_species_id: item.parent_temp_id ? null : parent.id,
        origin_event_id: eventId,
        branch_group: item.branch_group || (branchOnly ? `branch_${eventId.slice(0, 8)}_${index + 1}` : "main"),
        name: item.name || `Descendant ${index + 1}`,
        scientific_name: item.scientific_name || null,
        classification: item.classification || parent.classification || null,
        category: item.category || parent.category || null,
        status: item.status || "stable",
        can_evolve: item.status !== "extinct" && item.can_evolve !== false,
        step_index: baseDepth + relativeStep,
        depth_index: baseDepth + relativeStep,
        sort_order: rows.length + index,
        position_x: Number(parent.position_x || 80) + relativeStep * 420,
        position_y: Number(parent.position_y || 80) + (index === 0 ? 0 : Math.ceil(index / 2) * (index % 2 ? 500 : -500)),
        years_since_parent: yearsSinceParent,
        elapsed_years: elapsedYears,
        overview: item.overview || "",
        habitat: item.habitat || parent.habitat || "",
        ecology: item.ecology || parent.ecology || {},
        reproduction: item.reproduction || parent.reproduction || {},
        population_condition: item.population_condition || {},
        newly_evolved_traits: item.newly_evolved_traits || [],
        complete_traits: item.complete_traits || parent.complete_traits || {},
        inherited_traits: item.inherited_traits || [],
        lost_traits: item.lost_traits || [],
        potential_trait_hints: item.potential_trait_hints || [],
        pressures: [],
        adaptation_bias: null,
        custom_evolution_traits: [],
        custom_evolution_trait: null,
        novelty: normalizeNovelty(parent.novelty),
        visual_genome: item.visual_genome || parent.visual_genome || {},
        image_prompt: item.image_prompt || parent.image_prompt || "",
        extinction_cause: item.extinction_cause || null,
        evolution_reason: item.evolution_reason || generated.summary || "",
      };
    });
    insertRows.forEach((row, index) => {
      const source = generated.species[index];
      if (source.parent_temp_id && idByTemp.has(source.parent_temp_id)) {
        row.parent_species_id = idByTemp.get(source.parent_temp_id);
      }
    });

    const { data: inserted, error: insertError } = await window.centralisSupabase
      .from("god_species")
      .insert(insertRows)
      .select("*");
    if (insertError) throw insertError;

    const nextRows = [...rows, ...(inserted || [])];
    await persistLayout(nextRows);
    await Promise.allSettled((inserted || []).map((row) => generateImage(row, nextRows)));
    log(`Cycle ${cycleNumber}: added ${inserted?.length || 0} species from ${parent.name}.`, "success");
    return nextRows;
  }

  async function runAutopilot() {
    if (isRunning) return;
    if (!window.centralisSupabase || !currentUser?.id) {
      setStatus("You must be signed in before running autopilot.", "error");
      return;
    }
    if (!evolutionId) {
      setStatus("No God Engine evolution is selected.", "error");
      return;
    }
    shouldStop = false;
    isRunning = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    setStatus("Loading latest God Engine tree...");
    try {
      const evolution = await loadEvolution();
      let rows = await loadSpecies();
      for (let index = 1; index <= MAX_CYCLES; index += 1) {
        if (shouldStop) break;
        setStatus(`Running autopilot cycle ${index} of ${MAX_CYCLES}...`);
        rows = await runCycle(index, evolution, rows);
        await sleep(2500);
      }
      setStatus(shouldStop ? "Autopilot stopped." : "Autopilot completed 10 cycles.", shouldStop ? "" : "success");
      log(shouldStop ? "Stopped by user." : "Completed all 10 cycles.", shouldStop ? "" : "success");
    } catch (error) {
      console.error(error);
      setStatus(`Autopilot failed: ${error.message || error}`, "error");
      log(`Error: ${error.message || error}`, "error");
    } finally {
      isRunning = false;
      startButton.disabled = false;
      stopButton.disabled = true;
    }
  }

  startButton?.addEventListener("click", runAutopilot);
  stopButton?.addEventListener("click", () => {
    shouldStop = true;
    stopButton.disabled = true;
    setStatus("Stopping after the current cycle settles...");
  });

  window.addEventListener("centralis:current-user-changed", (event) => {
    currentUser = event.detail?.user || window.centralisCurrentAppUser;
    if (params.get("autorun") === "1" && currentUser?.id && !isRunning) {
      void runAutopilot();
    }
  });

  if (params.get("autorun") === "1" && currentUser?.id) {
    void runAutopilot();
  }
})();
