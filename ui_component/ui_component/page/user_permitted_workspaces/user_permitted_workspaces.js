frappe.pages['user-permitted-workspaces'].on_page_load = function (wrapper) {
	new user_permitted_workspaces(wrapper);
};

let user_permitted_workspaces = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('User Permitted Workspaces'),
			single_column: true
		});

		this.current_user = frappe.session.user;
		this.current_workspace = null;
		this.current_show_details = 0;
		this.current_preset = 'permitted'; // 'permitted' | 'denied'
		this.search_query = '';
		this.data = null;
		this.easy_table_instance = null;

		this.make();
	},

	make: function () {
		// Ensure Awesomplete dropdowns overlay correctly
		frappe.dom.set_style(`
			.user-permitted-workspaces-container .awesomplete > [role=listbox],
			.workspaces-input-wrapper .awesomplete > [role=listbox],
			.awesomplete > [role=listbox] {
				z-index: 12 !important;
			}
		`);

		// Render template HTML
		let rendered_html = frappe.render_template('user_permitted_workspaces', {});
		$(rendered_html).appendTo(this.page.main);

		// Hide standard page form header
		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_controls();
		this.setup_presets();
		this.setup_actions();
		this.check_route_options();
		this.load_data();
	},

	setup_controls: function () {
		const self = this;
		const $userMount = this.page.main.find('#userFieldMount');
		const $wsMount = this.page.main.find('#workspaceFieldMount');
		const $detailsMount = this.page.main.find('#showDetailsFieldMount');

		// 1. User Link Field
		$userMount.empty();
		this.user_control = frappe.ui.form.make_control({
			parent: $userMount,
			df: {
				fieldtype: 'Link',
				fieldname: 'user',
				label: __('User'),
				options: 'User',
				default: this.current_user,
				placeholder: __('Select User...'),
				reqd: 1,
				change: () => {
					const val = (this.user_control.get_value() || '').trim();
					this.update_link_btn_visibility(this.user_control);
					if (val === this.current_user) return;
					this.current_user = val || frappe.session.user;
					this.load_data();
				}
			},
			only_input: true,
			with_link_btn: true,
			render_input: true
		});

		if (this.user_control && this.user_control.$wrapper) {
			this.user_control.$wrapper.removeClass('col-md-2');
			this.ensure_link_btn(this.user_control);
			this.user_control.$wrapper.on('click', '.btn-clear', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.user_control.set_value('');
				setTimeout(() => {
					this.update_link_btn_visibility(this.user_control);
					const val = (this.user_control.get_value() || '').trim();
					if (val === this.current_user) return;
					this.current_user = val || frappe.session.user;
					this.load_data();
				}, 50);
			});
		}
		if (this.user_control && this.user_control.$input) {
			this.user_control.$input.on('input change blur', () => {
				this.update_link_btn_visibility(this.user_control);
			});
		}
		if (this.current_user) {
			this.user_control.set_value(this.current_user);
		}
		this.update_link_btn_visibility(this.user_control);

		// 2. Workspace Name Link Field
		$wsMount.empty();
		this.workspace_control = frappe.ui.form.make_control({
			parent: $wsMount,
			df: {
				fieldtype: 'Link',
				fieldname: 'workspace_name',
				label: __('Workspace'),
				options: 'Workspace',
				placeholder: __('All Workspaces (Optional)'),
				change: () => {
					const val = (this.workspace_control.get_value() || '').trim();
					this.update_link_btn_visibility(this.workspace_control);
					if (val === (this.current_workspace || '')) return;
					this.current_workspace = val || null;
					this.load_data();
				}
			},
			only_input: true,
			with_link_btn: true,
			render_input: true
		});

		if (this.workspace_control && this.workspace_control.$wrapper) {
			this.workspace_control.$wrapper.removeClass('col-md-2');
			this.ensure_link_btn(this.workspace_control);
			this.workspace_control.$wrapper.on('click', '.btn-clear', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.workspace_control.set_value('');
				setTimeout(() => {
					this.update_link_btn_visibility(this.workspace_control);
					const val = (this.workspace_control.get_value() || '').trim();
					if (val === (this.current_workspace || '')) return;
					this.current_workspace = val || null;
					this.load_data();
				}, 50);
			});
		}
		if (this.workspace_control && this.workspace_control.$input) {
			this.workspace_control.$input.on('input change blur', () => {
				this.update_link_btn_visibility(this.workspace_control);
			});
		}
		if (this.current_workspace) {
			this.workspace_control.set_value(this.current_workspace);
		}
		this.update_link_btn_visibility(this.workspace_control);

		// 3. Show Details Checkbox Field
		$detailsMount.empty();
		this.show_details_control = frappe.ui.form.make_control({
			parent: $detailsMount,
			df: {
				fieldtype: 'Check',
				fieldname: 'show_details',
				label: __('Show Details'),
				default: 0,
				change: () => {
					const val = this.show_details_control.get_value() ? 1 : 0;
					if (val === this.current_show_details) return;
					this.current_show_details = val;
					this.load_data();
				}
			},
			render_input: true
		});

		if (this.show_details_control && this.show_details_control.$wrapper) {
			this.show_details_control.$wrapper.removeClass('col-md-2');
		}
	},

	ensure_link_btn: function (control) {
		if (!control || !control.$wrapper) return;
		const $linkField = control.$wrapper.find('.link-field');
		if ($linkField.length && $linkField.find('.link-btn').length === 0) {
			const $linkBtn = $(`
				<span class="link-btn">
					<a class="btn-clear no-decoration" title="${__("Clear")}">
						${frappe.utils.icon("close", "xs")}
					</a>
					<a class="btn-open no-decoration" title="${__("Open Link")}">
						${frappe.utils.icon("arrow-right", "xs")}
					</a>
				</span>
			`);
			$linkBtn.appendTo($linkField);
		}
	},

	update_link_btn_visibility: function (control) {
		if (!control || !control.$wrapper) return;
		this.ensure_link_btn(control);
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
		this.page.main.find('.btn-preset').on('click', function () {
			const preset = $(this).data('preset');
			if (preset === self.current_preset) return;

			self.current_preset = preset;
			self.page.main.find('.btn-preset').removeClass('active');
			$(this).addClass('active');

			self.load_data();
		});
	},

	setup_actions: function () {
		const self = this;

		// Expand All button
		this.page.main.find('.btn-expand-all').on('click', () => {
			this.expand_all();
		});

		// Collapse All button
		this.page.main.find('.btn-collapse-all').on('click', () => {
			this.collapse_all();
		});

		// Refresh button
		this.page.main.find('.btn-refresh-workspaces').on('click', () => {
			this.load_data();
		});

		// Reset filters button
		this.page.main.find('.btn-reset-filters').on('click', () => {
			this.current_user = frappe.session.user;
			this.current_workspace = null;
			this.current_show_details = 0;
			this.current_preset = 'permitted';
			this.search_query = '';

			this.page.main.find('.workspaces-search-input').val('');
			this.page.main.find('.btn-preset').removeClass('active');
			this.page.main.find('.btn-preset[data-preset="permitted"]').addClass('active');

			if (this.user_control) {
				this.user_control.set_value(frappe.session.user);
				this.update_link_btn_visibility(this.user_control);
			}
			if (this.workspace_control) {
				this.workspace_control.set_value('');
				this.update_link_btn_visibility(this.workspace_control);
			}
			if (this.show_details_control) this.show_details_control.set_value(0);

			this.load_data();
		});

		// Live Search Input with debounce
		let search_timer = null;
		this.page.main.find('.workspaces-search-input').on('input', function () {
			clearTimeout(search_timer);
			const query = ($(this).val() || '').trim().toLowerCase();
			search_timer = setTimeout(() => {
				self.search_query = query;
				self.render_view();
			}, 200);
		});
	},

	expand_all: function () {
		if (this.easy_table_instance) {
			if (typeof this.easy_table_instance.expandAll === 'function') {
				this.easy_table_instance.expandAll();
			} else {
				this.page.main.find('.easy-table-toggle[aria-expanded="false"]').each(function () {
					$(this).trigger('click');
				});
			}
		} else {
			this.page.main.find('.tree-row-child').show();
			this.page.main.find('.fallback-toggle i').removeClass('fa-chevron-right').addClass('fa-chevron-down');
		}
	},

	collapse_all: function () {
		if (this.easy_table_instance) {
			if (typeof this.easy_table_instance.collapseAll === 'function') {
				this.easy_table_instance.collapseAll();
			} else {
				this.page.main.find('.easy-table-toggle[aria-expanded="true"]').each(function () {
					$(this).trigger('click');
				});
			}
		} else {
			this.page.main.find('.tree-row-child').hide();
			this.page.main.find('.fallback-toggle i').removeClass('fa-chevron-down').addClass('fa-chevron-right');
		}
	},

	check_route_options: function () {
		const route_options = frappe.route_options || {};
		let should_update = false;

		if (route_options.user && route_options.user !== this.current_user) {
			this.current_user = route_options.user;
			if (this.user_control) {
				this.user_control.set_value(this.current_user);
				this.update_link_btn_visibility(this.user_control);
			}
			should_update = true;
		}

		if (route_options.workspace_name) {
			this.current_workspace = route_options.workspace_name;
			if (this.workspace_control) {
				this.workspace_control.set_value(this.current_workspace);
				this.update_link_btn_visibility(this.workspace_control);
			}
			should_update = true;
		}

		if (route_options.show_details !== undefined) {
			this.current_show_details = route_options.show_details ? 1 : 0;
			if (this.show_details_control) this.show_details_control.set_value(this.current_show_details);
			should_update = true;
		}

		frappe.route_options = null;
	},

	load_data: function () {
		const $mount = this.page.main.find('.workspaces-table-mount');
		$mount.html(`
			<div class="workspaces-empty-state text-center text-muted">
				<div class="spinner-border spinner-border-sm text-primary mb-2" role="status"></div>
				<div>${__('Loading workspace permissions for')} <strong>${frappe.utils.escape_html(this.current_user)}</strong>...</div>
			</div>
		`);

		const api_status = this.current_preset === 'denied' ? 'Denied' : 'Permitted';

		frappe.call({
			method: 'ui_component.ui_component.page.user_permitted_workspaces.api.get_user_permitted_workspaces',
			args: {
				user: this.current_user,
				workspace_name: this.current_workspace,
				show_details: this.current_show_details,
				status: api_status
			},
			freeze: false,
			callback: (r) => {
				if (r.exc) {
					$mount.html(`
						<div class="alert alert-danger mx-3 my-3">
							<i class="fa fa-exclamation-triangle mr-2"></i> ${__('Failed to evaluate permissions.')}
						</div>
					`);
					return;
				}

				this.data = r.message;
				this.update_summary_badges();
				this.render_view();
			},
			error: (err) => {
				$mount.html(`
					<div class="alert alert-danger mx-3 my-3">
						<i class="fa fa-exclamation-triangle mr-2"></i> ${__('Failed to load workspace permissions.')}
					</div>
				`);
			}
		});
	},

	update_summary_badges: function () {
		if (!this.data) return;
		const summary = this.data.summary || {};
		const $summaryRow = this.page.main.find('.workspaces-summary-row');
		const $badges = this.page.main.find('.workspaces-meta-badges');

		let badges_html = `
			<span class="summary-badge badge-user">
				<i class="fa fa-user"></i>
				<span>${frappe.utils.escape_html(this.data.user_name || this.data.user)}</span>
				${this.data.is_admin ? '<span class="badge badge-primary ml-1">Admin</span>' : ''}
				${this.data.is_workspace_manager && !this.data.is_admin ? '<span class="badge badge-info ml-1">Workspace Manager</span>' : ''}
			</span>
			<span class="summary-badge">
				${__('Total Workspaces:')} <strong>${summary.total_workspaces || 0}</strong>
			</span>
			<span class="summary-badge badge-permitted">
				<span class="legend-dot dot-permitted"></span>
				${__('Permitted:')} <strong>${summary.permitted_workspaces || 0}</strong>
			</span>
			<span class="summary-badge badge-denied">
				<span class="legend-dot dot-denied"></span>
				${__('Denied:')} <strong>${summary.denied_workspaces || 0}</strong>
			</span>
		`;

		if (this.current_show_details) {
			badges_html += `
				<span class="summary-badge badge-items">
					<i class="fa fa-cubes"></i>
					${__('Total Items:')} <strong>${summary.total_items || 0}</strong>
					(${summary.permitted_items || 0} ${__('permitted')}, ${summary.denied_items || 0} ${__('denied')})
				</span>
			`;
		}

		$badges.html(badges_html);
		$summaryRow.show();
	},

	get_filtered_records: function () {
		if (!this.data) return [];

		if (this.current_show_details) {
			const all_items = this.data.detailed_items || this.data.records || [];
			const preset = this.current_preset;
			const q = (this.search_query || '').trim().toLowerCase();

			// When a live search query is entered, match rows and keep their tree hierarchy
			if (q) {
				const matched_workspaces = new Set();
				const matched_sections = new Set();
				const matched_indices = new Set();

				all_items.forEach((it, idx) => {
					const indent = Number(it.indent) || 0;
					let match_preset = true;
					if (preset === 'permitted') match_preset = it.workspace_permitted;
					else if (preset === 'denied') match_preset = !it.workspace_permitted;

					const match_text = (
						(it.workspace_title || '').toLowerCase().includes(q) ||
						(it.workspace || '').toLowerCase().includes(q) ||
						(it.section || '').toLowerCase().includes(q) ||
						(it.label || '').toLowerCase().includes(q) ||
						(it.node || '').toLowerCase().includes(q) ||
						(it.target || '').toLowerCase().includes(q) ||
						(it.target_type || '').toLowerCase().includes(q) ||
						(it.reason || '').toLowerCase().includes(q)
					);

					if (match_preset && match_text) {
						matched_indices.add(idx);
						if (it.workspace) matched_workspaces.add(it.workspace);
						if (it.section) matched_sections.add(it.workspace + '::' + it.section);
					}
				});

				return all_items.filter((it, idx) => {
					const indent = Number(it.indent) || 0;
					if (indent === 0) {
						return matched_workspaces.has(it.workspace);
					} else if (indent === 1) {
						return matched_sections.has(it.workspace + '::' + it.section);
					} else {
						return matched_indices.has(idx);
					}
				});
			}

			// Without text search: display all permitted or denied workspaces and ALL their internal items
			return all_items.filter((it) => {
				if (preset === 'permitted') return it.workspace_permitted;
				if (preset === 'denied') return !it.workspace_permitted;
				return true;
			});
		} else {
			let workspaces = this.data.workspaces || [];

			// Preset filtering
			if (this.current_preset === 'permitted') {
				workspaces = workspaces.filter(ws => ws.is_permitted);
			} else if (this.current_preset === 'denied') {
				workspaces = workspaces.filter(ws => !ws.is_permitted);
			}

			// Text search filtering
			if (this.search_query) {
				const q = this.search_query;
				workspaces = workspaces.filter(ws => {
					return (
						(ws.title || '').toLowerCase().includes(q) ||
						(ws.name || '').toLowerCase().includes(q) ||
						(ws.module || '').toLowerCase().includes(q) ||
						(ws.permission_reason || '').toLowerCase().includes(q)
					);
				});
			}

			return workspaces;
		}
	},

	render_view: function () {
		const $mount = this.page.main.find('.workspaces-table-mount');

		// Toggle Expand / Collapse All buttons visibility
		if (this.current_show_details) {
			this.page.main.find('.btn-expand-all, .btn-collapse-all').show();
		} else {
			this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		}

		// Cleanup existing EasyTable instance
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try {
				this.easy_table_instance.destroy();
			} catch (e) {
				console.warn(e);
			}
			this.easy_table_instance = null;
		}
		$mount.empty();

		const records = this.get_filtered_records();

		if (!records || records.length === 0) {
			$mount.html(`
				<div class="workspaces-empty-state text-center text-muted">
					<i class="fa fa-folder-open-o fa-2x mb-2 text-muted"></i>
					<div class="font-weight-bold">${__('No matching workspaces or items found.')}</div>
					<div class="text-muted small mt-1">${__('Try clearing filters or switching search criteria.')}</div>
				</div>
			`);
			return;
		}

		if (this.current_show_details) {
			this.render_detailed_items_view($mount, records);
		} else {
			this.render_workspaces_view($mount, records);
		}
	},

	render_workspaces_view: function ($mount, records) {
		const self = this;
		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;

		// Check if EasyTable is available
		if (EasyTable && typeof EasyTable === 'function') {
			const columns = [
				{
					fieldname: 'title_html',
					label: __('Workspace Title'),
					fieldtype: 'HTML',
					width: 250,
					freeze: true,
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.title || row.name || '') : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'permission_status_html',
					label: __('Status'),
					fieldtype: 'HTML',
					width: 120,
					align: 'center',
					cell_decorator: {
						body: (val, row) => {
							const text = row && row.is_permitted ? 'Permitted' : 'Denied';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'module_html',
					label: __('Module'),
					fieldtype: 'HTML',
					width: 140,
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.module || '') : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'scope_html',
					label: __('Scope'),
					fieldtype: 'HTML',
					width: 110,
					cell_decorator: {
						body: (val, row) => {
							const text = row && row.public ? 'Public' : 'Private';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'items_summary_html',
					label: __('Items Accessible'),
					fieldtype: 'HTML',
					width: 180,
					cell_decorator: {
						body: (val, row) => {
							const total = row ? (row.total_items || 0) : 0;
							const perm = row ? (row.permitted_items || 0) : 0;
							const pct = total > 0 ? Math.round((perm / total) * 100) : 0;
							return {
								attributes: {
									title: `${perm}/${total} (${pct}%)`,
									'data-value': `${perm}/${total}`
								}
							};
						}
					}
				},
				{
					fieldname: 'reason_html',
					label: __('Access Evaluation Reason'),
					fieldtype: 'HTML',
					width: 320,
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.permission_reason || '') : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				}
			];

			const table_data = records.map(row => {
				const is_perm = row.is_permitted;
				const status_badge = is_perm
					? `<span class="status-pill status-permitted"><i class="fa fa-check-circle"></i> Permitted</span>`
					: `<span class="status-pill status-denied"><i class="fa fa-times-circle"></i> Denied</span>`;

				const route = `/app/${frappe.router.slug(row.name)}`;
				const title_html = `
					<div class="font-weight-bold">
						<a href="${route}" class="text-dark" target="_blank" title="${__('Open Workspace')}">
							<i class="fa fa-${row.icon || 'folder'} mr-1 text-muted"></i>
							${frappe.utils.escape_html(row.title)}
						</a>
					</div>
				`;

				const module_html = row.module
					? `<span class="badge badge-light border text-muted">${frappe.utils.escape_html(row.module)}</span>`
					: `<span class="text-muted small">—</span>`;

				const scope_html = row.public
					? `<span class="type-pill">${__('Public')}</span>`
					: `<span class="type-pill text-warning">${__('Private')}</span>`;

				const total = row.total_items || 0;
				const perm = row.permitted_items || 0;
				const pct = total > 0 ? Math.round((perm / total) * 100) : 0;
				const items_summary_html = `
					<div class="items-mini-progress">
						<div class="items-progress-bar-bg" title="${perm}/${total} (${pct}%)">
							<div class="items-progress-bar-fill" style="width: ${pct}%;"></div>
						</div>
						<span class="small font-weight-bold">${perm}/${total}</span>
					</div>
				`;

				const text_color = is_perm ? 'text-success' : 'text-danger';
				const reason_html = `<span class="${text_color} small"><i class="fa ${is_perm ? 'fa-check' : 'fa-info-circle'} mr-1"></i>${frappe.utils.escape_html(row.permission_reason || '')}</span>`;

				return {
					name: row.name,
					title_html: title_html,
					permission_status_html: status_badge,
					module_html: module_html,
					scope_html: scope_html,
					items_summary_html: items_summary_html,
					reason_html: reason_html,
					is_permitted: is_perm,
					title: row.title,
					module: row.module,
					public: row.public,
					permitted_items: perm,
					total_items: total,
					permission_reason: row.permission_reason
				};
			});

			const tableMountEl = $mount[0];
			this.easy_table_instance = new EasyTable({
				parent: tableMountEl,
				columns: columns,
				data: table_data,
				pagination: {
					enabled: true,
					pageSize: 25
				}
			});

			const applyAttrs = () => {
				self.update_workspaces_cell_attributes($mount, table_data);
			};

			if (this.easy_table_instance.bus) {
				this.easy_table_instance.bus.on('table:render', applyAttrs);
				this.easy_table_instance.bus.on('table:render-body', applyAttrs);
				this.easy_table_instance.bus.on('pagination:page-change', applyAttrs);
			}

			applyAttrs();
			setTimeout(applyAttrs, 50);
		} else {
			// Fallback Standard HTML Table
			let table_html = `
				<div class="workspaces-fallback-table-wrapper">
					<table class="table workspaces-fallback-table">
						<thead>
							<tr>
								<th>${__('Workspace')}</th>
								<th style="width: 120px; text-align: center;">${__('Status')}</th>
								<th>${__('Module')}</th>
								<th>${__('Scope')}</th>
								<th style="width: 160px;">${__('Items Accessible')}</th>
								<th>${__('Access Reason')}</th>
							</tr>
						</thead>
						<tbody>
			`;

			records.forEach(row => {
				const is_perm = row.is_permitted;
				const status_badge = is_perm
					? `<span class="status-pill status-permitted"><i class="fa fa-check-circle"></i> Permitted</span>`
					: `<span class="status-pill status-denied"><i class="fa fa-times-circle"></i> Denied</span>`;

				const scope_badge = row.public
					? `<span class="type-pill">${__('Public')}</span>`
					: `<span class="type-pill text-warning">${__('Private')}</span>`;

				const total = row.total_items || 0;
				const perm = row.permitted_items || 0;
				const pct = total > 0 ? Math.round((perm / total) * 100) : 0;
				const progress_html = `
					<div class="items-mini-progress">
						<div class="items-progress-bar-bg" title="${perm}/${total} (${pct}%)">
							<div class="items-progress-bar-fill" style="width: ${pct}%;"></div>
						</div>
						<span class="small font-weight-bold">${perm}/${total}</span>
					</div>
				`;

				const reason_color = is_perm ? 'text-success' : 'text-danger';
				const route = `/app/${frappe.router.slug(row.name)}`;
				const titleText = frappe.utils.escape_html(row.title || row.name || '');
				const statusText = is_perm ? 'Permitted' : 'Denied';
				const moduleText = frappe.utils.escape_html(row.module || '');
				const scopeText = row.public ? 'Public' : 'Private';
				const itemsText = `${perm}/${total}`;
				const reasonText = frappe.utils.escape_html(row.permission_reason || '');

				table_html += `
					<tr class="${is_perm ? '' : 'row-denied'}">
						<td title="${titleText}" data-value="${titleText}">
							<div class="font-weight-bold">
								<a href="${route}" class="text-dark" target="_blank">
									<i class="fa fa-${row.icon || 'folder'} mr-1 text-muted"></i>
									${titleText}
								</a>
							</div>
						</td>
						<td style="text-align: center;" title="${statusText}" data-value="${statusText}">${status_badge}</td>
						<td title="${moduleText}" data-value="${moduleText}">${row.module ? `<span class="badge badge-light border">${moduleText}</span>` : '<span class="text-muted">—</span>'}</td>
						<td title="${scopeText}" data-value="${scopeText}">${scope_badge}</td>
						<td title="${itemsText} (${pct}%)" data-value="${itemsText}">${progress_html}</td>
						<td title="${reasonText}" data-value="${reasonText}"><span class="${reason_color} small"><i class="fa ${is_perm ? 'fa-check' : 'fa-info-circle'} mr-1"></i>${reasonText}</span></td>
					</tr>
				`;
			});

			table_html += `</tbody></table></div>`;
			$mount.html(table_html);
		}
	},

	update_workspaces_cell_attributes: function ($mount, table_data) {
		if (!$mount || !table_data || !table_data.length) return;

		for (let i = 0; i < table_data.length; i++) {
			const row = table_data[i];
			const tr = row.__tr || ($mount.find('.easy-table-row:not(.easy-table-header-row)')[i]);
			if (!tr) continue;

			const $tr = $(tr);

			// Workspace Title cell
			const $titleCell = $tr.find('.easy-table-cell[data-fieldname="title_html"]');
			if ($titleCell.length) {
				const val = row.title || row.name || '';
				$titleCell.attr('title', val).attr('data-value', val);
				if ($titleCell[0].dataset) $titleCell[0].dataset.value = val;
			}

			// Status cell
			const $statusCell = $tr.find('.easy-table-cell[data-fieldname="permission_status_html"]');
			if ($statusCell.length) {
				const val = row.is_permitted ? 'Permitted' : 'Denied';
				$statusCell.attr('title', val).attr('data-value', val);
				if ($statusCell[0].dataset) $statusCell[0].dataset.value = val;
			}

			// Module cell
			const $moduleCell = $tr.find('.easy-table-cell[data-fieldname="module_html"]');
			if ($moduleCell.length) {
				const val = row.module || '';
				if (val) {
					$moduleCell.attr('title', val).attr('data-value', val);
					if ($moduleCell[0].dataset) $moduleCell[0].dataset.value = val;
				} else {
					$moduleCell.removeAttr('title').attr('data-value', '');
					if ($moduleCell[0].dataset) $moduleCell[0].dataset.value = '';
				}
			}

			// Scope cell
			const $scopeCell = $tr.find('.easy-table-cell[data-fieldname="scope_html"]');
			if ($scopeCell.length) {
				const val = row.public ? 'Public' : 'Private';
				$scopeCell.attr('title', val).attr('data-value', val);
				if ($scopeCell[0].dataset) $scopeCell[0].dataset.value = val;
			}

			// Items summary cell
			const $itemsCell = $tr.find('.easy-table-cell[data-fieldname="items_summary_html"]');
			if ($itemsCell.length) {
				const total = row.total_items || 0;
				const perm = row.permitted_items || 0;
				const pct = total > 0 ? Math.round((perm / total) * 100) : 0;
				const val = `${perm}/${total}`;
				const tip = `${perm}/${total} (${pct}%)`;
				$itemsCell.attr('title', tip).attr('data-value', val);
				if ($itemsCell[0].dataset) $itemsCell[0].dataset.value = val;
			}

			// Reason cell
			const $reasonCell = $tr.find('.easy-table-cell[data-fieldname="reason_html"]');
			if ($reasonCell.length) {
				const val = row.permission_reason || '';
				$reasonCell.attr('title', val).attr('data-value', val);
				if ($reasonCell[0].dataset) $reasonCell[0].dataset.value = val;
			}
		}
	},

	update_detailed_cell_attributes: function ($mount, table_data) {
		if (!$mount || !table_data || !table_data.length) return;

		for (let i = 0; i < table_data.length; i++) {
			const row = table_data[i];
			const tr = row.__tr || ($mount.find('.easy-table-row:not(.easy-table-header-row)')[i]);
			if (!tr) continue;

			const $tr = $(tr);

			// Hierarchy node cell
			const $nodeCell = $tr.find('.easy-table-cell[data-fieldname="hierarchy_node"]');
			if ($nodeCell.length) {
				const val = row.workspace_title || row.section || row.label || row.node || '';
				$nodeCell.attr('title', val).attr('data-value', val);
				if ($nodeCell[0].dataset) $nodeCell[0].dataset.value = val;
			}

			// Status cell
			const $statusCell = $tr.find('.easy-table-cell[data-fieldname="permission_status_html"]');
			if ($statusCell.length) {
				const val = row.permission_status || (row.is_permitted ? 'Permitted' : 'Denied');
				$statusCell.attr('title', val).attr('data-value', val);
				if ($statusCell[0].dataset) $statusCell[0].dataset.value = val;
			}

			// Type cell
			const $typeCell = $tr.find('.easy-table-cell[data-fieldname="type_html"]');
			if ($typeCell.length) {
				const indent = Number(row.indent) || 0;
				const val = row.item_type || (indent === 0 ? 'Workspace' : (indent === 1 ? 'Section' : ''));
				$typeCell.attr('title', val).attr('data-value', val);
				if ($typeCell[0].dataset) $typeCell[0].dataset.value = val;
			}

			// Target Link / DocType cell
			const $targetCell = $tr.find('.easy-table-cell[data-fieldname="target_html"]');
			if ($targetCell.length) {
				const val = (row.target && row.target !== '—') ? row.target : '';
				if (val) {
					$targetCell.attr('title', val).attr('data-value', val);
					if ($targetCell[0].dataset) $targetCell[0].dataset.value = val;
				} else {
					$targetCell.removeAttr('title').attr('data-value', '');
					if ($targetCell[0].dataset) $targetCell[0].dataset.value = '';
				}
			}

			// Reason cell
			const $reasonCell = $tr.find('.easy-table-cell[data-fieldname="reason_html"]');
			if ($reasonCell.length) {
				const val = row.reason || row.permission_reason || '';
				$reasonCell.attr('title', val).attr('data-value', val);
				if ($reasonCell[0].dataset) $reasonCell[0].dataset.value = val;
			}
		}
	},

	render_detailed_items_view: function ($mount, records) {
		const self = this;
		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;

		// Check if EasyTable is available
		if (EasyTable && typeof EasyTable === 'function') {
			const columns = [
				{
					fieldname: 'hierarchy_node',
					label: __('Workspace / Section / Item'),
					fieldtype: 'HTML',
					width: 320,
					freeze: true,
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.workspace_title || row.section || row.label || row.node || '') : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'permission_status_html',
					label: __('Status'),
					fieldtype: 'HTML',
					width: 110,
					align: 'center',
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.permission_status || (row.is_permitted ? 'Permitted' : 'Denied')) : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'type_html',
					label: __('Type'),
					fieldtype: 'HTML',
					width: 120,
					cell_decorator: {
						body: (val, row) => {
							const indent = row ? Number(row.indent) || 0 : 0;
							const text = row ? (row.item_type || (indent === 0 ? 'Workspace' : (indent === 1 ? 'Section' : ''))) : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'target_html',
					label: __('Target Link / DocType'),
					fieldtype: 'HTML',
					width: 220,
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.target || '') : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				},
				{
					fieldname: 'reason_html',
					label: __('Permission Evaluation Details'),
					fieldtype: 'HTML',
					width: 340,
					cell_decorator: {
						body: (val, row) => {
							const text = row ? (row.reason || row.permission_reason || '') : '';
							return { attributes: { title: text, 'data-value': text } };
						}
					}
				}
			];

			const table_data = records.map(row => {
				const indent = Number(row.indent) || 0;
				const is_perm = row.is_permitted;

				let status_badge = '';
				if (row.permission_status === 'Permitted') {
					status_badge = `<span class="status-pill status-permitted"><i class="fa fa-check-circle"></i> Permitted</span>`;
				} else if (row.permission_status === 'Partial') {
					status_badge = `<span class="status-pill status-partial text-warning"><i class="fa fa-adjust"></i> Partial</span>`;
				} else {
					status_badge = `<span class="status-pill status-denied"><i class="fa fa-times-circle"></i> Denied</span>`;
				}

				let displayNode = '';
				let type_badge = '';
				let target_html = '';

				if (indent === 0) {
					const ws_route = `/app/${frappe.router.slug(row.workspace || row.name || '')}`;
					displayNode = `
						<span class="font-weight-bold">
							<a href="${ws_route}" class="text-dark" target="_blank" title="${__('Open Workspace')}">
								<i class="fa fa-${row.icon || 'folder'} mr-1 text-primary"></i>
								${frappe.utils.escape_html(row.workspace_title || row.label || row.node)}
							</a>
						</span>
					`;
					type_badge = `<span class="type-pill text-primary font-weight-bold">${__('Workspace')}</span>`;
					target_html = `<span class="text-muted small">—</span>`;
				} else if (indent === 1) {
					displayNode = `
						<span class="font-weight-bold text-dark">
							<i class="fa fa-folder-open-o mr-1 text-info"></i>
							${frappe.utils.escape_html(row.section || row.label || row.node)}
						</span>
					`;
					type_badge = `<span class="type-pill text-info">${__('Section')}</span>`;
					target_html = `<span class="text-muted small">—</span>`;
				} else {
					let icon_cls = row.icon || 'file-o';
					displayNode = `
						<span>
							<i class="fa fa-${icon_cls} mr-1 text-muted"></i>
							${frappe.utils.escape_html(row.label || row.node)}
						</span>
					`;

					let color_cls = 'badge-secondary';
					if (row.item_type === 'Link') color_cls = 'badge-info';
					else if (row.item_type === 'Shortcut') color_cls = 'badge-primary';
					else if (row.item_type === 'Chart') color_cls = 'badge-warning';
					else if (row.item_type === 'Number Card') color_cls = 'badge-success';
					type_badge = `<span class="badge ${color_cls}">${frappe.utils.escape_html(row.item_type)}</span>`;

					const target_type = (row.target_type || '').toLowerCase();
					let link_href = '';
					if (target_type === 'doctype') link_href = `/app/${frappe.router.slug(row.target)}`;
					else if (target_type === 'page') link_href = `/app/${frappe.router.slug(row.target)}`;
					else if (target_type === 'report') link_href = `/app/query-report/${encodeURIComponent(row.target)}`;

					target_html = link_href && is_perm
						? `<a href="${link_href}" class="text-primary" target="_blank">${frappe.utils.escape_html(row.target)} <i class="fa fa-external-link small ml-1"></i></a>`
						: `<span class="text-muted">${frappe.utils.escape_html(row.target || '—')}</span>`;
				}

				const text_color = is_perm ? 'text-success' : (row.permission_status === 'Partial' ? 'text-warning' : 'text-danger');
				const reason_html = `<span class="${text_color} small"><i class="fa ${is_perm ? 'fa-check' : 'fa-times'} mr-1"></i>${frappe.utils.escape_html(row.reason || '')}</span>`;

				return {
					hierarchy_node: displayNode,
					permission_status_html: status_badge,
					type_html: type_badge,
					target_html: target_html,
					reason_html: reason_html,
					indent: indent,
					is_permitted: is_perm,
					workspace_title: row.workspace_title,
					section: row.section,
					label: row.label,
					node: row.node,
					permission_status: row.permission_status,
					item_type: row.item_type,
					target: row.target,
					reason: row.reason || row.permission_reason
				};
			});

			const tableMountEl = $mount[0];
			this.easy_table_instance = new EasyTable({
				parent: tableMountEl,
				columns: columns,
				data: table_data,
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

			const applyDetailedAttrs = () => {
				self.update_detailed_cell_attributes($mount, table_data);
			};

			if (this.easy_table_instance.bus) {
				this.easy_table_instance.bus.on('table:render', applyDetailedAttrs);
				this.easy_table_instance.bus.on('table:render-body', applyDetailedAttrs);
				this.easy_table_instance.bus.on('row:toggle', applyDetailedAttrs);
				this.easy_table_instance.bus.on('row:expand-all', applyDetailedAttrs);
				this.easy_table_instance.bus.on('row:collapse-all', applyDetailedAttrs);
				this.easy_table_instance.bus.on('filter:change', applyDetailedAttrs);
				this.easy_table_instance.bus.on('sort:change', applyDetailedAttrs);
			}

			applyDetailedAttrs();
			setTimeout(applyDetailedAttrs, 50);
			setTimeout(applyDetailedAttrs, 200);
			setTimeout(applyDetailedAttrs, 500);
		} else {
			// Fallback Standard HTML Table with Hierarchical Indentation
			let table_html = `
				<div class="workspaces-fallback-table-wrapper">
					<table class="table workspaces-fallback-table">
						<thead>
							<tr>
								<th style="width: 340px;">${__('Workspace / Section / Item')}</th>
								<th style="width: 110px; text-align: center;">${__('Status')}</th>
								<th style="width: 110px;">${__('Type')}</th>
								<th>${__('Target Link')}</th>
								<th>${__('Permission Reason')}</th>
							</tr>
						</thead>
						<tbody>
			`;

			records.forEach(row => {
				const indent = Number(row.indent) || 0;
				const is_perm = row.is_permitted;

				let status_badge = '';
				if (row.permission_status === 'Permitted') {
					status_badge = `<span class="status-pill status-permitted"><i class="fa fa-check-circle"></i> Permitted</span>`;
				} else if (row.permission_status === 'Partial') {
					status_badge = `<span class="status-pill status-partial text-warning"><i class="fa fa-adjust"></i> Partial</span>`;
				} else {
					status_badge = `<span class="status-pill status-denied"><i class="fa fa-times-circle"></i> Denied</span>`;
				}

				let indent_padding = indent === 0 ? '12px' : (indent === 1 ? '34px' : '56px');
				let row_bg = indent === 0 ? 'background-color: var(--bg-light-gray, #f8fafc); font-weight: 700;' : (indent === 1 ? 'background-color: #fafbfd; font-weight: 600;' : '');

				let node_html = '';
				let type_badge = '';
				let target_html = '';

				if (indent === 0) {
					const ws_route = `/app/${frappe.router.slug(row.workspace || row.name || '')}`;
					node_html = `
						<a href="${ws_route}" class="text-dark font-weight-bold" target="_blank">
							<i class="fa fa-${row.icon || 'folder'} mr-1 text-primary"></i>
							${frappe.utils.escape_html(row.workspace_title || row.label || row.node)}
						</a>
					`;
					type_badge = `<span class="type-pill text-primary font-weight-bold">${__('Workspace')}</span>`;
					target_html = `<span class="text-muted small">—</span>`;
				} else if (indent === 1) {
					node_html = `
						<span class="text-dark">
							<i class="fa fa-folder-open-o mr-1 text-info"></i>
							${frappe.utils.escape_html(row.section || row.label || row.node)}
						</span>
					`;
					type_badge = `<span class="type-pill text-info">${__('Section')}</span>`;
					target_html = `<span class="text-muted small">—</span>`;
				} else {
					node_html = `
						<span>
							<i class="fa fa-${row.icon || 'file-o'} mr-1 text-muted"></i>
							${frappe.utils.escape_html(row.label || row.node)}
						</span>
					`;

					let color_cls = 'badge-secondary';
					if (row.item_type === 'Link') color_cls = 'badge-info';
					else if (row.item_type === 'Shortcut') color_cls = 'badge-primary';
					else if (row.item_type === 'Chart') color_cls = 'badge-warning';
					else if (row.item_type === 'Number Card') color_cls = 'badge-success';
					type_badge = `<span class="badge ${color_cls}">${frappe.utils.escape_html(row.item_type)}</span>`;

					const target_type = (row.target_type || '').toLowerCase();
					let link_href = '';
					if (target_type === 'doctype') link_href = `/app/${frappe.router.slug(row.target)}`;
					else if (target_type === 'page') link_href = `/app/${frappe.router.slug(row.target)}`;
					else if (target_type === 'report') link_href = `/app/query-report/${encodeURIComponent(row.target)}`;

					target_html = link_href && is_perm
						? `<a href="${link_href}" class="text-primary" target="_blank">${frappe.utils.escape_html(row.target)} <i class="fa fa-external-link small ml-1"></i></a>`
						: `<span class="text-muted">${frappe.utils.escape_html(row.target || '—')}</span>`;
				}

				const reason_color = is_perm ? 'text-success' : (row.permission_status === 'Partial' ? 'text-warning' : 'text-danger');

				const nodeText = frappe.utils.escape_html(row.workspace_title || row.section || row.label || row.node || '');
				const statusText = row.permission_status || (is_perm ? 'Permitted' : 'Denied');
				const typeText = frappe.utils.escape_html(row.item_type || (indent === 0 ? 'Workspace' : (indent === 1 ? 'Section' : '')));
				const targetText = frappe.utils.escape_html(row.target || '');
				const reasonText = frappe.utils.escape_html(row.reason || '');

				table_html += `
					<tr style="${row_bg}">
						<td style="padding-left: ${indent_padding};" title="${nodeText}" data-value="${nodeText}">${node_html}</td>
						<td style="text-align: center;" title="${statusText}" data-value="${statusText}">${status_badge}</td>
						<td title="${typeText}" data-value="${typeText}">${type_badge}</td>
						<td title="${targetText}" data-value="${targetText}">${target_html}</td>
						<td title="${reasonText}" data-value="${reasonText}"><span class="${reason_color} small"><i class="fa ${is_perm ? 'fa-check' : 'fa-times'} mr-1"></i>${reasonText}</span></td>
					</tr>
				`;
			});

			table_html += `</tbody></table></div>`;
			$mount.html(table_html);
		}
	},

	inspect_workspace_items: function (workspace_name) {
		this.current_workspace = workspace_name;
		this.current_show_details = 1;

		if (this.workspace_control) {
			this.workspace_control.set_value(workspace_name);
			this.update_link_btn_visibility(this.workspace_control);
		}
		if (this.show_details_control) {
			this.show_details_control.set_value(1);
		}

		this.load_data();
	}
});
