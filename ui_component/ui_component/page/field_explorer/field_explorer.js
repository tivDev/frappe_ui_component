frappe.pages['field-explorer'].on_page_load = function (wrapper) {
	new field_explorer(wrapper);
};

let field_explorer = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('Field Explorer'),
			single_column: true
		});

		this.current_doctype = null;
		this.current_include_system_fields = 1;
		this.current_meta = null;
		this.easy_table_instance = null;

		this.make();
	},

	make: function () {
		frappe.dom.set_style(`
			.field-explorer-container .awesomplete > [role=listbox],
			.doctype-input-wrapper .awesomplete > [role=listbox],
			.awesomplete > [role=listbox] {
				z-index: 12 !important;
			}
		`);

		// Render the template with data
		let rendered_html = frappe.render_template('field_explorer', {});
		// Append the rendered HTML to the page
		$(rendered_html).appendTo(this.page.main);

		// Hide default header page form row so controls mount cleanly inside the unified card
		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		// Add fields after rendering the page content
		this.addFieldsInputs();
		this.setupPresets();
		this.setupActions();
		this.checkRouteOptions();
	},

	addFieldsInputs: function () {
		const $doctypeMount = this.page.main.find('#doctypeFieldMount');
		const $sysMount = this.page.main.find('#sysFieldMount');

		// 1. DocType Link Field
		this.doctype_control = this.page.add_field(
			{
				fieldtype: 'Link',
				fieldname: 'doctype',
				label: __('DocType'),
				options: 'DocType',
				placeholder: __('Search or select DocType...'),
				reqd: 1,
				change: () => {
					const dt = (this.doctype_control ? this.doctype_control.get_value() || '' : '').trim() || null;
					this.update_link_btn_visibility(this.doctype_control);
					if (dt === this.current_doctype) return;
					if (dt) {
						this.load_doctype_fields(dt);
					} else {
						this.reset_view();
					}
				}
			},
			$doctypeMount
		);

		if (this.doctype_control && this.doctype_control.$wrapper) {
			// Remove Bootstrap col-md-2 constraint added by page.add_field
			this.doctype_control.$wrapper.removeClass('col-md-2');
		}

		if (this.doctype_control && this.doctype_control.$input) {
			this.doctype_control.$input.on('input change blur', () => {
				this.update_link_btn_visibility(this.doctype_control);
			});
		}

		if (this.doctype_control && this.doctype_control.$wrapper) {
			this.doctype_control.$wrapper.on('click', '.btn-clear', () => {
				setTimeout(() => {
					this.update_link_btn_visibility(this.doctype_control);
					const dt = (this.doctype_control ? this.doctype_control.get_value() || '' : '').trim() || null;
					if (dt === this.current_doctype) return;
					if (dt) {
						this.load_doctype_fields(dt);
					} else {
						this.reset_view();
					}
				}, 50);
			});
		}
		this.update_link_btn_visibility(this.doctype_control);

		// 2. Include System Fields Checkbox
		this.sys_control = this.page.add_field(
			{
				fieldtype: 'Check',
				fieldname: 'include_system_fields',
				label: __('Include System Fields'),
				default: 1,
				change: () => {
					const val = this.sys_control.get_value() ? 1 : 0;
					if (val === this.current_include_system_fields) return;
					this.current_include_system_fields = val;
					const dt = this.doctype_control.get_value();
					if (dt) {
						this.load_doctype_fields(dt);
					}
				}
			},
			$sysMount
		);

		if (this.sys_control && this.sys_control.$wrapper) {
			// Remove Bootstrap col-md-2 constraint added by page.add_field
			this.sys_control.$wrapper.removeClass('col-md-2');
		}
	},

	update_link_btn_visibility: function (control) {
		if (!control || !control.$wrapper) return;
		const val = (control.get_value() || '').trim();
		const $linkField = control.$wrapper.find('.link-field');
		if (!$linkField.length) return;

		let $linkBtn = control.$wrapper.find('.link-btn');
		if ($linkBtn.length === 0) {
			$linkBtn = $(`
				<span class="link-btn">
					<a class="btn-clear" style="display: inline-block;" title="${__('Clear Link')}">
						${frappe.utils.icon('close', 'xs', 'es-icon')}
					</a>
					<a class="btn-open" tabIndex="-1" style="display: inline-block;" title="${__('Open Link')}">
						${frappe.utils.icon('arrow-right', 'xs')}
					</a>
				</span>
			`).appendTo($linkField);

			$linkBtn.find('.btn-clear').on('click', () => {
				setTimeout(() => {
					control.set_value('');
					this.update_link_btn_visibility(control);
					if (this.reset_view) {
						this.reset_view();
					}
				}, 50);
			});
		}

		if (val) {
			$linkField.addClass('has-value');
			$linkBtn.attr('style', 'display: inline-flex !important;');
			const options = control.get_options ? control.get_options() : (control.df ? control.df.options : 'DocType');
			if (options) {
				const href = frappe.utils.get_form_link(options, val);
				$linkBtn.find('.btn-open').attr('href', href);
			}
		} else {
			$linkField.removeClass('has-value');
			$linkBtn.attr('style', 'display: none !important;');
		}
	},

	setupPresets: function () {
		const presets = [
			'Item',
			'Customer',
			'Sales Order',
			'Purchase Order',
			'Material Request',
			'User',
			'Account',
			'Task'
		];

		const $presetContainer = this.page.main.find('.preset-buttons');
		presets.forEach((dt) => {
			$(`<button type="button" class="preset-btn">${dt}</button>`)
				.appendTo($presetContainer)
				.on('click', () => {
					this.doctype_control.set_value(dt);
					this.update_link_btn_visibility(this.doctype_control);
				});
		});
	},

	updatePresetActiveState: function (current_dt) {
		this.page.main.find('.preset-btn').each(function () {
			const dt = $(this).text().trim();
			if (dt === current_dt) {
				$(this).addClass('active');
			} else {
				$(this).removeClass('active');
			}
		});
	},

	setupActions: function () {
		this.page.set_primary_action(
			__('Refresh'),
			() => {
				const dt = this.doctype_control.get_value();
				if (dt) this.load_doctype_fields(dt);
			},
			'refresh'
		);

		this.page.add_button(__('Customize Form'), () => {
			const dt = this.doctype_control.get_value();
			if (dt) {
				frappe.set_route('Form', 'Customize Form', { doc_type: dt });
			} else {
				frappe.msgprint(__('Please select a DocType first.'));
			}
		});

		this.page.add_button(__('DocType Form'), () => {
			const dt = this.doctype_control.get_value();
			if (dt) {
				frappe.set_route('Form', 'DocType', dt);
			} else {
				frappe.msgprint(__('Please select a DocType first.'));
			}
		});
	},

	reset_view: function () {
		this.current_doctype = null;
		this.current_meta = null;
		this.updatePresetActiveState(null);
		this.update_link_btn_visibility(this.doctype_control);

		this.page.main.find('.field-explorer-summary-row').hide();
		this.page.main.find('.field-explorer-table-mount').html(`
			<div class="empty-state-no-filter text-center text-muted">
				${__('Please set filters')}
			</div>
		`);
		this.page.set_title(__('Field Explorer'));
	},

	get_skeleton_html: function (doctype) {
		return `<div class="skeleton-box field-explorer-skeleton-box"></div>`;
	},

	load_doctype_fields: function (doctype) {
		this.current_doctype = doctype;
		this.page.set_title(__('Field Explorer: {0}', [doctype]));
		this.updatePresetActiveState(doctype);
		this.update_link_btn_visibility(this.doctype_control);

		// Show skeleton in summary row
		const $summaryRow = this.page.main.find('.field-explorer-summary-row');
		const $metaBadges = $summaryRow.find('.doctype-meta-badges');
		const $childTablesContainer = $summaryRow.find('.child-tables-container');
		$childTablesContainer.hide();
		$metaBadges.html(`
			<div class="skeleton-box" style="width: 105px; height: 22px; border-radius: 6px;"></div>
			<div class="skeleton-box" style="width: 75px; height: 22px; border-radius: 6px;"></div>
			<div class="skeleton-box" style="width: 90px; height: 22px; border-radius: 6px;"></div>
		`);
		$summaryRow.show();

		// Show skeleton table loader
		const $tableMount = this.page.main.find('.field-explorer-table-mount');
		$tableMount.html(this.get_skeleton_html(doctype));

		frappe.call({
			method: 'ui_component.ui_component.page.field_explorer.api.get_doctype_fields',
			args: {
				doctype: doctype,
				include_system_fields: this.sys_control ? this.sys_control.get_value() : 1
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						this.render_explorer_data(r.message);
					} else {
						$tableMount.html(`
							<div class="empty-state text-center text-muted">
								<div class="empty-icon">
									<img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state">
								</div>
								<div class="empty-title">${__('Nothing to show')}</div>
							</div>
						`);
					}
				}, 1000);
			},
			error: () => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="text-center text-danger" style="padding: 40px 20px;">
							${__('Error loading DocType fields. Please check permissions or DocType name.')}
						</div>
					`);
				}, 1000);
			}
		});
	},

	render_explorer_data: function (data) {
		this.current_meta = data;

		const $summaryRow = this.page.main.find('.field-explorer-summary-row');
		const $metaBadges = $summaryRow.find('.doctype-meta-badges');
		const $childTablesContainer = $summaryRow.find('.child-tables-container');
		const $childTablePills = $summaryRow.find('.child-table-pills');

		$metaBadges.empty();

		// Module badge
		if (data.module) {
			$metaBadges.append(`<span class="badge-tag badge-tag-module">${__('Module')}: ${data.module}</span>`);
		}

		// Total fields
		$metaBadges.append(`<span class="badge-tag badge-tag-count">${data.total_fields} ${__('Fields')}</span>`);

		// Type badges
		if (data.is_submittable) {
			$metaBadges.append(`<span class="badge-tag badge-tag-submittable">✓ ${__('Submittable')}</span>`);
		}
		if (data.is_single) {
			$metaBadges.append(`<span class="badge-tag badge-tag-single">${__('Single')}</span>`);
		}
		if (data.is_table) {
			$metaBadges.append(`<span class="badge-tag badge-tag-table">${__('Child Table')}</span>`);
		}
		if (data.is_tree) {
			$metaBadges.append(`<span class="badge-tag badge-tag-tree">${__('Tree')}</span>`);
		}
		if (data.autoname) {
			$metaBadges.append(`<span class="badge-tag badge-tag-naming">${__('Naming')}: ${data.autoname}</span>`);
		}

		// Child Tables Pills
		if (data.child_tables && data.child_tables.length > 0) {
			$childTablePills.empty();
			data.child_tables.forEach((ct) => {
				$(`<button type="button" class="child-table-pill" title="${ct.fieldname}">
					${ct.options}
				</button>`)
					.appendTo($childTablePills)
					.on('click', () => {
						this.doctype_control.set_value(ct.options);
					});
			});
			$childTablesContainer.show();
		} else {
			$childTablesContainer.hide();
		}

		$summaryRow.slideDown(150);

		// Initialize EasyTable
		this.render_easy_table(data.fields);
	},

	render_easy_table: function (fields_data) {
		const $tableMount = this.page.main.find('.field-explorer-table-mount');
		$tableMount.empty();

		const EasyTable =
			(window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) ||
			window.EasyTable;

		if (!EasyTable) {
			console.error('[Field Explorer] EasyTable component is not loaded.');
			$tableMount.html(`
				<div class="alert alert-warning m-3">
					${__('EasyTable library could not be found. Please ensure ditech_core is enabled.')}
				</div>
			`);
			return;
		}

		// Clean up previous instance
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try {
				this.easy_table_instance.destroy();
			} catch (e) {
				console.warn(e);
			}
			this.easy_table_instance = null;
		}

		const columns = [
			{
				fieldname: 'label',
				label: __('Label'),
				fieldtype: 'Data',
				width: 210,
				cell_decorator: {
					body(value, row) {
						if (row && (row.fieldtype === 'Table' || row.fieldtype === 'Table MultiSelect')) {
							return {
								styles: {
									fontWeight: '600'
								}
							};
						}
						if (row && row.indent > 0) {
							return {
								styles: {
									fontWeight: '400',
									color: 'var(--text-muted, #64748b)'
								}
							};
						}
						return {
							styles: {
								fontWeight: '500'
							}
						};
					}
				}
			},
			{
				fieldname: 'fieldname',
				label: __('Fieldname'),
				fieldtype: 'Data',
				width: 175,
				freeze: true,
				cell_decorator: {
					body(value, row) {
						let color = row && row.is_system_field ? '#0284c7' : '#1e293b';
						if (row && row.indent > 0 && !row.is_system_field) {
							color = '#475569';
						}
						return {
							styles: {
								fontFamily: 'monospace',
								fontWeight: row && row.indent > 0 ? '500' : '600',
								color: color
							}
						};
					}
				}
			},
			{
				fieldname: 'fieldtype',
				label: __('Field Type'),
				fieldtype: 'Data',
				width: 125,
				cell_decorator: {
					body(value) {
						const type = String(value || '');
						let bg = '#f1f5f9';
						let color = '#334155';

						if (type === 'Link') {
							bg = '#dbeafe';
							color = '#1d4ed8';
						} else if (type === 'Table' || type === 'Table MultiSelect') {
							bg = '#f3e8ff';
							color = '#7e22ce';
						} else if (type === 'Select') {
							bg = '#ffedd5';
							color = '#c2410c';
						} else if (['Currency', 'Float', 'Int', 'Percent'].includes(type)) {
							bg = '#dcfce7';
							color = '#15803d';
						} else if (type === 'Check') {
							bg = '#e0f2fe';
							color = '#0369a1';
						} else if (['Date', 'Datetime', 'Time'].includes(type)) {
							bg = '#fef3c7';
							color = '#b45309';
						} else if (['Text', 'Small Text', 'Long Text', 'Code'].includes(type)) {
							bg = '#e2e8f0';
							color = '#475569';
						}

						return {
							styles: {
								fontWeight: '600',
								fontSize: '11px',
								color: color
							}
						};
					}
				}
			},
			{
				fieldname: 'options',
				label: __('Options / Target'),
				fieldtype: 'Data',
				width: 160
			},
			{
				fieldname: 'reqd',
				label: __('Mandatory'),
				fieldtype: 'Check',
				width: 110
			},
			{
				fieldname: 'read_only',
				label: __('Read Only'),
				fieldtype: 'Check',
				width: 105
			},
			{
				fieldname: 'hidden',
				label: __('Hidden'),
				fieldtype: 'Check',
				width: 90
			},
			{
				fieldname: 'in_list_view',
				label: __('In List'),
				fieldtype: 'Check',
				width: 85
			},
			{
				fieldname: 'in_standard_filter',
				label: __('Filter'),
				fieldtype: 'Check',
				width: 80
			},
			{
				fieldname: 'in_global_search',
				label: __('Search'),
				fieldtype: 'Check',
				width: 85
			},
			{
				fieldname: 'unique',
				label: __('Unique'),
				fieldtype: 'Check',
				width: 80
			},
			{
				fieldname: 'allow_on_submit',
				label: __('On Submit'),
				fieldtype: 'Check',
				width: 95
			},
			{
				fieldname: 'default',
				label: __('Default Value'),
				fieldtype: 'Data',
				width: 120
			},
			{
				fieldname: 'fetch_from',
				label: __('Fetch From'),
				fieldtype: 'Data',
				width: 140
			},
			{
				fieldname: 'depends_on',
				label: __('Depends On'),
				fieldtype: 'Data',
				width: 150
			},
			{
				fieldname: 'description',
				label: __('Description'),
				fieldtype: 'Data',
				width: 220
			},
			{
				fieldname: 'is_custom_field',
				label: __('Custom'),
				fieldtype: 'Check',
				width: 85
			},
			{
				fieldname: 'is_system_field',
				label: __('System'),
				fieldtype: 'Check',
				width: 85
			}
		];

		const tableMountEl = $tableMount[0];

		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: fields_data,
			doctype: this.current_doctype,
			table_config: {
				additional_settings: {
					collapse_all: true
				}
			},
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	checkRouteOptions: function () {
		const initialDocType =
			(frappe.route_options && frappe.route_options.doctype) ||
			(frappe.get_route()[1] && !frappe.get_route()[1].includes('explorer') ? frappe.get_route()[1] : '');

		if (initialDocType) {
			this.doctype_control.set_value(initialDocType);
			this.update_link_btn_visibility(this.doctype_control);
		}
	}
});
