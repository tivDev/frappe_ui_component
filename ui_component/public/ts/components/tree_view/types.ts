export interface TreeNode {
    id: string | number;
    label: string;
    value?: any;
    parent_id?: string | number | null;
    is_group?: boolean;
    expandable?: boolean;
    expanded?: boolean;
    loaded?: boolean;
    loading?: boolean;
    selected?: boolean;
    checked?: boolean;
    icon?: string;
    badge?: string | number;
    children?: TreeNode[];
    data?: Record<string, any>;
    doctype?: string;
    parent_node?: TreeNode | null;
    element?: HTMLElement | null;
    childrenContainer?: HTMLElement | null;
}

export interface TreeViewOptions {
    container: HTMLElement | string;
    data?: TreeNode[];
    doctype?: string;
    title?: string;
    showDoctypeSelector?: boolean;
    doctypePlaceholder?: string;
    popularDoctypes?: string[];
    searchable?: boolean;
    showToolbar?: boolean;
    selectable?: boolean;
    multiSelect?: boolean;
    showBadges?: boolean;
    showIcons?: boolean;
    showActions?: boolean;
    showLines?: boolean;
    emptyText?: string;
    onDoctypeChange?: (doctype: string) => void;
    onNodeClick?: (node: TreeNode, event: MouseEvent) => void;
    onNodeSelect?: (node: TreeNode) => void;
    onNodeExpand?: (node: TreeNode) => void;
    onNodeCollapse?: (node: TreeNode) => void;
    onCheckChange?: (node: TreeNode, checked: boolean) => void;
    loadChildren?: (node: TreeNode) => Promise<TreeNode[]> | TreeNode[];
}

