export type SnackbarType = 'default' | 'success' | 'error' | 'warning' | 'info';

export type SnackbarVerticalPosition = 'top' | 'bottom';
export type SnackbarHorizontalPosition = 'left' | 'center' | 'right';

export type SnackbarPosition =
    | `${SnackbarVerticalPosition}-${SnackbarHorizontalPosition}`
    | `${SnackbarHorizontalPosition} ${SnackbarVerticalPosition}`
    | `${SnackbarVerticalPosition} ${SnackbarHorizontalPosition}`
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'center';

export interface SnackbarAction {
    text: string;
    onClick?: (instance: any) => void;
    className?: string;
}

export interface SnackbarOptions {
    message: string;
    type?: SnackbarType;
    position?: SnackbarPosition | string;
    duration?: number;
    showProgress?: boolean;
    dismissible?: boolean;
    action?: SnackbarAction;
    icon?: string | HTMLElement | false;
    onClose?: (instance: any) => void;
    onOpen?: (instance: any) => void;
    className?: string;
    style?: Partial<CSSStyleDeclaration> | Record<string, string>;
}

