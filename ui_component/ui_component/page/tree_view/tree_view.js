frappe.pages['tree-view'].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __('Tree View Explorer'),
		single_column: true
	});

	// Simply call and use TreeView component (DocType link field is built inside the component)
	let tree_view = new TreeView({
		container: page.main[0],
		showDoctypeSelector: true,
		doctype: (frappe.route_options && frappe.route_options.doctype) || (frappe.get_route()[1] !== 'tree-view' ? frappe.get_route()[1] : ''),
		onDoctypeChange: function (dt) {
			page.set_title(__('Tree View: {0}', [dt]));
		}
	});

	// Header actions
	page.set_primary_action(__('Refresh'), function () {
		tree_view.refresh();
	}, 'refresh');

	page.add_button(__('Expand All'), function () {
		tree_view.expand_all();
	});

	page.add_button(__('Collapse All'), function () {
		tree_view.collapse_all();
	});
};
