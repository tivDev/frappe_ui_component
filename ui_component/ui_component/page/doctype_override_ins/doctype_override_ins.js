frappe.pages['doctype-override-ins'].on_page_load = function (wrapper) {
	frappe.ui_component = frappe.ui_component || {};
	frappe.ui_component.doctype_override_ins = new DocTypeOverrideInspector(wrapper);
};

class DocTypeOverrideInspector {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('DocType Override Inspector'),
			single_column: true
		});

		this.current_doctype = null;
		this.easy_table_instance = null;
		this.all_records = [];
		this.summary = null;
		this._filter_timer = null;

		this.make();
	}

	make() {
		const rendered_html = frappe.render_template('doctype_override_ins', {});
		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_controls();
		this.setup_actions();
		this.check_route_options();
	}

	setup_controls() {
		const $doctypeMount = this.page.main.find('.override-input-wrapper.doctype-wrapper');

		// Mandatory DocType Link Control
		this.doctype_control = frappe.ui.form.make_control({
			parent: $doctypeMount,
			df: {
				fieldtype: 'Link',
				options: 'DocType',
				fieldname: 'inspector_doctype',
				label: __('Select DocType (Required)'),
				placeholder: __('Choose DocType to inspect...'),
				reqd: 1,
				get_query: () => {
					return {
						filters: {
							issingle: 0
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
	}

	update_link_btn_visibility(control) {
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
	}

	setup_actions() {
		this.page.set_primary_action(
			__('Refresh'),
			() => {
				if (!this.current_doctype) {
					frappe.msgprint({
						title: __('DocType Required'),
						message: __('Please select a DocType before refreshing.'),
						indicator: 'orange'
					});
					return;
				}
				this.load_data();
			},
			'refresh'
		);

		this.page.main.find('.btn-expand-all').on('click', () => {
			this.expand_all();
		});

		this.page.main.find('.btn-collapse-all').on('click', () => {
			this.collapse_all();
		});

		this.page.main.find('.btn-reset').on('click', () => {
			this.clear_all();
		});
	}

	check_route_options() {
		if (frappe.route_options && frappe.route_options.doctype && this.doctype_control) {
			this.doctype_control.set_value(frappe.route_options.doctype);
			this.current_doctype = frappe.route_options.doctype;
			frappe.route_options = null;
			this.load_data();
		}
	}

	trigger_auto_reload() {
		clearTimeout(this._filter_timer);
		this._filter_timer = setTimeout(() => {
			this.load_data();
		}, 300);
	}

	load_data() {
		if (!this.current_doctype) {
			this.render_empty_no_filter();
			return;
		}

		const $tableMount = this.page.main.find('.doctype-override-table-mount');
		$tableMount.html('<div class="override-skeleton-box"></div>');
		this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		this.page.main.find('.override-summary-row').hide();

		frappe.call({
			method: 'ui_component.ui_component.page.doctype_override_ins.api.get_doctype_override_data',
			args: {
				doctype: this.current_doctype
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						const msg = r.message;
						this.all_records = msg.records || [];
						this.summary = msg.summary || {};

						this.render_summary();

						if (this.all_records.length === 0) {
							this.render_empty(__('No implementation records found for DocType {0}.', [this.current_doctype]));
						} else {
							this.render_table(this.all_records);
							this.page.main.find('.btn-expand-all, .btn-collapse-all').show();
						}
					} else {
						this.render_empty(__('No data returned for this DocType.'));
					}
				}, 200);
			},
			error: (err) => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="override-empty-prompt text-center text-danger">
							<i class="fa fa-exclamation-triangle fa-2x mb-2 text-danger"></i>
							<div class="font-weight-bold">${__('Failed to inspect DocType implementations.')}</div>
						</div>
					`);
				}, 200);
			}
		});
	}

	render_summary() {
		if (!this.summary) return;
		const s = this.summary;
		const $summaryRow = this.page.main.find('.override-summary-row');
		const $badges = $summaryRow.find('.override-meta-badges');
		$badges.empty();

		$badges.append(`<span class="badge-tag badge-tag-total"><i class="fa fa-cubes mr-1"></i>${s.total_implementations || 0} ${__('Implementations')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-js"><i class="fa fa-file-code-o mr-1"></i>${s.total_js || 0} ${__('JavaScript')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-py"><i class="fa fa-terminal mr-1"></i>${s.total_python || 0} ${__('Python')}</span>`);

		if (s.total_overrides > 0) {
			$badges.append(`<span class="badge-tag badge-tag-override"><i class="fa fa-exchange mr-1"></i>${s.total_overrides} ${__('Overrides')}</span>`);
		}
		if (s.total_events > 0) {
			$badges.append(`<span class="badge-tag badge-tag-events"><i class="fa fa-bolt mr-1"></i>${s.total_events} ${__('Doc Events')}</span>`);
		}
		if (s.total_custom_scripts > 0) {
			$badges.append(`<span class="badge-tag badge-tag-scripts"><i class="fa fa-code mr-1"></i>${s.total_custom_scripts} ${__('Custom Scripts')}</span>`);
		}
		if (s.module) {
			$badges.append(`<span class="badge-tag badge-tag-module"><i class="fa fa-folder-open-o mr-1"></i>${__('Module')}: ${s.module} (${s.module_app || 'frappe'})</span>`);
		}

		$summaryRow.show();
	}

	render_table(records) {
		const $tableMount = this.page.main.find('.doctype-override-table-mount');
		$tableMount.empty();

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (!EasyTable) {
			$tableMount.html(`
				<div class="override-empty-prompt text-center text-danger">
					<div>${__('EasyTable component is not available.')}</div>
				</div>
			`);
			return;
		}

		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const formatNodeCell = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent === 0) {
				return {
					styles: {
						fontWeight: '700',
						color: '#0f172a',
						fontSize: '13px'
					}
				};
			} else if (indent === 1) {
				return {
					styles: {
						fontWeight: '700',
						color: '#1e3a8a'
					}
				};
			} else if (indent === 2) {
				return {
					styles: {
						fontWeight: '600',
						color: '#334155'
					}
				};
			}
			return {
				styles: {
					fontWeight: '500',
					fontFamily: 'monospace',
					color: '#0f172a'
				}
			};
		};

		const formatStatusCell = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent < 3) return {};
			const st = String(val || '').toLowerCase().trim();
			if (st === 'found' || st === 'active') {
				return {
					styles: {
						color: '#15803d',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (st === 'missing' || st === 'disabled') {
				return {
					styles: {
						color: '#b91c1c',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (st === 'unresolved') {
				return {
					styles: {
						color: '#b45309',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			}
			return {};
		};

		const formatImplTypeCell = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent < 3) return {};
			const text = String(val || '');
			if (text.includes('Override')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#be185d'
					}
				};
			} else if (text.includes('Event')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#6d28d9'
					}
				};
			} else if (text.includes('Original')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#0369a1'
					}
				};
			} else if (text.includes('Script')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#15803d'
					}
				};
			}
			return {};
		};

		// EasyTable puts the hierarchy indent and toggle on column index 1
		const columns = [
			{
				fieldname: 'node',
				label: __('DocType / Section / File'),
				fieldtype: 'Data',
				width: 300,
				freeze: true,
				cell_decorator: { body: formatNodeCell }
			},
			{
				fieldname: 'language',
				label: __('Language'),
				fieldtype: 'Data',
				width: 110,
				align: 'center'
			},
			{
				fieldname: 'app',
				label: __('App'),
				fieldtype: 'Data',
				width: 130
			},
			{
				fieldname: 'file_name',
				label: __('File Name'),
				fieldtype: 'Data',
				width: 200
			},
			{
				fieldname: 'file_path',
				label: __('File Path'),
				fieldtype: 'Data',
				width: 250
			},
			{
				fieldname: 'impl_type',
				label: __('Implementation Type'),
				fieldtype: 'Data',
				width: 170,
				cell_decorator: { body: formatImplTypeCell }
			},
			{
				fieldname: 'registration',
				label: __('Registration'),
				fieldtype: 'Data',
				width: 180
			},
			{
				fieldname: 'event',
				label: __('Event / View'),
				fieldtype: 'Data',
				width: 140
			},
			{
				fieldname: 'handler',
				label: __('Handler / Class'),
				fieldtype: 'Data',
				width: 240
			},
			{
				fieldname: 'status',
				label: __('Status'),
				fieldtype: 'Data',
				width: 100,
				align: 'center',
				cell_decorator: { body: formatStatusCell }
			}
		];

		const tableData = records.map((r) => {
			return {
				node: r.node || '',
				doctype: r.doctype || '',
				language: r.language || '',
				app: r.app || '',
				file_name: r.file_name || '',
				file_path: r.file_path || '',
				impl_type: r.impl_type || '',
				registration: r.registration || '',
				event: r.event || '',
				handler: r.handler || '',
				status: r.status || '',
				indent: r.indent
			};
		});

		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: tableData,
			options: {
				hierarchy: {
					enabled: true,
					initialState: 'expanded'
				},
				layout: {
					striped: true,
					bordered: true,
					hover: true,
					dense: false
				},
				pagination: {
					enabled: false
				}
			}
		});
	}

	expand_all() {
		if (!this.easy_table_instance) return;
		this.page.main.find('.easy-table-toggle[aria-expanded="false"]').each(function () {
			$(this).trigger('click');
		});
	}

	collapse_all() {
		if (!this.easy_table_instance) return;
		$(this.page.main.find('.easy-table-toggle[aria-expanded="true"]').get().reverse()).each(function () {
			$(this).trigger('click');
		});
	}

	render_empty_no_filter() {
		this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		this.page.main.find('.override-summary-row').hide();
		const $tableMount = this.page.main.find('.doctype-override-table-mount');
		$tableMount.html(`
			<div class="override-empty-prompt text-center text-muted">
				<div class="empty-icon-wrapper mb-3">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted" style="opacity: 0.5;">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
						<polyline points="14 2 14 8 20 8"></polyline>
						<line x1="16" y1="13" x2="8" y2="13"></line>
						<line x1="16" y1="17" x2="8" y2="17"></line>
						<polyline points="10 9 9 9 8 9"></polyline>
					</svg>
				</div>
				<h5 class="text-dark font-weight-bold mb-1">${__('Select a DocType to Inspect')}</h5>
				<p class="text-muted font-size-sm mb-0">
					${__('Choose any DocType above to discover its original files, controller overrides, hook scripts, document events, and server scripts.')}
				</p>
			</div>
		`);
	}

	render_empty(message) {
		this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		const $tableMount = this.page.main.find('.doctype-override-table-mount');
		$tableMount.html(`
			<div class="override-empty-prompt text-center text-muted">
				<i class="fa fa-folder-open-o fa-3x mb-2 text-muted" style="opacity: 0.4;"></i>
				<div class="font-weight-bold">${message || __('No implementation records found.')}</div>
			</div>
		`);
	}

	clear_all() {
		if (this.doctype_control) {
			this.doctype_control.set_value('');
			this.update_link_btn_visibility(this.doctype_control);
		}
		this.current_doctype = null;
		this.all_records = [];
		this.summary = null;
		this.render_empty_no_filter();
	}
}

window.DocTypeOverrideInspector = DocTypeOverrideInspector;


window.DocTypeOverrideInspector = DocTypeOverrideInspector;