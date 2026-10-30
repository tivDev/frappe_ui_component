frappe.pages['permission-explorer'].on_page_load = function (wrapper) {
	new permission_explorer(wrapper);
};

let permission_explorer = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('Permission Explorer'),
			single_column: true
		});

		this.current_mode = 'doctype'; // 'doctype' | 'role' | 'user'
		this.current_subview = 'rules'; // 'rules' | 'fields' | 'user-perms' | 'shares'
		this.current_doctype = null;
		this.current_role = null;
		this.current_user = null;
		this.current_permlevel = 'All';
		this.current_data = null;
		this.easy_table_instance = null;

		this.make();
	},

	make: function () {
		frappe.dom.set_style(`
			.permission-explorer-container .awesomplete > [role=listbox],
			.perm-input-wrapper .awesomplete > [role=listbox],
			.awesomplete > [role=listbox] {
				z-index: 12 !important;
			}
		`);

		let rendered_html = frappe.render_template('permission_explorer', {});
		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setupModeSwitcher();
		this.addFieldsInputs();
		this.setupPresets();
		this.setupSubviews();
		this.setupPageActions();
		this.checkRouteOptions();
	},

	setupModeSwitcher: function () {
		const self = this;
		this.page.main.find('.perm-mode-btn').on('click', function () {
			const mode = $(this).data('mode');
			if (mode === self.current_mode) return;

			self.current_mode = mode;
			self.current_subview = 'rules';
			self.page.main.find('.perm-mode-btn').removeClass('active');
			$(this).addClass('active');

			// Toggle input visibility
			self.page.main.find('#doctypeMountWrapper').toggle(mode === 'doctype');
			self.page.main.find('#roleMountWrapper').toggle(mode === 'role');
			self.page.main.find('#userMountWrapper').toggle(mode === 'user');

			self.update_link_btn_visibility(self.doctype_control);
			self.update_link_btn_visibility(self.role_control);
			self.update_link_btn_visibility(self.user_control);

			self.setupPresets();
			if (self.has_active_filter()) {
				self.load_data();
			} else {
				self.reset_view();
			}
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

	addFieldsInputs: function () {
		const $doctypeMount = this.page.main.find('#permDocTypeMount');
		const $roleMount = this.page.main.find('#permRoleMount');
		const $userMount = this.page.main.find('#permUserMount');
		const $levelMount = this.page.main.find('#permLevelMount');

		// 1. DocType Field
		this.doctype_control = frappe.ui.form.make_control({
			parent: $doctypeMount,
			df: {
				fieldtype: 'Link',
				fieldname: 'perm_doctype',
				options: 'DocType',
				label: __('DocType'),
				placeholder: __('Select DocType...'),
				reqd: 1,
				change: () => {
					const dt = (this.doctype_control ? this.doctype_control.get_value() || '' : '').trim() || null;
					this.update_link_btn_visibility(this.doctype_control);
					if (this.current_mode !== 'doctype') return;
					if (dt === this.current_doctype) return;
					this.current_doctype = dt;
					if (dt) this.load_data();
					else this.reset_view();
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
				const dt = (this.doctype_control ? this.doctype_control.get_value() || '' : '').trim() || null;
				if (dt === this.current_doctype) return;
				this.current_doctype = dt;
				if (dt) this.load_data();
				else this.reset_view();
			}, 50);
		});
		this.update_link_btn_visibility(this.doctype_control);

		// 2. Role Field
		this.role_control = frappe.ui.form.make_control({
			parent: $roleMount,
			df: {
				fieldtype: 'Link',
				fieldname: 'perm_role',
				options: 'Role',
				label: __('Role'),
				placeholder: __('Select Role...'),
				reqd: 1,
				change: () => {
					const role = (this.role_control ? this.role_control.get_value() || '' : '').trim() || null;
					this.update_link_btn_visibility(this.role_control);
					if (this.current_mode !== 'role') return;
					if (role === this.current_role) return;
					this.current_role = role;
					if (role) this.load_data();
					else this.reset_view();
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
				const role = (this.role_control ? this.role_control.get_value() || '' : '').trim() || null;
				if (role === this.current_role) return;
				this.current_role = role;
				if (role) this.load_data();
				else this.reset_view();
			}, 50);
		});
		this.update_link_btn_visibility(this.role_control);

		// 3. User Field
		this.user_control = frappe.ui.form.make_control({
			parent: $userMount,
			df: {
				fieldtype: 'Link',
				fieldname: 'perm_user',
				options: 'User',
				label: __('User'),
				placeholder: __('Select User...'),
				reqd: 1,
				change: () => {
					const user = (this.user_control ? this.user_control.get_value() || '' : '').trim() || null;
					this.update_link_btn_visibility(this.user_control);
					if (this.current_mode !== 'user') return;
					if (user === this.current_user) return;
					this.current_user = user;
					if (user) this.load_data();
					else this.reset_view();
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
				const user = (this.user_control ? this.user_control.get_value() || '' : '').trim() || null;
				if (user === this.current_user) return;
				this.current_user = user;
				if (user) this.load_data();
				else this.reset_view();
			}, 50);
		});
		this.update_link_btn_visibility(this.user_control);

		// 4. Perm Level Field
		this.level_control = frappe.ui.form.make_control({
			parent: $levelMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'perm_level',
				label: __('Perm Level'),
				placeholder: __('Perm Level'),
				options: ['All', '0', '1', '2', '3', '4', '5'],
				default: 'All',
				change: () => {
					const lvl = this.level_control.get_value() || 'All';
					if (lvl === this.current_permlevel) return;
					this.current_permlevel = lvl;
					if (this.has_active_filter()) this.load_data();
				}
			},
			render_input: true
		});
		this.level_control.set_value('All');
	},

	has_active_filter: function () {
		if (this.current_mode === 'doctype') return Boolean(this.doctype_control?.get_value());
		if (this.current_mode === 'role') return Boolean(this.role_control?.get_value());
		if (this.current_mode === 'user') return Boolean(this.user_control?.get_value());
		return false;
	},

	setupPresets: function () {
		const $container = this.page.main.find('.preset-buttons');
		$container.empty();

		let presets = [];
		if (this.current_mode === 'doctype') {
			presets = ['User', 'Employee', 'Customer', 'Sales Order', 'Item', 'Company'];
		} else if (this.current_mode === 'role') {
			presets = ['System Manager', 'HR Manager', 'Accounts Manager', 'Sales User', 'All'];
		} else if (this.current_mode === 'user') {
			presets = Array.from(new Set(['Administrator', frappe.session.user].filter(Boolean)));
		}

		presets.forEach((val) => {
			const $btn = $(`<button class="preset-pill" type="button">${val}</button>`);
			$btn.on('click', () => {
				if (this.current_mode === 'doctype' && this.doctype_control) {
					this.doctype_control.set_value(val);
					this.update_link_btn_visibility(this.doctype_control);
				} else if (this.current_mode === 'role' && this.role_control) {
					this.role_control.set_value(val);
					this.update_link_btn_visibility(this.role_control);
				} else if (this.current_mode === 'user' && this.user_control) {
					this.user_control.set_value(val);
					this.update_link_btn_visibility(this.user_control);
				}
			});
			$container.append($btn);
		});
	},

	updatePresetActiveState: function (activeVal) {
		const $pills = this.page.main.find('.preset-pill');
		$pills.removeClass('active');
		if (!activeVal) return;
		$pills.each(function () {
			if ($(this).text().trim() === activeVal) {
				$(this).addClass('active');
			}
		});
	},

	setupSubviews: function () {
		const self = this;
		this.page.main.find('.perm-subviews-group button').on('click', function () {
			const subview = $(this).data('subview');
			if (subview === self.current_subview) return;

			self.current_subview = subview;
			self.page.main.find('.perm-subviews-group button').removeClass('active');
			$(this).addClass('active');

			if (self.current_data) {
				self.render_active_subview();
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
		}
		if (dt && this.doctype_control) {
			setTimeout(() => {
				this.doctype_control.set_value(dt);
			}, 100);
		}
	},

	get_skeleton_html: function () {
		return `<div class="perm-skeleton-box"></div>`;
	},

	load_data: function () {
		let activeFilter = '';
		if (this.current_mode === 'doctype') activeFilter = this.doctype_control?.get_value();
		else if (this.current_mode === 'role') activeFilter = this.role_control?.get_value();
		else if (this.current_mode === 'user') activeFilter = this.user_control?.get_value();

		if (!activeFilter) {
			this.reset_view();
			return;
		}

		this.page.set_title(__('Permission Explorer: {0}', [activeFilter]));
		this.updatePresetActiveState(activeFilter);

		// Show skeleton loader
		const $summaryRow = this.page.main.find('.perm-summary-row');
		$summaryRow.hide();

		const $tableMount = this.page.main.find('.permission-explorer-table-mount');
		$tableMount.html(this.get_skeleton_html());

		const args = {
			mode: this.current_mode,
			doctype: this.current_mode === 'doctype' ? this.doctype_control?.get_value() : undefined,
			role: this.current_mode === 'role' ? this.role_control?.get_value() : undefined,
			user: this.current_mode === 'user' ? this.user_control?.get_value() : undefined,
			permlevel: this.current_permlevel !== 'All' ? this.current_permlevel : undefined
		};

		frappe.call({
			method: 'ui_component.ui_component.page.permission_explorer.api.get_permission_explorer_data',
			args: args,
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						this.render_data(r.message);
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
							${__('Error loading permissions. Please verify permissions or parameters.')}
						</div>
					`);
				}, 1000);
			}
		});
	},

	render_data: function (data) {
		this.current_data = data;

		// Summary badges
		const $summaryRow = this.page.main.find('.perm-summary-row');
		const $badges = $summaryRow.find('.perm-meta-badges');
		$badges.empty();

		if (data.mode === 'doctype') {
			if (data.module) $badges.append(`<span class="badge-tag badge-tag-module">${__('Module')}: ${data.module}</span>`);
			$badges.append(`<span class="badge-tag badge-tag-total">${data.total_rules} ${__('Rules')}</span>`);
			if (data.has_custom_permissions) {
				$badges.append(`<span class="badge-tag badge-tag-custom">${__('Custom Overrides Active')}</span>`);
			} else {
				$badges.append(`<span class="badge-tag badge-tag-standard">${__('Standard Rules')}</span>`);
			}
			if (data.is_submittable) $badges.append(`<span class="badge-tag">${__('Submittable')}</span>`);

			// Show subview toggles
			const $subviews = this.page.main.find('.perm-subviews-group');
			$subviews.show();
			$subviews.find('[data-subview="rules"]').show();
			$subviews.find('[data-subview="fields"]').show();
			$subviews.find('[data-subview="user-perms"]').hide();
			$subviews.find('[data-subview="shares"]').hide();
		} else if (data.mode === 'role') {
			$badges.append(`<span class="badge-tag badge-tag-total">${data.total_doctypes} ${__('DocTypes')}</span>`);
			$badges.append(`<span class="badge-tag badge-tag-total">${data.total_rules} ${__('Rules')}</span>`);
			$badges.append(`<span class="badge-tag" style="background: #dbeafe; color: #1d4ed8;">${data.read_only_count} ${__('Read-Only')}</span>`);
			$badges.append(`<span class="badge-tag" style="background: #dcfce7; color: #15803d;">${data.read_write_count} ${__('Read-Write')}</span>`);
			if (data.submittable_count) $badges.append(`<span class="badge-tag" style="background: #fae8ff; color: #a21caf;">${data.submittable_count} ${__('Submittable')}</span>`);

			if (data.desk_access) {
				$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${__('Desk Access')}</span>`);
			} else {
				$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${__('No Desk Access')}</span>`);
			}

			this.page.main.find('.perm-subviews-group').hide();
			this.current_subview = 'rules';
		} else if (data.mode === 'user') {
			$badges.append(`<span class="badge-tag badge-tag-module">${data.user_type}</span>`);
			if (data.has_desk_access) {
				$badges.append(`<span class="badge-tag badge-tag-desk-yes">✓ ${__('Desk Access')}</span>`);
			} else {
				$badges.append(`<span class="badge-tag badge-tag-desk-no">✗ ${__('No Desk Access')}</span>`);
			}
			if (!data.enabled) {
				$badges.append(`<span class="badge-tag badge-tag-desk-no">${__('Disabled User')}</span>`);
			}
			$badges.append(`<span class="badge-tag badge-tag-total">${(data.assigned_roles || []).length} ${__('Assigned Roles')}</span>`);
			$badges.append(`<span class="badge-tag">${(data.user_permissions || []).length} ${__('User Permissions')}</span>`);
			$badges.append(`<span class="badge-tag">${(data.shares || []).length} ${__('Shared Docs')}</span>`);

			// Show user subviews
			const $subviews = this.page.main.find('.perm-subviews-group');
			$subviews.show();
			$subviews.find('[data-subview="rules"]').show().text(__('Effective Rules'));
			$subviews.find('[data-subview="fields"]').hide();
			$subviews.find('[data-subview="user-perms"]').show();
			$subviews.find('[data-subview="shares"]').show();
		}

		$summaryRow.show();
		this.render_active_subview();
	},

	render_active_subview: function () {
		const data = this.current_data;
		if (!data) return;

		if (this.current_subview === 'fields' && data.mode === 'doctype') {
			this.render_fields_table(data.fields || []);
		} else if (this.current_subview === 'user-perms' && data.mode === 'user') {
			this.render_user_permissions_table(data.user_permissions || []);
		} else if (this.current_subview === 'shares' && data.mode === 'user') {
			this.render_shares_table(data.shares || []);
		} else {
			this.render_rules_table(data.permissions || []);
		}
	},

	render_rules_table: function (rules) {
		const $tableMount = this.page.main.find('.permission-explorer-table-mount');
		$tableMount.empty();

		if (!rules || rules.length === 0) {
			$tableMount.html(`
				<div class="empty-state text-center text-muted">
					<div class="empty-icon">
						<img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state">
					</div>
					<div class="empty-title">${__('Nothing to show')}</div>
				</div>
			`);
			return;
		}

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (!EasyTable) {
			$tableMount.html(`<div class="alert alert-warning m-3">${__('EasyTable library could not be loaded.')}</div>`);
			return;
		}

		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const renderFlag = (val) => {
			if (val) {
				return {
					styles: {
						color: '#16a34a',
						fontWeight: '700',
						textAlign: 'center'
					}
				};
			}
			return {
				styles: {
					color: 'var(--text-muted, #cbd5e1)',
					textAlign: 'center'
				}
			};
		};

		const columns = [];

		if (this.current_mode === 'doctype') {
			columns.push({
				fieldname: 'role',
				label: __('Role'),
				fieldtype: 'Data',
				width: 190,
				freeze: true,
				cell_decorator: {
					body() {
						return { styles: { fontWeight: '600', color: 'var(--text-color, #0f172a)' } };
					}
				}
			});
		} else {
			columns.push({
				fieldname: 'doctype',
				label: __('DocType'),
				fieldtype: 'Link',
				options: 'DocType',
				width: 200,
				freeze: true,
				cell_decorator: {
					body() {
						return { styles: { fontWeight: '600', color: 'var(--text-color, #0f172a)' } };
					}
				}
			});
			if (this.current_mode === 'user') {
				columns.push({
					fieldname: 'role',
					label: __('Matched Role'),
					fieldtype: 'Link',
					options: 'Role',
					width: 160
				});
			}
		}

		columns.push(
			{
				fieldname: 'permlevel',
				label: __('Level'),
				fieldtype: 'Data',
				width: 85,
				align: 'center',
				cell_decorator: {
					body(v) {
						const lvl = parseInt(v, 10) || 0;
						return {
							styles: {
								textAlign: 'center',
								fontWeight: lvl > 0 ? '600' : 'normal',
								color: lvl > 0 ? '#b45309' : 'inherit'
							}
						};
					}
				}
			},
			{ fieldname: 'read', label: __('Read'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'write', label: __('Write'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'create', label: __('Create'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'delete', label: __('Delete'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'submit', label: __('Submit'), fieldtype: 'Check', width: 87, cell_decorator: { body: renderFlag } },
			{ fieldname: 'cancel', label: __('Cancel'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'amend', label: __('Amend'), fieldtype: 'Check', width: 87, cell_decorator: { body: renderFlag } },
			{ fieldname: 'report', label: __('Report'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'export', label: __('Export'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'import', label: __('Import'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'print', label: __('Print'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'email', label: __('Email'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{ fieldname: 'share', label: __('Share'), fieldtype: 'Check', width: 85, cell_decorator: { body: renderFlag } },
			{
				fieldname: 'if_owner',
				label: __('If Owner'),
				fieldtype: 'Check',
				width: 95,
				cell_decorator: {
					body(v) {
						if (v) {
							return {
								styles: {
									backgroundColor: '#fef3c7',
									color: '#b45309',
									padding: '2px 6px',
									borderRadius: '4px',
									fontSize: '11px',
									fontWeight: '600'
								}
							};
						}
						return { styles: { color: 'var(--text-muted, #cbd5e1)', textAlign: 'center' } };
					}
				}
			},
			{
				fieldname: 'condition',
				label: __('Condition'),
				fieldtype: 'Data',
				width: 180,
				cell_decorator: {
					body(v) {
						return { styles: { fontFamily: 'monospace', fontSize: '11px', color: v ? '#0284c7' : 'inherit' } };
					}
				}
			}
		);
		
		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: rules,
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	render_fields_table: function (fields) {
		const $tableMount = this.page.main.find('.permission-explorer-table-mount');
		$tableMount.empty();

		if (!fields || fields.length === 0) {
			$tableMount.html(`<div class="empty-state text-center text-muted"><div class="empty-title">${__('No Fields Metadata Found')}</div></div>`);
			return;
		}

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const columns = [
			{ fieldname: 'fieldname', label: __('Fieldname'), fieldtype: 'Data', width: 180, freeze: true, cell_decorator: { body() { return { styles: { fontFamily: 'monospace', fontWeight: '600', color: '#0284c7' } }; } } },
			{ fieldname: 'label', label: __('Field Label'), fieldtype: 'Data', width: 190 },
			{ fieldname: 'fieldtype', label: __('Field Type'), fieldtype: 'Data', width: 130 },
			{
				fieldname: 'permlevel',
				label: __('Perm Level'),
				fieldtype: 'Data',
				width: 90,
				align: 'center',
				cell_decorator: {
					body(v) {
						const lvl = parseInt(v, 10) || 0;
						return {
							styles: {
								textAlign: 'center',
								fontWeight: lvl > 0 ? '600' : 'normal',
								color: lvl > 0 ? '#7e22ce' : 'inherit'
							}
						};
					}
				}
			},
			{ fieldname: 'reqd', label: __('Mandatory'), fieldtype: 'Check', width: 90 },
			{ fieldname: 'read_only', label: __('Read Only'), fieldtype: 'Check', width: 95 },
			{ fieldname: 'hidden', label: __('Hidden'), fieldtype: 'Check', width: 85 }
		];

		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: fields,
			report_name: `field_permlevels_${this.current_doctype}`,
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	render_user_permissions_table: function (userPerms) {
		const $tableMount = this.page.main.find('.permission-explorer-table-mount');
		$tableMount.empty();

		if (!userPerms || userPerms.length === 0) {
			$tableMount.html(`
				<div class="empty-state text-center text-muted">
					<div class="empty-icon"><img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state"></div>
					<div class="empty-title">${__('No User Permission Restrictions Configured')}</div>
				</div>
			`);
			return;
		}

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const columns = [
			{ fieldname: 'allow', label: __('Restricted DocType'), fieldtype: 'Data', width: 200, freeze: true, cell_decorator: { body() { return { styles: { fontWeight: '600' } }; } } },
			{ fieldname: 'for_value', label: __('Allowed Value'), fieldtype: 'Data', width: 220, cell_decorator: { body() { return { styles: { fontFamily: 'monospace', color: '#0284c7', fontWeight: '500' } }; } } },
			{ fieldname: 'applicable_for', label: __('Applicable For DocType'), fieldtype: 'Data', width: 200 },
			{ fieldname: 'is_default', label: __('Is Default'), fieldtype: 'Check', width: 90 },
			{ fieldname: 'hide_descendants', label: __('Hide Descendants'), fieldtype: 'Check', width: 130 }
		];

		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: userPerms,
			report_name: `user_perms_${this.current_user}`,
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	render_shares_table: function (shares) {
		const $tableMount = this.page.main.find('.permission-explorer-table-mount');
		$tableMount.empty();

		if (!shares || shares.length === 0) {
			$tableMount.html(`
				<div class="empty-state text-center text-muted">
					<div class="empty-icon"><img src="/assets/frappe/images/ui-states/list-empty-state.svg" alt="Generic Empty State" class="null-state"></div>
					<div class="empty-title">${__('No Records Directly Shared with this User')}</div>
				</div>
			`);
			return;
		}

		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try { this.easy_table_instance.destroy(); } catch (e) { console.warn(e); }
			this.easy_table_instance = null;
		}

		const columns = [
			{ fieldname: 'share_doctype', label: __('DocType'), fieldtype: 'Data', width: 200, freeze: true, cell_decorator: { body() { return { styles: { fontWeight: '600' } }; } } },
			{ fieldname: 'share_name', label: __('Document Name'), fieldtype: 'Data', width: 220, cell_decorator: { body() { return { styles: { fontFamily: 'monospace', color: '#0284c7' } }; } } },
			{ fieldname: 'read', label: __('Read'), fieldtype: 'Check', width: 70 },
			{ fieldname: 'write', label: __('Write'), fieldtype: 'Check', width: 70 },
			{ fieldname: 'share', label: __('Share'), fieldtype: 'Check', width: 70 },
			{ fieldname: 'submit', label: __('Submit'), fieldtype: 'Check', width: 70 },
			{ fieldname: 'everyone', label: __('Everyone'), fieldtype: 'Check', width: 90 }
		];

		const tableMountEl = $tableMount[0];
		this.easy_table_instance = new EasyTable({
			parent: tableMountEl,
			columns: columns,
			data: shares,
			report_name: `shares_${this.current_user}`,
			pagination: {
				enabled: true,
				pageSize: 100
			}
		});
	},

	reset_view: function () {
		this.current_data = null;
		this.page.set_title(__('Permission Explorer'));
		this.updatePresetActiveState(null);
		this.update_link_btn_visibility(this.doctype_control);
		this.update_link_btn_visibility(this.role_control);
		this.update_link_btn_visibility(this.user_control);

		this.page.main.find('.perm-summary-row').hide();
		this.page.main.find('.perm-subviews-group').hide();
		const $tableMount = this.page.main.find('.permission-explorer-table-mount');
		$tableMount.html(`
			<div class="empty-state-no-filter text-center text-muted">
				${__('Please set filters')}
			</div>
		`);
	},

	refresh: function () {
		if (this.has_active_filter()) {
			this.load_data();
		}
	}
});
