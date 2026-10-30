frappe.pages['doctype-relationship'].on_page_load = function (wrapper) {
	new doctype_relationship(wrapper);
};

let doctype_relationship = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('DocType Relationship Explorer'),
			single_column: true
		});

		this.current_doctype = null;
		this.current_direction = 'Both';
		this.current_include_indirect = 1;
		this.current_data = null;
		this.easy_table_instance = null;

		this.make();
	},

	make: function () {
		frappe.dom.set_style(`
			.doctype-relationship-container .awesomplete > [role=listbox],
			.doctype-input-wrapper .awesomplete > [role=listbox],
			.awesomplete > [role=listbox] {
				z-index: 12 !important;
			}
		`);

		// Render HTML template
		let rendered_html = frappe.render_template('doctype_relationship', {});
		$(rendered_html).appendTo(this.page.main);

		// Hide default page form row so controls mount in the unified card
		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.addFieldsInputs();
		this.setupPresets();
		this.setupPageActions();
		this.checkRouteOptions();
	},

	addFieldsInputs: function () {
		const $doctypeMount = this.page.main.find('#doctypeRelFieldMount');
		const $directionMount = this.page.main.find('#directionRelFieldMount');
		const $indirectMount = this.page.main.find('#indirectRelFieldMount');

		// 1. Target DocType Link Field
		this.doctype_control = this.page.add_field(
			{
				fieldtype: 'Link',
				fieldname: 'target_doctype',
				label: __('Target DocType'),
				options: 'DocType',
				placeholder: __('Select or search target DocType...'),
				reqd: 1,
				change: () => {
					const dt = (this.doctype_control ? this.doctype_control.get_value() || '' : '').trim() || null;
					this.update_link_btn_visibility(this.doctype_control);
					if (dt === this.current_doctype) return;
					if (dt) {
						this.load_relationships(dt);
					} else {
						this.reset_view();
					}
				}
			},
			$doctypeMount
		);

		if (this.doctype_control && this.doctype_control.$wrapper) {
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
						this.load_relationships(dt);
					} else {
						this.reset_view();
					}
				}, 50);
			});
		}
		this.update_link_btn_visibility(this.doctype_control);

		// 2. Direction Select Field
		this.direction_control = this.page.add_field(
			{
				fieldtype: 'Select',
				fieldname: 'direction',
				label: __('Direction'),
				options: [
					{ label: __('Both Directions'), value: 'Both' },
					{ label: __('Incoming'), value: 'Incoming' },
					{ label: __('Outgoing'), value: 'Outgoing' }
				],
				default: 'Both',
				change: () => {
					const val = this.direction_control.get_value() || 'Both';
					if (val === this.current_direction) return;
					this.current_direction = val;
					const dt = this.doctype_control.get_value();
					if (dt) {
						this.load_relationships(dt);
					}
				}
			},
			$directionMount
		);

		if (this.direction_control && this.direction_control.$wrapper) {
			this.direction_control.$wrapper.removeClass('col-md-2');
		}

		// 3. Include Indirect References Checkbox
		this.indirect_control = this.page.add_field(
			{
				fieldtype: 'Check',
				fieldname: 'include_indirect',
				label: __('Include Indirect (Child Tables)'),
				default: 1,
				change: () => {
					const val = this.indirect_control.get_value() ? 1 : 0;
					if (val === this.current_include_indirect) return;
					this.current_include_indirect = val;
					const dt = this.doctype_control.get_value();
					if (dt) {
						this.load_relationships(dt);
					}
				}
			},
			$indirectMount
		);

		if (this.indirect_control && this.indirect_control.$wrapper) {
			this.indirect_control.$wrapper.removeClass('col-md-2');
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
			'User',
			'Customer',
			'Supplier',
			'Item',
			'Company',
			'Employee',
			'Project',
			'Account'
		];

		const $container = this.page.main.find('.preset-buttons');
		$container.empty();

		presets.forEach((dt) => {
			const $btn = $(`<button class="preset-pill" type="button">${dt}</button>`);
			$btn.on('click', () => {
				if (this.doctype_control) {
					this.doctype_control.set_value(dt);
					this.update_link_btn_visibility(this.doctype_control);
				} else {
					this.load_relationships(dt);
				}
			});
			$container.append($btn);
		});
	},

	updatePresetActiveState: function (doctype) {
		const $pills = this.page.main.find('.preset-pill');
		$pills.removeClass('active');
		if (!doctype) return;

		$pills.each(function () {
			if ($(this).text().trim() === doctype) {
				$(this).addClass('active');
			}
		});
	},

	setupPageActions: function () {
		this.page.set_primary_action(
			__('Refresh'),
			() => {
				this.refresh();
			},
			'refresh'
		);
	},

	checkRouteOptions: function () {
		let dt = null;
		if (frappe.route_options && frappe.route_options.doctype) {
			dt = frappe.route_options.doctype;
			frappe.route_options = null;
		} else {
			const route = frappe.get_route();
			if (route.length > 1 && route[1] && route[1] !== 'doctype-relationship') {
				dt = route[1];
			}
		}

		if (dt) {
			setTimeout(() => {
				if (this.doctype_control) {
					this.doctype_control.set_value(dt);
					this.update_link_btn_visibility(this.doctype_control);
				} else {
					this.load_relationships(dt);
				}
			}, 100);
		}
	},

	get_skeleton_html: function () {
		return `<div class="rel-skeleton-box"></div>`;
	},

	load_relationships: function (doctype) {
		this.current_doctype = doctype;
		this.page.set_title(__('DocType Relationships: {0}', [doctype]));
		this.updatePresetActiveState(doctype);
		this.update_link_btn_visibility(this.doctype_control);

		// Show skeleton loader in summary row
		const $summaryRow = this.page.main.find('.relationship-summary-row');
		const $metaBadges = $summaryRow.find('.relationship-meta-badges');
		$metaBadges.html(`
			<div class="skeleton-box" style="width: 110px; height: 22px; border-radius: 6px;"></div>
			<div class="skeleton-box" style="width: 90px; height: 22px; border-radius: 6px;"></div>
			<div class="skeleton-box" style="width: 90px; height: 22px; border-radius: 6px;"></div>
			<div class="skeleton-box" style="width: 100px; height: 22px; border-radius: 6px;"></div>
		`);
		$summaryRow.show();

		// Show skeleton in table container
		const $tableMount = this.page.main.find('.doctype-relationship-table-mount');
		$tableMount.html(this.get_skeleton_html());

		const include_indirect = this.indirect_control ? (this.indirect_control.get_value() ? 1 : 0) : 1;
		const direction = this.direction_control ? (this.direction_control.get_value() || 'Both') : 'Both';

		frappe.call({
			method: 'ui_component.ui_component.page.doctype_relationship.api.get_doctype_relationships',
			args: {
				doctype: doctype,
				include_indirect: include_indirect,
				direction: direction
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						this.render_relationship_data(r.message);
					} else {
						$tableMount.html(`
							<div class="text-center text-danger" style="padding: 40px 20px;">
								${__('No relationship data returned for {0}', [doctype])}
							</div>
						`);
					}
				}, 1000);
			},
			error: () => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="text-center text-danger" style="padding: 40px 20px;">
							${__('Error discovering relationships. Please check permissions or DocType name.')}
						</div>
					`);
				}, 1000);
			}
		});
	},

	render_relationship_data: function (data) {
		this.current_data = data;

		const $summaryRow = this.page.main.find('.relationship-summary-row');
		const $metaBadges = $summaryRow.find('.relationship-meta-badges');
		$metaBadges.empty();

		if (data.target_module) {
			$metaBadges.append(
				`<span class="badge-tag badge-tag-module">${__('Module')}: ${data.target_module}</span>`
			);
		}

		$metaBadges.append(
			`<span class="badge-tag badge-tag-total">${data.total_count} ${__('Total Dependencies')}</span>`
		);

		$metaBadges.append(
			`<span class="badge-tag badge-tag-incoming">${data.incoming_count || 0} ${__('Incoming')}</span>`
		);

		$metaBadges.append(
			`<span class="badge-tag badge-tag-outgoing">${data.outgoing_count || 0} ${__('Outgoing')}</span>`
		);

		$metaBadges.append(
			`<span class="badge-tag badge-tag-direct">${data.direct_count} ${__('Direct')}</span>`
		);

		$metaBadges.append(
			`<span class="badge-tag badge-tag-indirect">${data.indirect_count} ${__('Indirect')}</span>`
		);

		$summaryRow.show();

		const $tableMount = this.page.main.find('.doctype-relationship-table-mount');
		$tableMount.empty();

		if (!data.relationships || data.relationships.length === 0) {
			$tableMount.html(`
				<div class="empty-state text-center text-muted">
					<div class="empty-icon">
						<img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state">
					</div>
					<div class="empty-title">${__('Nothing to show')}</div>
					<div class="empty-desc">${__('No dependency relationships found for {0}.', [data.target_doctype])}</div>
				</div>
			`);
			return;
		}

		const EasyTable =
			(window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) ||
			window.EasyTable;

		if (!EasyTable) {
			console.error('[DocType Relationship] EasyTable component is not available.');
			$tableMount.html(`
				<div class="alert alert-warning m-3">
					${__('EasyTable library could not be loaded. Please ensure ditech_core is enabled.')}
				</div>
			`);
			return;
		}

		// Clean up existing instance
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
				fieldname: 'seq',
				label: __('No'),
				fieldtype: 'Int',
				width: 55,
				align: 'center',
				cell_decorator: {
					body() {
						return {
							styles: {
								color: 'var(--text-muted, #64748b)',
								fontWeight: '500'
							}
						};
					}
				}
			},
			{
				fieldname: 'direction',
				label: __('Direction'),
				fieldtype: 'Data',
				width: 125,
				align: 'center',
				cell_decorator: {
					body(value) {
						const isIncoming = String(value || '').toLowerCase() === 'incoming';
						return {
							styles: {
								display: 'inline-block',
								padding: '2px 8px',
								borderRadius: '4px',
								fontSize: '11px',
								fontWeight: '600',
								backgroundColor: isIncoming ? '#e0f2fe' : '#f3e8ff',
								color: isIncoming ? '#0369a1' : '#7e22ce',
								border: isIncoming ? '1px solid #bae6fd' : '1px solid #e9d5ff'
							}
						};
					}
				}
			},
			{
				fieldname: 'source_doctype',
				label: __('Source DocType'),
				fieldtype: 'Link',
				options: 'DocType',
				width: 220,
				freeze: true,
				cell_decorator: {
					body(value, row) {
						const isChild = row && row.is_child_table;
						return {
							styles: {
								fontWeight: '600',
								color: isChild ? '#7c3aed' : 'var(--text-color, #0f172a)'
							}
						};
					}
				}
			},
			{
				fieldname: 'source_module',
				label: __('Module'),
				fieldtype: 'Link',
				options: 'Module Def',
				width: 130,
				cell_decorator: {
					body() {
						return {
							styles: {
								color: 'var(--text-muted, #475569)',
								fontSize: '12px'
							}
						};
					}
				}
			},
			{
				fieldname: 'fieldname',
				label: __('Fieldname'),
				fieldtype: 'Data',
				width: 180,
				cell_decorator: {
					body() {
						return {
							styles: {
								fontFamily: 'monospace',
								fontWeight: '600',
								color: '#0284c7'
							}
						};
					}
				}
			},
			{
				fieldname: 'label',
				label: __('Field Label'),
				fieldtype: 'Data',
				width: 190,
				cell_decorator: {
					body() {
						return {
							styles: {
								fontWeight: '500'
							}
						};
					}
				}
			},
			{
				fieldname: 'fieldtype',
				label: __('Field Type'),
				fieldtype: 'Data',
				width: 145,
				cell_decorator: {
					body(value) {
						const type = String(value || '');
						let bg = '#f1f5f9';
						let color = '#334155';

						if (type === 'Link') {
							bg = '#dbeafe';
							color = '#1d4ed8';
						} else if (type === 'Table') {
							bg = '#f3e8ff';
							color = '#7e22ce';
						} else if (type === 'Table MultiSelect') {
							bg = '#fae8ff';
							color = '#a21caf';
						}

						return {
							styles: {
								display: 'inline-block',
								padding: '2px 8px',
								borderRadius: '4px',
								fontSize: '11px',
								fontWeight: '600',
								backgroundColor: bg,
								color: color
							}
						};
					}
				}
			},
			{
				fieldname: 'relationship_type',
				label: __('Relationship'),
				fieldtype: 'Data',
				width: 135,
				cell_decorator: {
					body(value) {
						const isDirect = String(value || '').toLowerCase() === 'direct';
						return {
							styles: {
								display: 'inline-block',
								padding: '2px 8px',
								borderRadius: '4px',
								fontSize: '11px',
								fontWeight: '600',
								backgroundColor: isDirect ? '#dcfce7' : '#fef3c7',
								color: isDirect ? '#15803d' : '#b45309'
							}
						};
					}
				}
			},
			{
				fieldname: 'options',
				label: __('Target / Child DocType'),
				fieldtype: 'Link',
				options: 'DocType',
				width: 200,
				cell_decorator: {
					body() {
						return {
							styles: {
								fontFamily: 'monospace',
								color: '#334155',
								fontWeight: '500'
							}
						};
					}
				}
			},
			{
				fieldname: 'child_fields_display',
				label: __('Matching Child Fields'),
				fieldtype: 'Data',
				width: 250,
				cell_decorator: {
					body(value) {
						const hasFields = value && value !== '-';
						return {
							styles: {
								fontFamily: hasFields ? 'monospace' : 'inherit',
								fontSize: '12px',
								color: hasFields ? '#475569' : 'var(--text-muted, #94a3b8)'
							}
						};
					}
				}
			}
		];

		const tableMountEl = $tableMount[0];

		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: data.relationships,
			doctype: this.current_doctype,
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	reset_view: function () {
		this.current_doctype = null;
		this.current_data = null;
		this.page.set_title(__('DocType Relationship Explorer'));
		this.updatePresetActiveState(null);
		this.update_link_btn_visibility(this.doctype_control);

		this.page.main.find('.relationship-summary-row').hide();
		const $tableMount = this.page.main.find('.doctype-relationship-table-mount');
		$tableMount.html(`
			<div class="empty-state text-center text-muted">
				<div class="empty-icon">
					<img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state">
				</div>
				<div class="empty-title">${__('Select a DocType to Explore Relationships')}</div>
				<div class="empty-desc">${__('Discover all incoming and outgoing DocType dependencies through Link, Table, or Table MultiSelect fields.')}</div>
			</div>
		`);
	},

	refresh: function () {
		const dt = this.doctype_control ? this.doctype_control.get_value() : this.current_doctype;
		if (dt) {
			this.load_relationships(dt);
		}
	}
});
