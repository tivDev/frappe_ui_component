(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __publicField = (obj, key, value) => {
    __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
    return value;
  };

  // ../ui_component/ui_component/public/ts/components/snackbar/index.ts
  var _Snackbar = class {
    constructor(options = { message: "" }) {
      __publicField(this, "message");
      __publicField(this, "type");
      __publicField(this, "position");
      __publicField(this, "duration");
      __publicField(this, "showProgress");
      __publicField(this, "dismissible");
      __publicField(this, "action");
      __publicField(this, "icon");
      __publicField(this, "onClose");
      __publicField(this, "onOpen");
      __publicField(this, "customClass");
      __publicField(this, "customStyle");
      __publicField(this, "element", null);
      __publicField(this, "progressBar", null);
      __publicField(this, "timer", null);
      __publicField(this, "startTime", 0);
      __publicField(this, "remaining", 0);
      __publicField(this, "isDismissed", false);
      const opts = typeof options === "string" ? { message: options } : options;
      this.message = opts.message || "";
      this.type = opts.type || "default";
      this.position = _Snackbar.normalizePosition(opts.position || _Snackbar.defaultPosition);
      this.duration = opts.duration !== void 0 ? opts.duration : _Snackbar.defaultDuration;
      this.showProgress = opts.showProgress !== false && this.duration > 0;
      this.dismissible = opts.dismissible !== false;
      this.action = opts.action || null;
      this.icon = opts.icon !== void 0 ? opts.icon : null;
      this.onClose = opts.onClose || null;
      this.onOpen = opts.onOpen || null;
      this.customClass = opts.className || "";
      this.customStyle = opts.style || null;
      this.remaining = this.duration;
      this._render();
    }
    static normalizePosition(pos) {
      if (!pos)
        return "bottom-center";
      const str = String(pos).toLowerCase().trim().replace(/[\s_]+/g, "-");
      const parts = str.split("-");
      const vertical = parts.find((p) => p === "top" || p === "bottom") || "bottom";
      const horizontal = parts.find((p) => p === "left" || p === "right" || p === "center") || "center";
      return `${vertical}-${horizontal}`;
    }
    static getContainer(position) {
      const normalized = _Snackbar.normalizePosition(position || _Snackbar.defaultPosition);
      let container = _Snackbar.containers.get(normalized);
      if (!container || !document.body.contains(container)) {
        container = document.querySelector(`.easy-snackbar-container.${normalized}, .snackbar-container.${normalized}`);
        if (!container) {
          container = document.createElement("div");
          container.className = `easy-snackbar-container snackbar-container ${normalized}`;
          document.body.appendChild(container);
        }
        _Snackbar.containers.set(normalized, container);
      }
      return container;
    }
    static show(options) {
      const instance = new _Snackbar(options);
      return instance.show();
    }
    static success(message, options = {}) {
      return _Snackbar.show(__spreadValues({ message, type: "success" }, options));
    }
    static error(message, options = {}) {
      return _Snackbar.show(__spreadValues({ message, type: "error" }, options));
    }
    static warning(message, options = {}) {
      return _Snackbar.show(__spreadValues({ message, type: "warning" }, options));
    }
    static info(message, options = {}) {
      return _Snackbar.show(__spreadValues({ message, type: "info" }, options));
    }
    static dismissAll() {
      const instances = Array.from(_Snackbar.activeInstances);
      instances.forEach((instance) => instance.dismiss());
    }
    static cleanupEmptyContainers() {
      const containers = document.querySelectorAll(".easy-snackbar-container, .snackbar-container");
      containers.forEach((container) => {
        if (container.children.length === 0) {
          container.remove();
        }
      });
      for (const [key, container] of _Snackbar.containers.entries()) {
        if (!document.body.contains(container)) {
          _Snackbar.containers.delete(key);
        }
      }
    }
    _render() {
      this.element = document.createElement("div");
      const isTop = this.position.startsWith("top");
      const posClass = isTop ? "pos-top" : "pos-bottom";
      this.element.className = `easy-snackbar-item snackbar-item type-${this.type} ${posClass} ${this.customClass}`.trim();
      if (this.customStyle && typeof this.customStyle === "object") {
        Object.assign(this.element.style, this.customStyle);
      }
      const content = document.createElement("div");
      content.className = "easy-snackbar-content snackbar-content";
      const iconNode = this._createIconElement();
      if (iconNode) {
        content.appendChild(iconNode);
      }
      const messageNode = document.createElement("span");
      messageNode.className = "easy-snackbar-message snackbar-message";
      messageNode.innerHTML = this.message;
      content.appendChild(messageNode);
      this.element.appendChild(content);
      const actionsContainer = document.createElement("div");
      actionsContainer.className = "easy-snackbar-actions snackbar-actions";
      if (this.action && this.action.text) {
        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = `easy-snackbar-action-btn snackbar-action-btn ${this.action.className || ""}`.trim();
        actionBtn.textContent = this.action.text;
        actionBtn.addEventListener("click", (e) => {
          var _a;
          e.stopPropagation();
          if (typeof ((_a = this.action) == null ? void 0 : _a.onClick) === "function") {
            this.action.onClick(this);
          }
        });
        actionsContainer.appendChild(actionBtn);
      }
      if (this.dismissible) {
        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "easy-snackbar-close-btn snackbar-close-btn";
        closeBtn.innerHTML = "&times;";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.dismiss();
        });
        actionsContainer.appendChild(closeBtn);
      }
      if (actionsContainer.children.length > 0) {
        this.element.appendChild(actionsContainer);
      }
      if (this.showProgress) {
        this.progressBar = document.createElement("div");
        this.progressBar.className = "easy-snackbar-progress snackbar-progress";
        this.element.appendChild(this.progressBar);
      }
      if (this.duration > 0) {
        this.element.addEventListener("mouseenter", () => this.pause());
        this.element.addEventListener("mouseleave", () => this.resume());
      }
    }
    _createIconElement() {
      if (this.icon === false) {
        return null;
      }
      const iconWrapper = document.createElement("span");
      iconWrapper.className = "easy-snackbar-icon snackbar-icon";
      if (this.icon instanceof HTMLElement) {
        iconWrapper.appendChild(this.icon);
        return iconWrapper;
      }
      if (typeof this.icon === "string") {
        iconWrapper.innerHTML = this.icon;
        return iconWrapper;
      }
      switch (this.type) {
        case "success":
          iconWrapper.textContent = "\u2713";
          break;
        case "error":
          iconWrapper.textContent = "\u2715";
          break;
        case "warning":
          iconWrapper.textContent = "\u26A0";
          break;
        case "info":
          iconWrapper.textContent = "\u2139";
          break;
        default:
          iconWrapper.textContent = "\u25CF";
          break;
      }
      return iconWrapper;
    }
    show() {
      if (!this.element)
        return this;
      const container = _Snackbar.getContainer(this.position);
      if (this.position.startsWith("top")) {
        container.insertBefore(this.element, container.firstChild);
      } else {
        container.appendChild(this.element);
      }
      _Snackbar.activeInstances.add(this);
      requestAnimationFrame(() => {
        if (!this.element)
          return;
        this.element.classList.add("is-visible");
        if (this.duration > 0) {
          this._startTimer();
        }
        if (typeof this.onOpen === "function") {
          this.onOpen(this);
        }
      });
      return this;
    }
    _startTimer() {
      this.startTime = Date.now();
      if (this.progressBar) {
        this.progressBar.style.transition = `transform ${this.remaining}ms linear`;
        this.progressBar.style.transform = "scaleX(0)";
      }
      this.timer = setTimeout(() => {
        this.dismiss();
      }, this.remaining);
    }
    pause() {
      if (!this.timer || this.duration === 0 || this.isDismissed)
        return;
      clearTimeout(this.timer);
      this.timer = null;
      this.remaining -= Date.now() - this.startTime;
      if (this.remaining < 0)
        this.remaining = 0;
      if (this.progressBar) {
        const computedStyle = window.getComputedStyle(this.progressBar);
        const matrix = computedStyle.transform || computedStyle.webkitTransform;
        this.progressBar.style.transition = "none";
        if (matrix && matrix !== "none") {
          this.progressBar.style.transform = matrix;
        }
      }
    }
    resume() {
      if (this.timer || this.duration === 0 || this.remaining <= 0 || this.isDismissed)
        return;
      this._startTimer();
    }
    dismiss() {
      if (this.isDismissed)
        return;
      this.isDismissed = true;
      _Snackbar.activeInstances.delete(this);
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.element) {
        this.element.classList.remove("is-visible");
        this.element.classList.add("is-hiding");
        setTimeout(() => {
          if (this.element) {
            const parent = this.element.parentElement || this.element.parentNode;
            this.element.remove();
            this.element = null;
            if (parent && parent.children.length === 0) {
              parent.remove();
              _Snackbar.containers.delete(this.position);
            }
          }
          _Snackbar.cleanupEmptyContainers();
          if (typeof this.onClose === "function") {
            this.onClose(this);
          }
        }, 300);
      } else {
        _Snackbar.cleanupEmptyContainers();
        if (typeof this.onClose === "function") {
          this.onClose(this);
        }
      }
    }
  };
  var Snackbar = _Snackbar;
  __publicField(Snackbar, "containers", /* @__PURE__ */ new Map());
  __publicField(Snackbar, "activeInstances", /* @__PURE__ */ new Set());
  __publicField(Snackbar, "defaultPosition", "bottom-center");
  __publicField(Snackbar, "defaultDuration", 4e3);
  try {
    Object.defineProperty(window, "Snackbar", {
      value: Snackbar,
      writable: true,
      configurable: true,
      enumerable: true
    });
    Object.defineProperty(window, "EasySnackbar", {
      value: Snackbar,
      writable: true,
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    window.Snackbar = Snackbar;
    window.EasySnackbar = Snackbar;
  }
  if (typeof window.frappe !== "undefined") {
    window.frappe.snackbar = Snackbar;
    window.frappe.show_snackbar = (message, type = "default", options = {}) => {
      return Snackbar.show(__spreadValues({ message, type }, options));
    };
  }

  // ../ui_component/ui_component/public/ts/components/tree_view/index.ts
  var TreeView = class {
    constructor(options) {
      __publicField(this, "container");
      __publicField(this, "options");
      __publicField(this, "nodes", []);
      __publicField(this, "nodeMap", /* @__PURE__ */ new Map());
      __publicField(this, "selectedNode", null);
      __publicField(this, "currentDoctype", null);
      __publicField(this, "currentMeta", null);
      __publicField(this, "filterQuery", "");
      __publicField(this, "rootElement");
      __publicField(this, "toolbarElement");
      __publicField(this, "doctypeWrapper", null);
      __publicField(this, "doctypeControl", null);
      __publicField(this, "presetsWrapper", null);
      __publicField(this, "searchInput");
      __publicField(this, "searchClearBtn");
      __publicField(this, "bodyElement");
      __publicField(this, "emptyElement");
      __publicField(this, "loadingElement");
      __publicField(this, "infoBadge");
      if (typeof options.container === "string") {
        const el = document.querySelector(options.container);
        if (!el) {
          throw new Error(`[TreeView] Container element not found: ${options.container}`);
        }
        this.container = el;
      } else {
        this.container = options.container;
      }
      this.options = __spreadValues({
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
        emptyText: __("Select a DocType or provide data to view the tree structure.")
      }, options);
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
    _initDOM() {
      this.container.innerHTML = "";
      this.rootElement = document.createElement("div");
      this.rootElement.className = `tree-view ${this.options.showLines ? "has-tree-lines" : ""}`.trim();
      const headerElement = document.createElement("div");
      headerElement.className = "tree-view__header";
      if (this.options.showToolbar) {
        this.toolbarElement = document.createElement("div");
        this.toolbarElement.className = "tree-view__toolbar";
        const controlsLeft = document.createElement("div");
        controlsLeft.className = "tree-view__controls-left";
        if (this.options.showDoctypeSelector) {
          const dtSelectorContainer = document.createElement("div");
          dtSelectorContainer.className = "tree-view__doctype-selector";
          const dtLabel = document.createElement("label");
          dtLabel.className = "tree-view__control-label";
          dtLabel.innerHTML = `
                    <svg class="tree-view__label-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                    </svg>
                    <span>${__("DocType")}</span>
                `;
          dtSelectorContainer.appendChild(dtLabel);
          this.doctypeWrapper = document.createElement("div");
          this.doctypeWrapper.className = "tree-view__doctype-control-wrapper";
          dtSelectorContainer.appendChild(this.doctypeWrapper);
          controlsLeft.appendChild(dtSelectorContainer);
        }
        if (this.options.showDoctypeSelector && this.options.searchable) {
          const divider = document.createElement("div");
          divider.className = "tree-view__divider";
          controlsLeft.appendChild(divider);
        }
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
        const controlsRight = document.createElement("div");
        controlsRight.className = "tree-view__controls-right";
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
        this.options.popularDoctypes.forEach((dt) => {
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
      this.bodyElement = document.createElement("div");
      this.bodyElement.className = "tree-view__body";
      this.rootElement.appendChild(this.bodyElement);
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
      this.emptyElement = document.createElement("div");
      this.emptyElement.className = "tree-view__empty";
      this.emptyElement.innerHTML = `
            <div class="tree-view__empty-icon">\u{1F4C2}</div>
            <div class="tree-view__empty-title">${this.options.emptyText}</div>
        `;
      this.emptyElement.style.display = "none";
      this.rootElement.appendChild(this.emptyElement);
      this.container.appendChild(this.rootElement);
    }
    _initDoctypeField() {
      var _a, _b;
      if (!this.options.showDoctypeSelector || !this.doctypeWrapper)
        return;
      if (typeof frappe !== "undefined" && ((_b = (_a = frappe.ui) == null ? void 0 : _a.form) == null ? void 0 : _b.make_control)) {
        this.doctypeControl = frappe.ui.form.make_control({
          df: {
            fieldtype: "Link",
            options: "DocType",
            fieldname: "tree_doctype",
            placeholder: this.options.doctypePlaceholder || __("Select DocType..."),
            get_query: () => ({
              filters: {
                istable: 0,
                issingle: 0,
                is_tree: 1
              }
            }),
            change: () => {
              var _a2, _b2, _c;
              const val = (_a2 = this.doctypeControl) == null ? void 0 : _a2.get_value();
              if (val && val !== this.currentDoctype) {
                this._updatePresetActiveState(val);
                this.load_doctype(val);
                (_c = (_b2 = this.options).onDoctypeChange) == null ? void 0 : _c.call(_b2, val);
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
        const fallbackInput = document.createElement("input");
        fallbackInput.type = "text";
        fallbackInput.className = "form-control input-sm";
        fallbackInput.placeholder = this.options.doctypePlaceholder || "Enter DocType...";
        fallbackInput.addEventListener("change", () => {
          var _a2, _b2;
          const val = fallbackInput.value.trim();
          if (val && val !== this.currentDoctype) {
            this._updatePresetActiveState(val);
            this.load_doctype(val);
            (_b2 = (_a2 = this.options).onDoctypeChange) == null ? void 0 : _b2.call(_a2, val);
          }
        });
        this.doctypeWrapper.appendChild(fallbackInput);
      }
    }
    _updatePresetActiveState(currentDt) {
      if (!this.presetsWrapper)
        return;
      const dt = currentDt !== void 0 ? currentDt : this.currentDoctype;
      const btns = this.presetsWrapper.querySelectorAll(".tree-view__preset-btn");
      btns.forEach((btn) => {
        var _a;
        if (dt && ((_a = btn.textContent) == null ? void 0 : _a.trim()) === dt) {
          btn.classList.add("is-active");
        } else {
          btn.classList.remove("is-active");
        }
      });
    }
    set_doctype(doctype) {
      var _a, _b;
      this._updatePresetActiveState(doctype);
      if (this.doctypeControl) {
        this.doctypeControl.set_value(doctype);
      } else {
        this.load_doctype(doctype);
        (_b = (_a = this.options).onDoctypeChange) == null ? void 0 : _b.call(_a, doctype);
      }
    }
    _bindToolbarEvents() {
      var _a;
      if (!this.searchInput)
        return;
      let debounceTimer = null;
      this.searchInput.addEventListener("input", () => {
        const val = this.searchInput.value.trim();
        this.searchClearBtn.style.display = val ? "inline-flex" : "none";
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filter(val);
        }, 180);
      });
      (_a = this.searchClearBtn) == null ? void 0 : _a.addEventListener("click", () => {
        this.searchInput.value = "";
        this.searchClearBtn.style.display = "none";
        this.filter("");
        this.searchInput.focus();
      });
    }
    set_data(rawNodes) {
      this.nodeMap.clear();
      this.nodes = this._buildHierarchy(rawNodes);
      this.render();
      this._updateCount();
    }
    _buildHierarchy(items) {
      const hasChildrenArrays = items.some((item) => Array.isArray(item.children) && item.children.length > 0);
      const hasParentIds = items.some((item) => item.parent_id !== void 0);
      if (hasChildrenArrays && !hasParentIds) {
        const registerRecursive = (nodeList, parentNode = null) => {
          nodeList.forEach((n) => {
            n.parent_node = parentNode;
            n.loaded = n.loaded !== void 0 ? n.loaded : Array.isArray(n.children) && n.children.length > 0;
            n.is_group = n.is_group !== void 0 ? n.is_group : n.expandable || Array.isArray(n.children) && n.children.length > 0;
            this.nodeMap.set(n.id, n);
            if (n.children && n.children.length > 0) {
              registerRecursive(n.children, n);
            }
          });
        };
        registerRecursive(items);
        return items;
      }
      const roots = [];
      const itemMap = /* @__PURE__ */ new Map();
      items.forEach((raw) => {
        var _a, _b;
        const node = __spreadProps(__spreadValues({}, raw), {
          children: raw.children ? [...raw.children] : [],
          loaded: (_a = raw.loaded) != null ? _a : false,
          is_group: (_b = raw.is_group) != null ? _b : Boolean(raw.expandable)
        });
        itemMap.set(node.id, node);
        this.nodeMap.set(node.id, node);
      });
      items.forEach((raw) => {
        const node = itemMap.get(raw.id);
        const parentId = raw.parent_id;
        if (parentId && itemMap.has(parentId)) {
          const parent = itemMap.get(parentId);
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
    render() {
      this.bodyElement.innerHTML = "";
      this.loadingElement.style.display = "none";
      if (!this.nodes || this.nodes.length === 0) {
        this.show_empty();
        return;
      }
      this.emptyElement.style.display = "none";
      this.bodyElement.style.display = "block";
      const fragment = document.createDocumentFragment();
      this.nodes.forEach((node) => {
        const nodeEl = this._renderNode(node, 0);
        fragment.appendChild(nodeEl);
      });
      this.bodyElement.appendChild(fragment);
      if (this.filterQuery) {
        this.filter(this.filterQuery);
      }
    }
    _renderNode(node, level = 0) {
      var _a, _b;
      const nodeEl = document.createElement("div");
      nodeEl.className = `tree-node ${node.is_group ? "is-group" : "is-leaf"} ${node.expanded ? "is-expanded" : ""}`.trim();
      nodeEl.dataset.nodeId = String(node.id);
      node.element = nodeEl;
      const row = document.createElement("div");
      row.className = `tree-node__content ${node.selected ? "is-selected" : ""}`.trim();
      row.style.paddingLeft = `${level * 20 + 8}px`;
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
      if (this.options.multiSelect) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "tree-node__checkbox";
        checkbox.checked = Boolean(node.checked);
        checkbox.addEventListener("change", (e) => {
          var _a2, _b2;
          e.stopPropagation();
          node.checked = checkbox.checked;
          (_b2 = (_a2 = this.options).onCheckChange) == null ? void 0 : _b2.call(_a2, node, node.checked);
        });
        row.appendChild(checkbox);
      }
      if (this.options.showIcons) {
        const iconEl = document.createElement("span");
        iconEl.className = "tree-node__icon";
        iconEl.innerHTML = this._getNodeIcon(node);
        row.appendChild(iconEl);
      }
      const labelEl = document.createElement("span");
      labelEl.className = "tree-node__label";
      labelEl.textContent = node.label || String(node.id);
      labelEl.title = node.label || String(node.id);
      row.appendChild(labelEl);
      if (node.value && node.value !== node.label) {
        const valueEl = document.createElement("span");
        valueEl.className = "tree-node__value-badge";
        valueEl.textContent = `(${node.value})`;
        row.appendChild(valueEl);
      }
      if (this.options.showBadges && node.is_group) {
        const badgeEl = document.createElement("span");
        badgeEl.className = "tree-node__badge";
        const childCount = (_b = (_a = node.children) == null ? void 0 : _a.length) != null ? _b : 0;
        if (node.loaded && childCount > 0) {
          badgeEl.textContent = String(childCount);
        } else if (!node.loaded) {
          badgeEl.textContent = "+";
        }
        row.appendChild(badgeEl);
      }
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
      row.addEventListener("click", (e) => {
        var _a2, _b2;
        if (this.options.selectable) {
          this.select_node(node);
        }
        (_b2 = (_a2 = this.options).onNodeClick) == null ? void 0 : _b2.call(_a2, node, e);
      });
      row.addEventListener("dblclick", () => {
        if (node.is_group || node.expandable) {
          this.toggle_node(node);
        }
      });
      nodeEl.appendChild(row);
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "tree-node__children";
      node.childrenContainer = childrenContainer;
      if (node.expanded && node.children && node.children.length > 0) {
        node.children.forEach((child) => {
          childrenContainer.appendChild(this._renderNode(child, level + 1));
        });
      }
      nodeEl.appendChild(childrenContainer);
      return nodeEl;
    }
    _getNodeIcon(node) {
      if (node.icon)
        return node.icon;
      if (node.is_group || node.expandable) {
        if (node.expanded) {
          return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="9" y1="14" x2="15" y2="14"></line></svg>`;
        }
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      }
      return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    }
    async toggle_node(node) {
      if (node.expanded) {
        this.collapse_node(node);
      } else {
        await this.expand_node(node);
      }
    }
    async expand_node(node) {
      var _a, _b, _c;
      if (node.expanded)
        return;
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
        (_a = node.children) == null ? void 0 : _a.forEach((child) => {
          var _a2;
          (_a2 = node.childrenContainer) == null ? void 0 : _a2.appendChild(this._renderNode(child, level));
        });
      }
      (_c = (_b = this.options).onNodeExpand) == null ? void 0 : _c.call(_b, node);
    }
    collapse_node(node) {
      var _a, _b;
      if (!node.expanded)
        return;
      node.expanded = false;
      if (node.element) {
        node.element.classList.remove("is-expanded");
        const iconSpan = node.element.querySelector(".tree-node__content .tree-node__icon");
        if (iconSpan) {
          iconSpan.innerHTML = this._getNodeIcon(node);
        }
      }
      (_b = (_a = this.options).onNodeCollapse) == null ? void 0 : _b.call(_a, node);
    }
    _getNodeLevel(node) {
      let level = 0;
      let curr = node.parent_node;
      while (curr) {
        level++;
        curr = curr.parent_node;
      }
      return level;
    }
    async _fetchAndAppendChildren(node) {
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
        let childItems = [];
        if (this.options.loadChildren) {
          childItems = await this.options.loadChildren(node);
        } else if (this.currentDoctype) {
          childItems = await this._fetchDocTypeChildren(this.currentDoctype, String(node.value || node.id));
        }
        node.children = childItems.map((c) => __spreadProps(__spreadValues({}, c), {
          parent_node: node,
          doctype: c.doctype || this.currentDoctype || void 0
        }));
        node.children.forEach((child) => {
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
    async _fetchDocTypeChildren(doctype, parentValue) {
      return new Promise((resolve) => {
        if (typeof frappe === "undefined") {
          resolve([]);
          return;
        }
        frappe.call({
          method: "frappe.desk.treeview.get_children",
          args: {
            doctype,
            parent: parentValue
          },
          callback: (r) => {
            if (r && Array.isArray(r.message)) {
              const items = r.message.map((row) => ({
                id: row.value || row.name,
                value: row.value || row.name,
                label: row.title || row.value || row.name,
                expandable: Boolean(row.expandable),
                is_group: Boolean(row.expandable),
                doctype,
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
    async _fallbackFetchChildren(doctype, parentValue) {
      return new Promise((resolve) => {
        const meta = this.currentMeta || (typeof frappe !== "undefined" ? frappe.get_meta(doctype) : null);
        const parentField = (meta == null ? void 0 : meta.nsm_parent_field) || `parent_${(doctype || "").toLowerCase().replace(/[\s-]+/g, "_")}`;
        const titleField = (meta == null ? void 0 : meta.title_field) || "name";
        frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype,
            fields: ["name", titleField, "is_group", parentField],
            filters: [[parentField, "=", parentValue]],
            limit_page_length: 500,
            order_by: "name asc"
          },
          callback: (r) => {
            if (r && Array.isArray(r.message)) {
              const items = r.message.map((row) => ({
                id: row.name,
                value: row.name,
                label: row[titleField] || row.name,
                is_group: Boolean(row.is_group),
                expandable: Boolean(row.is_group),
                doctype,
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
    async load_doctype(doctype) {
      var _a, _b, _c, _d;
      this.currentDoctype = doctype;
      this._updatePresetActiveState(doctype);
      this.show_loading(__("Loading tree for {0}...", [doctype]));
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      if (typeof frappe === "undefined") {
        this.show_empty(__("Frappe framework not detected."));
        return;
      }
      try {
        await new Promise((resolve) => frappe.model.with_doctype(doctype, resolve));
        const meta = frappe.get_meta(doctype);
        this.currentMeta = meta;
        if (this.toolbarElement) {
          const isTree = Boolean(meta.is_tree || ((_b = (_a = frappe.meta).get_docfield) == null ? void 0 : _b.call(_a, doctype, "is_group")));
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
          const isGroupField = (_d = (_c = meta.fields) == null ? void 0 : _c.find((f) => f.fieldname === "is_group")) == null ? void 0 : _d.fieldname;
          const fields = ["name", titleField];
          if (isGroupField)
            fields.push(isGroupField);
          const records = await new Promise((resolve) => {
            frappe.call({
              method: "frappe.client.get_list",
              args: {
                doctype,
                fields,
                limit_page_length: 200,
                order_by: "creation desc"
              },
              callback: (r) => resolve(r.message || []),
              error: () => resolve([])
            });
          });
          if (records.length > 0) {
            const nodes = records.map((rec) => ({
              id: rec.name,
              value: rec.name,
              label: rec[titleField] || rec.name,
              is_group: Boolean(rec.is_group),
              expandable: Boolean(rec.is_group),
              doctype,
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
    select_node(node) {
      var _a, _b;
      if (this.selectedNode && this.selectedNode.element) {
        const row = this.selectedNode.element.querySelector(".tree-node__content");
        row == null ? void 0 : row.classList.remove("is-selected");
        this.selectedNode.selected = false;
      }
      this.selectedNode = node;
      node.selected = true;
      if (node.element) {
        const row = node.element.querySelector(".tree-node__content");
        row == null ? void 0 : row.classList.add("is-selected");
      }
      (_b = (_a = this.options).onNodeSelect) == null ? void 0 : _b.call(_a, node);
    }
    async expand_all() {
      const hasUnloadedGroups = Array.from(this.nodeMap.values()).some((n) => (n.is_group || n.expandable) && !n.loaded);
      if (hasUnloadedGroups && this.currentDoctype) {
        this.show_loading(__("Expanding all nodes..."));
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        try {
          await this._loadAllNodesSingleCall(this.currentDoctype);
        } catch (err) {
          console.error("[TreeView] Error loading all nodes in single call:", err);
        }
      }
      this.nodeMap.forEach((n) => {
        if (n.is_group || n.expandable) {
          n.expanded = true;
        }
      });
      this.render();
    }
    async _loadAllNodesSingleCall(doctype) {
      return new Promise((resolve) => {
        if (typeof frappe === "undefined") {
          resolve();
          return;
        }
        frappe.call({
          method: "frappe.desk.treeview.get_all_nodes",
          args: {
            doctype,
            label: doctype,
            parent: "",
            tree_method: "frappe.desk.treeview.get_children",
            is_root: true
          },
          callback: (r) => {
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
    _integrateAllNodesData(dataList, doctype) {
      const childrenByParent = /* @__PURE__ */ new Map();
      dataList.forEach((group) => {
        childrenByParent.set(String(group.parent), group.data || []);
      });
      const rootData = childrenByParent.get(doctype) || childrenByParent.get("") || (dataList.length > 0 ? dataList[0].data : []);
      this.nodeMap.clear();
      const buildNodeRecursive = (item, parentNode) => {
        const isGroup = Boolean(item.expandable);
        const node = {
          id: item.value,
          value: item.value,
          label: item.title || item.value,
          is_group: isGroup,
          expandable: isGroup,
          loaded: true,
          expanded: true,
          parent_node: parentNode,
          doctype,
          children: [],
          data: item
        };
        this.nodeMap.set(node.id, node);
        if (isGroup && childrenByParent.has(String(item.value))) {
          const childrenData = childrenByParent.get(String(item.value)) || [];
          node.children = childrenData.map((childData) => buildNodeRecursive(childData, node));
        }
        return node;
      };
      this.nodes = rootData.map((d) => buildNodeRecursive(d, null));
    }
    async _fallbackLoadAllNodes(doctype) {
      return new Promise((resolve) => {
        const meta = this.currentMeta || (typeof frappe !== "undefined" ? frappe.get_meta(doctype) : null);
        const parentField = (meta == null ? void 0 : meta.nsm_parent_field) || `parent_${(doctype || "").toLowerCase().replace(/[\s-]+/g, "_")}`;
        const titleField = (meta == null ? void 0 : meta.title_field) || "name";
        frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype,
            fields: ["name", titleField, "is_group", parentField],
            limit_page_length: 5e3,
            order_by: "name asc"
          },
          callback: (r) => {
            if (r && Array.isArray(r.message)) {
              const items = r.message.map((row) => ({
                id: row.name,
                value: row.name,
                label: row[titleField] || row.name,
                parent_id: row[parentField] || null,
                is_group: Boolean(row.is_group),
                expandable: Boolean(row.is_group),
                loaded: true,
                expanded: true,
                doctype,
                data: row
              }));
              this.nodeMap.clear();
              this.nodes = this._buildHierarchy(items);
              this.nodeMap.forEach((n) => {
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
    collapse_all() {
      const collapseRecursive = (nodeList) => {
        nodeList.forEach((n) => {
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
    filter(query) {
      this.filterQuery = (query || "").toLowerCase().trim();
      if (!this.filterQuery) {
        this.nodeMap.forEach((n) => {
          if (n.element) {
            n.element.classList.remove("is-hidden");
            const labelEl = n.element.querySelector(".tree-node__label");
            if (labelEl)
              labelEl.innerHTML = n.label || String(n.id);
          }
        });
        this.emptyElement.style.display = "none";
        this.bodyElement.style.display = "block";
        this._updateCount();
        return;
      }
      let matchCount = 0;
      const checkNode = (node) => {
        const labelStr = (node.label || String(node.id)).toLowerCase();
        const valueStr = String(node.value || "").toLowerCase();
        const isMatch = labelStr.includes(this.filterQuery) || valueStr.includes(this.filterQuery);
        let hasMatchingChild = false;
        if (node.children && node.children.length > 0) {
          node.children.forEach((child) => {
            const childMatched = checkNode(child);
            if (childMatched)
              hasMatchingChild = true;
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
      this.nodes.forEach((root) => checkNode(root));
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
    refresh() {
      if (this.currentDoctype) {
        this.load_doctype(this.currentDoctype);
      } else if (this.options.data) {
        this.set_data(this.options.data);
      }
    }
    show_loading(message) {
      this.bodyElement.style.display = "none";
      this.emptyElement.style.display = "none";
      this.loadingElement.style.display = "block";
    }
    show_empty(message) {
      this.bodyElement.style.display = "none";
      this.loadingElement.style.display = "none";
      this.emptyElement.style.display = "flex";
      const title = this.emptyElement.querySelector(".tree-view__empty-title");
      if (title)
        title.textContent = message || this.options.emptyText || __("No nodes to display");
      if (this.infoBadge) {
        const countSpan = this.infoBadge.querySelector(".count-text");
        if (countSpan)
          countSpan.textContent = `0 ${__("nodes")}`;
        this.infoBadge.classList.remove("is-filtering");
      }
    }
    _updateCount() {
      if (!this.infoBadge)
        return;
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
    get_selected_node() {
      return this.selectedNode;
    }
    destroy() {
      this.container.innerHTML = "";
      this.nodeMap.clear();
      this.nodes = [];
    }
  };
  if (typeof window !== "undefined") {
    window.TreeView = TreeView;
    if (typeof window.frappe !== "undefined") {
      window.frappe.ui_component = window.frappe.ui_component || {};
      window.frappe.ui_component.TreeView = TreeView;
    }
  }

  // ../ui_component/ui_component/public/ts/ui_component.bundle.ts
  console.log("UI Component is built...");
})();
//# sourceMappingURL=ui_component.bundle.BDIZYY2U.js.map
