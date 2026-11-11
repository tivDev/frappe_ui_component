frappe.pages['doctype-revision-ins'].on_page_load = function (wrapper) {
	frappe.ui_component = frappe.ui_component || {};
	frappe.ui_component.doctype_revision_ins = new DocTypeRevisionInspector(wrapper);
};

class DocTypeRevisionInspector {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('DocType Revision Inspector'),
			single_column: true
		});

		this.current_doctype = null;
		this.current_docname = null;
		this.current_option = 'All';
		this.easy_table_instance = null;
		this._filter_timer = null;

		this.make();
	}

	make() {
		const rendered_html = frappe.render_template('doctype_revision_ins', {});
		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_controls();
		this.setup_actions();
		this.check_route_options();
	}

	setup_controls() {
		const $doctypeMount = this.page.main.find('.revision-input-wrapper.doctype-wrapper');
		const $optionMount = this.page.main.find('.revision-input-wrapper.option-wrapper');

		// 1. DocType Link Control (only DocTypes having "is_active" and "revised_from")
		this.doctype_control = frappe.ui.form.make_control({
			parent: $doctypeMount,
			df: {
				fieldtype: 'Link',
				options: 'DocType',
				fieldname: 'revision_doctype',
				label: __('DocType'),
				placeholder: __('Select DocType...'),
				reqd: 1,
				get_query: () => {
					return {
						query: 'ui_component.ui_component.page.doctype_revision_ins.api.get_revision_doctypes'
					};
				},
				change: () => {
					const dt = (this.doctype_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.doctype_control);
					if (dt === this.current_doctype) return;
					this.current_doctype = dt;
					this.update_document_control(dt);
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
				this.update_document_control(dt);
				if (dt) {
					this.trigger_auto_reload();
				} else {
					this.render_empty_no_filter();
				}
			}, 50);
		});
		this.update_link_btn_visibility(this.doctype_control);

		// 2. Document Name Control (Dynamic Link based on selected DocType)
		this.update_document_control(null);

		// 3. Status Option Select Control ("All", "Active", "Inactive")
		this.option_control = frappe.ui.form.make_control({
			parent: $optionMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'revision_status_option',
				label: __('Status Option'),
				options: [
					{ label: __('All'), value: 'All' },
					{ label: __('Active'), value: 'Active' },
					{ label: __('Inactive'), value: 'Inactive' }
				],
				default: 'All',
				change: () => {
					const val = this.option_control.get_value() || 'All';
					if (val === this.current_option) return;
					this.current_option = val;
					if (this.current_doctype) {
						this.trigger_auto_reload();
					}
				}
			},
			render_input: true
		});
		this.option_control.set_value('All');
	}

	update_document_control(doctype, default_val = null) {
		const $docMount = this.page.main.find('.revision-input-wrapper.docname-wrapper');
		$docMount.empty();
		this.current_docname = default_val || null;

		if (doctype) {
			this.docname_control = frappe.ui.form.make_control({
				parent: $docMount,
				df: {
					fieldtype: 'Link',
					options: doctype,
					fieldname: 'revision_document_name',
					label: __('Document Name'),
					placeholder: __('Document Name (Optional)'),
					change: () => {
						const docname = (this.docname_control ? this.docname_control.get_value() || '' : '').trim() || null;
						this.update_link_btn_visibility(this.docname_control);
						if (docname === this.current_docname) return;
						this.current_docname = docname;
						if (this.current_doctype) {
							this.trigger_auto_reload();
						}
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
					if (this.current_doctype) {
						this.trigger_auto_reload();
					}
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
					fieldname: 'revision_document_name',
					label: __('Document Name'),
					placeholder: __('Select DocType first'),
					read_only: 1
				},
				render_input: true
			});
		}
	}

	update_link_btn_visibility(control) {
		if (!control || !control.$wrapper) return;
		const val = (control.get_value() || '').trim();
		const $linkField = control.$wrapper.find('.link-field');
		const $linkBtn = control.$wrapper.find('.link-btn');

		if (val) {
			$linkField.addClass('has-value');
			$linkBtn.attr('style', 'display: inline-flex !important;');
			const options = control.get_options ? control.get_options() : (control.df ? control.df.options : null);
			if (options) {
				const href = frappe.utils.get_form_link(options, val);
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
		let dt = null;
		let docname = null;
		let statusOption = null;

		if (frappe.route_options && frappe.route_options.doctype) {
			dt = frappe.route_options.doctype;
			docname = frappe.route_options.document_name || frappe.route_options.docname || null;
			statusOption = frappe.route_options.status_option || null;
			frappe.route_options = null;
		} else {
			const route = frappe.get_route();
			if (route.length > 1 && route[1] && route[1] !== 'doctype-revision-ins') {
				dt = route[1];
				if (route.length > 2 && route[2]) {
					docname = route[2];
				}
			}
		}

		if (statusOption && this.option_control) {
			this.current_option = statusOption;
			this.option_control.set_value(statusOption);
		}

		if (dt && this.doctype_control) {
			this.current_doctype = dt;
			this.doctype_control.set_value(dt);
			this.update_link_btn_visibility(this.doctype_control);
			this.update_document_control(dt, docname);
			this.load_data();
		}
	}

	trigger_auto_reload() {
		clearTimeout(this._filter_timer);
		this._filter_timer = setTimeout(() => {
			this.load_data();
		}, 150);
	}

	load_data() {
		if (!this.current_doctype) {
			this.render_empty_no_filter();
			return;
		}

		const $tableMount = this.page.main.find('.doctype-revision-table-mount');
		$tableMount.html('<div class="revision-skeleton-box"></div>');
		this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		this.page.main.find('.revision-summary-row').hide();

		frappe.call({
			method: 'ui_component.ui_component.page.doctype_revision_ins.api.get_doctype_revisions',
			args: {
				doctype: this.current_doctype,
				document_name: this.current_docname || '',
				status_option: this.current_option || 'All'
			},
			callback: (r) => {
				if (r && r.message) {
					const msg = r.message;
					const records = msg.records || [];
					this.render_summary(msg);

					if (records.length === 0) {
						this.render_empty(
							this.current_docname
								? __('No matching revisions found for {0} ({1}).', [this.current_docname, __(this.current_option)])
								: __('No revision records found for {0} ({1}).', [this.current_doctype, __(this.current_option)])
						);
					} else {
						this.render_table(msg);
						const hasCollapsible = records.some((rec) => Number(rec.has_children) === 1);
						if (hasCollapsible) {
							this.page.main.find('.btn-expand-all, .btn-collapse-all').show();
						}
					}
				} else {
					this.render_empty(__('No revision data returned.'));
				}
			},
			error: () => {
				$tableMount.html(`
					<div class="revision-empty-prompt text-center text-danger">
						<i class="fa fa-exclamation-triangle fa-2x mb-2 text-danger"></i>
						<div class="font-weight-bold">${__('Failed to load DocType revisions.')}</div>
					</div>
				`);
			}
		});
	}

	render_summary(msg) {
		const s = msg.summary || {};
		const $summaryRow = this.page.main.find('.revision-summary-row');
		const $badges = $summaryRow.find('.revision-meta-badges');
		$badges.empty();

		$badges.append(
			`<span class="badge-tag badge-tag-total"><i class="fa fa-files-o mr-1"></i>${s.total || 0} ${__('Total')}</span>`
		);
		$badges.append(
			`<span class="badge-tag badge-tag-trees"><i class="fa fa-sitemap mr-1"></i>${s.trees || 0} ${__('Root Trees')}</span>`
		);
		$badges.append(
			`<span class="badge-tag badge-tag-active"><i class="fa fa-check-circle mr-1"></i>${s.active || 0} ${__('Active')}</span>`
		);
		$badges.append(
			`<span class="badge-tag badge-tag-inactive"><i class="fa fa-ban mr-1"></i>${s.inactive || 0} ${__('Inactive')}</span>`
		);

		if (msg.status_option && msg.status_option !== 'All') {
			$badges.append(
				`<span class="badge-tag badge-tag-filtered"><i class="fa fa-filter mr-1"></i>${__('Showing')}: ${s.filtered || 0} (${__(msg.status_option)})</span>`
			);
		}

		if (msg.module) {
			$badges.append(
				`<span class="badge-tag badge-tag-module"><i class="fa fa-folder-open-o mr-1"></i>${__('Module')}: ${frappe.utils.escape_html(msg.module)}</span>`
			);
		}

		$summaryRow.css('display', 'flex');
	}

	render_table(msg) {
		const $tableMount = this.page.main.find('.doctype-revision-table-mount');
		$tableMount.empty();

		const EasyTable =
			(window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) ||
			window.EasyTable;

		if (!EasyTable) {
			$tableMount.html(`
				<div class="revision-empty-prompt text-center text-danger">
					<div>${__('EasyTable component is not available.')}</div>
				</div>
			`);
			return;
		}

		this.destroy_table();

		const doctype = msg.doctype || this.current_doctype;
		const records = msg.records || [];

		// EasyTable applies hierarchy indent and collapsible toggles to columns[0] (after sequence_number).
		const columns = [
			{
				fieldname: 'name',
				label: __('Document Name'),
				fieldtype: 'Link',
				options: doctype,
				width: 270,
				freeze: true,
				cell_decorator: {
					body: (val, row) => {
						const indent = Number(row?.indent) || 0;
						if (row && Number(row.is_current) === 1) {
							return {
								styles: {
									fontWeight: '700',
									color: '#1d4ed8',
									backgroundColor: 'rgba(59, 130, 246, 0.08)'
								}
							};
						}
						if (indent === 0) {
							return {
								styles: {
									fontWeight: '700',
									color: '#0f172a'
								}
							};
						}
						return {
							styles: {
								fontWeight: '500',
								color: '#334155'
							}
						};
					}
				}
			},
			{
				fieldname: 'revision_display',
				label: __('Revision'),
				fieldtype: 'Data',
				width: 100,
				align: 'center',
				cell_decorator: {
					body: (val, row) => {
						const indent = Number(row?.indent) || 0;
						return {
							styles: {
								fontWeight: '600',
								color: indent === 0 ? '#0369a1' : '#475569'
							}
						};
					}
				}
			},
			{
				fieldname: 'active_label',
				label: __('Active Status'),
				fieldtype: 'Data',
				width: 115,
				align: 'center',
				cell_decorator: {
					body: (val, row) => {
						const isActive = Number(row?.is_active) === 1;
						return {
							styles: {
								fontWeight: '600',
								color: isActive ? '#15803d' : '#b91c1c',
								textAlign: 'center'
							}
						};
					}
				}
			},
			{
				fieldname: 'docstatus_label',
				label: __('Doc Status'),
				fieldtype: 'Data',
				width: 115,
				align: 'center',
				cell_decorator: {
					body: (val, row) => {
						const ds = Number(row?.docstatus);
						let color = '#475569';
						if (ds === 1) color = '#0369a1';
						else if (ds === 2) color = '#b91c1c';
						return {
							styles: {
								fontWeight: '600',
								color: color,
								textAlign: 'center'
							}
						};
					}
				}
			}
		];

		if (msg.has_status_field) {
			columns.push({
				fieldname: 'status',
				label: __('Status'),
				fieldtype: 'Data',
				width: 130,
				align: 'center'
			});
		}

		if (msg.has_title_field) {
			columns.push({
				fieldname: 'title',
				label: __(msg.title_field_label || 'Title'),
				fieldtype: 'Data',
				width: 210
			});
		}

		columns.push(
			{
				fieldname: 'revised_from',
				label: __('Revised From'),
				fieldtype: 'Link',
				options: doctype,
				width: 200
			},
			{
				fieldname: 'owner',
				label: __('Created By'),
				fieldtype: 'Link',
				options: 'User',
				width: 165
			},
			{
				fieldname: 'creation',
				label: __('Created On'),
				fieldtype: 'Data',
				width: 165
			},
			{
				fieldname: 'modified',
				label: __('Last Modified'),
				fieldtype: 'Data',
				width: 165
			}
		);

		const tableData = records.map((r) => ({
			name: r.name || '',
			revision_display: r.revision_display || '',
			active_label: r.active_label || '',
			is_active: r.is_active,
			docstatus: r.docstatus,
			docstatus_label: r.docstatus_label || '',
			status: r.status || '',
			title: r.title || '',
			revised_from: r.revised_from || '',
			owner: r.owner || '',
			creation: r.creation || '',
			modified: r.modified || '',
			is_current: r.is_current || 0,
			indent: Number(r.indent) || 0
		}));

		this.easy_table_instance = new EasyTable({
			parent: $tableMount[0],
			doctype: doctype,
			columns: columns,
			data: tableData,
			collapse_all: false,
			pagination: {
				enabled: false
			}
		});
	}

	destroy_table() {
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try {
				this.easy_table_instance.destroy();
			} catch (e) {
				console.warn(e);
			}
		}
		this.easy_table_instance = null;
	}

	expand_all() {
		if (!this.easy_table_instance) return;
		if (typeof this.easy_table_instance.expandAll === 'function') {
			this.easy_table_instance.expandAll();
			return;
		}
		this.page.main.find('.easy-table-toggle[aria-expanded="false"]').each(function () {
			$(this).trigger('click');
		});
	}

	collapse_all() {
		if (!this.easy_table_instance) return;
		if (typeof this.easy_table_instance.collapseAll === 'function') {
			this.easy_table_instance.collapseAll();
			return;
		}
		$(this.page.main.find('.easy-table-toggle[aria-expanded="true"]').get().reverse()).each(function () {
			$(this).trigger('click');
		});
	}

	render_empty_no_filter() {
		this.destroy_table();
		this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		this.page.main.find('.revision-summary-row').hide();
		const $tableMount = this.page.main.find('.doctype-revision-table-mount');
		$tableMount.html(`
			<div class="revision-empty-prompt text-center text-muted">
				<div class="empty-icon-wrapper mb-3">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted" style="opacity: 0.5;">
						<circle cx="18" cy="18" r="3"></circle>
						<circle cx="6" cy="6" r="3"></circle>
						<path d="M6 21V9a9 9 0 0 0 9 9"></path>
					</svg>
				</div>
				<h5 class="text-dark font-weight-bold mb-1">${__('Select a DocType to Inspect Revisions')}</h5>
				<p class="text-muted font-size-sm mb-0">
					${__('Choose a revision-enabled DocType above to explore its collapsible revision tree, optionally narrow by Document Name, or filter by Active/Inactive status.')}
				</p>
			</div>
		`);
	}

	render_empty(message) {
		this.destroy_table();
		this.page.main.find('.btn-expand-all, .btn-collapse-all').hide();
		const $tableMount = this.page.main.find('.doctype-revision-table-mount');
		$tableMount.html(`
			<div class="revision-empty-prompt text-center text-muted">
				<i class="fa fa-folder-open-o fa-3x mb-2 text-muted" style="opacity: 0.4;"></i>
				<div class="font-weight-bold">${frappe.utils.escape_html(message || __('No revision records found.'))}</div>
			</div>
		`);
	}

	clear_all() {
		clearTimeout(this._filter_timer);
		if (this.doctype_control) {
			this.doctype_control.set_value('');
			this.update_link_btn_visibility(this.doctype_control);
		}
		if (this.option_control) {
			this.option_control.set_value('All');
		}
		this.current_doctype = null;
		this.current_docname = null;
		this.current_option = 'All';
		this.update_document_control(null);
		this.render_empty_no_filter();
	}
}

window.DocTypeRevisionInspector = DocTypeRevisionInspector;
