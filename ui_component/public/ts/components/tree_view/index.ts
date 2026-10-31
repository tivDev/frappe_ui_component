import type { TreeNode, TreeViewOptions } from "./types";

export class TreeView {
    public container: HTMLElement;
    public options: TreeViewOptions;
    public nodes: TreeNode[] = [];
    public nodeMap: Map<string | number, TreeNode> = new Map();
    public selectedNode: TreeNode | null = null;
    public currentDoctype: string | null = null;
    public currentMeta: any = null;
    public filterQuery: string = "";

    // DOM Elements
    public rootElement!: HTMLElement;
    public toolbarElement!: HTMLElement;
    public doctypeWrapper: HTMLElement | null = null;
    public doctypeControl: any = null;
    public presetsWrapper: HTMLElement | null = null;
    public searchInput!: HTMLInputElement;
    public searchClearBtn!: HTMLButtonElement;
    public bodyElement!: HTMLElement;
    public emptyElement!: HTMLElement;
    public loadingElement!: HTMLElement;
    public infoBadge!: HTMLElement;

    constructor(options: TreeViewOptions) {
        if (typeof options.container === "string") {
            const el = document.querySelector(options.container) as HTMLElement;
            if (!el) {
                throw new Error(`[TreeView] Container element not found: ${options.container}`);
            }
            this.container = el;
        } else {
            this.container = options.container;
        }

        this.options = {
            searchable: true,
            showToolbar: true,
            showDoctypeSelector: true,
            popularDoctypes: [
                "Territory",
                "Customer Group",
                "Item Group",
                "Department",
                "Cost Center",
                "Account",
                "Warehouse"
            ],
            selectable: true,
            multiSelect: false,
            showBadges: true,
            showIcons: true,
            showActions: true,
            showLines: true,
            emptyText: __("Select a DocType or provide data to view the tree structure."),
            ...options
        };

        this._initDOM();
        this._initDoctypeField();
        this._bindToolbarEvents();

        if (this.options.data && this.options.data.length > 0) {
            this.set_data(this.options.data);
        } else if (this.options.doctype) {
            this.set_doctype(this.options.doctype);
        } else {
            this.show_empty(this.options.emptyText);
        }
    }

    private _initDOM(): void {
        this.container.innerHTML = "";
        this.rootElement = document.createElement("div");
        this.rootElement.className = `tree-view ${this.options.showLines ? "has-tree-lines" : ""}`.trim();

        // 1. Header Wrapper (encapsulates toolbar and presets into a cohesive card header)
        const headerElement = document.createElement("div");
        headerElement.className = "tree-view__header";

        if (this.options.showToolbar) {
            this.toolbarElement = document.createElement("div");
            this.toolbarElement.className = "tree-view__toolbar";

            // Left Controls Group: DocType Selector & Tree Search
            const controlsLeft = document.createElement("div");
            controlsLeft.className = "tree-view__controls-left";

            // DocType Link selector inside the component
            if (this.options.showDoctypeSelector) {
                const dtSelectorContainer = document.createElement("div");
                dtSelectorContainer.className = "tree-view__doctype-selector";

                this.doctypeWrapper = document.createElement("div");
                this.doctypeWrapper.className = "tree-view__doctype-control-wrapper";
                dtSelectorContainer.appendChild(this.doctypeWrapper);

                controlsLeft.appendChild(dtSelectorContainer);
            }

            // Divider between DocType selector and Search box
            if (this.options.showDoctypeSelector && this.options.searchable) {
                const divider = document.createElement("div");
                divider.className = "tree-view__divider";
                controlsLeft.appendChild(divider);
            }

            // Search Input
            if (this.options.searchable) {
                const searchWrapper = document.createElement("div");
                searchWrapper.className = "tree-view__search-wrapper";

                const searchIcon = document.createElement("span");
                searchIcon.className = "tree-view__search-icon";
                searchIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
                searchWrapper.appendChild(searchIcon);

                this.searchInput = document.createElement("input");
                this.searchInput.type = "text";
                this.searchInput.className = "form-control tree-view__search-input";
                this.searchInput.placeholder = __("Search in tree...");
                searchWrapper.appendChild(this.searchInput);

                this.searchClearBtn = document.createElement("button");
                this.searchClearBtn.type = "button";
                this.searchClearBtn.className = "tree-view__search-clear";
                this.searchClearBtn.innerHTML = "&times;";
                this.searchClearBtn.title = __("Clear search");
                this.searchClearBtn.style.display = "none";
                searchWrapper.appendChild(this.searchClearBtn);

                controlsLeft.appendChild(searchWrapper);
            }

            this.toolbarElement.appendChild(controlsLeft);

            // Right Controls Group: Action Buttons & Count Badge
            const controlsRight = document.createElement("div");
            controlsRight.className = "tree-view__controls-right";

            // Action Buttons
            if (this.options.showActions !== false) {
                const btnGroup = document.createElement("div");
                btnGroup.className = "tree-view__actions-group";

                const expandBtn = document.createElement("button");
                expandBtn.type = "button";
                expandBtn.className = "btn btn-default btn-sm tree-view__btn tree-view__btn-expand";
                expandBtn.title = __("Expand All");
                expandBtn.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                    <span>${__("Expand All")}</span>
                `;
                expandBtn.addEventListener("click", () => this.expand_all());
                btnGroup.appendChild(expandBtn);

                const collapseBtn = document.createElement("button");
                collapseBtn.type = "button";
                collapseBtn.className = "btn btn-default btn-sm tree-view__btn tree-view__btn-collapse";
                collapseBtn.title = __("Collapse All");
                collapseBtn.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="4 14 10 14 10 20"></polyline>
                        <polyline points="20 10 14 10 14 4"></polyline>
                        <line x1="14" y1="10" x2="21" y2="3"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                    <span>${__("Collapse All")}</span>
                `;
                collapseBtn.addEventListener("click", () => this.collapse_all());
                btnGroup.appendChild(collapseBtn);

                const refreshBtn = document.createElement("button");
                refreshBtn.type = "button";
                refreshBtn.className = "btn btn-default btn-sm tree-view__btn tree-view__btn-refresh";
                refreshBtn.title = __("Refresh");
                refreshBtn.innerHTML = `
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                    </svg>
                `;
                refreshBtn.addEventListener("click", () => this.refresh());
                btnGroup.appendChild(refreshBtn);

                controlsRight.appendChild(btnGroup);
            }

            // Info Count Badge
            this.infoBadge = document.createElement("div");
            this.infoBadge.className = "tree-view__count-badge";
            this.infoBadge.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span class="count-text">0 ${__("nodes")}</span>
            `;
            controlsRight.appendChild(this.infoBadge);

            this.toolbarElement.appendChild(controlsRight);
            headerElement.appendChild(this.toolbarElement);
        }

        // 2. Presets Pills Bar (Row 2 in header)
        if (this.options.showDoctypeSelector && this.options.popularDoctypes && this.options.popularDoctypes.length > 0) {
            this.presetsWrapper = document.createElement("div");
            this.presetsWrapper.className = "tree-view__presets";

            const presetsTitle = document.createElement("span");
            presetsTitle.className = "tree-view__presets-title";
            presetsTitle.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
                <span>${__("Quick Presets:")}</span>
            `;
            this.presetsWrapper.appendChild(presetsTitle);

            const presetsList = document.createElement("div");
            presetsList.className = "tree-view__presets-list";

            this.options.popularDoctypes.forEach(dt => {
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = "tree-view__preset-btn";
                pill.textContent = dt;
                pill.addEventListener("click", () => {
                    this.set_doctype(dt);
                });
                presetsList.appendChild(pill);
            });

            this.presetsWrapper.appendChild(presetsList);
            headerElement.appendChild(this.presetsWrapper);
        }

        this.rootElement.appendChild(headerElement);

        // 3. Body Container
        this.bodyElement = document.createElement("div");
        this.bodyElement.className = "tree-view__body";
        this.rootElement.appendChild(this.bodyElement);

        // 4. Loading Element (Skeleton Tree Loader)
        this.loadingElement = document.createElement("div");
        this.loadingElement.className = "tree-view__loading";
        this.loadingElement.innerHTML = `
            <div class="tree-view__skeleton">
                <div class="tree-skeleton-row"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 220px; height: 16px;"></div></div>
                <div class="tree-skeleton-row" style="padding-left: 24px;"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 180px; height: 16px;"></div></div>
                <div class="tree-skeleton-row" style="padding-left: 48px;"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 150px; height: 16px;"></div></div>
                <div class="tree-skeleton-row" style="padding-left: 48px;"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 190px; height: 16px;"></div></div>
                <div class="tree-skeleton-row" style="padding-left: 24px;"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 160px; height: 16px;"></div></div>
                <div class="tree-skeleton-row"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 200px; height: 16px;"></div></div>
                <div class="tree-skeleton-row" style="padding-left: 24px;"><div class="skeleton-box" style="width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0;"></div><div class="skeleton-box" style="width: 140px; height: 16px;"></div></div>
            </div>
        `;
        this.loadingElement.style.display = "none";
        this.rootElement.appendChild(this.loadingElement);

        // 5. Empty State Element
        this.emptyElement = document.createElement("div");
        this.emptyElement.className = "tree-view__empty";
        this.emptyElement.innerHTML = `
            <div class="tree-view__empty-icon">📂</div>
            <div class="tree-view__empty-title">${this.options.emptyText}</div>
        `;
        this.emptyElement.style.display = "none";
        this.rootElement.appendChild(this.emptyElement);

        this.container.appendChild(this.rootElement);
    }

    private _initDoctypeField(): void {
        if (!this.options.showDoctypeSelector || !this.doctypeWrapper) return;

        if (typeof frappe !== "undefined" && frappe.ui?.form?.make_control) {
            this.doctypeControl = frappe.ui.form.make_control({
                df: {
                    fieldtype: "Link",
                    options: "DocType",
                    fieldname: "tree_doctype",
                    placeholder: this.options.doctypePlaceholder || __("Select DocType..."),
                    reqd: 1,
                    get_query: () => ({
                        filters: {
                            istable: 0,
                            issingle: 0,
                            is_tree: 1
                        }
                    }),
                    change: () => {
                        const val = this.doctypeControl?.get_value();
                        if (val && val !== this.currentDoctype) {
                            this._updatePresetActiveState(val);
                            this.load_doctype(val);
                            this.options.onDoctypeChange?.(val);
                        } else if (!val) {
                            this.currentDoctype = null;
                            this._updatePresetActiveState(null);
                            this.show_empty(this.options.emptyText);
                        }
                    }
                },
                parent: this.doctypeWrapper,
                only_input: true
            });
            this.doctypeControl.refresh();

            if (this.doctypeControl.wrapper) {
                $(this.doctypeControl.wrapper).removeClass("col-md-2");
                $(this.doctypeControl.wrapper).css({
                    minWidth: "200px",
                    maxWidth: "280px",
                    margin: 0
                });
            }
        } else {
            // Fallback standard input
            const fallbackInput = document.createElement("input");
            fallbackInput.type = "text";
            fallbackInput.className = "form-control input-sm";
            fallbackInput.placeholder = this.options.doctypePlaceholder || "Enter DocType...";
            fallbackInput.addEventListener("change", () => {
                const val = fallbackInput.value.trim();
                if (val && val !== this.currentDoctype) {
                    this._updatePresetActiveState(val);
                    this.load_doctype(val);
                    this.options.onDoctypeChange?.(val);
                }
            });
            this.doctypeWrapper.appendChild(fallbackInput);
        }
    }

    private _updatePresetActiveState(currentDt?: string | null): void {
        if (!this.presetsWrapper) return;
        const dt = currentDt !== undefined ? currentDt : this.currentDoctype;
        const btns = this.presetsWrapper.querySelectorAll(".tree-view__preset-btn");
        btns.forEach((btn: any) => {
            if (dt && btn.textContent?.trim() === dt) {
                btn.classList.add("is-active");
            } else {
                btn.classList.remove("is-active");
            }
        });
    }

    public set_doctype(doctype: string): void {
        this._updatePresetActiveState(doctype);
        if (this.doctypeControl) {
            this.doctypeControl.set_value(doctype);
        } else {
            this.load_doctype(doctype);
            this.options.onDoctypeChange?.(doctype);
        }
    }

    private _bindToolbarEvents(): void {
        if (!this.searchInput) return;

        let debounceTimer: any = null;
        this.searchInput.addEventListener("input", () => {
            const val = this.searchInput.value.trim();
            this.searchClearBtn.style.display = val ? "inline-flex" : "none";

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.filter(val);
            }, 180);
        });

        this.searchClearBtn?.addEventListener("click", () => {
            this.searchInput.value = "";
            this.searchClearBtn.style.display = "none";
            this.filter("");
            this.searchInput.focus();
        });
    }

    public set_data(rawNodes: TreeNode[]): void {
        this.nodeMap.clear();
        this.nodes = this._buildHierarchy(rawNodes);
        this.render();
        this._updateCount();
    }

    private _buildHierarchy(items: TreeNode[]): TreeNode[] {
        const hasChildrenArrays = items.some(item => Array.isArray(item.children) && item.children.length > 0);
        const hasParentIds = items.some(item => item.parent_id !== undefined);

        if (hasChildrenArrays && !hasParentIds) {
            const registerRecursive = (nodeList: TreeNode[], parentNode: TreeNode | null = null) => {
                nodeList.forEach(n => {
                    n.parent_node = parentNode;
                    n.loaded = n.loaded !== undefined ? n.loaded : (Array.isArray(n.children) && n.children.length > 0);
                    n.is_group = n.is_group !== undefined ? n.is_group : (n.expandable || (Array.isArray(n.children) && n.children.length > 0));
                    this.nodeMap.set(n.id, n);
                    if (n.children && n.children.length > 0) {
                        registerRecursive(n.children, n);
                    }
                });
            };
            registerRecursive(items);
            return items;
        }

        const roots: TreeNode[] = [];
        const itemMap = new Map<string | number, TreeNode>();

        items.forEach(raw => {
            const node: TreeNode = {
                ...raw,
                children: raw.children ? [...raw.children] : [],
                loaded: raw.loaded ?? false,
                is_group: raw.is_group ?? Boolean(raw.expandable)
            };
            itemMap.set(node.id, node);
            this.nodeMap.set(node.id, node);
        });

        items.forEach(raw => {
            const node = itemMap.get(raw.id)!;
            const parentId = raw.parent_id;

            if (parentId && itemMap.has(parentId)) {
                const parent = itemMap.get(parentId)!;
                parent.is_group = true;
                parent.children = parent.children || [];
                parent.children.push(node);
                node.parent_node = parent;
            } else {
                roots.push(node);
            }
        });

        return roots;
    }

    public render(): void {
        this.bodyElement.innerHTML = "";
        this.loadingElement.style.display = "none";

        if (!this.nodes || this.nodes.length === 0) {
            this.show_empty();
            return;
        }

        this.emptyElement.style.display = "none";
        this.bodyElement.style.display = "block";

        const fragment = document.createDocumentFragment();
        this.nodes.forEach(node => {
            const nodeEl = this._renderNode(node, 0);
            fragment.appendChild(nodeEl);
        });

        this.bodyElement.appendChild(fragment);

        if (this.filterQuery) {
            this.filter(this.filterQuery);
        }
    }

    private _renderNode(node: TreeNode, level: number = 0): HTMLElement {
        const nodeEl = document.createElement("div");
        nodeEl.className = `tree-node ${node.is_group ? "is-group" : "is-leaf"} ${node.expanded ? "is-expanded" : ""}`.trim();
        nodeEl.dataset.nodeId = String(node.id);
        node.element = nodeEl;

        // Content row
        const row = document.createElement("div");
        row.className = `tree-node__content ${node.selected ? "is-selected" : ""}`.trim();
        row.style.paddingLeft = `${level * 20 + 8}px`;

        // 1. Toggle Caret Button
        const toggleBtn = document.createElement("span");
        toggleBtn.className = "tree-node__toggle";
        if (node.is_group || node.expandable) {
            toggleBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
            toggleBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggle_node(node);
            });
        } else {
            toggleBtn.classList.add("is-empty");
        }
        row.appendChild(toggleBtn);

        // 2. Checkbox (if multiSelect)
        if (this.options.multiSelect) {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "tree-node__checkbox";
            checkbox.checked = Boolean(node.checked);
            checkbox.addEventListener("change", (e) => {
                e.stopPropagation();
                node.checked = checkbox.checked;
                this.options.onCheckChange?.(node, node.checked);
            });
            row.appendChild(checkbox);
        }

        // 3. Node Icon
        if (this.options.showIcons) {
            const iconEl = document.createElement("span");
            iconEl.className = "tree-node__icon";
            iconEl.innerHTML = this._getNodeIcon(node);
            row.appendChild(iconEl);
        }

        // 4. Node Label
        const labelEl = document.createElement("span");
        labelEl.className = "tree-node__label";
        labelEl.textContent = node.label || String(node.id);
        labelEl.title = node.label || String(node.id);
        row.appendChild(labelEl);

        // 5. Node ID Badge (if label differs from ID)
        if (node.value && node.value !== node.label) {
            const valueEl = document.createElement("span");
            valueEl.className = "tree-node__value-badge";
            valueEl.textContent = `(${node.value})`;
            row.appendChild(valueEl);
        }

        // 6. Child Count Badge
        if (this.options.showBadges && node.is_group) {
            const badgeEl = document.createElement("span");
            badgeEl.className = "tree-node__badge";
            const childCount = node.children?.length ?? 0;
            if (node.loaded && childCount > 0) {
                badgeEl.textContent = String(childCount);
            } else if (!node.loaded) {
                badgeEl.textContent = "+";
            }
            row.appendChild(badgeEl);
        }

        // 7. Action Button: Open Document in Desk
        if (this.options.showActions && (node.value || node.id)) {
            const actionsEl = document.createElement("div");
            actionsEl.className = "tree-node__actions";

            const openBtn = document.createElement("button");
            openBtn.type = "button";
            openBtn.className = "tree-node__action-btn";
            openBtn.title = __("Open Document");
            openBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
            openBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const dt = node.doctype || this.currentDoctype;
                const name = node.value || node.id;
                if (dt && name && typeof frappe !== "undefined" && frappe.set_route) {
                    frappe.set_route("Form", dt, String(name));
                }
            });
            actionsEl.appendChild(openBtn);
            row.appendChild(actionsEl);
        }

        // Node Row Click Handler
        row.addEventListener("click", (e) => {
            if (this.options.selectable) {
                this.select_node(node);
            }
            this.options.onNodeClick?.(node, e);
        });

        // Double click toggles node
        row.addEventListener("dblclick", () => {
            if (node.is_group || node.expandable) {
                this.toggle_node(node);
            }
        });

        nodeEl.appendChild(row);

        // Children Container
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "tree-node__children";
        node.childrenContainer = childrenContainer;

        if (node.expanded && node.children && node.children.length > 0) {
            node.children.forEach(child => {
                childrenContainer.appendChild(this._renderNode(child, level + 1));
            });
        }

        nodeEl.appendChild(childrenContainer);
        return nodeEl;
    }

    private _getNodeIcon(node: TreeNode): string {
        if (node.icon) return node.icon;

        if (node.is_group || node.expandable) {
            if (node.expanded) {
                return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="9" y1="14" x2="15" y2="14"></line></svg>`;
            }
            return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
        }

        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    }

    public async toggle_node(node: TreeNode): Promise<void> {
        if (node.expanded) {
            this.collapse_node(node);
        } else {
            await this.expand_node(node);
        }
    }

    public async expand_node(node: TreeNode): Promise<void> {
        if (node.expanded) return;

        if ((node.is_group || node.expandable) && !node.loaded && (!node.children || node.children.length === 0)) {
            await this._fetchAndAppendChildren(node);
        }

        node.expanded = true;
        if (node.element) {
            node.element.classList.add("is-expanded");
            const iconSpan = node.element.querySelector(".tree-node__content .tree-node__icon");
            if (iconSpan) {
                iconSpan.innerHTML = this._getNodeIcon(node);
            }
        }

        if (node.childrenContainer && (!node.childrenContainer.children.length || node.childrenContainer.children.length === 0)) {
            const level = this._getNodeLevel(node) + 1;
            node.children?.forEach(child => {
                node.childrenContainer?.appendChild(this._renderNode(child, level));
            });
        }

        this.options.onNodeExpand?.(node);
    }

    public collapse_node(node: TreeNode): void {
        if (!node.expanded) return;
        node.expanded = false;

        if (node.element) {
            node.element.classList.remove("is-expanded");
            const iconSpan = node.element.querySelector(".tree-node__content .tree-node__icon");
            if (iconSpan) {
                iconSpan.innerHTML = this._getNodeIcon(node);
            }
        }

        this.options.onNodeCollapse?.(node);
    }

    private _getNodeLevel(node: TreeNode): number {
        let level = 0;
        let curr = node.parent_node;
        while (curr) {
            level++;
            curr = curr.parent_node;
        }
        return level;
    }

    private async _fetchAndAppendChildren(node: TreeNode): Promise<void> {
        node.loading = true;

        if (node.childrenContainer) {
            node.childrenContainer.innerHTML = `
                <div class="tree-node__loading">
                    <span class="tree-view__spinner-sm"></span>
                    <span>${__("Loading...")}</span>
                </div>
            `;
        }

        try {
            let childItems: TreeNode[] = [];

            if (this.options.loadChildren) {
                childItems = await this.options.loadChildren(node);
            } else if (this.currentDoctype) {
                childItems = await this._fetchDocTypeChildren(this.currentDoctype, String(node.value || node.id));
            }

            node.children = childItems.map(c => ({
                ...c,
                parent_node: node,
                doctype: c.doctype || this.currentDoctype || undefined
            }));

            node.children.forEach(child => {
                this.nodeMap.set(child.id, child);
            });

            node.loaded = true;
        } catch (err) {
            console.error("[TreeView] Error loading children:", err);
            if (node.childrenContainer) {
                node.childrenContainer.innerHTML = `
                    <div class="tree-node__error text-danger text-muted small p-2">
                        ${__("Failed to load children.")}
                    </div>
                `;
            }
        } finally {
            node.loading = false;
            if (node.childrenContainer) {
                node.childrenContainer.innerHTML = "";
            }
            this._updateCount();
        }
    }

    private async _fetchDocTypeChildren(doctype: string, parentValue: string): Promise<TreeNode[]> {
        return new Promise((resolve) => {
            if (typeof frappe === "undefined") {
                resolve([]);
                return;
            }

            frappe.call({
                method: "frappe.desk.treeview.get_children",
                args: {
                    doctype: doctype,
                    parent: parentValue
                },
                callback: (r: any) => {
                    if (r && Array.isArray(r.message)) {
                        const items: TreeNode[] = r.message.map((row: any) => ({
                            id: row.value || row.name,
                            value: row.value || row.name,
                            label: row.title || row.value || row.name,
                            expandable: Boolean(row.expandable),
                            is_group: Boolean(row.expandable),
                            doctype: doctype,
                            data: row
                        }));
                        resolve(items);
                    } else {
                        this._fallbackFetchChildren(doctype, parentValue).then(resolve);
                    }
                },
                error: () => {
                    this._fallbackFetchChildren(doctype, parentValue).then(resolve);
                }
            });
        });
    }

    private async _fallbackFetchChildren(doctype: string, parentValue: string): Promise<TreeNode[]> {
        return new Promise((resolve) => {
            const meta = this.currentMeta || (typeof frappe !== "undefined" ? frappe.get_meta(doctype) : null);
            const parentField = meta?.nsm_parent_field || `parent_${(doctype || "").toLowerCase().replace(/[\s-]+/g, "_")}`;
            const titleField = meta?.title_field || "name";

            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: doctype,
                    fields: ["name", titleField, "is_group", parentField],
                    filters: [[parentField, "=", parentValue]],
                    limit_page_length: 500,
                    order_by: "name asc"
                },
                callback: (r: any) => {
                    if (r && Array.isArray(r.message)) {
                        const items: TreeNode[] = r.message.map((row: any) => ({
                            id: row.name,
                            value: row.name,
                            label: row[titleField] || row.name,
                            is_group: Boolean(row.is_group),
                            expandable: Boolean(row.is_group),
                            doctype: doctype,
                            data: row
                        }));
                        resolve(items);
                    } else {
                        resolve([]);
                    }
                },
                error: () => resolve([])
            });
        });
    }

    public async load_doctype(doctype: string): Promise<void> {
        this.currentDoctype = doctype;
        this._updatePresetActiveState(doctype);
        this.show_loading(__("Loading tree for {0}...", [doctype]));

        // Wait 1s for smooth skeleton loading
        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (typeof frappe === "undefined") {
            this.show_empty(__("Frappe framework not detected."));
            return;
        }

        try {
            await new Promise((resolve) => frappe.model.with_doctype(doctype, resolve));
            const meta = frappe.get_meta(doctype);
            this.currentMeta = meta;

            if (this.toolbarElement) {
                const isTree = Boolean(meta.is_tree || frappe.meta.get_docfield?.(doctype, "is_group"));
                const badge = this.toolbarElement.querySelector(".tree-view__count-badge");
                if (badge) {
                    badge.setAttribute("title", isTree ? __("Tree DocType") : __("Standard DocType"));
                }
            }

            const roots = await this._fetchDocTypeChildren(doctype, "");

            if (roots && roots.length > 0) {
                this.set_data(roots);

                if (roots.length === 1 && (roots[0].is_group || roots[0].expandable)) {
                    await this.expand_node(roots[0]);
                }
            } else {
                const titleField = meta.title_field || "name";
                const isGroupField = meta.fields?.find((f: any) => f.fieldname === "is_group")?.fieldname;
                const fields = ["name", titleField];
                if (isGroupField) fields.push(isGroupField);

                const records: any[] = await new Promise((resolve) => {
                    frappe.call({
                        method: "frappe.client.get_list",
                        args: {
                            doctype: doctype,
                            fields: fields,
                            limit_page_length: 200,
                            order_by: "creation desc"
                        },
                        callback: (r: any) => resolve(r.message || []),
                        error: () => resolve([])
                    });
                });

                if (records.length > 0) {
                    const nodes: TreeNode[] = records.map((rec) => ({
                        id: rec.name,
                        value: rec.name,
                        label: rec[titleField] || rec.name,
                        is_group: Boolean(rec.is_group),
                        expandable: Boolean(rec.is_group),
                        doctype: doctype,
                        data: rec
                    }));
                    this.set_data(nodes);
                } else {
                    this.show_empty(__("No records found in {0}.", [doctype]));
                }
            }
        } catch (err) {
            console.error("[TreeView] Failed to load DocType:", err);
            this.show_empty(__("Failed to load DocType: {0}", [String(err)]));
        }
    }

    public select_node(node: TreeNode): void {
        if (this.selectedNode && this.selectedNode.element) {
            const row = this.selectedNode.element.querySelector(".tree-node__content");
            row?.classList.remove("is-selected");
            this.selectedNode.selected = false;
        }

        this.selectedNode = node;
        node.selected = true;

        if (node.element) {
            const row = node.element.querySelector(".tree-node__content");
            row?.classList.add("is-selected");
        }

        this.options.onNodeSelect?.(node);
    }

    public async expand_all(): Promise<void> {
        // Check if there are unloaded group nodes
        const hasUnloadedGroups = Array.from(this.nodeMap.values()).some(n => (n.is_group || n.expandable) && !n.loaded);

        if (hasUnloadedGroups && this.currentDoctype) {
            // Load ALL nodes using single API call: get_all_nodes
            this.show_loading(__("Expanding all nodes..."));
            await new Promise((resolve) => setTimeout(resolve, 1000));
            try {
                await this._loadAllNodesSingleCall(this.currentDoctype);
            } catch (err) {
                console.error("[TreeView] Error loading all nodes in single call:", err);
            }
        }

        // Expand all nodes
        this.nodeMap.forEach(n => {
            if (n.is_group || n.expandable) {
                n.expanded = true;
            }
        });

        this.render();
    }

    private async _loadAllNodesSingleCall(doctype: string): Promise<void> {
        return new Promise((resolve) => {
            if (typeof frappe === "undefined") {
                resolve();
                return;
            }

            frappe.call({
                method: "frappe.desk.treeview.get_all_nodes",
                args: {
                    doctype: doctype,
                    label: doctype,
                    parent: "",
                    tree_method: "frappe.desk.treeview.get_children",
                    is_root: true
                },
                callback: (r: any) => {
                    if (r && Array.isArray(r.message) && r.message.length > 0) {
                        this._integrateAllNodesData(r.message, doctype);
                        resolve();
                    } else {
                        this._fallbackLoadAllNodes(doctype).then(resolve);
                    }
                },
                error: () => {
                    this._fallbackLoadAllNodes(doctype).then(resolve);
                }
            });
        });
    }

    private _integrateAllNodesData(dataList: any[], doctype: string): void {
        const childrenByParent = new Map<string, any[]>();
        dataList.forEach(group => {
            childrenByParent.set(String(group.parent), group.data || []);
        });

        const rootData = childrenByParent.get(doctype) || childrenByParent.get("") || (dataList.length > 0 ? dataList[0].data : []);

        this.nodeMap.clear();

        const buildNodeRecursive = (item: any, parentNode: TreeNode | null): TreeNode => {
            const isGroup = Boolean(item.expandable);
            const node: TreeNode = {
                id: item.value,
                value: item.value,
                label: item.title || item.value,
                is_group: isGroup,
                expandable: isGroup,
                loaded: true,
                expanded: true,
                parent_node: parentNode,
                doctype: doctype,
                children: [],
                data: item
            };

            this.nodeMap.set(node.id, node);

            if (isGroup && childrenByParent.has(String(item.value))) {
                const childrenData = childrenByParent.get(String(item.value)) || [];
                node.children = childrenData.map(childData => buildNodeRecursive(childData, node));
            }

            return node;
        };

        this.nodes = rootData.map((d: any) => buildNodeRecursive(d, null));
    }

    private async _fallbackLoadAllNodes(doctype: string): Promise<void> {
        return new Promise((resolve) => {
            const meta = this.currentMeta || (typeof frappe !== "undefined" ? frappe.get_meta(doctype) : null);
            const parentField = meta?.nsm_parent_field || `parent_${(doctype || "").toLowerCase().replace(/[\s-]+/g, "_")}`;
            const titleField = meta?.title_field || "name";

            frappe.call({
                method: "frappe.client.get_list",
                args: {
                    doctype: doctype,
                    fields: ["name", titleField, "is_group", parentField],
                    limit_page_length: 5000,
                    order_by: "name asc"
                },
                callback: (r: any) => {
                    if (r && Array.isArray(r.message)) {
                        const items: TreeNode[] = r.message.map((row: any) => ({
                            id: row.name,
                            value: row.name,
                            label: row[titleField] || row.name,
                            parent_id: row[parentField] || null,
                            is_group: Boolean(row.is_group),
                            expandable: Boolean(row.is_group),
                            loaded: true,
                            expanded: true,
                            doctype: doctype,
                            data: row
                        }));
                        this.nodeMap.clear();
                        this.nodes = this._buildHierarchy(items);
                        this.nodeMap.forEach(n => {
                            n.loaded = true;
                            n.expanded = true;
                        });
                    }
                    resolve();
                },
                error: () => resolve()
            });
        });
    }

    public collapse_all(): void {
        const collapseRecursive = (nodeList: TreeNode[]) => {
            nodeList.forEach(n => {
                if (n.expanded) {
                    this.collapse_node(n);
                }
                if (n.children && n.children.length > 0) {
                    collapseRecursive(n.children);
                }
            });
        };
        collapseRecursive(this.nodes);
    }

    public filter(query: string): void {
        this.filterQuery = (query || "").toLowerCase().trim();

        if (!this.filterQuery) {
            this.nodeMap.forEach(n => {
                if (n.element) {
                    n.element.classList.remove("is-hidden");
                    const labelEl = n.element.querySelector(".tree-node__label");
                    if (labelEl) labelEl.innerHTML = n.label || String(n.id);
                }
            });
            this.emptyElement.style.display = "none";
            this.bodyElement.style.display = "block";
            this._updateCount();
            return;
        }

        let matchCount = 0;

        const checkNode = (node: TreeNode): boolean => {
            const labelStr = (node.label || String(node.id)).toLowerCase();
            const valueStr = String(node.value || "").toLowerCase();
            const isMatch = labelStr.includes(this.filterQuery) || valueStr.includes(this.filterQuery);

            let hasMatchingChild = false;
            if (node.children && node.children.length > 0) {
                node.children.forEach(child => {
                    const childMatched = checkNode(child);
                    if (childMatched) hasMatchingChild = true;
                });
            }

            const visible = isMatch || hasMatchingChild;

            if (node.element) {
                if (visible) {
                    node.element.classList.remove("is-hidden");
                    if (hasMatchingChild && !node.expanded) {
                        this.expand_node(node);
                    }

                    const labelEl = node.element.querySelector(".tree-node__label");
                    if (labelEl) {
                        if (isMatch) {
                            const original = node.label || String(node.id);
                            const regex = new RegExp(`(${this.filterQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
                            labelEl.innerHTML = original.replace(regex, `<mark class="tree-search-highlight">$1</mark>`);
                            matchCount++;
                        } else {
                            labelEl.innerHTML = node.label || String(node.id);
                        }
                    }
                } else {
                    node.element.classList.add("is-hidden");
                }
            }

            return visible;
        };

        this.nodes.forEach(root => checkNode(root));

        if (matchCount === 0) {
            this.show_empty(__("No matching nodes found for '{0}'", [this.filterQuery]));
        } else {
            this.emptyElement.style.display = "none";
            this.bodyElement.style.display = "block";
        }

        if (this.infoBadge) {
            const countSpan = this.infoBadge.querySelector(".count-text");
            const text = `${matchCount} ${matchCount === 1 ? __("match") : __("matches")}`;
            if (countSpan) {
                countSpan.textContent = text;
            } else {
                this.infoBadge.textContent = text;
            }
            this.infoBadge.classList.add("is-filtering");
        }
    }

    public refresh(): void {
        if (this.currentDoctype) {
            this.load_doctype(this.currentDoctype);
        } else if (this.options.data) {
            this.set_data(this.options.data);
        }
    }

    public show_loading(message?: string): void {
        this.bodyElement.style.display = "none";
        this.emptyElement.style.display = "none";
        this.loadingElement.style.display = "block";
    }

    public show_empty(message?: string): void {
        this.bodyElement.style.display = "none";
        this.loadingElement.style.display = "none";
        this.emptyElement.style.display = "flex";
        const title = this.emptyElement.querySelector(".tree-view__empty-title");
        if (title) title.textContent = message || this.options.emptyText || __("No nodes to display");
        if (this.infoBadge) {
            const countSpan = this.infoBadge.querySelector(".count-text");
            if (countSpan) countSpan.textContent = `0 ${__("nodes")}`;
            this.infoBadge.classList.remove("is-filtering");
        }
    }

    private _updateCount(): void {
        if (!this.infoBadge) return;
        const total = this.nodeMap.size;
        const countSpan = this.infoBadge.querySelector(".count-text");
        const text = `${total} ${total === 1 ? __("node") : __("nodes")}`;
        if (countSpan) {
            countSpan.textContent = text;
        } else {
            this.infoBadge.textContent = text;
        }
        this.infoBadge.classList.remove("is-filtering");
    }

    public get_selected_node(): TreeNode | null {
        return this.selectedNode;
    }

    public destroy(): void {
        this.container.innerHTML = "";
        this.nodeMap.clear();
        this.nodes = [];
    }
}

// Global exposure
declare global {
    interface Window {
        TreeView: typeof TreeView;
    }
}

if (typeof window !== "undefined") {
    (window as any).TreeView = TreeView;
    if (typeof (window as any).frappe !== "undefined") {
        (window as any).frappe.ui_component = (window as any).frappe.ui_component || {};
        (window as any).frappe.ui_component.TreeView = TreeView;
    }
}

export * from "./types";
export default TreeView;

