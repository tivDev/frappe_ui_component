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

};
