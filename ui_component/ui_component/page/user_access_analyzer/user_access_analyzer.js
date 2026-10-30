frappe.pages['user-access-analyzer'].on_page_load = function (wrapper) {
	new user_access_analyzer(wrapper);
};

let user_access_analyzer = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('User Access Analyzer'),
			single_column: true
		});

		this.current_user = null;
		this.current_doctype = null;
		this.current_docname = null;
		this.current_access_type = 'All';
		this.current_access_status = 'All';

		this.easy_table_instance = null;
		this.current_data = null;
		this._analysis_timer = null;

		this.make();
	},

	make: function () {
		frappe.dom.set_style(`
			.user-access-analyzer-container .awesomplete > [role=listbox],
			.analyzer-input-wrapper .awesomplete > [role=listbox],
			.awesomplete > [role=listbox] {
				z-index: 12 !important;
			}
		`);

		let rendered_html = frappe.render_template('user_access_analyzer', {});
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
		const self = this;
		const $userMount = this.page.main.find('.analyzer-input-wrapper.user-wrapper');
		const $dtMount = this.page.main.find('.analyzer-input-wrapper.doctype-wrapper');
		const $typeMount = this.page.main.find('.analyzer-input-wrapper.type-wrapper');
		const $statusMount = this.page.main.find('.analyzer-input-wrapper.status-wrapper');

		// 1. User Control
		this.user_control = frappe.ui.form.make_control({
			parent: $userMount,
			df: {
				fieldtype: 'Link',
				options: 'User',
				fieldname: 'analyzer_user',
				label: __('User'),
				placeholder: __('Select User...'),
				reqd: 1,
				change: () => {
					const val = (this.user_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.user_control);
					if (val === this.current_user) return;
					this.current_user = val;
					this.update_preset_active_state(val);
					this.trigger_auto_analysis();
				}
			},
			render_input: true
		});
		this.user_control.$input.on('input change blur', () => {
			this.update_link_btn_visibility(this.user_control);
		});
		this.user_control.$wrapper.on('click', '.btn-clear', () => {
			setTimeout(() => {
				this.update_link_btn_visibility(this.user_control);
				const val = (this.user_control.get_value() || '').trim() || null;
				if (val === this.current_user) return;
				this.current_user = val;
				this.update_preset_active_state(val);
				this.trigger_auto_analysis();
			}, 50);
		});
		this.update_link_btn_visibility(this.user_control);

		// 2. DocType Control
		this.doctype_control = frappe.ui.form.make_control({
			parent: $dtMount,
			df: {
				fieldtype: 'Link',
				options: 'DocType',
				fieldname: 'analyzer_doctype',
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
					this.update_document_control(dt);
					this.trigger_auto_analysis();
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
				this.update_document_control(dt);
				this.trigger_auto_analysis();
			}, 50);
		});
		this.update_link_btn_visibility(this.doctype_control);

		// 3. Document Name Control (initialized dynamically based on DocType)
		this.update_document_control(null);

		// 4. Access Type Select
		this.access_type_control = frappe.ui.form.make_control({
			parent: $typeMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'analyzer_access_type',
				label: __('Access Type'),
				placeholder: __('Access Type'),
				options: [
					{ label: __('All Operations'), value: 'All' },
					{ label: __('Read Access'), value: 'read' },
					{ label: __('Write Access'), value: 'write' },
					{ label: __('Delete Access'), value: 'delete' },
					{ label: __('List Visibility'), value: 'list' },
					{ label: __('Submit Access'), value: 'submit' },
					{ label: __('Share Access'), value: 'share' }
				],
				default: 'All',
				change: () => {
					const type = this.access_type_control.get_value() || 'All';
					if (type === this.current_access_type) return;
					this.current_access_type = type;
					this.trigger_auto_analysis();
				}
			},
			render_input: true
		});
		this.access_type_control.set_value('All');

		// 5. Access Status Select
		this.access_status_control = frappe.ui.form.make_control({
			parent: $statusMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'analyzer_access_status',
				label: __('Access Status'),
				placeholder: __('Access Status'),
				options: [
					{ label: __('All Statuses'), value: 'All' },
					{ label: __('Allowed'), value: 'allowed' },
					{ label: __('Denied'), value: 'denied' },
					{ label: __('Indeterminate'), value: 'indeterminate' }
				],
				default: 'All',
				change: () => {
					const stat = this.access_status_control.get_value() || 'All';
					if (stat === this.current_access_status) return;
					this.current_access_status = stat;
					this.trigger_auto_analysis();
				}
			},
			render_input: true
		});
		this.access_status_control.set_value('All');
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

	update_document_control: function (doctype, default_val) {
		const $docMount = this.page.main.find('.analyzer-input-wrapper.docname-wrapper');
		$docMount.empty();
		this.current_docname = default_val || null;

		if (doctype) {
			this.docname_control = frappe.ui.form.make_control({
				parent: $docMount,
				df: {
					fieldtype: 'Link',
					options: doctype,
					fieldname: 'analyzer_document_name',
					label: __('Document Name'),
					placeholder: __('Document Name (Optional)'),
					change: () => {
						const docname = (this.docname_control ? this.docname_control.get_value() || '' : '').trim() || null;
						this.update_link_btn_visibility(this.docname_control);
						if (docname === this.current_docname) return;
						this.current_docname = docname;
						this.trigger_auto_analysis();
					}
				},
				render_input: true
			});
			this.docname_control.$input.on('input change blur', () => {
				this.update_link_btn_visibility(this.docname_control);
			});
			this.docname_control.$wrapper.on('click', '.btn-clear', () => {
				setTimeout(() => {
					this.update_link_btn_visibility(this.docname_control);
					const docname = (this.docname_control ? this.docname_control.get_value() || '' : '').trim() || null;
					if (docname === this.current_docname) return;
					this.current_docname = docname;
					this.trigger_auto_analysis();
				}, 50);
			});

			if (default_val) {
				this.docname_control.set_value(default_val);
			}
			this.update_link_btn_visibility(this.docname_control);
		} else {
			this.docname_control = frappe.ui.form.make_control({
				parent: $docMount,
				df: {
					fieldtype: 'Data',
					fieldname: 'analyzer_document_name',
					label: __('Document Name'),
					placeholder: __('Select DocType first'),
					read_only: 1
				},
				render_input: true
			});
		}
	},

	setup_presets: function () {
		const $container = this.page.main.find('.preset-buttons');
		$container.empty();

		const presets = Array.from(new Set(['Administrator', frappe.session.user].filter(Boolean)));
		presets.forEach((u) => {
			const $btn = $(`<button class="preset-pill" type="button">${u}</button>`);
			$btn.on('click', () => {
				if (this.user_control) {
					const cur = (this.user_control.get_value() || '').trim() || null;
					if (cur === u) return;
					this.user_control.set_value(u);
				}
			});
			$container.append($btn);
		});
	},

	update_preset_active_state: function (activeUser) {
		const $pills = this.page.main.find('.preset-pill');
		$pills.removeClass('active');
		if (!activeUser) return;
		$pills.each(function () {
			if ($(this).text().trim() === activeUser) {
				$(this).addClass('active');
			}
		});
	},

	setup_actions: function () {
		this.page.set_primary_action(
			__('Analyze'),
			() => {
				this.run_analysis();
			},
			'refresh'
		);

		this.page.main.find('.btn-clear-analysis').on('click', () => {
			this.clear_all();
		});
	},

	trigger_auto_analysis: function () {
		const user = this.current_user;
		const doctype = this.current_doctype;
		if (user && doctype) {
			clearTimeout(this._analysis_timer);
			this._analysis_timer = setTimeout(() => {
				this.run_analysis();
			}, 300);
		} else {
			this.render_empty(__('Please select a User and DocType to begin access analysis.'));
			this.page.main.find('.analyzer-summary-row').hide();
		}
	},

	check_route_options: function () {
		let user = null;
		let doctype = null;
		let docname = null;

		if (frappe.route_options) {
			if (frappe.route_options.user) user = frappe.route_options.user;
			if (frappe.route_options.doctype) doctype = frappe.route_options.doctype;
			if (frappe.route_options.document_name) docname = frappe.route_options.document_name;
			frappe.route_options = null;
		}

		if (user && this.user_control) this.user_control.set_value(user);
		if (doctype && this.doctype_control) {
			this.doctype_control.set_value(doctype);
			this.current_doctype = doctype;
			this.update_document_control(doctype, docname);
		} else if (docname && this.docname_control) {
			this.docname_control.set_value(docname);
		}

		if (user && doctype) {
			setTimeout(() => {
				this.run_analysis();
			}, 300);
		}
	},

	run_analysis: function () {
		const user = this.current_user;
		const doctype = this.current_doctype;
		const docname = this.current_docname;
		const access_type = this.current_access_type || 'All';
		const access_status = this.current_access_status || 'All';

		if (!user || !doctype) {
			frappe.show_alert({
				message: __('Please select both a User and a DocType to analyze.'),
				indicator: 'orange'
			});
			return;
		}

		const $tableMount = this.page.main.find('.user-access-analyzer-table-mount');
		$tableMount.html('<div class="analyzer-skeleton-box"></div>');

		this.page.set_title(`${__('Access Analysis')}: ${user} (${doctype})`);

		frappe.call({
			method: 'ui_component.ui_component.page.user_access_analyzer.api.get_user_access_analysis',
			args: {
				user: user,
				doctype: doctype,
				document_name: docname,
				access_type: access_type,
				access_status: access_status,
				limit_start: 0,
				page_length: 50
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						this.render_results(r.message);
					} else {
						this.render_empty(__('No data returned for the selected analysis.'));
					}
				}, 600);
			},
			error: () => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="empty-state text-center text-danger">
							<div class="empty-title">${__('Error analyzing user access. Please verify parameters and permissions.')}</div>
						</div>
					`);
				}, 600);
			}
		});
	},

	render_results: function (data) {
		this.current_data = data;
		const $summaryRow = this.page.main.find('.analyzer-summary-row');
		const $badges = $summaryRow.find('.analyzer-meta-badges');
		$badges.empty();

		// Badge 1: User Type
		$badges.append(`<span class="badge-tag badge-tag-module">${data.user_type || 'User'}</span>`);

		// Badge 2: Desk Access
		if (data.has_desk_access) {
			$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${__('Desk Access')}</span>`);
		} else {
			$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${__('No Desk Access')}</span>`);
		}

		if (!data.enabled) {
			$badges.append(`<span class="badge-tag badge-tag-desk-no">${__('Disabled User')}</span>`);
		}

		// Summary Counts
		const s = data.summary || {};
		$badges.append(`<span class="badge-tag badge-tag-total">${s.analyzed || 0} ${__('Analyzed')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${s.accessible || 0} ${__('Accessible')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${s.inaccessible || 0} ${__('Inaccessible')}</span>`);
		if (s.indeterminate > 0) {
			$badges.append(`<span class="badge-tag badge-tag-indeterminate">? ${s.indeterminate} ${__('Indeterminate')}</span>`);
		}

		// DocType Meta
		const m = data.doctype_meta || {};
		if (m.module) {
			$badges.append(`<span class="badge-tag badge-tag-module">${__('Module')}: ${m.module}</span>`);
		}
		if (m.has_read_rule) {
			$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${__('Role Read Rule Active')}</span>`);
		} else {
			$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${__('No Role Read Rule')}</span>`);
		}
		if (m.has_delete_rule !== undefined) {
			if (m.has_delete_rule) {
				$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${__('Role Delete Rule Active')}</span>`);
			} else {
				$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${__('No Role Delete Rule')}</span>`);
			}
		}

		$summaryRow.show();

		const records = data.records || [];
		if (records.length === 0) {
			this.render_empty(data.message || __('No matching candidate records found for analysis.'));
			return;
		}

		this.render_table(records, data.doctype);
	},

	render_table: function (records, doctype) {
		const $tableMount = this.page.main.find('.user-access-analyzer-table-mount');
		$tableMount.empty();

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (!EasyTable) {
			$tableMount.html(`<div class="alert alert-warning m-3">${__('EasyTable library could not be loaded.')}</div>`);
			return;
		}

		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const formatBadge = (statusObj) => {
			const st = (typeof statusObj === 'string' ? statusObj : statusObj?.status || '').toLowerCase();
			if (st === 'allowed') {
				return {
					styles: {
						color: '#15803d',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (st === 'denied') {
				return {
					styles: {
						color: '#b91c1c',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (st === 'indeterminate') {
				return {
					styles: {
						color: '#b45309',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			}
			return {
				styles: {
					color: 'var(--text-muted, #94a3b8)',
					textAlign: 'center'
				}
			};
		};

		const columns = [
			{
				fieldname: 'name',
				label: __('Document Name'),
				fieldtype: 'Link',
				options: doctype,
				width: 190,
				freeze: true
			},
			{
				fieldname: 'list_status',
				label: __('List Visibility'),
				fieldtype: 'Data',
				width: 120,
				align: 'center',
				cell_decorator: { body: formatBadge }
			},
			{
				fieldname: 'read_status',
				label: __('Detail Read'),
				fieldtype: 'Data',
				width: 115,
				align: 'center',
				cell_decorator: { body: formatBadge }
			},
			{
				fieldname: 'write_status',
				label: __('Write'),
				fieldtype: 'Data',
				width: 100,
				align: 'center',
				cell_decorator: { body: formatBadge }
			},
			{
				fieldname: 'delete_status',
				label: __('Delete'),
				fieldtype: 'Data',
				width: 100,
				align: 'center',
				cell_decorator: { body: formatBadge }
			},
			{
				fieldname: 'owner',
				label: __('Owner'),
				fieldtype: 'Link',
				options: 'User',
				width: 160,
				cell_decorator: {
					body(v, row) {
						return {
							styles: {
								fontWeight: row?.is_owner ? '600' : 'normal',
								color: row?.is_owner ? '#166534' : 'inherit'
							}
						};
					}
				}
			},
			{
				fieldname: 'access_details',
				label: __('Diagnostic Reasoning'),
				fieldtype: 'Data',
				width: 320,
				cell_decorator: {
					body() {
						return {
							styles: {
								fontSize: '12px',
								color: 'var(--text-muted, #475569)'
							}
						};
					}
				}
			}
		];

		const tableData = records.map((r) => {
			return {
				name: r.name,
				list_status: r.list_visibility?.status === 'allowed' ? __('Allowed') : __('Denied'),
				read_status: r.detail_read_access?.status === 'allowed' ? __('Allowed') : (r.detail_read_access?.status === 'indeterminate' ? __('Indeterminate') : __('Denied')),
				write_status: r.write_access?.status === 'allowed' ? __('Allowed') : (r.write_access?.status === 'indeterminate' ? __('Indeterminate') : __('Denied')),
				delete_status: r.delete_access?.status === 'allowed' ? __('Allowed') : (r.delete_access?.status === 'indeterminate' ? __('Indeterminate') : __('Denied')),
				owner: r.owner || '',
				is_owner: r.is_owner,
				access_details: r.access_details || ''
			};
		});

		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: tableData,
			pagination: {
				enabled: true,
				pageSize: 50
			}
		});
	},

	render_empty: function (message) {
		const $tableMount = this.page.main.find('.user-access-analyzer-table-mount');
		$tableMount.html(`
			<div class="empty-state text-center text-muted">
				<div class="empty-icon">
					<img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state">
				</div>
				<div class="empty-title">${message || __('Nothing to show')}</div>
			</div>
		`);
	},

	clear_all: function () {
		if (this.user_control) {
			this.user_control.set_value('');
			this.update_link_btn_visibility(this.user_control);
		}
		if (this.doctype_control) {
			this.doctype_control.set_value('');
			this.update_link_btn_visibility(this.doctype_control);
		}
		this.current_user = null;
		this.current_doctype = null;
		this.update_document_control(null);
		if (this.access_type_control) this.access_type_control.set_value('All');
		if (this.access_status_control) this.access_status_control.set_value('All');

		this.current_data = null;
		this.page.set_title(__('User Access Analyzer'));
		this.update_preset_active_state(null);
		this.page.main.find('.analyzer-summary-row').hide();

		const $tableMount = this.page.main.find('.user-access-analyzer-table-mount');
		$tableMount.html(`
			<div class="empty-state-no-filter text-center text-muted">
				${__('Please select a User and DocType to begin access analysis.')}
			</div>
		`);
	}
});
