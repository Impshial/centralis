(async function initUniverseCanvas() {
  const rootElement = document.getElementById("universe-flow");
  if (!rootElement || !window.React || !window.ReactDOM || !window.ReactFlow) {
    if (rootElement) {
      rootElement.textContent = "React Flow could not be loaded.";
    }
    return;
  }

  const SUPABASE_TIMEOUT_MS = 15000;
  const params = new URLSearchParams(window.location.search);
  let universeId = params.get("universe_id");
  const titleElement = document.querySelector("[data-universe-title]");

  if (universeId) {
    sessionStorage.setItem("centralis-current-universe-id", universeId);
  } else {
    universeId = sessionStorage.getItem("centralis-current-universe-id");
    if (universeId) {
      window.history.replaceState({}, document.title, `${window.location.pathname}?universe_id=${encodeURIComponent(universeId)}`);
    }
  }

  function withTimeout(promise, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(`${label} timed out after ${SUPABASE_TIMEOUT_MS / 1000} seconds.`));
      }, SUPABASE_TIMEOUT_MS);
    });

    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
  }

  function createId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `element-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createBlurb(description) {
    if (!description) {
      return "No description yet.";
    }

    const trimmed = description.trim();
    return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed;
  }

  function sanitizeIconName(icon) {
    const clean = String(icon || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    return clean || "circle";
  }

  function getReadableError(error) {
    return error?.message || error?.details || error?.hint || "Unknown error";
  }

  let universe = {
    id: universeId || "universe-root",
    name: "Universe Canvas",
    description: "",
    canvas_position_x: 120,
    canvas_position_y: 120
  };
  let elementTypes = [];
  let elements = [];
  let elementLinks = [];

  if (window.centralisSupabase && universeId) {
    const universeResponse = await withTimeout(window.centralisSupabase
      .from("universes")
      .select("id,name,description,canvas_position_x,canvas_position_y,fmt_node_bg_opacity,fmt_node_border_width")
      .eq("id", universeId)
      .maybeSingle(), "Loading universe");

    if (universeResponse.error && rootElement) {
      rootElement.textContent = `Could not load universe: ${universeResponse.error.message}`;
      return;
    }

    if (universeResponse.data) {
      universe = universeResponse.data;
    }

    const typeResponse = await withTimeout(window.centralisSupabase
      .from("element_types")
      .select("id,name,icon,color")
      .eq("universe_id", universeId)
      .order("name", { ascending: true }), "Loading element types");

    if (!typeResponse.error) {
      elementTypes = typeResponse.data || [];
    }

    const elementResponse = await withTimeout(window.centralisSupabase
      .from("elements")
      .select("id,name,description,position_x,position_y,element_type_id")
      .eq("universe_id", universeId)
      .order("created_at", { ascending: true }), "Loading elements");

    if (!elementResponse.error) {
      elements = elementResponse.data || [];
    }

    const linkResponse = await withTimeout(window.centralisSupabase
      .from("element_links")
      .select("id,source_element_id,target_element_id,label,stroke_color,stroke_width,stroke_style,path_type")
      .eq("universe_id", universeId)
      .order("created_at", { ascending: true }), "Loading element links");

    if (!linkResponse.error) {
      elementLinks = linkResponse.data || [];
    }
  }

  if (titleElement) {
    titleElement.textContent = universe.name || "Universe Canvas";
  }

  const React = window.React;
  const ReactDOM = window.ReactDOM;
  const Flow = window.ReactFlow;
  const ReactFlowComponent = Flow.default || Flow.ReactFlow;
  const Background = Flow.Background;
  const Controls = Flow.Controls;
  const Handle = Flow.Handle;
  const Position = Flow.Position;
  const EdgeLabelRenderer = Flow.EdgeLabelRenderer;
  const BaseEdge = Flow.BaseEdge;
  const getBezierPath = Flow.getBezierPath;
  const applyNodeChanges = Flow.applyNodeChanges;
  const applyEdgeChanges = Flow.applyEdgeChanges;

  function useNodeMenu(nodeId) {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const menuRef = React.useRef(null);

    React.useEffect(() => {
      if (!menuOpen) {
        return undefined;
      }

      function handlePointerDown(event) {
        if (!menuRef.current?.contains(event.target)) {
          setMenuOpen(false);
        }
      }

      function handleKeyDown(event) {
        if (event.key === "Escape") {
          setMenuOpen(false);
        }
      }

      function handleCloseMenus(event) {
        if (event.detail?.nodeId !== nodeId) {
          setMenuOpen(false);
        }
      }

      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
      window.addEventListener("centralis:close-node-menus", handleCloseMenus);

      return () => {
        document.removeEventListener("pointerdown", handlePointerDown);
        document.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("centralis:close-node-menus", handleCloseMenus);
      };
    }, [menuOpen, nodeId]);

    function toggleMenu(event) {
      event.stopPropagation();
      setMenuOpen((isOpen) => {
        if (!isOpen) {
          window.dispatchEvent(new CustomEvent("centralis:close-node-menus", {
            detail: { nodeId }
          }));
        }

        return !isOpen;
      });
    }

    return { menuOpen, setMenuOpen, menuRef, toggleMenu };
  }

  function UniverseNode(props) {
    const data = props.data;
    const { menuOpen, menuRef, toggleMenu } = useNodeMenu(props.id);

    return React.createElement(
      "article",
      { className: `universe-flow-node${props.selected ? " is-selected" : ""}` },
      React.createElement(Handle, { className: "node-grab node-grab-right", id: "right", type: "source", position: Position.Right }),
      React.createElement(Handle, { className: "node-grab node-grab-left", id: "left", type: "target", position: Position.Left }),
      React.createElement(
        "div",
        { className: "node-menu-wrap nodrag nopan", ref: menuRef },
        React.createElement(
          "button",
          {
            className: "node-kebab",
            type: "button",
            "aria-label": "Universe menu",
            "aria-expanded": menuOpen,
            onClick: toggleMenu
          },
          React.createElement("ph-dots-three-vertical", { weight: "bold", "aria-hidden": "true" })
        ),
        menuOpen && React.createElement(
          "div",
          { className: "node-menu" },
          React.createElement("button", { type: "button", disabled: true }, "No Items")
        )
      ),
      React.createElement("span", { className: "node-kicker" }, "Universe"),
      React.createElement("strong", null, data.name),
      React.createElement("p", null, createBlurb(data.description))
    );
  }

  function ElementNode(props) {
    const data = props.data;
    const { menuOpen, setMenuOpen, menuRef, toggleMenu } = useNodeMenu(props.id);
    const elementType = data.elementType;
    const color = elementType?.color || "#64748b";
    const typeName = elementType?.name || "No Type";
    const iconName = sanitizeIconName(elementType?.icon);

    return React.createElement(
      "article",
      {
        className: `element-flow-node${props.selected ? " is-selected" : ""}`,
        style: { "--element-color": color }
      },
      React.createElement(Handle, { className: "node-grab node-grab-right", id: "right", type: "source", position: Position.Right }),
      React.createElement(Handle, { className: "node-grab node-grab-left", id: "left", type: "target", position: Position.Left }),
      React.createElement(
        "div",
        { className: "node-menu-wrap nodrag nopan", ref: menuRef },
        React.createElement(
          "button",
          {
            className: "node-kebab",
            type: "button",
            "aria-label": "Element menu",
            "aria-expanded": menuOpen,
            onClick: toggleMenu
          },
          React.createElement("ph-dots-three-vertical", { weight: "bold", "aria-hidden": "true" })
        ),
        menuOpen && React.createElement(
          "div",
          { className: "node-menu" },
          React.createElement(
            "button",
            {
              type: "button",
              onClick: (event) => {
                event.stopPropagation();
                setMenuOpen(false);
                window.dispatchEvent(new CustomEvent("centralis:request-delete-element", {
                  detail: {
                    nodeId: props.id,
                    elementId: data.recordId,
                    name: data.name
                  }
                }));
              }
            },
            "Delete Element"
          )
        )
      ),
      React.createElement(
        "span",
        { className: "node-kicker" },
        React.createElement("span", { className: "element-icon", "aria-hidden": "true" }, React.createElement(`ph-${iconName}`, { weight: "duotone" })),
        typeName
      ),
      React.createElement("strong", null, data.name),
      React.createElement("p", null, createBlurb(data.description))
    );
  }

  function toUniverseNode(row) {
    return {
      id: `universe:${row.id}`,
      type: "universe",
      position: {
        x: Number(row.canvas_position_x ?? 120),
        y: Number(row.canvas_position_y ?? 120)
      },
      data: {
        kind: "universe",
        recordId: row.id,
        name: row.name || "Untitled Universe",
        description: row.description || ""
      },
      draggable: true
    };
  }

  function toElementNode(row) {
    const elementType = elementTypes.find((type) => type.id === row.element_type_id) || null;

    return {
      id: `element:${row.id}`,
      type: "element",
      position: {
        x: Number(row.position_x ?? 460),
        y: Number(row.position_y ?? 180)
      },
      data: {
        kind: "element",
        recordId: row.id,
        name: row.name || "Untitled Element",
        description: row.description || "",
        elementType
      },
      draggable: true
    };
  }

  const initialNodes = [
    toUniverseNode(universe),
    ...elements.map(toElementNode)
  ];

  function toRecordId(nodeId) {
    return String(nodeId || "").replace(/^(universe|element):/, "");
  }

  function toNodeId(recordId) {
    const value = String(recordId || "");
    if (value.startsWith("universe:") || value.startsWith("element:")) {
      return value;
    }

    return value === universe.id ? `universe:${value}` : `element:${value}`;
  }

  function toLinkEdge(link) {
    return {
      id: link.id,
      source: toNodeId(link.source_element_id),
      target: toNodeId(link.target_element_id),
      sourceHandle: "right",
      targetHandle: "left",
      label: link.label || undefined,
      type: "deletable",
      data: {
        recordId: link.id
      },
      style: {
        stroke: link.stroke_color || "#475569",
        strokeWidth: Number(link.stroke_width || 2)
      }
    };
  }

  const initialEdges = elementLinks.map(toLinkEdge);

  async function saveNodePosition(_event, node) {
    if (!window.centralisSupabase || !node?.position || !node?.data?.recordId) {
      return;
    }

    const payload = {
      updated_at: new Date().toISOString()
    };

    let tableName = "universes";
    if (node.data.kind === "universe") {
      payload.canvas_position_x = Number(node.position.x);
      payload.canvas_position_y = Number(node.position.y);
    } else {
      tableName = "elements";
      payload.position_x = Number(node.position.x);
      payload.position_y = Number(node.position.y);
    }

    const { error } = await window.centralisSupabase
      .from(tableName)
      .update(payload)
      .eq("id", node.data.recordId);

    if (error) {
      console.error("Could not save node position:", error);
    }
  }

  function populateElementTypeSelect() {
    const select = document.querySelector("[data-element-type-select]");
    if (!select) {
      return;
    }

    select.innerHTML = '<option value="">No type</option>';
    elementTypes.forEach((type) => {
      const option = document.createElement("option");
      option.value = type.id;
      option.textContent = type.name;
      select.appendChild(option);
    });
  }

  function UniverseFlow() {
    const [nodes, setNodes] = React.useState(initialNodes);
    const [edges, setEdges] = React.useState(initialEdges);
    const [pendingLink, setPendingLink] = React.useState(null);
    const [pendingDeleteElement, setPendingDeleteElement] = React.useState(null);
    const reactFlowWrapper = React.useRef(null);
    const reactFlowInstance = React.useRef(null);
    const nodeTypes = React.useMemo(() => ({ universe: UniverseNode, element: ElementNode }), []);
    const deleteEdge = React.useCallback(async (edgeId) => {
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.id !== edgeId));

      const { error } = await window.centralisSupabase
        .from("element_links")
        .delete()
        .eq("id", edgeId);

      if (error) {
        console.error("Could not delete element link:", error);
      }
    }, []);
    const edgeTypes = React.useMemo(() => ({
      deletable: function DeletableEdge(props) {
        const [isHovered, setIsHovered] = React.useState(false);
        const pathResult = getBezierPath({
          sourceX: props.sourceX,
          sourceY: props.sourceY,
          sourcePosition: props.sourcePosition,
          targetX: props.targetX,
          targetY: props.targetY,
          targetPosition: props.targetPosition
        });
        const edgePath = pathResult[0];
        const labelX = pathResult[1];
        const labelY = pathResult[2];

        return React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "g",
            {
              onMouseEnter: () => setIsHovered(true),
              onMouseLeave: () => setIsHovered(false)
            },
            React.createElement(BaseEdge, {
              id: props.id,
              path: edgePath,
              markerEnd: props.markerEnd,
              style: props.style
            }),
            React.createElement("path", {
              className: "edge-hover-path",
              d: edgePath
            })
          ),
          React.createElement(
            EdgeLabelRenderer,
            null,
            React.createElement(
              "button",
              {
                className: `edge-delete-button nodrag nopan${isHovered ? " is-visible" : ""}`,
                type: "button",
                style: {
                  transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`
                },
                "aria-label": "Delete link",
                onMouseEnter: () => setIsHovered(true),
                onMouseLeave: () => setIsHovered(false),
                onClick: (event) => {
                  event.stopPropagation();
                  deleteEdge(props.id);
                }
              },
              React.createElement("span", { "aria-hidden": "true" }, "x")
            )
          )
        );
      }
    }), [deleteEdge]);

    React.useEffect(() => {
      populateElementTypeSelect();

      const form = document.querySelector("[data-element-form]");
      const status = document.querySelector("[data-element-status]");
      if (!form) {
        return undefined;
      }

      async function handleSubmit(event) {
        event.preventDefault();

        const submitButton = form.querySelector('[type="submit"]');
        const formData = new FormData(form);
        const name = String(formData.get("element-name") || "").trim();
        const description = String(formData.get("element-description") || "").trim();
        const elementTypeId = String(formData.get("element-type") || "");

        if (!name) {
          if (status) {
            status.textContent = "Name is required.";
            status.classList.add("is-error");
          }
          form.querySelector('[name="element-name"]')?.focus();
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
        }

        if (status) {
          status.textContent = "Adding element...";
          status.classList.remove("is-error");
        }

        const id = createId();
        const position = pendingLink?.position || {
          x: Number(universe.canvas_position_x ?? 120) + 360 + (nodes.length - 1) * 32,
          y: Number(universe.canvas_position_y ?? 120) + 40 + (nodes.length - 1) * 22
        };

        try {
        const { data: savedElement, error } = await withTimeout(window.centralisSupabase
          .from("elements")
          .insert({
            id,
            universe_id: universe.id,
            element_type_id: elementTypeId || null,
            name,
            description: description || null,
            position_x: position.x,
            position_y: position.y
          })
          .select("id,name,description,position_x,position_y,element_type_id")
          .single(), "Creating element");

        if (error) {
          if (status) {
            status.textContent = `Could not add element: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
          if (submitButton) {
            submitButton.disabled = false;
          }
          return;
        }

        setNodes((currentNodes) => [...currentNodes, toElementNode(savedElement)]);

        if (pendingLink?.sourceNodeId) {
          const linkId = createId();
          const sourceRecordId = toRecordId(pendingLink.sourceNodeId);
          const targetRecordId = savedElement.id;
          const edge = {
            id: linkId,
            source: pendingLink.sourceNodeId,
            target: `element:${savedElement.id}`,
            sourceHandle: pendingLink.sourceHandle || "right",
            targetHandle: "left",
            type: "deletable",
            data: { recordId: linkId },
            style: {
              stroke: "#475569",
              strokeWidth: 2
            }
          };

          setEdges((currentEdges) => [...currentEdges, edge]);

          const { error: linkError } = await window.centralisSupabase
            .from("element_links")
            .insert({
              id: linkId,
              universe_id: universe.id,
              source_element_id: sourceRecordId,
              target_element_id: targetRecordId,
              path_type: "deletable"
            });

          if (linkError) {
            console.error("Could not create element link:", linkError);
            setEdges((currentEdges) => currentEdges.filter((currentEdge) => currentEdge.id !== linkId));
          }
        }

        setPendingLink(null);
        form.reset();
        if (status) {
          status.textContent = "";
          status.classList.remove("is-error");
        }
        document.getElementById("add-element-modal").hidden = true;
        } catch (error) {
          if (status) {
            status.textContent = `Could not add element: ${getReadableError(error)}`;
            status.classList.add("is-error");
          }
        }

        if (submitButton) {
          submitButton.disabled = false;
        }
      }

      form.addEventListener("submit", handleSubmit);
      return () => form.removeEventListener("submit", handleSubmit);
    }, [nodes.length, pendingLink]);

    React.useEffect(() => {
      function handleRequestDelete(event) {
        setPendingDeleteElement(event.detail);
        const modal = document.getElementById("delete-element-modal");
        if (modal) {
          modal.hidden = false;
        }
      }

      window.addEventListener("centralis:request-delete-element", handleRequestDelete);
      return () => window.removeEventListener("centralis:request-delete-element", handleRequestDelete);
    }, []);

    React.useEffect(() => {
      const modal = document.getElementById("delete-element-modal");
      const cancelButton = document.querySelector("[data-cancel-delete-element]");
      const confirmButton = document.querySelector("[data-confirm-delete-element]");

      if (!modal || !cancelButton || !confirmButton) {
        return undefined;
      }

      function closeDeleteModal() {
        modal.hidden = true;
        setPendingDeleteElement(null);
      }

      async function confirmDelete() {
        if (!pendingDeleteElement?.elementId) {
          closeDeleteModal();
          return;
        }

        confirmButton.disabled = true;

        const { error: linksError } = await window.centralisSupabase
          .from("element_links")
          .delete()
          .or(`source_element_id.eq.${pendingDeleteElement.elementId},target_element_id.eq.${pendingDeleteElement.elementId}`);

        if (linksError) {
          console.error("Could not delete element links:", linksError);
          confirmButton.disabled = false;
          return;
        }

        const { error: elementError } = await window.centralisSupabase
          .from("elements")
          .delete()
          .eq("id", pendingDeleteElement.elementId);

        if (elementError) {
          console.error("Could not delete element:", elementError);
          confirmButton.disabled = false;
          return;
        }

        setEdges((currentEdges) => currentEdges.filter((edge) => (
          edge.source !== pendingDeleteElement.nodeId &&
          edge.target !== pendingDeleteElement.nodeId
        )));
        setNodes((currentNodes) => currentNodes.filter((node) => node.id !== pendingDeleteElement.nodeId));
        confirmButton.disabled = false;
        closeDeleteModal();
      }

      cancelButton.addEventListener("click", closeDeleteModal);
      confirmButton.addEventListener("click", confirmDelete);
      return () => {
        cancelButton.removeEventListener("click", closeDeleteModal);
        confirmButton.removeEventListener("click", confirmDelete);
      };
    }, [pendingDeleteElement]);

    async function handleConnect(connection) {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }

      const id = createId();
      const sourceRecordId = toRecordId(connection.source);
      const targetRecordId = toRecordId(connection.target);
      const edge = {
        id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle || "right",
        targetHandle: connection.targetHandle || "left",
        type: "deletable",
        data: { recordId: id },
        style: {
          stroke: "#475569",
          strokeWidth: 2
        }
      };

      setEdges((currentEdges) => [...currentEdges, edge]);

      const { error } = await window.centralisSupabase
        .from("element_links")
        .insert({
          id,
          universe_id: universe.id,
          source_element_id: sourceRecordId,
          target_element_id: targetRecordId,
          path_type: "deletable"
        });

      if (error) {
        console.error("Could not create element link:", error);
        setEdges((currentEdges) => currentEdges.filter((currentEdge) => currentEdge.id !== id));
      }
    }

    function handleConnectEnd(event) {
      const targetIsPane = event.target?.classList?.contains("react-flow__pane");
      if (!targetIsPane || !reactFlowInstance.current || !reactFlowWrapper.current) {
        return;
      }

      const state = window.__centralisConnectionStart;
      if (!state?.sourceNodeId) {
        return;
      }

      const rect = reactFlowWrapper.current.getBoundingClientRect();
      const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
      const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;
      if (typeof clientX !== "number" || typeof clientY !== "number") {
        return;
      }

      const position = reactFlowInstance.current.project({
        x: clientX - rect.left,
        y: clientY - rect.top
      });

      setPendingLink({
        sourceNodeId: state.sourceNodeId,
        sourceHandle: state.sourceHandle || "right",
        position
      });

      const modal = document.getElementById("add-element-modal");
      if (modal) {
        modal.hidden = false;
        modal.querySelector('[name="element-name"]')?.focus();
      }
    }

    async function handleEdgesChange(changes) {
      setEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));

      const removedEdges = changes.filter((change) => change.type === "remove");
      if (!removedEdges.length) {
        return;
      }

      await Promise.all(removedEdges.map((change) => window.centralisSupabase
        .from("element_links")
        .delete()
        .eq("id", change.id)));
    }

    return React.createElement(
      "div",
      {
        ref: reactFlowWrapper,
        className: "flow-canvas-inner"
      },
      React.createElement(
      ReactFlowComponent,
      {
        nodes,
        edges,
        nodeTypes,
        edgeTypes,
        fitView: true,
        onInit: (instance) => {
          reactFlowInstance.current = instance;
        },
        onNodesChange: (changes) => setNodes((currentNodes) => applyNodeChanges(changes, currentNodes)),
        onEdgesChange: handleEdgesChange,
        onConnectStart: (_event, params) => {
          window.__centralisConnectionStart = {
            sourceNodeId: params.nodeId,
            sourceHandle: params.handleId
          };
        },
        onConnect: handleConnect,
        onConnectEnd: handleConnectEnd,
        elementsSelectable: true,
        nodesDraggable: true,
        multiSelectionKeyCode: ["Control", "Meta"],
        selectionKeyCode: "Shift",
        selectionOnDrag: false,
        panOnDrag: true,
        onNodeDragStop: saveNodePosition,
        proOptions: { hideAttribution: true }
      },
      React.createElement(Background, { gap: 18, size: 1 }),
      React.createElement(Controls, null)
      )
    );
  }

  ReactDOM.createRoot(rootElement).render(React.createElement(UniverseFlow));
})();
