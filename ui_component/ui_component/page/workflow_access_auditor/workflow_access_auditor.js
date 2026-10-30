frappe.pages['workflow-access-auditor'].on_page_load = function (wrapper) {
	new workflow_access_auditor(wrapper);
};

if (frappe.pages && frappe.pages['workflow-inspector']) {
	frappe.pages['workflow-inspector'].on_page_load = function (wrapper) {
		new workflow_access_auditor(wrapper);
	};
}

let workflow_access_auditor = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('Workflow Inspector'),
			single_column: true
		});

		this.current_doctype = null;
		this.current_role = null;
		this.current_state = null;
		this.current_status_preset = 'all'; // 'all' | 'active' | 'inactive'

		this.easy_table_instance = null;
		this.current_data = null;
		this._filter_timer = null;

		this.make();
	},

	make: function () {
		let rendered_html = frappe.render_template('workflow_access_auditor', {});
		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_controls();
		this.setup_presets();
		this.setup_actions();
		this.check_route_options();
	},

	setup_controls: function () {
		const $dtMount = this.page.main.find('.inspector-input-wrapper.dt-wrapper');
		const $roleMount = this.page.main.find('.inspector-input-wrapper.role-wrapper');
		const $stateMount = this.page.main.find('.inspector-input-wrapper.state-wrapper');

		// 1. DocType Control (Mandatory)
		this.doctype_control = frappe.ui.form.make_control({
			parent: $dtMount,
			df: {
				fieldtype: 'Link',
				options: 'DocType',
				fieldname: 'inspector_doctype',
				label: __('DocType'),
				placeholder: __('Select DocType...'),
				reqd: 1,
				get_query: () => {
					return {
						filters: {
							issingle: 0,
							istable: 0
						}
					};
				},
				change: () => {
					const dt = (this.doctype_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.doctype_control);
					if (dt === this.current_doctype) return;
					this.current_doctype = dt;
					if (dt) {
						this.trigger_auto_reload();
					} else {
						this.render_empty_no_filter();
					}
				}
			},
			render_input: true
		});
		this.doctype_control.$input.on('input change blur', () => {
			this.update_link_btn_visibility(this.doctype_control);
		});
		this.doctype_control.$wrapper.on('click', '.btn-clear', () => {
			setTimeout(() => {
				this.update_link_btn_visibility(this.doctype_control);
				const dt = (this.doctype_control.get_value() || '').trim() || null;
				if (dt === this.current_doctype) return;
				this.current_doctype = dt;
				if (dt) {
					this.trigger_auto_reload();
				} else {
					this.render_empty_no_filter();
				}
			}, 50);
		});

		// 2. Role Control (Optional Filter)
		this.role_control = frappe.ui.form.make_control({
			parent: $roleMount,
			df: {
				fieldtype: 'Link',
				options: 'Role',
				fieldname: 'inspector_role',
				label: __('Allowed Role'),
				placeholder: __('Select Role (Optional)...'),
				change: () => {
					const role = (this.role_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.role_control);
					if (role === this.current_role) return;
					this.current_role = role;
					if (this.current_doctype) {
						this.trigger_auto_reload();
					}
				}
			},
			render_input: true
		});
		this.role_control.$input.on('input change blur', () => {
			this.update_link_btn_visibility(this.role_control);
		});
		this.role_control.$wrapper.on('click', '.btn-clear', () => {
			setTimeout(() => {
				this.update_link_btn_visibility(this.role_control);
				const role = (this.role_control.get_value() || '').trim() || null;
				if (role === this.current_role) return;
				this.current_role = role;
				if (this.current_doctype) {
					this.trigger_auto_reload();
				}
			}, 50);
		});

		// 3. Workflow State Control (Optional Filter)
		this.state_control = frappe.ui.form.make_control({
			parent: $stateMount,
			df: {
				fieldtype: 'Link',
				options: 'Workflow State',
				fieldname: 'inspector_state',
				label: __('Workflow State'),
				placeholder: __('Select State (Optional)...'),
				change: () => {
					const state = (this.state_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.state_control);
					if (state === this.current_state) return;
					this.current_state = state;
					if (this.current_doctype) {
						this.trigger_auto_reload();
					}
				}
			},
			render_input: true
		});
		this.state_control.$input.on('input change blur', () => {
			this.update_link_btn_visibility(this.state_control);
		});
		this.state_control.$wrapper.on('click', '.btn-clear', () => {
			setTimeout(() => {
				this.update_link_btn_visibility(this.state_control);
				const state = (this.state_control.get_value() || '').trim() || null;
				if (state === this.current_state) return;
				this.current_state = state;
				if (this.current_doctype) {
					this.trigger_auto_reload();
				}
			}, 50);
		});
	},

	update_link_btn_visibility: function (control) {
		if (!control || !control.$wrapper) return;
		const val = (control.get_value() || '').trim();
		const $linkField = control.$wrapper.find('.link-field');
		const $linkBtn = control.$wrapper.find('.link-btn');

		if (val) {
			$linkField.addClass('has-value');
			$linkBtn.attr('style', 'display: inline-flex !important;');
			if (control.get_options && control.get_options()) {
				const href = frappe.utils.get_form_link(control.get_options(), val);
				$linkBtn.find('.btn-open').attr('href', href);
			}
		} else {
			$linkField.removeClass('has-value');
			$linkBtn.attr('style', 'display: none !important;');
		}
	},

	setup_presets: function () {
		const self = this;
		this.page.main.find('.preset-pill').on('click', function () {
			const preset = $(this).data('preset');
			if (preset === self.current_status_preset) return;

			self.current_status_preset = preset;
			self.page.main.find('.preset-pill').removeClass('active');
			$(this).addClass('active');

			if (self.current_data) {
				self.filter_and_render_table();
			} else if (self.current_doctype) {
				self.load_data();
			}
		});
	},

	setup_actions: function () {
		this.page.set_primary_action(
			__('Refresh'),
			() => {
				if (this.current_doctype) {
					this.load_data();
				} else {
					frappe.show_alert({
						message: __('Please select a DocType first.'),
						indicator: 'orange'
					});
				}
			},
			'refresh'
		);

		this.page.main.find('.btn-clear-inspector').on('click', () => {
			this.clear_all();
		});
	},

	trigger_auto_reload: function () {
		clearTimeout(this._filter_timer);
		this._filter_timer = setTimeout(() => {
			this.load_data();
		}, 300);
	},

	check_route_options: function () {
		if (frappe.route_options) {
			if (frappe.route_options.doctype && this.doctype_control) {
				this.doctype_control.set_value(frappe.route_options.doctype);
				this.current_doctype = frappe.route_options.doctype;
			}
			if (frappe.route_options.role && this.role_control) {
				this.role_control.set_value(frappe.route_options.role);
				this.current_role = frappe.route_options.role;
			}
			if (frappe.route_options.state && this.state_control) {
				this.state_control.set_value(frappe.route_options.state);
				this.current_state = frappe.route_options.state;
			}
			frappe.route_options = null;
		}

		if (this.current_doctype) {
			this.load_data();
		} else {
			this.render_empty_no_filter();
		}
	},

	load_data: function () {
		if (!this.current_doctype) {
			this.render_empty_no_filter();
			return;
		}

		const $tableMount = this.page.main.find('.workflow-inspector-table-mount');
		$tableMount.html('<div class="inspector-skeleton-box"></div>');

		this.page.set_title(`${__('Workflow Inspector')}: ${this.current_doctype}`);

		frappe.call({
			method: 'ui_component.ui_component.page.workflow_access_auditor.api.get_workflow_inspector_data',
			args: {
				doctype: this.current_doctype,
				role: this.current_role,
				state: this.current_state
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						this.current_data = r.message;
						this.render_summary(r.message.summary);
						this.filter_and_render_table();
					} else {
						this.render_empty(__('No workflow data returned.'));
					}
				}, 200);
			},
			error: () => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="empty-state text-center text-danger">
							<div>${__('Error loading workflow inspector data. Please check permissions.')}</div>
						</div>
					`);
				}, 200);
			}
		});
	},

	render_summary: function (summary) {
		const s = summary || {};
		const $summaryRow = this.page.main.find('.inspector-summary-row');
		const $badges = $summaryRow.find('.inspector-meta-badges');
		$badges.empty();

		$badges.append(`<span class="badge-tag badge-tag-total">${s.total_workflows || 0} ${__('Workflows')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${s.active_workflows || 0} ${__('Active')}</span>`);
		if (s.inactive_workflows > 0) {
			$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${s.inactive_workflows} ${__('Inactive')}</span>`);
		}
		$badges.append(`<span class="badge-tag badge-tag-state">${s.total_states || 0} ${__('States')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-action">${s.total_transitions || 0} ${__('Transitions')}</span>`);

		$summaryRow.show();
	},

	filter_and_render_table: function () {
		if (!this.current_data) return;

		let records = this.current_data.records || [];
		const preset = this.current_status_preset;

		if (preset === 'active') {
			records = records.filter((r) => r.is_active === true);
		} else if (preset === 'inactive') {
			records = records.filter((r) => r.is_active === false);
		}

		if (records.length === 0) {
			this.render_empty(this.current_data.message || __('No workflow records match the active filters.'));
			return;
		}

		this.render_table(records);
	},

	render_table: function (records) {
		const $tableMount = this.page.main.find('.workflow-inspector-table-mount');
		$tableMount.empty();

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (!EasyTable) {
			$tableMount.html(`<div class="alert alert-warning m-3">${__('EasyTable component could not be loaded.')}</div>`);
			return;
		}

		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const formatNode = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent === 0) {
				return {
					styles: {
						fontWeight: '600',
						color: '#1d4ed8'
					}
				};
			} else if (indent === 1) {
				return {
					styles: {
						fontWeight: '600',
						color: '#b45309'
					}
				};
			}
			return {
				styles: {
					fontWeight: '500',
					color: '#0f172a'
				}
			};
		};

		const formatDocStatus = (val, row) => {
			const ds = String(val || '').trim();
			if (ds.includes('0') || ds.toLowerCase().includes('draft')) {
				return {
					styles: {
						color: '#64748b',
						textAlign: 'center'
					}
				};
			} else if (ds.includes('1') || ds.toLowerCase().includes('submitted')) {
				return {
					styles: {
						color: '#15803d',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (ds.includes('2') || ds.toLowerCase().includes('cancelled')) {
				return {
					styles: {
						color: '#b91c1c',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			}
			return {
				styles: { textAlign: 'center' }
			};
		};

		const formatStatus = (val) => {
			const st = String(val || '').toLowerCase();
			if (st === 'active' || st === __('active').toLowerCase()) {
				return {
					styles: {
						color: '#15803d',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (st === 'inactive' || st === __('inactive').toLowerCase()) {
				return {
					styles: {
						color: '#94a3b8',
						textAlign: 'center'
					}
				};
			}
			return { styles: { textAlign: 'center' } };
		};

		// EasyTable puts the indentation and collapse chevron toggle on column index 1
		// (index 0 is the unshifted sequence number column).
		const columns = [
			{
				fieldname: 'hierarchy_node',
				label: __('Workflow / State / Action'),
				fieldtype: 'Data',
				width: 270,
				freeze: true,
				cell_decorator: { body: formatNode }
			},
			{
				fieldname: 'workflow',
				label: __('Workflow'),
				fieldtype: 'Link',
				options: 'Workflow',
				width: 180
			},
			{
				fieldname: 'doctype',
				label: __('DocType'),
				fieldtype: 'Link',
				options: 'DocType',
				width: 150
			},
			{
				fieldname: 'state',
				label: __('State'),
				fieldtype: 'Data',
				width: 130
			},
			{
				fieldname: 'doc_status',
				label: __('DocStatus'),
				fieldtype: 'Data',
				width: 110,
				align: 'center',
				cell_decorator: { body: formatDocStatus }
			},
			{
				fieldname: 'allow_edit',
				label: __('Allow Edit Role'),
				fieldtype: 'Link',
				options: 'Role',
				width: 140
			},
			{
				fieldname: 'action',
				label: __('Action'),
				fieldtype: 'Data',
				width: 130,
				cell_decorator: {
					body(v) {
						if (v) {
							return {
								styles: {
									fontWeight: '600',
									color: '#1e40af'
								}
							};
						}
						return {};
					}
				}
			},
			{
				fieldname: 'next_state',
				label: __('Next State'),
				fieldtype: 'Data',
				width: 130
			},
			{
				fieldname: 'allowed_role',
				label: __('Allowed Role'),
				fieldtype: 'Link',
				options: 'Role',
				width: 150
			},
			{
				fieldname: 'allow_self_approval',
				label: __('Self Approval'),
				fieldtype: 'Check',
				width: 110,
				align: 'center'
			},
			{
				fieldname: 'condition',
				label: __('Condition Expression'),
				fieldtype: 'Data',
				width: 220,
				cell_decorator: {
					body(v) {
						if (v) {
							return {
								styles: {
									fontFamily: 'monospace',
									fontSize: '11.5px',
									color: '#475569'
								}
							};
						}
						return {};
					}
				}
			},
			{
				fieldname: 'workflow_status',
				label: __('Status'),
				fieldtype: 'Data',
				width: 95,
				align: 'center',
				cell_decorator: { body: formatStatus }
			}
		];

		const tableData = records.map((r) => {
			let displayNode = r.hierarchy_node || '';
			const indent = Number(r.indent) || 0;
			if (indent === 0) {
				displayNode = `⛭ ${r.workflow || r.hierarchy_node}`;
			} else if (indent === 1) {
				displayNode = `● ${r.state || r.hierarchy_node}`;
			} else if (indent === 2) {
				displayNode = `➜ ${r.action || r.hierarchy_node}`;
			}

			return {
				hierarchy_node: displayNode,
				workflow: r.workflow || '',
				doctype: r.doctype || '',
				state: r.state || '',
				doc_status: r.doc_status || '',
				allow_edit: r.allow_edit || '',
				action: r.action || '',
				next_state: r.next_state || '',
				allowed_role: r.allowed_role || '',
				allow_self_approval: r.allow_self_approval ? 1 : (r.allow_self_approval === false ? 0 : null),
				condition: r.condition || '',
				workflow_status: r.workflow_status || '',
				indent: r.indent,
				is_active: r.is_active
			};
		});

		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: tableData,
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	render_empty_no_filter: function () {
		this.current_data = null;
		this.page.set_title(__('Workflow Inspector'));
		this.page.main.find('.inspector-summary-row').hide();
		const $tableMount = this.page.main.find('.workflow-inspector-table-mount');
		$tableMount.html(`
			<div class="empty-state-no-filter text-center text-muted">
				<i class="fa fa-sitemap fa-3x mb-2 text-muted" style="opacity: 0.5;"></i>
				<div>${__('Please select a DocType to inspect its workflow.')}</div>
			</div>
		`);
	},

	render_empty: function (message) {
		const $tableMount = this.page.main.find('.workflow-inspector-table-mount');
		$tableMount.html(`
			<div class="empty-state text-center text-muted">
				<i class="fa fa-sitemap fa-3x mb-2 text-muted" style="opacity: 0.4;"></i>
				<div class="font-weight-bold">${message || __('No workflow records found.')}</div>
			</div>
		`);
	},

	clear_all: function () {
		if (this.doctype_control) {
			this.doctype_control.set_value('');
			this.update_link_btn_visibility(this.doctype_control);
		}
		if (this.role_control) {
			this.role_control.set_value('');
			this.update_link_btn_visibility(this.role_control);
		}
		if (this.state_control) {
			this.state_control.set_value('');
			this.update_link_btn_visibility(this.state_control);
		}

		this.current_doctype = null;
		this.current_role = null;
		this.current_state = null;
		this.current_status_preset = 'all';

		this.page.main.find('.preset-pill').removeClass('active');
		this.page.main.find('.preset-pill[data-preset="all"]').addClass('active');

		this.render_empty_no_filter();
	}
});

// Alias class name
window.workflow_inspector = workflow_access_auditor;
window.workflow_access_auditor = workflow_access_auditor;
