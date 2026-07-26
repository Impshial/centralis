(function () {
  const IMAGE_VIEWER_MAX_ZOOM = 5;
  const IMAGE_VIEWER_ZOOM_STEP = 0.14;

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
    imageLoading: false
  };

  let viewer = null;

  function ensureViewer() {
    if (viewer?.modal) return viewer;

    let modal = document.querySelector("[data-centralis-image-viewer]");
    if (!modal) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal-backdrop centralis-image-viewer-backdrop" data-centralis-image-viewer hidden>
          <section class="modal-dialog centralis-image-viewer-dialog" role="dialog" aria-modal="true" aria-labelledby="centralis-image-viewer-title">
            <header class="centralis-image-viewer-header">
              <div class="centralis-image-viewer-title-block">
                <p class="settings-eyebrow" data-centralis-image-viewer-kicker>Image Viewer</p>
                <h2 id="centralis-image-viewer-title" data-centralis-image-viewer-title>Image</h2>
              </div>
              <div class="centralis-image-viewer-actions">
                <label class="centralis-image-viewer-primary" data-centralis-image-viewer-primary-wrap hidden>
                  <input type="checkbox" data-centralis-image-viewer-primary>
                  <span>Set as Primary Image</span>
                </label>
                <button class="secondary-action centralis-image-viewer-action" type="button" data-centralis-image-viewer-upload hidden>
                  <ph-upload-simple weight="bold" aria-hidden="true"></ph-upload-simple>
                  <span>Upload</span>
                </button>
                <input type="file" accept="image/*" data-centralis-image-viewer-upload-input hidden>
                <button class="secondary-action centralis-image-viewer-action" type="button" data-centralis-image-viewer-open>
                  <ph-arrow-square-out weight="bold" aria-hidden="true"></ph-arrow-square-out>
                  <span>Open in New Tab</span>
                </button>
                <button class="secondary-action centralis-image-viewer-action" type="button" data-centralis-image-viewer-download>
                  <ph-download-simple weight="bold" aria-hidden="true"></ph-download-simple>
                  <span>Download</span>
                </button>
                <button class="danger-action centralis-image-viewer-action" type="button" data-centralis-image-viewer-delete>
                  <ph-trash weight="bold" aria-hidden="true"></ph-trash>
                  <span>Delete</span>
                </button>
                <button class="modal-close" type="button" aria-label="Close image viewer" data-centralis-image-viewer-close>
                  <ph-x aria-hidden="true"></ph-x>
                </button>
              </div>
            </header>

            <div class="centralis-image-viewer-stage" data-centralis-image-viewer-stage>
              <aside class="centralis-image-viewer-thumb-rail" data-centralis-image-viewer-thumb-rail hidden>
                <div class="centralis-image-viewer-thumb-list" data-centralis-image-viewer-thumbs></div>
              </aside>
              <button class="centralis-image-viewer-nav is-prev" type="button" aria-label="Previous image" data-centralis-image-viewer-prev>
                <ph-caret-left weight="bold" aria-hidden="true"></ph-caret-left>
              </button>
              <div class="centralis-image-viewer-zoom-controls" aria-label="Image zoom controls">
                <button class="icon-button" type="button" aria-label="Actual size" title="Actual Size" data-centralis-image-viewer-actual-size>
                  <ph-arrows-out-simple weight="bold" aria-hidden="true"></ph-arrows-out-simple>
                </button>
                <button class="icon-button" type="button" aria-label="Fit to view" title="Fit to View" data-centralis-image-viewer-fit-view>
                  <ph-frame-corners weight="bold" aria-hidden="true"></ph-frame-corners>
                </button>
              </div>
              <div class="centralis-image-viewer-frame" data-centralis-image-viewer-frame>
                <img data-centralis-image-viewer-image alt="" draggable="false">
              </div>
              <button class="centralis-image-viewer-nav is-next" type="button" aria-label="Next image" data-centralis-image-viewer-next>
                <ph-caret-right weight="bold" aria-hidden="true"></ph-caret-right>
              </button>
            </div>

            <section class="centralis-image-viewer-drawer is-collapsed" data-centralis-image-viewer-drawer>
              <button class="centralis-image-viewer-drawer-toggle" type="button" data-centralis-image-viewer-drawer-toggle aria-expanded="false">
                <span>Details</span>
                <span class="centralis-image-viewer-drawer-control" aria-hidden="true">
                  <ph-caret-up class="centralis-image-viewer-drawer-icon is-open-icon"></ph-caret-up>
                  <ph-caret-down class="centralis-image-viewer-drawer-icon is-close-icon"></ph-caret-down>
                </span>
              </button>
              <div class="centralis-image-viewer-details" data-centralis-image-viewer-details></div>
            </section>
            <div class="centralis-image-viewer-loading" data-centralis-image-viewer-loading hidden>
              <span>Loading...</span>
            </div>
          </section>
        </div>
      `);
      modal = document.querySelector("[data-centralis-image-viewer]");
    }

    viewer = {
      modal,
      dialog: modal.querySelector(".centralis-image-viewer-dialog"),
      kicker: modal.querySelector("[data-centralis-image-viewer-kicker]"),
      title: modal.querySelector("[data-centralis-image-viewer-title]"),
      stage: modal.querySelector("[data-centralis-image-viewer-stage]"),
      frame: modal.querySelector("[data-centralis-image-viewer-frame]"),
      image: modal.querySelector("[data-centralis-image-viewer-image]"),
      thumbRail: modal.querySelector("[data-centralis-image-viewer-thumb-rail]"),
      thumbs: modal.querySelector("[data-centralis-image-viewer-thumbs]"),
      prev: modal.querySelector("[data-centralis-image-viewer-prev]"),
      next: modal.querySelector("[data-centralis-image-viewer-next]"),
      actualSize: modal.querySelector("[data-centralis-image-viewer-actual-size]"),
      fitView: modal.querySelector("[data-centralis-image-viewer-fit-view]"),
      upload: modal.querySelector("[data-centralis-image-viewer-upload]"),
      uploadInput: modal.querySelector("[data-centralis-image-viewer-upload-input]"),
      open: modal.querySelector("[data-centralis-image-viewer-open]"),
      download: modal.querySelector("[data-centralis-image-viewer-download]"),
      delete: modal.querySelector("[data-centralis-image-viewer-delete]"),
      close: modal.querySelector("[data-centralis-image-viewer-close]"),
      primaryWrap: modal.querySelector("[data-centralis-image-viewer-primary-wrap]"),
      primary: modal.querySelector("[data-centralis-image-viewer-primary]"),
      drawer: modal.querySelector("[data-centralis-image-viewer-drawer]"),
      drawerToggle: modal.querySelector("[data-centralis-image-viewer-drawer-toggle]"),
      details: modal.querySelector("[data-centralis-image-viewer-details]"),
      loading: modal.querySelector("[data-centralis-image-viewer-loading]")
    };

    bindViewerEvents();
    return viewer;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getCapabilities(config = {}) {
    return {
      canNavigate: config.capabilities?.canNavigate !== false,
      canSetPrimary: Boolean(config.capabilities?.canSetPrimary),
      canOpen: config.capabilities?.canOpen !== false,
      canDownload: config.capabilities?.canDownload !== false,
      canDelete: Boolean(config.capabilities?.canDelete),
      canUpload: Boolean(config.capabilities?.canUpload),
      canShowThumbnails: Boolean(config.capabilities?.canShowThumbnails),
      uploadMode: config.capabilities?.uploadMode === "replace" ? "replace" : "add",
      uploadLabel: config.capabilities?.uploadLabel || "Upload",
      uploadAccept: config.capabilities?.uploadAccept || "image/*"
    };
  }

  function getImageIndex(config, imageId) {
    const images = config?.images || [];
    const index = images.findIndex((image) => image.id === imageId);
    return index >= 0 ? index : 0;
  }

  function getCurrentImage() {
    return state.currentConfig?.images?.[state.currentIndex] || null;
  }

  function applyImageTransform() {
    if (!viewer?.image) return;
    viewer.image.style.transform = `translate(-50%, -50%) translate3d(${state.translateX}px, ${state.translateY}px, 0) scale(${state.zoom})`;
    viewer.image.classList.toggle("is-zoomed", Math.abs(state.zoom - 1) > 0.01);
    viewer.image.classList.toggle("is-dragging", state.isDragging);
  }

  function setViewerLoading(isLoading) {
    state.imageLoading = Boolean(isLoading);
    if (viewer?.dialog) viewer.dialog.classList.toggle("is-loading", state.imageLoading);
    if (viewer?.loading) viewer.loading.hidden = !state.imageLoading;
  }

  function getFramePointerPoint(event) {
    if (!viewer?.frame) return { x: 0, y: 0 };
    const rect = viewer.frame.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - (rect.width / 2),
      y: event.clientY - rect.top - (rect.height / 2)
    };
  }

  function getFrameAvailableSize() {
    if (!viewer?.frame) return { width: 0, height: 0 };
    const frameStyle = window.getComputedStyle(viewer.frame);
    const horizontalPadding = parseFloat(frameStyle.paddingLeft || "0") + parseFloat(frameStyle.paddingRight || "0");
    const verticalPadding = parseFloat(frameStyle.paddingTop || "0") + parseFloat(frameStyle.paddingBottom || "0");
    return {
      width: Math.max(0, viewer.frame.clientWidth - horizontalPadding),
      height: Math.max(0, viewer.frame.clientHeight - verticalPadding)
    };
  }

  function fitImageToFrame() {
    if (!viewer?.image || !viewer?.frame) return;
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

  function getDetails(config, image, index) {
    if (typeof config.details === "function") {
      return config.details(image, index) || {};
    }
    return config.details || {};
  }

  function renderDetails(details = {}) {
    if (!viewer?.details) return;
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

  function renderThumbnails(config, capabilities) {
    if (!viewer?.thumbRail || !viewer?.thumbs) return;
    const images = Array.isArray(config.images) ? config.images : [];
    const shouldShow = Boolean(capabilities.canShowThumbnails && images.length > 1);
    viewer.thumbRail.hidden = !shouldShow;
    viewer.stage?.classList.toggle("has-thumbnail-rail", shouldShow);
    if (!shouldShow) {
      viewer.thumbs.innerHTML = "";
      return;
    }
    viewer.thumbs.innerHTML = images.map((item, index) => `
      <button class="centralis-image-viewer-thumb${index === state.currentIndex ? " is-active" : ""}" type="button" data-centralis-image-viewer-thumb="${index}" aria-label="View ${escapeHtml(item.name || `image ${index + 1}`)}">
        <img src="${escapeHtml(item.src || "")}" alt="">
      </button>
    `).join("");
  }

  function renderViewer() {
    ensureViewer();
    const config = state.currentConfig;
    const image = getCurrentImage();
    if (!config || !image || !viewer.modal) return;
    const capabilities = getCapabilities(config);
    const hasMultiple = capabilities.canNavigate && (config.images || []).length > 1;
    renderThumbnails(config, capabilities);

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
    if (viewer.upload) {
      viewer.upload.hidden = !(capabilities.canUpload && typeof config.actions?.upload === "function");
      viewer.upload.querySelector("span").textContent = capabilities.uploadLabel;
    }
    if (viewer.uploadInput) viewer.uploadInput.accept = capabilities.uploadAccept;
    if (viewer.open) viewer.open.hidden = !capabilities.canOpen;
    if (viewer.download) viewer.download.hidden = !capabilities.canDownload;
    if (viewer.delete) viewer.delete.hidden = !capabilities.canDelete;
    if (viewer.primaryWrap) viewer.primaryWrap.hidden = !capabilities.canSetPrimary;
    if (viewer.primary) {
      viewer.primary.checked = Boolean(image.isPrimary);
      viewer.primary.disabled = Boolean(image.isPrimary);
    }
    renderDetails(getDetails(config, image, state.currentIndex));
  }

  function selectThumbnail(event) {
    const button = event.target.closest("[data-centralis-image-viewer-thumb]");
    if (!button || !state.currentConfig) return;
    const index = Number(button.dataset.centralisImageViewerThumb);
    const images = state.currentConfig.images || [];
    if (!Number.isInteger(index) || index < 0 || index >= images.length || index === state.currentIndex) return;
    state.currentIndex = index;
    state.currentConfig.actions?.changeImage?.(images[index], index);
    renderViewer();
  }

  function openCentralisImageViewer(config = {}) {
    ensureViewer();
    if (!viewer.modal || !Array.isArray(config.images) || !config.images.length) return;
    state.currentConfig = config;
    state.currentIndex = getImageIndex(config, config.activeImageId);
    state.drawerOpen = false;
    if (viewer.drawer) viewer.drawer.classList.add("is-collapsed");
    if (viewer.drawerToggle) viewer.drawerToggle.setAttribute("aria-expanded", "false");
    viewer.modal.hidden = false;
    document.body.classList.add("centralis-modal-open");
    renderViewer();
  }

  function closeCentralisImageViewer() {
    if (!viewer?.modal) return;
    state.imageLoadToken += 1;
    viewer.modal.hidden = true;
    if (viewer.image) viewer.image.style.visibility = "";
    setViewerLoading(false);
    document.body.classList.remove("centralis-modal-open");
    state.currentConfig?.actions?.close?.();
    state.currentConfig = null;
    state.currentIndex = 0;
    state.fitZoom = 1;
    resetImageTransform();
  }

  function replaceViewerImages(images, activeImageId) {
    if (!state.currentConfig) return;
    state.currentConfig.images = Array.isArray(images) ? images : [];
    if (!state.currentConfig.images.length) {
      closeCentralisImageViewer();
      return;
    }
    state.currentIndex = getImageIndex(state.currentConfig, activeImageId);
    renderViewer();
  }

  function moveImage(direction) {
    const images = state.currentConfig?.images || [];
    if (images.length < 2) return;
    state.currentIndex = (state.currentIndex + direction + images.length) % images.length;
    state.currentConfig?.actions?.changeImage?.(getCurrentImage(), state.currentIndex);
    renderViewer();
  }

  async function handleOpenImage() {
    const image = getCurrentImage();
    if (!image?.src) return;
    const result = await state.currentConfig?.actions?.open?.(image);
    if (result === false) return;
    window.open(image.src, "_blank", "noopener,noreferrer");
  }

  async function handleDownloadImage() {
    const image = getCurrentImage();
    if (!image?.src) return;
    const result = await state.currentConfig?.actions?.download?.(image);
    if (result === false) return;
    if (viewer.download) viewer.download.disabled = true;
    const downloadName = image.downloadName || image.name || "centralis-image.png";
    const link = document.createElement("a");
    try {
      const response = await fetch(image.src);
      if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}.`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error("Image download failed; using direct link fallback.", error);
      link.href = image.src;
      link.download = downloadName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      if (viewer?.download) viewer.download.disabled = false;
    }
  }

  async function handleDeleteImage() {
    const image = getCurrentImage();
    if (!image) return;
    if (viewer.delete) viewer.delete.disabled = true;
    try {
      const result = await state.currentConfig?.actions?.delete?.(image, state.currentIndex);
      if (result === false) return;
      if (result?.close) {
        closeCentralisImageViewer();
      } else if (Array.isArray(result?.images)) {
        replaceViewerImages(result.images, result.activeImageId);
      } else if (state.currentConfig) {
        renderViewer();
      }
    } catch (error) {
      console.error("Image delete action failed.", error);
    } finally {
      if (viewer?.delete) viewer.delete.disabled = false;
    }
  }

  function handleUploadButtonClick() {
    if (!viewer.uploadInput) return;
    viewer.uploadInput.value = "";
    viewer.uploadInput.click();
  }

  async function handleUploadImage() {
    const file = viewer.uploadInput?.files?.[0] || null;
    if (!file || !state.currentConfig) return;
    const image = getCurrentImage();
    const capabilities = getCapabilities(state.currentConfig);
    if (viewer.upload) viewer.upload.disabled = true;
    try {
      const result = await state.currentConfig.actions?.upload?.(file, {
        image,
        index: state.currentIndex,
        images: [...(state.currentConfig.images || [])],
        mode: capabilities.uploadMode
      });
      if (result === false) return;
      if (result?.close) {
        closeCentralisImageViewer();
      } else if (Array.isArray(result?.images)) {
        replaceViewerImages(result.images, result.activeImageId || image?.id);
      } else if (state.currentConfig) {
        renderViewer();
      }
    } catch (error) {
      console.error("Image upload action failed.", error);
    } finally {
      if (viewer?.upload) viewer.upload.disabled = false;
      if (viewer?.uploadInput) viewer.uploadInput.value = "";
    }
  }

  async function handleSetPrimary() {
    const image = getCurrentImage();
    if (!image || !state.currentConfig) return;
    if (viewer.primary) viewer.primary.disabled = true;
    try {
      const result = await state.currentConfig.actions?.setPrimary?.(image, state.currentIndex);
      if (Array.isArray(result?.images)) {
        replaceViewerImages(result.images, result.activeImageId || image.id);
        return;
      }
      state.currentConfig.images = state.currentConfig.images.map((item) => ({
        ...item,
        isPrimary: item.id === image.id
      }));
      renderViewer();
    } catch (error) {
      if (viewer.primary) {
        viewer.primary.checked = Boolean(image.isPrimary);
        viewer.primary.disabled = Boolean(image.isPrimary);
      }
      console.error("Set primary image action failed.", error);
    }
  }

  function toggleDrawer() {
    state.drawerOpen = !state.drawerOpen;
    if (viewer.drawer) viewer.drawer.classList.toggle("is-collapsed", !state.drawerOpen);
    if (viewer.drawerToggle) viewer.drawerToggle.setAttribute("aria-expanded", String(state.drawerOpen));
    requestAnimationFrame(resetImageTransform);
  }

  function handleWheel(event) {
    if (!state.currentConfig || !viewer?.frame) return;
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
    if (!viewer?.image || event.button !== 0) return;
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
    viewer?.image?.releasePointerCapture?.(event.pointerId);
    state.isDragging = false;
    state.dragStart = null;
    applyImageTransform();
  }

  function bindViewerEvents() {
    viewer.close?.addEventListener("click", closeCentralisImageViewer);
    viewer.prev?.addEventListener("click", () => moveImage(-1));
    viewer.next?.addEventListener("click", () => moveImage(1));
    viewer.thumbs?.addEventListener("click", selectThumbnail);
    viewer.thumbs?.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    viewer.actualSize?.addEventListener("click", setImageActualSize);
    viewer.fitView?.addEventListener("click", setImageFitToView);
    viewer.upload?.addEventListener("click", handleUploadButtonClick);
    viewer.uploadInput?.addEventListener("change", handleUploadImage);
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
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && viewer?.modal && !viewer.modal.hidden) {
      closeCentralisImageViewer();
    }
  });

  window.addEventListener("resize", () => {
    if (viewer?.modal && !viewer.modal.hidden) requestAnimationFrame(resetImageTransform);
  });

  window.openCentralisImageViewer = openCentralisImageViewer;
  window.closeCentralisImageViewer = closeCentralisImageViewer;
})();
