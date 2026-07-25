(function () {
  const page = document.querySelector("[data-designer-page]");
  const scenariosHost = document.querySelector("[data-designer-scenarios]");
  const summaryHost = document.querySelector("[data-designer-scenario-summary]");
  const viewer = {
    modal: document.querySelector("[data-centralis-image-viewer]"),
    kicker: document.querySelector("[data-centralis-image-viewer-kicker]"),
    title: document.querySelector("[data-centralis-image-viewer-title]"),
    stage: document.querySelector("[data-centralis-image-viewer-stage]"),
    frame: document.querySelector("[data-centralis-image-viewer-frame]"),
    image: document.querySelector("[data-centralis-image-viewer-image]"),
    prev: document.querySelector("[data-centralis-image-viewer-prev]"),
    next: document.querySelector("[data-centralis-image-viewer-next]"),
    actualSize: document.querySelector("[data-centralis-image-viewer-actual-size]"),
    fitView: document.querySelector("[data-centralis-image-viewer-fit-view]"),
    open: document.querySelector("[data-centralis-image-viewer-open]"),
    download: document.querySelector("[data-centralis-image-viewer-download]"),
    delete: document.querySelector("[data-centralis-image-viewer-delete]"),
    close: document.querySelector("[data-centralis-image-viewer-close]"),
    primaryWrap: document.querySelector("[data-centralis-image-viewer-primary-wrap]"),
    primary: document.querySelector("[data-centralis-image-viewer-primary]"),
    drawer: document.querySelector("[data-centralis-image-viewer-drawer]"),
    drawerToggle: document.querySelector("[data-centralis-image-viewer-drawer-toggle]"),
    details: document.querySelector("[data-centralis-image-viewer-details]"),
    loading: document.querySelector("[data-centralis-image-viewer-loading]")
  };

  const state = {
    currentConfig: null,
    currentIndex: 0,
    zoom: 1,
    fitZoom: 1,
    translateX: 0,
    translateY: 0,
    isDragging: false,
    dragStart: null,
    drawerOpen: false,
    imageLoadToken: 0,
    imageLoading: false,
    storageHydrated: false,
    storageHydrating: false
  };

  const IMAGE_VIEWER_MAX_ZOOM = 5;
  const IMAGE_VIEWER_ZOOM_STEP = 0.14;

  const sampleImages = {
    landing: "assets/centralis-landing-bg.png",
    cinematic: "assets/venice-styles/cinematic.jpg",
    fantasy: "assets/venice-styles/fantasy-art.jpg",
    hyperreal: "assets/venice-styles/hyperrealism.jpg",
    space: "assets/venice-styles/space.jpg",
    photographic: "assets/venice-styles/photographic.jpg"
  };

  const storageImageSources = {
    universeBuilder: {
      bucket: "centralis",
      prefix: "images/universe-builder/",
      module: "Universe Builder / Chronicle"
    },
    imageGeneration: {
      bucket: "centralis",
      prefix: "images/image-generation/",
      module: "Image Generator"
    },
    chatRepository: {
      bucket: "centralis",
      prefix: "images/chat-repository/",
      module: "Chat Repository / Movie Tracker"
    }
  };

  const scenarios = [
    {
      id: "universe-builder",
      storageSource: "universeBuilder",
      label: "Universe Builder / Chronicle",
      description: "Multi-image element viewer with primary-image support and object details.",
      title: "Zyra Duskhisper",
      kicker: "Element Image Viewer",
      capabilities: {
        canNavigate: true,
        canSetPrimary: true,
        canOpen: true,
        canDownload: true,
        canDelete: true
      },
      images: [
        {
          id: "zyra-1",
          src: sampleImages.landing,
          name: "Zyra Duskhisper Image",
          downloadName: "zyra-duskhisper.png",
          isPrimary: true,
          alt: "Centralis interface concept artwork used as a stand-in element image."
        },
        {
          id: "zyra-2",
          src: sampleImages.fantasy,
          name: "Zyra Duskhisper Variant",
          downloadName: "zyra-duskhisper-variant.png",
          isPrimary: false,
          alt: "Fantasy style stand-in image."
        }
      ],
      details: {
        imageInfo: {
          title: "Image Information",
          rows: [
            ["Source", "Universe Builder object image"],
            ["Object", "Character: Zyra Duskhisper"],
            ["Images in set", "2"]
          ]
        },
        objectDetails: {
          title: "Object Details",
          body: "A character image attached to a worldbuilding node. This scenario includes primary image selection because the parent object can choose one visible hero image."
        },
        customDetails: {
          title: "Migration Notes",
          body: "This viewer should be able to replace both Universe Builder and Chronicle object-image viewers once approved."
        }
      }
    },
    {
      id: "image-generation",
      storageSource: "imageGeneration",
      label: "Image Generator",
      description: "Generated-output viewer with prompt and generation settings, no primary checkbox.",
      title: "Skate Fluffy Spiders",
      kicker: "Image Generator Viewer",
      capabilities: {
        canNavigate: true,
        canSetPrimary: false,
        canOpen: true,
        canDownload: true,
        canDelete: true
      },
      images: [
        {
          id: "spiders-1",
          src: sampleImages.cinematic,
          name: "9519411b-b6ae-4dc7-b333-a8140128ce6f.png",
          downloadName: "skate-fluffy-spiders.png",
          alt: "Cinematic style placeholder."
        },
        {
          id: "spiders-2",
          src: sampleImages.hyperreal,
          name: "Hyperrealism Variant",
          downloadName: "skate-fluffy-spiders-hyperreal.png",
          alt: "Hyperrealism style placeholder."
        },
        {
          id: "spiders-3",
          src: sampleImages.photographic,
          name: "Photographic Variant",
          downloadName: "skate-fluffy-spiders-photo.png",
          alt: "Photographic style placeholder."
        }
      ],
      details: {
        promptInfo: {
          title: "Prompt Information",
          body: "Draw me a picture of some small yellow creatures that look like fluffy spiders with roller skates on."
        },
        generatorInfo: {
          title: "Image Generator Information",
          rows: [
            ["Model", "GPT Image 2"],
            ["Provider", "OpenAI"],
            ["Quality", "High"],
            ["Format", "PNG"],
            ["References", "0"]
          ]
        }
      }
    },
    {
      id: "chat-repository",
      storageSource: "chatRepository",
      label: "Chat Repository / Movie Poster",
      description: "Single-image viewer with only common file actions and image information.",
      title: "Imported Chat Image",
      kicker: "Simple Image Viewer",
      capabilities: {
        canNavigate: false,
        canSetPrimary: false,
        canOpen: true,
        canDownload: true,
        canDelete: true
      },
      images: [
        {
          id: "chat-image-1",
          src: sampleImages.photographic,
          name: "chat-repository-cover.png",
          downloadName: "chat-repository-cover.png",
          alt: "Photographic style placeholder."
        }
      ],
      details: {
        imageInfo: {
          title: "Image Information",
          rows: [
            ["Module", "Chat Repository"],
            ["Record", "Imported conversation cover"],
            ["Usage", "Preview-only image"]
          ]
        }
      }
    },
    {
      id: "stellar-architect",
      storageSource: "universeBuilder",
      label: "Stellar Architect Future",
      description: "Future object viewer for planets, moons, lifeforms, and colonists.",
      title: "VJ-4136U d-I",
      kicker: "Stellar Object Viewer",
      capabilities: {
        canNavigate: true,
        canSetPrimary: true,
        canOpen: true,
        canDownload: true,
        canDelete: true
      },
      images: [
        {
          id: "moon-1",
          src: sampleImages.space,
          name: "VJ-4136U d-I Surface Study",
          downloadName: "vj-4136u-d-i.png",
          isPrimary: false,
          alt: "Space style placeholder."
        },
        {
          id: "moon-2",
          src: sampleImages.cinematic,
          name: "VJ-4136U d-I Orbit View",
          downloadName: "vj-4136u-d-i-orbit.png",
          isPrimary: true,
          alt: "Cinematic style placeholder."
        }
      ],
      details: {
        imageInfo: {
          title: "Image Information",
          rows: [
            ["Object type", "Moon"],
            ["System", "VJ-4136U"],
            ["Image role", "Surface and orbital reference"]
          ]
        },
        customDetails: {
          title: "Stellar Details",
          body: "Future detail slots can summarize physical properties, habitability notes, generated lifeform context, or colonist records without changing the core viewer controls."
        }
      }
    }
  ];

  function revealDesignerForAdmin(user) {
    if (!page) {
      return;
    }

    if (user?.admin === true) {
      page.hidden = false;
      return;
    }

    page.hidden = true;
    if (user) {
      window.location.replace("index.html");
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function getSupabaseClient() {
    return window.centralisSupabase || window.supabaseClient || window.CENTRALIS_SUPABASE || null;
  }

  async function getDesignerFunctionResponse(name, body = {}) {
    const client = getSupabaseClient();
    if (!client) throw new Error("Supabase is not initialized.");
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      throw sessionError || new Error("You must be signed in.");
    }
    const config = window.CENTRALIS_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) {
      throw new Error("Supabase configuration is missing.");
    }
    const response = await fetch(`${config.url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: config.publishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(payload?.error || payload?.message || `Could not call ${name}.`);
    }
    return payload || {};
  }

  function isImageStorageObject(object = {}) {
    const key = object.key || "";
    const contentType = object.contentType || object.content_type || "";
    return /^image\//i.test(contentType) || /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(key);
  }

  function getFileNameFromKey(key = "") {
    return key.split("/").filter(Boolean).pop() || "centralis-image.png";
  }

  function shuffleItems(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  async function getSignedStorageImage(bucket, object) {
    const payload = await getDesignerFunctionResponse("get-storage-object-url", {
      bucket,
      key: object.key,
      contentType: object.contentType,
      size: object.size,
      lastModified: object.lastModified
    });
    const fileName = getFileNameFromKey(object.key);
    return {
      id: object.key,
      src: payload.url,
      name: fileName,
      downloadName: fileName,
      alt: fileName,
      metadata: {
        key: object.key,
        size: object.size,
        contentType: payload.metadata?.contentType || object.contentType || "image",
        lastModified: payload.metadata?.lastModified || object.lastModified || ""
      }
    };
  }

  async function listStorageImagesRecursive(source, prefix = source.prefix, depth = 0, limit = 12) {
    const payload = await getDesignerFunctionResponse("browse-storage", {
      action: "objects",
      bucket: source.bucket,
      prefix,
      maxKeys: 250
    });
    const directImages = (payload.objects || []).filter(isImageStorageObject);
    if (directImages.length >= limit || depth >= 2) return directImages.slice(0, limit);
    const childFolders = payload.folders || [];
    const images = [...directImages];
    for (const folder of childFolders) {
      if (images.length >= limit) break;
      try {
        const childImages = await listStorageImagesRecursive(source, folder, depth + 1, limit - images.length);
        images.push(...childImages);
      } catch (error) {
        console.warn("Could not load Designer storage folder.", { bucket: source.bucket, folder, error });
      }
    }
    return images.slice(0, limit);
  }

  async function loadRandomImagesForSource(sourceKey, count = 3) {
    const source = storageImageSources[sourceKey];
    if (!source) return [];
    const imageObjects = await listStorageImagesRecursive(source, source.prefix, 0, Math.max(count * 4, 12));
    const selectedObjects = shuffleItems(imageObjects).slice(0, count);
    const signedResults = await Promise.allSettled(selectedObjects.map((object) => getSignedStorageImage(source.bucket, object)));
    return signedResults
      .filter((result) => result.status === "fulfilled" && result.value?.src)
      .map((result) => result.value);
  }

  function mergeStorageImagesIntoScenario(scenario, images) {
    if (!images.length) return scenario;
    const nextScenario = structuredClone(scenario);
    nextScenario.images = images.map((image, index) => ({
      ...image,
      name: index === 0 ? `${nextScenario.title} Image` : image.name,
      isPrimary: Boolean(nextScenario.capabilities?.canSetPrimary && index === 0)
    }));
    const imageInfo = nextScenario.details?.imageInfo;
    if (imageInfo?.rows) {
      imageInfo.rows = [
        ["Source", `${storageImageSources[nextScenario.storageSource]?.bucket}/${storageImageSources[nextScenario.storageSource]?.prefix}`],
        ["Selected image", images[0].metadata?.key || images[0].name],
        ["Images in set", String(images.length)],
        ...imageInfo.rows.filter(([label]) => !["Source", "Selected image", "Images in set"].includes(label))
      ];
    }
    return nextScenario;
  }

  function setScenarioLoadingState(message, tone = "") {
    if (!summaryHost) return;
    summaryHost.innerHTML = `<span class="${tone === "error" ? "is-error" : ""}">${escapeHtml(message)}</span>`;
  }

  async function hydrateStorageScenarios() {
    if (state.storageHydrated || state.storageHydrating) return;
    if (!getSupabaseClient()) {
      setScenarioLoadingState("Using local placeholder images. Supabase is not initialized yet.");
      return;
    }
    state.storageHydrating = true;
    setScenarioLoadingState("Loading random iDrive images for viewer scenarios...");
    try {
      const hydrated = await Promise.allSettled(scenarios.map(async (scenario) => {
        const desiredCount = scenario.capabilities?.canNavigate ? 3 : 1;
        const images = await loadRandomImagesForSource(scenario.storageSource, desiredCount);
        return mergeStorageImagesIntoScenario(scenario, images);
      }));
      hydrated.forEach((result, index) => {
        if (result.status === "fulfilled") scenarios[index] = result.value;
        else console.warn("Could not hydrate Designer image scenario.", scenarios[index]?.id, result.reason);
      });
      renderScenarioCards();
      const failedCount = hydrated.filter((result) => result.status === "rejected").length;
      if (failedCount) {
        setScenarioLoadingState(`Loaded available iDrive images. ${failedCount} scenario${failedCount === 1 ? "" : "s"} fell back to placeholder images.`, "error");
      } else {
        setScenarioLoadingState("Loaded random iDrive images for all viewer scenarios.");
      }
      state.storageHydrated = true;
    } finally {
      state.storageHydrating = false;
    }
  }

  function getCapabilities(config) {
    return {
      canNavigate: false,
      canSetPrimary: false,
      canOpen: true,
      canDownload: true,
      canDelete: true,
      ...(config?.capabilities || {})
    };
  }

  function getCurrentImage() {
    return state.currentConfig?.images?.[state.currentIndex] || null;
  }

  function getImageIndex(config, activeImageId) {
    const images = Array.isArray(config?.images) ? config.images : [];
    const requestedIndex = images.findIndex((image) => image.id === activeImageId);
    return requestedIndex >= 0 ? requestedIndex : 0;
  }

  function renderScenarioCards() {
    if (!scenariosHost) return;
    scenariosHost.innerHTML = scenarios.map((scenario) => {
      const capabilities = getCapabilities(scenario);
      const flags = [
        capabilities.canNavigate ? "List navigation" : "Single image",
        capabilities.canSetPrimary ? "Primary image" : "No primary",
        scenario.details?.promptInfo ? "Prompt details" : null,
        scenario.details?.generatorInfo ? "Generation settings" : null
      ].filter(Boolean);
      const cover = scenario.images?.[0]?.src || sampleImages.landing;
      return `
        <article class="designer-scenario-card">
          <img src="${escapeHtml(cover)}" alt="">
          <div>
            <h3>${escapeHtml(scenario.label)}</h3>
            <p>${escapeHtml(scenario.description)}</p>
            <p class="designer-scenario-source">${escapeHtml(storageImageSources[scenario.storageSource]?.prefix || "Local placeholder")}</p>
            <div class="designer-scenario-tags">
              ${flags.map((flag) => `<span>${escapeHtml(flag)}</span>`).join("")}
            </div>
          </div>
          <button class="secondary-action" type="button" data-designer-open-viewer="${escapeHtml(scenario.id)}">Open Viewer</button>
        </article>
      `;
    }).join("");
  }

  function renderScenarioSummary(scenario) {
    if (!summaryHost) return;
    if (!scenario) {
      summaryHost.innerHTML = "<span>Select a scenario to inspect its enabled capabilities.</span>";
      return;
    }
    const capabilities = getCapabilities(scenario);
    const enabled = Object.entries(capabilities)
      .filter(([, value]) => value)
      .map(([key]) => key.replace(/^can/, ""))
      .join(", ");
    const details = Object.keys(scenario.details || {})
      .map((key) => key.replace(/([A-Z])/g, " $1").trim())
      .join(", ");
    summaryHost.innerHTML = `
      <strong>${escapeHtml(scenario.label)}</strong>
      <span>Capabilities: ${escapeHtml(enabled || "None")}</span>
      <span>Details: ${escapeHtml(details || "None")}</span>
    `;
  }

  function applyImageTransform() {
    if (!viewer.image) return;
    viewer.image.style.transform = `translate(-50%, -50%) translate3d(${state.translateX}px, ${state.translateY}px, 0) scale(${state.zoom})`;
    viewer.image.classList.toggle("is-zoomed", Math.abs(state.zoom - 1) > 0.01);
    viewer.image.classList.toggle("is-dragging", state.isDragging);
  }

  function setViewerLoading(isLoading) {
    state.imageLoading = Boolean(isLoading);
    if (viewer.modal) viewer.modal.classList.toggle("is-loading", state.imageLoading);
    if (viewer.loading) viewer.loading.hidden = !state.imageLoading;
  }

  function getFramePointerPoint(event) {
    if (!viewer.frame) return { x: 0, y: 0 };
    const rect = viewer.frame.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - (rect.width / 2),
      y: event.clientY - rect.top - (rect.height / 2)
    };
  }

  function getFrameAvailableSize() {
    if (!viewer.frame) return { width: 0, height: 0 };
    const frameStyle = window.getComputedStyle(viewer.frame);
    const horizontalPadding = parseFloat(frameStyle.paddingLeft || "0") + parseFloat(frameStyle.paddingRight || "0");
    const verticalPadding = parseFloat(frameStyle.paddingTop || "0") + parseFloat(frameStyle.paddingBottom || "0");
    return {
      width: Math.max(0, viewer.frame.clientWidth - horizontalPadding),
      height: Math.max(0, viewer.frame.clientHeight - verticalPadding)
    };
  }

  function fitImageToFrame() {
    if (!viewer.image || !viewer.frame) return;
    const naturalWidth = viewer.image.naturalWidth || 0;
    const naturalHeight = viewer.image.naturalHeight || 0;
    const { width: availableWidth, height: availableHeight } = getFrameAvailableSize();
    if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) return;
    const fitScale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
    state.fitZoom = Math.min(1, fitScale);
    viewer.image.style.width = `${naturalWidth}px`;
    viewer.image.style.height = `${naturalHeight}px`;
  }

  function resetImageTransform() {
    state.translateX = 0;
    state.translateY = 0;
    state.isDragging = false;
    state.dragStart = null;
    fitImageToFrame();
    state.zoom = state.fitZoom || 1;
    applyImageTransform();
  }

  function setImageFitToView() {
    fitImageToFrame();
    state.zoom = state.fitZoom || 1;
    state.translateX = 0;
    state.translateY = 0;
    applyImageTransform();
  }

  function setImageActualSize() {
    fitImageToFrame();
    state.zoom = 1;
    state.translateX = 0;
    state.translateY = 0;
    applyImageTransform();
  }

  function renderDetails(details = {}) {
    if (!viewer.details) return;
    const sourceSections = [
      details.imageInfo,
      details.promptInfo,
      details.generatorInfo,
      details.objectDetails,
      details.customDetails
    ].filter(Boolean);
    const sections = sourceSections.length <= 2
      ? sourceSections
      : [
        sourceSections[0],
        {
          title: sourceSections.slice(1).map((section) => section.title || "Details").join(" / "),
          rows: sourceSections.slice(1).flatMap((section) => {
            const rows = Array.isArray(section.rows) ? section.rows : [];
            const bodyRows = section.body ? [[section.title || "Details", section.body]] : [];
            return [...rows, ...bodyRows];
          })
        }
      ];
    viewer.details.classList.toggle("has-one-section", sections.length === 1);
    viewer.details.classList.toggle("has-two-sections", sections.length === 2);
    if (!sections.length) {
      viewer.details.innerHTML = '<p class="centralis-image-viewer-empty-details">No details supplied for this viewer.</p>';
      return;
    }
    viewer.details.innerHTML = sections.map((section) => {
      const rows = Array.isArray(section.rows) && section.rows.length
        ? `<dl>${section.rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`
        : "";
      const body = section.body ? `<p>${escapeHtml(section.body)}</p>` : "";
      return `
        <article class="centralis-image-viewer-detail-section">
          <h3>${escapeHtml(section.title || "Details")}</h3>
          ${rows}
          ${body}
        </article>
      `;
    }).join("");
  }

  function renderViewer() {
    const config = state.currentConfig;
    const image = getCurrentImage();
    if (!config || !image || !viewer.modal) return;
    const capabilities = getCapabilities(config);
    const hasMultiple = capabilities.canNavigate && (config.images || []).length > 1;

    if (viewer.kicker) viewer.kicker.textContent = config.kicker || "Image Viewer";
    if (viewer.title) viewer.title.textContent = image.name || config.title || "Image";
    if (viewer.image) {
      const loadToken = state.imageLoadToken + 1;
      state.imageLoadToken = loadToken;
      state.fitZoom = 1;
      state.zoom = 1;
      state.translateX = 0;
      state.translateY = 0;
      state.isDragging = false;
      state.dragStart = null;
      viewer.image.style.visibility = "hidden";
      setViewerLoading(true);
      applyImageTransform();
      const handleImageReady = () => {
        if (loadToken !== state.imageLoadToken) return;
        resetImageTransform();
        viewer.image.style.visibility = "";
        setViewerLoading(false);
      };
      viewer.image.onload = handleImageReady;
      viewer.image.onerror = () => {
        if (loadToken !== state.imageLoadToken) return;
        viewer.image.style.visibility = "";
        setViewerLoading(false);
      };
      viewer.image.src = image.src || "";
      viewer.image.alt = image.alt || image.name || config.title || "Image";
      if (viewer.image.complete && viewer.image.naturalWidth) requestAnimationFrame(handleImageReady);
    }

    if (viewer.prev) viewer.prev.hidden = !hasMultiple;
    if (viewer.next) viewer.next.hidden = !hasMultiple;
    if (viewer.open) viewer.open.hidden = !capabilities.canOpen;
    if (viewer.download) viewer.download.hidden = !capabilities.canDownload;
    if (viewer.delete) viewer.delete.hidden = !capabilities.canDelete;
    if (viewer.primaryWrap) viewer.primaryWrap.hidden = !capabilities.canSetPrimary;
    if (viewer.primary) {
      viewer.primary.checked = Boolean(image.isPrimary);
      viewer.primary.disabled = Boolean(image.isPrimary);
    }

    renderDetails(config.details);
  }

  function openCentralisImageViewer(config = {}) {
    if (!viewer.modal || !Array.isArray(config.images) || !config.images.length) return;
    state.currentConfig = config;
    state.currentIndex = getImageIndex(config, config.activeImageId);
    state.drawerOpen = false;
    if (viewer.drawer) viewer.drawer.classList.add("is-collapsed");
    if (viewer.drawerToggle) viewer.drawerToggle.setAttribute("aria-expanded", "false");
    viewer.modal.hidden = false;
    document.body.classList.add("centralis-modal-open");
    renderViewer();
    renderScenarioSummary(config);
  }

  function closeCentralisImageViewer() {
    state.imageLoadToken += 1;
    if (viewer.modal) viewer.modal.hidden = true;
    if (viewer.image) viewer.image.style.visibility = "";
    setViewerLoading(false);
    document.body.classList.remove("centralis-modal-open");
    state.currentConfig?.actions?.close?.();
    state.currentConfig = null;
    state.currentIndex = 0;
    state.fitZoom = 1;
    resetImageTransform();
  }

  function moveImage(direction) {
    const images = state.currentConfig?.images || [];
    if (images.length < 2) return;
    state.currentIndex = (state.currentIndex + direction + images.length) % images.length;
    state.currentConfig?.actions?.changeImage?.(getCurrentImage(), state.currentIndex);
    renderViewer();
  }

  function handleOpenImage() {
    const image = getCurrentImage();
    if (!image?.src) return;
    state.currentConfig?.actions?.open?.(image);
    window.open(image.src, "_blank", "noopener,noreferrer");
  }

  function handleDownloadImage() {
    const image = getCurrentImage();
    if (!image?.src) return;
    state.currentConfig?.actions?.download?.(image);
    const link = document.createElement("a");
    link.href = image.src;
    link.download = image.downloadName || image.name || "centralis-image.png";
    link.click();
  }

  function handleDeleteImage() {
    const image = getCurrentImage();
    if (!image) return;
    state.currentConfig?.actions?.delete?.(image);
    window.alert(`Prototype delete action: ${image.name || image.id}`);
  }

  function handleSetPrimary() {
    const image = getCurrentImage();
    if (!image || !state.currentConfig) return;
    state.currentConfig.images = state.currentConfig.images.map((item) => ({
      ...item,
      isPrimary: item.id === image.id
    }));
    state.currentConfig.actions?.setPrimary?.(image);
    renderViewer();
  }

  function toggleDrawer() {
    state.drawerOpen = !state.drawerOpen;
    if (viewer.drawer) viewer.drawer.classList.toggle("is-collapsed", !state.drawerOpen);
    if (viewer.drawerToggle) viewer.drawerToggle.setAttribute("aria-expanded", String(state.drawerOpen));
    requestAnimationFrame(resetImageTransform);
  }

  function handleWheel(event) {
    if (!state.currentConfig || !viewer.frame) return;
    event.preventDefault();
    const previousZoom = state.zoom || 1;
    const zoomStep = event.deltaY < 0 ? IMAGE_VIEWER_ZOOM_STEP : -IMAGE_VIEWER_ZOOM_STEP;
    const minZoom = Math.max(0.05, (state.fitZoom || 1) * 0.25);
    const nextZoom = Math.max(minZoom, Math.min(IMAGE_VIEWER_MAX_ZOOM, previousZoom + zoomStep));
    if (Math.abs(nextZoom - previousZoom) < 0.001) return;

    const pointer = getFramePointerPoint(event);
    const imagePointX = (pointer.x - state.translateX) / previousZoom;
    const imagePointY = (pointer.y - state.translateY) / previousZoom;

    state.zoom = Math.abs(nextZoom - 1) <= 0.02 ? 1 : nextZoom;
    state.translateX = pointer.x - (imagePointX * state.zoom);
    state.translateY = pointer.y - (imagePointY * state.zoom);
    applyImageTransform();
  }

  function handlePointerDown(event) {
    if (!viewer.image || event.button !== 0) return;
    event.preventDefault();
    viewer.image.setPointerCapture?.(event.pointerId);
    state.isDragging = true;
    state.dragStart = {
      x: event.clientX,
      y: event.clientY,
      translateX: state.translateX,
      translateY: state.translateY
    };
    applyImageTransform();
  }

  function handlePointerMove(event) {
    if (!state.isDragging || !state.dragStart) return;
    event.preventDefault();
    state.translateX = state.dragStart.translateX + (event.clientX - state.dragStart.x);
    state.translateY = state.dragStart.translateY + (event.clientY - state.dragStart.y);
    applyImageTransform();
  }

  function handlePointerUp(event) {
    if (!state.isDragging) return;
    viewer.image?.releasePointerCapture?.(event.pointerId);
    state.isDragging = false;
    state.dragStart = null;
    applyImageTransform();
  }

  function bindDesignerEvents() {
    scenariosHost?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-designer-open-viewer]");
      if (!button) return;
      const scenario = scenarios.find((item) => item.id === button.dataset.designerOpenViewer);
      if (scenario) openCentralisImageViewer(structuredClone(scenario));
    });
    viewer.close?.addEventListener("click", closeCentralisImageViewer);
    viewer.prev?.addEventListener("click", () => moveImage(-1));
    viewer.next?.addEventListener("click", () => moveImage(1));
    viewer.actualSize?.addEventListener("click", setImageActualSize);
    viewer.fitView?.addEventListener("click", setImageFitToView);
    viewer.open?.addEventListener("click", handleOpenImage);
    viewer.download?.addEventListener("click", handleDownloadImage);
    viewer.delete?.addEventListener("click", handleDeleteImage);
    viewer.primary?.addEventListener("change", handleSetPrimary);
    viewer.drawerToggle?.addEventListener("click", toggleDrawer);
    viewer.stage?.addEventListener("wheel", handleWheel, { passive: false });
    viewer.image?.addEventListener("pointerdown", handlePointerDown);
    viewer.image?.addEventListener("pointermove", handlePointerMove);
    viewer.image?.addEventListener("pointerup", handlePointerUp);
    viewer.image?.addEventListener("pointercancel", handlePointerUp);
    viewer.image?.addEventListener("dragstart", (event) => event.preventDefault());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && viewer.modal && !viewer.modal.hidden) {
        closeCentralisImageViewer();
      }
    });
    window.addEventListener("resize", () => {
      if (viewer.modal && !viewer.modal.hidden) requestAnimationFrame(resetImageTransform);
    });
  }

  revealDesignerForAdmin(window.centralisCurrentAppUser);
  renderScenarioCards();
  bindDesignerEvents();
  window.openCentralisImageViewer = openCentralisImageViewer;
  if (window.centralisCurrentAppUser?.admin === true) {
    hydrateStorageScenarios();
  }

  window.addEventListener("centralis:current-user-changed", (event) => {
    revealDesignerForAdmin(event.detail?.user || null);
    if (event.detail?.user?.admin === true) {
      hydrateStorageScenarios();
    }
  });
})();
