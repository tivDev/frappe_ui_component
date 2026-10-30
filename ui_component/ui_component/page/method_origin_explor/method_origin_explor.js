frappe.pages['method-origin-explor'].on_page_load = function (wrapper) {
	frappe.ui_component = frappe.ui_component || {};
	frappe.ui_component.method_origin_explor = new MethodOriginExplorer(wrapper);
};

class MethodOriginExplorer {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('Method Origin Explorer'),
			single_column: true
		});

		this.current_method = '';
		this.current_language = 'All';
		this.current_mode = 'definition';
		this.current_app = null;
		this.current_class = null;

		this.easy_table_instance = null;
		this.all_records = [];
		this.summary = null;

		this.make();
	}

	make() {
		const rendered_html = frappe.render_template('method_origin_explor', {});
		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_controls();
		this.setup_actions();
		this.check_route_options();
	}

	setup_controls() {
		const $methodMount = this.page.main.find('.explorer-input-wrapper.method-wrapper');
		const $langMount = this.page.main.find('.explorer-input-wrapper.language-wrapper');
		const $modeMount = this.page.main.find('.explorer-input-wrapper.mode-wrapper');
		const $appMount = this.page.main.find('.explorer-input-wrapper.app-wrapper');
		const $classMount = this.page.main.find('.explorer-input-wrapper.class-wrapper');

		// 1. Method / Function Name (Optional if Class / Object provided)
		this.method_control = frappe.ui.form.make_control({
			parent: $methodMount,
			df: {
				fieldtype: 'Data',
				fieldname: 'explorer_method',
				label: __('Method / Function'),
				placeholder: __('e.g. validate, get_context...'),
				reqd: 0,
				change: () => {
					this.current_method = (this.method_control.get_value() || '').trim();
				}
			},
			render_input: true
		});

		this.method_control.$input.on('keydown', (e) => {
			if (e.which === 13 || e.keyCode === 13) {
				e.preventDefault();
				this.execute_search();
			}
		});

		// 2. Language Select Control
		this.lang_control = frappe.ui.form.make_control({
			parent: $langMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'explorer_language',
				label: __('Language'),
				options: ['All', 'Python', 'JavaScript'],
				default: 'All',
				change: () => {
					this.current_language = this.lang_control.get_value() || 'All';
				}
			},
			render_input: true
		});
		this.lang_control.set_value('All');

		// 3. Search Mode Select Control
		this.mode_control = frappe.ui.form.make_control({
			parent: $modeMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'explorer_mode',
				label: __('Search Mode'),
				options: [
					{ label: __('Find Definition'), value: 'definition' },
					{ label: __('Find References'), value: 'references' },
					{ label: __('Both'), value: 'both' }
				],
				default: 'definition',
				change: () => {
					this.current_mode = this.mode_control.get_value() || 'definition';
				}
			},
			render_input: true
		});
		this.mode_control.set_value('definition');

		// 4. App Filter (Optional)
		const installedApps = (frappe.boot && frappe.boot.installed_apps) || [
			'frappe', 'erpnext', 'hrms', 'ditech_core', 'ui_component'
		];
		const appOptions = [{ label: __('All Apps'), value: '' }].concat(
			installedApps.map((a) => ({ label: a, value: a }))
		);

		this.app_control = frappe.ui.form.make_control({
			parent: $appMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'explorer_app',
				label: __('App'),
				options: appOptions,
				default: '',
				change: () => {
					this.current_app = (this.app_control.get_value() || '').trim() || null;
				}
			},
			render_input: true
		});
		this.app_control.set_value('');

		// 5. Class / Object Filter
		this.class_control = frappe.ui.form.make_control({
			parent: $classMount,
			df: {
				fieldtype: 'Data',
				fieldname: 'explorer_class',
				label: __('Class / Object'),
				placeholder: __('e.g. SalesInvoice, EasyTable...'),
				reqd: 0,
				change: () => {
					this.current_class = (this.class_control.get_value() || '').trim() || null;
				}
			},
			render_input: true
		});

		this.class_control.$input.on('keydown', (e) => {
			if (e.which === 13 || e.keyCode === 13) {
				e.preventDefault();
				this.execute_search();
			}
		});
	}

	setup_actions() {
		this.page.set_primary_action(
			__('Search'),
			() => {
				this.execute_search();
			},
			'search'
		);

		this.page.main.find('.btn-search-method').on('click', () => {
			this.execute_search();
		});

		this.page.main.find('.btn-reset').on('click', () => {
			this.clear_all();
		});
	}

	check_route_options() {
		if (frappe.route_options) {
			if (frappe.route_options.method && this.method_control) {
				this.method_control.set_value(frappe.route_options.method);
				this.current_method = frappe.route_options.method;
			}
			if ((frappe.route_options.class || frappe.route_options.class_name) && this.class_control) {
				const val = frappe.route_options.class || frappe.route_options.class_name;
				this.class_control.set_value(val);
				this.current_class = val;
			}
			if (frappe.route_options.language && this.lang_control) {
				this.lang_control.set_value(frappe.route_options.language);
				this.current_language = frappe.route_options.language;
			}
			if (frappe.route_options.search_mode && this.mode_control) {
				this.mode_control.set_value(frappe.route_options.search_mode);
				this.current_mode = frappe.route_options.search_mode;
			}
			frappe.route_options = null;

			if (this.current_method || this.current_class) {
				this.execute_search();
			}
		}
	}

	execute_search() {
		this.current_method = (this.method_control.get_value() || '').trim();
		this.current_class = (this.class_control.get_value() || '').trim() || null;

		if (!this.current_method && !this.current_class) {
			frappe.show_alert({
				message: __('Please enter a Method / Function name or a Class / Object name to search.'),
				indicator: 'orange'
			}, 4);
			this.method_control.$input.focus();
			return;
		}

		this.load_data();
	}

	load_data() {
		const $tableMount = this.page.main.find('.method-explorer-table-mount');
		$tableMount.html('<div class="explorer-skeleton-box"></div>');
		this.page.main.find('.explorer-summary-row').hide();

		frappe.call({
			method: 'ui_component.ui_component.page.method_origin_explor.api.search_method_origin',
			args: {
				method_name: this.current_method,
				language: this.current_language,
				search_mode: this.current_mode,
				app: this.current_app,
				class_name: this.current_class
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						const msg = r.message;
						this.all_records = msg.records || [];
						this.summary = msg.summary || {};

						this.render_summary();

						if (this.all_records.length === 0 || (this.all_records.length === 1 && this.all_records[0].indent === 0 && (!msg.summary.total_matches))) {
							this.render_empty(__('No definitions or references found for method "{0}".', [this.current_method]));
						} else {
							this.render_table(this.all_records);
						}
					} else {
						this.render_empty(__('No data returned for this method search.'));
					}
				}, 200);
			},
			error: () => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="explorer-empty-prompt text-center text-danger">
							<i class="fa fa-exclamation-triangle fa-2x mb-2 text-danger"></i>
							<div class="font-weight-bold">${__('Failed to search method origins. Please check permissions.')}</div>
						</div>
					`);
				}, 200);
			}
		});
	}

	render_summary() {
		if (!this.summary) return;
		const s = this.summary;
		const $summaryRow = this.page.main.find('.explorer-summary-row');
		const $badges = $summaryRow.find('.explorer-meta-badges');
		$badges.empty();

		$badges.append(`<span class="badge-tag badge-tag-total"><i class="fa fa-search mr-1"></i>${s.total_matches || 0} ${__('Matches')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-py"><i class="fa fa-terminal mr-1"></i>${s.total_python || 0} ${__('Python')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-js"><i class="fa fa-file-code-o mr-1"></i>${s.total_js || 0} ${__('JavaScript')}</span>`);

		if (s.total_definitions > 0) {
			$badges.append(`<span class="badge-tag badge-tag-orig"><i class="fa fa-bookmark mr-1"></i>${s.total_definitions} ${__('Original Defs')}</span>`);
		}
		if (s.total_overrides > 0) {
			$badges.append(`<span class="badge-tag badge-tag-override"><i class="fa fa-exchange mr-1"></i>${s.total_overrides} ${__('Overrides / Extensions')}</span>`);
		}
		if (s.total_references > 0) {
			$badges.append(`<span class="badge-tag badge-tag-refs"><i class="fa fa-crosshairs mr-1"></i>${s.total_references} ${__('References')}</span>`);
		}
		if (s.total_apps > 0) {
			$badges.append(`<span class="badge-tag badge-tag-app"><i class="fa fa-cubes mr-1"></i>${s.total_apps} ${__('Apps')}</span>`);
		}

		$summaryRow.show();
	}

	render_table(records) {
		const $tableMount = this.page.main.find('.method-explorer-table-mount');
		$tableMount.empty();

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (!EasyTable) {
			$tableMount.html(`
				<div class="explorer-empty-prompt text-center text-danger">
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
						fontSize: '13.5px'
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
						color: '#4338ca'
					}
				};
			} else if (indent === 3) {
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

		const formatImplTypeCell = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent < 4) return {};
			const text = String(val || '');
			if (text.includes('Override') || text.includes('Extension')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#be185d'
					}
				};
			} else if (text.includes('Original') || text.includes('Declaration') || text.includes('Definition')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#15803d'
					}
				};
			} else if (text.includes('Call') || text.includes('Import') || text.includes('Reference')) {
				return {
					styles: {
						fontWeight: '600',
						color: '#6d28d9'
					}
				};
			}
			return {};
		};

		const formatStatusCell = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent < 4) return {};
			const st = String(val || '').toLowerCase().trim();
			if (st === 'found') {
				return {
					styles: {
						color: '#15803d',
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

		// EasyTable puts the hierarchy indent and toggle on column index 1
		const columns = [
			{
				fieldname: 'node',
				label: __('Method / Section / File'),
				fieldtype: 'Data',
				width: 310,
				freeze: true,
				cell_decorator: { body: formatNodeCell }
			},
			{
				fieldname: 'language',
				label: __('Language'),
				fieldtype: 'Data',
				width: 105,
				align: 'center'
			},
			{
				fieldname: 'app',
				label: __('App'),
				fieldtype: 'Data',
				width: 125
			},
			{
				fieldname: 'class_name',
				label: __('Class / Object'),
				fieldtype: 'Data',
				width: 175
			},
			{
				fieldname: 'file_name',
				label: __('File Name'),
				fieldtype: 'Data',
				width: 175
			},
			{
				fieldname: 'file_path',
				label: __('File Path'),
				fieldtype: 'Data',
				width: 260
			},
			{
				fieldname: 'line_no',
				label: __('Line'),
				fieldtype: 'Int',
				width: 75,
				align: 'center'
			},
			{
				fieldname: 'impl_type',
				label: __('Implementation Type'),
				fieldtype: 'Data',
				width: 170,
				cell_decorator: { body: formatImplTypeCell }
			},
			{
				fieldname: 'parent_class',
				label: __('Parent Class'),
				fieldtype: 'Data',
				width: 150
			},
			{
				fieldname: 'registration',
				label: __('Registration / Signature'),
				fieldtype: 'Data',
				width: 220
			},
			{
				fieldname: 'status',
				label: __('Status'),
				fieldtype: 'Data',
				width: 95,
				align: 'center',
				cell_decorator: { body: formatStatusCell }
			}
		];

		const tableData = records.map((r) => {
			return {
				node: r.node || '',
				language: r.language || '',
				app: r.app || '',
				class_name: r.class_name || '',
				file_name: r.file_name || '',
				file_path: r.file_path || '',
				line_no: r.line_no || '',
				impl_type: r.impl_type || '',
				parent_class: r.parent_class || '',
				registration: r.registration || '',
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

	render_empty_prompt() {
		this.page.main.find('.explorer-summary-row').hide();
		const $tableMount = this.page.main.find('.method-explorer-table-mount');
		$tableMount.html(`
			<div class="explorer-empty-prompt text-center text-muted">
				<div class="empty-icon-wrapper mb-3">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted" style="opacity: 0.5;">
						<polyline points="16 18 22 12 16 6"></polyline>
						<polyline points="8 6 2 12 8 18"></polyline>
						<circle cx="12" cy="12" r="3"></circle>
					</svg>
				</div>
				<h5 class="text-dark font-weight-bold mb-1">${__('Search a Method, Function, or Class')}</h5>
				<p class="text-muted font-size-sm mb-0">
					${__('Enter a Method / Function name or a Class / Object name (e.g. validate, SalesInvoice, make_delivery_note) to inspect definitions, overrides, extensions, and references.')}
				</p>
			</div>
		`);
	}

	render_empty(message) {
		const $tableMount = this.page.main.find('.method-explorer-table-mount');
		$tableMount.html(`
			<div class="explorer-empty-prompt text-center text-muted">
				<i class="fa fa-search fa-3x mb-2 text-muted" style="opacity: 0.4;"></i>
				<div class="font-weight-bold">${message || __('No definitions or references found.')}</div>
			</div>
		`);
	}

	clear_all() {
		if (this.method_control) {
			this.method_control.set_value('');
		}
		if (this.lang_control) {
			this.lang_control.set_value('All');
		}
		if (this.mode_control) {
			this.mode_control.set_value('definition');
		}
		if (this.app_control) {
			this.app_control.set_value('');
		}
		if (this.class_control) {
			this.class_control.set_value('');
		}

		this.current_method = '';
		this.current_language = 'All';
		this.current_mode = 'definition';
		this.current_app = null;
		this.current_class = null;

		this.all_records = [];
		this.summary = null;

		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		this.render_empty_prompt();
	}
}

window.MethodOriginExplorer = MethodOriginExplorer;


window.MethodOriginExplorer = MethodOriginExplorer;