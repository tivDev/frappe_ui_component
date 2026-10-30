import type {
    SnackbarType,
    SnackbarPosition,
    SnackbarAction,
    SnackbarOptions
} from "./types";

export class Snackbar {
    public static containers: Map<string, HTMLElement> = new Map();
    public static activeInstances: Set<Snackbar> = new Set();
    public static defaultPosition: SnackbarPosition | string = 'bottom-center';
    public static defaultDuration: number = 4000;

    public message: string;
    public type: SnackbarType;
    public position: string;
    public duration: number;
    public showProgress: boolean;
    public dismissible: boolean;
    public action: SnackbarAction | null;
    public icon: string | HTMLElement | false | null;
    public onClose: ((instance: Snackbar) => void) | null;
    public onOpen: ((instance: Snackbar) => void) | null;
    public customClass: string;
    public customStyle: Partial<CSSStyleDeclaration> | Record<string, string> | null;

    public element: HTMLElement | null = null;
    public progressBar: HTMLElement | null = null;
    public timer: any = null;
    public startTime: number = 0;
    public remaining: number = 0;
    public isDismissed: boolean = false;

    public static normalizePosition(pos?: SnackbarPosition | string): string {
        if (!pos) return 'bottom-center';
        const str = String(pos).toLowerCase().trim().replace(/[\s_]+/g, '-');
        const parts = str.split('-');

        const vertical = parts.find(p => p === 'top' || p === 'bottom') || 'bottom';
        const horizontal = parts.find(p => p === 'left' || p === 'right' || p === 'center') || 'center';

        return `${vertical}-${horizontal}`;
    }

    public static getContainer(position?: SnackbarPosition | string): HTMLElement {
        const normalized = Snackbar.normalizePosition(position || Snackbar.defaultPosition);

        let container = Snackbar.containers.get(normalized);
        if (!container || !document.body.contains(container)) {
            container = document.querySelector(`.easy-snackbar-container.${normalized}, .snackbar-container.${normalized}`) as HTMLElement;
            if (!container) {
                container = document.createElement('div');
                container.className = `easy-snackbar-container snackbar-container ${normalized}`;
                document.body.appendChild(container);
            }
            Snackbar.containers.set(normalized, container);
        }
        return container;
    }

    public static show(options: SnackbarOptions | string): Snackbar {
        const instance = new Snackbar(options);
        return instance.show();
    }

    public static success(message: string, options: Partial<SnackbarOptions> = {}): Snackbar {
        return Snackbar.show({ message, type: 'success', ...options });
    }

    public static error(message: string, options: Partial<SnackbarOptions> = {}): Snackbar {
        return Snackbar.show({ message, type: 'error', ...options });
    }

    public static warning(message: string, options: Partial<SnackbarOptions> = {}): Snackbar {
        return Snackbar.show({ message, type: 'warning', ...options });
    }

    public static info(message: string, options: Partial<SnackbarOptions> = {}): Snackbar {
        return Snackbar.show({ message, type: 'info', ...options });
    }

    public static dismissAll(): void {
        const instances = Array.from(Snackbar.activeInstances);
        instances.forEach(instance => instance.dismiss());
    }

    public static cleanupEmptyContainers(): void {
        const containers = document.querySelectorAll('.easy-snackbar-container, .snackbar-container');
        containers.forEach(container => {
            if (container.children.length === 0) {
                container.remove();
            }
        });
        for (const [key, container] of Snackbar.containers.entries()) {
            if (!document.body.contains(container)) {
                Snackbar.containers.delete(key);
            }
        }
    }

    constructor(options: SnackbarOptions | string = { message: '' }) {
        const opts: SnackbarOptions = typeof options === 'string' ? { message: options } : options;

        this.message = opts.message || '';
        this.type = opts.type || 'default';
        this.position = Snackbar.normalizePosition(opts.position || Snackbar.defaultPosition);
        this.duration = opts.duration !== undefined ? opts.duration : Snackbar.defaultDuration;
        this.showProgress = opts.showProgress !== false && this.duration > 0;
        this.dismissible = opts.dismissible !== false;
        this.action = opts.action || null;
        this.icon = opts.icon !== undefined ? opts.icon : null;
        this.onClose = opts.onClose || null;
        this.onOpen = opts.onOpen || null;
        this.customClass = opts.className || '';
        this.customStyle = opts.style || null;

        this.remaining = this.duration;

        this._render();
    }

    private _render(): void {
        this.element = document.createElement('div');
        const isTop = this.position.startsWith('top');
        const posClass = isTop ? 'pos-top' : 'pos-bottom';
        this.element.className = `easy-snackbar-item snackbar-item type-${this.type} ${posClass} ${this.customClass}`.trim();

        if (this.customStyle && typeof this.customStyle === 'object') {
            Object.assign(this.element.style, this.customStyle);
        }

        // Content Area
        const content = document.createElement('div');
        content.className = 'easy-snackbar-content snackbar-content';

        // Icon
        const iconNode = this._createIconElement();
        if (iconNode) {
            content.appendChild(iconNode);
        }

        // Message
        const messageNode = document.createElement('span');
        messageNode.className = 'easy-snackbar-message snackbar-message';
        messageNode.innerHTML = this.message;
        content.appendChild(messageNode);

        this.element.appendChild(content);

        // Actions Container
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'easy-snackbar-actions snackbar-actions';

        if (this.action && this.action.text) {
            const actionBtn = document.createElement('button');
            actionBtn.type = 'button';
            actionBtn.className = `easy-snackbar-action-btn snackbar-action-btn ${this.action.className || ''}`.trim();
            actionBtn.textContent = this.action.text;
            actionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof this.action?.onClick === 'function') {
                    this.action.onClick(this);
                }
            });
            actionsContainer.appendChild(actionBtn);
        }

        if (this.dismissible) {
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'easy-snackbar-close-btn snackbar-close-btn';
            closeBtn.innerHTML = '&times;';
            closeBtn.setAttribute('aria-label', 'Close');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.dismiss();
            });
            actionsContainer.appendChild(closeBtn);
        }

        if (actionsContainer.children.length > 0) {
            this.element.appendChild(actionsContainer);
        }

        // Progress Bar
        if (this.showProgress) {
            this.progressBar = document.createElement('div');
            this.progressBar.className = 'easy-snackbar-progress snackbar-progress';
            this.element.appendChild(this.progressBar);
        }

        // Hover pause / resume listeners
        if (this.duration > 0) {
            this.element.addEventListener('mouseenter', () => this.pause());
            this.element.addEventListener('mouseleave', () => this.resume());
        }
    }

    private _createIconElement(): HTMLElement | null {
        if (this.icon === false) {
            return null;
        }

        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'easy-snackbar-icon snackbar-icon';

        if (this.icon instanceof HTMLElement) {
            iconWrapper.appendChild(this.icon);
            return iconWrapper;
        }

        if (typeof this.icon === 'string') {
            iconWrapper.innerHTML = this.icon;
            return iconWrapper;
        }

        switch (this.type) {
            case 'success':
                iconWrapper.textContent = '✓';
                break;
            case 'error':
                iconWrapper.textContent = '✕';
                break;
            case 'warning':
                iconWrapper.textContent = '⚠';
                break;
            case 'info':
                iconWrapper.textContent = 'ℹ';
                break;
            default:
                iconWrapper.textContent = '●';
                break;
        }
        return iconWrapper;
    }

    public show(): this {
        if (!this.element) return this;

        const container = Snackbar.getContainer(this.position);
        if (this.position.startsWith('top')) {
            container.insertBefore(this.element, container.firstChild);
        } else {
            container.appendChild(this.element);
        }

        Snackbar.activeInstances.add(this);

        requestAnimationFrame(() => {
            if (!this.element) return;
            this.element.classList.add('is-visible');
            if (this.duration > 0) {
                this._startTimer();
            }
            if (typeof this.onOpen === 'function') {
                this.onOpen(this);
            }
        });

        return this;
    }

    private _startTimer(): void {
        this.startTime = Date.now();

        if (this.progressBar) {
            this.progressBar.style.transition = `transform ${this.remaining}ms linear`;
            this.progressBar.style.transform = 'scaleX(0)';
        }

        this.timer = setTimeout(() => {
            this.dismiss();
        }, this.remaining);
    }

    public pause(): void {
        if (!this.timer || this.duration === 0 || this.isDismissed) return;
        clearTimeout(this.timer);
        this.timer = null;
        this.remaining -= Date.now() - this.startTime;
        if (this.remaining < 0) this.remaining = 0;

        if (this.progressBar) {
            const computedStyle = window.getComputedStyle(this.progressBar);
            const matrix = computedStyle.transform || (computedStyle as any).webkitTransform;
            this.progressBar.style.transition = 'none';
            if (matrix && matrix !== 'none') {
                this.progressBar.style.transform = matrix;
            }
        }
    }

    public resume(): void {
        if (this.timer || this.duration === 0 || this.remaining <= 0 || this.isDismissed) return;
        this._startTimer();
    }

    public dismiss(): void {
        if (this.isDismissed) return;
        this.isDismissed = true;

        Snackbar.activeInstances.delete(this);

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (this.element) {
            this.element.classList.remove('is-visible');
            this.element.classList.add('is-hiding');

            setTimeout(() => {
                if (this.element) {
                    const parent = this.element.parentElement || (this.element.parentNode as HTMLElement | null);
                    this.element.remove();
                    this.element = null;

                    if (parent && parent.children.length === 0) {
                        parent.remove();
                        Snackbar.containers.delete(this.position);
                    }
                }
                Snackbar.cleanupEmptyContainers();

                if (typeof this.onClose === 'function') {
                    this.onClose(this);
                }
            }, 300);
        } else {
            Snackbar.cleanupEmptyContainers();
            if (typeof this.onClose === 'function') {
                this.onClose(this);
            }
        }
    }
}

// EasySnackbar alias
export const EasySnackbar = Snackbar;

// Global Window & Frappe Exposure
declare global {
    interface Window {
        Snackbar: typeof Snackbar;
        EasySnackbar: typeof Snackbar;
    }
}

try {
    Object.defineProperty(window, 'Snackbar', {
        value: Snackbar,
        writable: true,
        configurable: true,
        enumerable: true
    });
    Object.defineProperty(window, 'EasySnackbar', {
        value: Snackbar,
        writable: true,
        configurable: true,
        enumerable: true
    });
} catch {
    (window as any).Snackbar = Snackbar;
    (window as any).EasySnackbar = Snackbar;
}

if (typeof (window as any).frappe !== 'undefined') {
    (window as any).frappe.snackbar = Snackbar;
    (window as any).frappe.show_snackbar = (
        message: string,
        type: SnackbarType = 'default',
        options: Partial<SnackbarOptions> = {}
    ) => {
        return Snackbar.show({ message, type, ...options });
    };
}

export * from "./types";
export default Snackbar;
