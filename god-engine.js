(function initGodEnginePage() {
  const list = document.querySelector("[data-god-list]");
  if (!list) return;

  const searchInput = document.querySelector("[data-god-search]");
  const count = document.querySelector("[data-god-count]");
  const status = document.querySelector("[data-god-status]");
  const modal = document.getElementById("god-create-modal");
  const form = document.querySelector("[data-god-create-form]");
  const formStatus = document.querySelector("[data-god-create-status]");
  const submitButton = document.querySelector("[data-god-create-submit]");
  let evolutions = [];
  let starterSpeciesByEvolution = new Map();
  let starterImagesByEvolution = new Map();
  let currentUser = window.centralisCurrentAppUser || null;

  function setStatus(target, message, type = "") {
    if (!target) return;
    target.textContent = message || "";
    target.classList.toggle("is-error", type === "error");
    target.classList.toggle("is-success", type === "success");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  function openModal() {
    if (!modal) return;
    modal.hidden = false;
    form?.querySelector("input[name='name']")?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    form?.reset();
    setStatus(formStatus, "");
  }

  function inferManualStarterName(notes) {
    const explicit = notes.match(/(?:called|named|name is)\s+([A-Z][A-Za-z '-]{2,60})/i)?.[1]?.trim();
    if (explicit) return explicit;
    const lower = notes.toLowerCase();
    const creature = [
      ["lizard", "lizard"],
      ["reptile", "reptile"],
      ["mammal", "mammal"],
      ["insect", "insect"],
      ["amphibian", "amphibian"],
      ["bird", "bird"],
      ["fish", "fish"],
      ["slug", "slug"],
      ["worm", "worm"],
    ].find(([needle]) => lower.includes(needle))?.[1] || "organism";
    const prefix = lower.includes("six") || /\b6\s+legs?\b/.test(lower)
      ? "hexapod"
      : lower.includes("four") || /\b4\s+legs?\b/.test(lower)
        ? "quadruped"
        : lower.includes("fur") || lower.includes("hair")
          ? "furred"
          : lower.includes("land") || lower.includes("terrestrial")
            ? "terrestrial"
            : "established";
    return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} ${creature}`;
  }

  function fallbackStarter(values) {
    const manualNotes = String(values.manualNotes || "").trim();
    if (values.startingMode === "manual" && manualNotes) {
      const isLand = /\b(land|terrestrial|forest|grassland|desert|mountain|soil|burrow|tree|arboreal)\b/i.test(manualNotes);
      const breathesOxygen = /\b(oxygen|air[- ]?breath|lungs?|tracheae?)\b/i.test(manualNotes);
      const laysEggs = /\b(egg|eggs|oviparous|lays?)\b/i.test(manualNotes);
      const hasFur = /\b(fur|hair|pelt|coat)\b/i.test(manualNotes);
      const legMatch = manualNotes.match(/\b(\d+|six|four|eight|two)\s+legs?\b/i);
      const legText = legMatch ? `${legMatch[1].toLowerCase()} legs` : "locomotor limbs matching the user's description";
      const speciesName = inferManualStarterName(manualNotes);
      const respiratoryTrait = breathesOxygen ? "oxygen respiration" : "respiration matching the described organism";
      const bodyCovering = hasFur ? "furred body covering" : "body covering matching the described organism";
      return {
        projectName: values.projectName || `${speciesName} Lineage`,
        species: {
          name: speciesName,
          scientific_name: "",
          classification: "Established evolved starter organism",
          category: "Established evolved organism",
          status: "stable",
          can_evolve: true,
          overview: manualNotes,
          habitat: values.habitat || (isLand ? "terrestrial habitat described by the user" : "habitat described by the user"),
          ecology: { niche: "starter ecology described by the user", notes: manualNotes },
          reproduction: { method: laysEggs ? "egg-laying reproduction" : "reproduction matching the described organism" },
          population_condition: { suitability: "stable", advantages: ["already adapted to its stated environment"], risks: ["future environmental pressures"] },
          newly_evolved_traits: [
            isLand ? "terrestrial habitat adaptation" : "habitat specialization from starter notes",
            respiratoryTrait,
            hasFur ? "furred body covering" : legText,
          ].filter(Boolean).slice(0, 3),
          complete_traits: {
            body_structure: [bodyCovering, legText],
            respiration: [breathesOxygen ? "oxygen breathing" : "respiration matching the described organism"],
            reproduction: [laysEggs ? "egg laying" : "reproduction matching the described organism"],
            habitat_adaptation: [isLand ? "land-adapted" : "habitat described by the user"],
            physical_description: manualNotes,
          },
          inherited_traits: [],
          lost_traits: [],
          potential_trait_hints: ["environmental specialization", "locomotion refinement", "sensory adaptation", "defensive adaptation"],
          pressures: [],
          visual_genome: {
            bodyPlan: manualNotes,
            symmetry: "based on described organism",
            surface: hasFur ? "furred outer covering" : "outer covering from starter notes",
            appendages: [legText],
            coloration: [],
            sensoryFeatures: [],
            scale: "established evolved organism",
          },
          image_prompt: `A realistic biological specimen concept image of ${speciesName}, matching these user constraints: ${manualNotes}. Natural habitat scene, landscape composition, no diagrams, no charts, no text, no labels, no captions, no annotations, no callouts, no title.`,
          evolution_reason: "This starter preserves the user's manual organism as an already-evolved root for future divergence.",
        },
      };
    }
    const isCell = values.starterKind === "single_cell";
    const species = {
      name: isCell ? "Prism Cytid" : "Glassfin Grazer",
      scientific_name: isCell ? "Cytida prismatica" : "Vitropinna prima",
      classification: isCell ? "Primitive unicellular life" : "Basal multicellular animal",
      category: isCell ? "Single-celled organism" : "Simple multicellular organism",
      status: "stable",
      can_evolve: true,
      overview: isCell
        ? "A resilient translucent cell drifting through mineral-rich shallows, feeding on dissolved organic matter and responding to light through simple chemical gradients."
        : "A small translucent aquatic grazer with soft steering folds, chemical sensing, and a flexible body plan ready for divergent adaptation.",
      habitat: values.habitat || "Warm shallow aquatic environment",
      ecology: { niche: "early opportunist", food_sources: ["microbial mats", "dissolved nutrients"], predators: [] },
      reproduction: { method: isCell ? "binary fission" : "broadcast spawning", limitations: "high sensitivity to chemical changes" },
      population_condition: { suitability: "moderate", advantages: ["simple body plan", "rapid reproduction"], risks: ["predation", "oxygen shifts"] },
      newly_evolved_traits: ["baseline cellular resilience", "chemical gradient sensing"],
      complete_traits: {
        body_structure: [isCell ? "single flexible membrane" : "soft translucent body"],
        locomotion: [isCell ? "passive drift" : "slow fin-fold swimming"],
        feeding: ["simple absorption", "surface grazing"],
        sensory_systems: ["chemical sensing"],
        reproduction: [isCell ? "binary fission" : "broadcast spawning"],
      },
      inherited_traits: [],
      lost_traits: [],
      potential_trait_hints: ["improved movement", "stronger outer tissues", "new feeding specialization", "better environmental tolerance"],
      pressures: ["resource patchiness", "chemical variation"],
      visual_genome: {
        bodyPlan: isCell ? "round translucent single cell" : "small elongated translucent aquatic body",
        symmetry: isCell ? "radial" : "bilateral",
        surface: "iridescent gelatinous membrane",
        appendages: isCell ? [] : ["soft lateral steering folds"],
        coloration: ["cyan", "pearl", "violet"],
        sensoryFeatures: ["subtle light-sensitive patches"],
        scale: "tiny early organism",
      },
      image_prompt: "A clear biological specimen concept art image of a translucent iridescent early aquatic organism, cyan pearl coloration, simple evolvable body plan, no text.",
      evolution_reason: "This root species establishes a flexible early lineage with room for future specialization.",
    };
    return {
      projectName: values.projectName || `${species.name} Lineage`,
      species,
    };
  }

  async function invokeFunction(name, body) {
    const { data, error } = await window.centralisSupabase.functions.invoke(name, { body });
    if (error) throw error;
    return data || {};
  }

  async function generateStarter(values) {
    try {
      const payload = await invokeFunction("generate-god-starter", values);
      const fallback = fallbackStarter(values);
      return {
        projectName: payload.projectName || payload.project_name || values.projectName || fallback.projectName,
        species: payload.species || fallback.species,
      };
    } catch (error) {
      console.warn("Using fallback God starter:", error);
      return fallbackStarter(values);
    }
  }

  function render() {
    const search = String(searchInput?.value || "").trim().toLowerCase();
    const visible = search
      ? evolutions.filter((item) => `${item.name || ""} ${item.world_summary || ""} ${item.description || ""}`.toLowerCase().includes(search))
      : evolutions;

    if (count) {
      count.textContent = visible.length === evolutions.length
        ? `${visible.length} ${visible.length === 1 ? "evolution" : "evolutions"}`
        : `${visible.length} of ${evolutions.length} evolutions`;
    }

    if (!visible.length) {
      list.innerHTML = `<p class="empty-state">${search ? "No matching evolutions." : "No evolutions yet. Create the first lineage."}</p>`;
      return;
    }

    list.innerHTML = visible.map((item) => {
      const starter = starterSpeciesByEvolution.get(item.id) || null;
      const image = starter ? starterImagesByEvolution.get(starter.id) : null;
      const creatureName = starter?.name || item.name || "Untitled Creature";
      const backgroundStyle = image?.image_url
        ? ` style="--god-evolution-image: url('${escapeAttribute(image.image_url)}');"`
        : "";
      const summary = item.world_summary || item.description || starter?.overview || "No environment summary yet.";
      return `
      <article class="god-evolution-card${image?.image_url ? " has-image" : ""}"${backgroundStyle}>
        <a href="god-canvas.html?evolution_id=${encodeURIComponent(item.id)}" class="god-evolution-card-link">
          <div class="god-evolution-card-top">
            <span class="god-specimen-mark"><ph-dna weight="duotone" aria-hidden="true"></ph-dna></span>
            <h2>${escapeHtml(creatureName)}</h2>
          </div>
          <p>${escapeHtml(summary)}</p>
          <div class="god-evolution-card-meta">
            <span>${new Date(item.updated_at || item.created_at || Date.now()).toLocaleDateString()}</span>
          </div>
        </a>
      </article>
    `;
    }).join("");
  }

  async function loadStarterImages() {
    starterSpeciesByEvolution = new Map();
    starterImagesByEvolution = new Map();
    const evolutionIds = evolutions.map((item) => item.id).filter(Boolean);
    if (!evolutionIds.length) return;

    const { data: species, error: speciesError } = await window.centralisSupabase
      .from("god_species")
      .select("id,evolution_id,name,overview")
      .in("evolution_id", evolutionIds)
      .eq("user_id", currentUser.id)
      .eq("deleted", false)
      .is("parent_species_id", null)
      .order("sort_order", { ascending: true });
    if (speciesError) {
      console.warn("Could not load starter species for God Engine cards:", speciesError);
      return;
    }

    for (const row of species || []) {
      if (!starterSpeciesByEvolution.has(row.evolution_id)) {
        starterSpeciesByEvolution.set(row.evolution_id, row);
      }
    }

    const speciesIds = [...starterSpeciesByEvolution.values()].map((row) => row.id);
    if (!speciesIds.length) return;
    try {
      const { data, error } = await window.centralisSupabase.functions.invoke("list-object-images", { body: { objectIds: speciesIds } });
      if (error) throw error;
      const imagesBySpecies = new Map();
      for (const image of data?.images || []) {
        const group = imagesBySpecies.get(image.object_id) || [];
        group.push(image);
        imagesBySpecies.set(image.object_id, group);
      }
      for (const [speciesId, images] of imagesBySpecies.entries()) {
        starterImagesByEvolution.set(speciesId, images.find((image) => image.is_primary) || images[0]);
      }
    } catch (error) {
      console.warn("Could not load starter species images for God Engine cards:", error);
    }
  }

  async function loadEvolutions() {
    if (!window.centralisSupabase || !currentUser?.id) return;
    setStatus(status, "Loading evolutions...");
    const { data, error } = await window.centralisSupabase
      .from("god_evolutions")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("deleted", false)
      .order("updated_at", { ascending: false });
    if (error) {
      list.innerHTML = `<p class="empty-state is-error">Could not load evolutions: ${escapeHtml(error.message || error)}</p>`;
      setStatus(status, "", "error");
      return;
    }
    evolutions = data || [];
    await loadStarterImages();
    setStatus(status, "");
    render();
  }

  async function createEvolution(event) {
    event.preventDefault();
    if (!window.centralisSupabase || !currentUser?.id) {
      setStatus(formStatus, "You must be signed in to create an evolution.", "error");
      return;
    }
    const data = new FormData(form);
    const values = {
      projectName: String(data.get("name") || "").trim(),
      description: "",
      worldSummary: String(data.get("worldSummary") || "").trim(),
      startingMode: String(data.get("startingMode") || "instant"),
      starterKind: String(data.get("starterKind") || "random"),
      habitat: String(data.get("habitat") || ""),
      manualNotes: String(data.get("manualNotes") || "").trim(),
    };
    submitButton.disabled = true;
    setStatus(formStatus, "Creating starter organism...");
    try {
      const starterResult = await generateStarter(values);
      const starter = starterResult.species;
      const projectName = starterResult.projectName || values.projectName || `${starter.name || "First Species"} Lineage`;
      const { data: evolution, error: evolutionError } = await window.centralisSupabase
        .from("god_evolutions")
        .insert({
          user_id: currentUser.id,
          name: starter.name || projectName,
          description: values.manualNotes || null,
          world_summary: values.worldSummary || null,
          starting_mode: values.startingMode,
          starter_kind: values.starterKind,
          environment: { habitat: values.habitat || null, summary: values.worldSummary || null },
          canvas_settings: {},
        })
        .select("*")
        .single();
      if (evolutionError) throw evolutionError;

      const { error: speciesError } = await window.centralisSupabase
        .from("god_species")
        .insert({
          ...starter,
          evolution_id: evolution.id,
          user_id: currentUser.id,
          parent_species_id: null,
          step_index: 0,
          depth_index: 0,
          years_since_parent: 0,
          elapsed_years: 0,
          sort_order: 0,
          position_x: 80,
          position_y: 80,
          novelty: 50,
          pressures: [],
          adaptation_bias: null,
        });
      if (speciesError) throw speciesError;

      closeModal();
      window.location.href = `god-canvas.html?evolution_id=${encodeURIComponent(evolution.id)}`;
    } catch (error) {
      console.error(error);
      setStatus(formStatus, `Could not create evolution: ${error.message || error}`, "error");
    } finally {
      submitButton.disabled = false;
    }
  }

  function bind() {
    document.querySelector("[data-open-god-create]")?.addEventListener("click", openModal);
    document.querySelector("[data-god-create-close]")?.addEventListener("click", closeModal);
    document.querySelector("[data-god-create-cancel]")?.addEventListener("click", closeModal);
    form?.addEventListener("submit", createEvolution);
    form?.querySelector("select[name='startingMode']")?.addEventListener("change", syncStartingModeCopy);
    searchInput?.addEventListener("input", render);
  }

  function syncStartingModeCopy() {
    const mode = form?.querySelector("select[name='startingMode']")?.value || "instant";
    const notes = form?.querySelector("textarea[name='manualNotes']");
    if (!notes) return;
    if (mode === "manual") {
      notes.placeholder = "Describe the already-evolved root creature. Example: a six-legged land reptile with rough scales, a long tail, oxygen-breathing lungs, egg laying, and dry gully habitat.";
    } else if (mode === "guided") {
      notes.placeholder = "Guide the early starter species. Example: translucent swimmer with chemical sensing, soft fins, and mineral-rich shallows.";
    } else {
      notes.placeholder = "Optional hints for the engine. Example: desert-adapted, nocturnal, shell-bearing, airborne spores, forest canopy.";
    }
  }

  bind();
  syncStartingModeCopy();
  if (currentUser?.id) {
    loadEvolutions();
  } else {
    window.addEventListener("centralis:current-user-changed", (event) => {
      currentUser = event.detail?.user || window.centralisCurrentAppUser;
      loadEvolutions();
    }, { once: true });
  }
})();
