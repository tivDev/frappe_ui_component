frappe.pages['customer-portal-insp'].on_page_load = function (wrapper) {
	new customer_portal_insp(wrapper);
};

let customer_portal_insp = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('Customer Portal Inspector'),
			single_column: true
		});

		this.current_customer = null;
		this.current_user = null;
		this.current_has_user = 'Has User';

		this.all_records = [];
		this.loaded_customer_names = new Set();
		this.loaded_customer_count = 0;
		this.total_customer_count = 0;
		this.total_portal_users = 0;
		this.has_more = false;
		this.next_start = 0;
		this.is_loading_more = false;

		this.easy_table_instance = null;
		this._filter_timer = null;

		this.make();
	},

	make: function () {
		let rendered_html = frappe.render_template('customer_portal_insp', {});
		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_controls();
		this.setup_actions();
		this.check_route_options();
		this.load_initial_data();
	},

	setup_controls: function () {
		const $custMount = this.page.main.find('.portal-input-wrapper.cust-wrapper');
		const $userMount = this.page.main.find('.portal-input-wrapper.user-wrapper');

		// 1. Customer Control (Optional filter)
		this.customer_control = frappe.ui.form.make_control({
			parent: $custMount,
			df: {
				fieldtype: 'Link',
				options: 'Customer',
				fieldname: 'inspector_customer',
				label: __('Customer'),
				placeholder: __('Select Customer (Optional)...'),
				change: () => {
					const val = (this.customer_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.customer_control);
					if (val === this.current_customer) return;
					this.current_customer = val;
					this.trigger_auto_reload();
				}
			},
			render_input: true
		});
		this.customer_control.$input.on('input change blur', () => {
			this.update_link_btn_visibility(this.customer_control);
		});
		this.customer_control.$wrapper.on('click', '.btn-clear', () => {
			setTimeout(() => {
				this.update_link_btn_visibility(this.customer_control);
				const val = (this.customer_control.get_value() || '').trim() || null;
				if (val === this.current_customer) return;
				this.current_customer = val;
				this.trigger_auto_reload();
			}, 50);
		});

		// 2. User Control (Optional filter)
		this.user_control = frappe.ui.form.make_control({
			parent: $userMount,
			df: {
				fieldtype: 'Link',
				options: 'User',
				fieldname: 'inspector_user',
				label: __('Portal User'),
				placeholder: __('Select User (Optional)...'),
				change: () => {
					const u = (this.user_control.get_value() || '').trim() || null;
					this.update_link_btn_visibility(this.user_control);
					if (u === this.current_user) return;
					this.current_user = u;
					this.trigger_auto_reload();
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
				const u = (this.user_control.get_value() || '').trim() || null;
				if (u === this.current_user) return;
				this.current_user = u;
				this.trigger_auto_reload();
			}, 50);
		});

		// 3. Has Portal User Filter (Options: Has User, No Has User)
		const $hasUserMount = this.page.main.find('.portal-input-wrapper.has-user-wrapper');
		this.has_user_control = frappe.ui.form.make_control({
			parent: $hasUserMount,
			df: {
				fieldtype: 'Select',
				fieldname: 'inspector_has_user',
				label: __('Portal User Status'),
				options: [
					'Has User',
					'No Has User'
				],
				default: 'Has User',
				change: () => {
					const val = (this.has_user_control.get_value() || '').trim() || 'Has User';
					if (val === this.current_has_user) return;
					this.current_has_user = val;
					this.trigger_auto_reload();
				}
			},
			render_input: true
		});
		this.has_user_control.set_value('Has User');
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

	setup_actions: function () {
		this.page.set_primary_action(
			__('Refresh'),
			() => {
				this.load_initial_data();
			},
			'refresh'
		);

		this.page.main.find('.btn-clear-portal').on('click', () => {
			this.clear_all();
		});

		this.page.main.find('.btn-load-more').on('click', () => {
			this.load_more_data();
		});
	},

	trigger_auto_reload: function () {
		clearTimeout(this._filter_timer);
		this._filter_timer = setTimeout(() => {
			this.load_initial_data();
		}, 300);
	},

	check_route_options: function () {
		if (frappe.route_options) {
			if (frappe.route_options.customer && this.customer_control) {
				this.customer_control.set_value(frappe.route_options.customer);
				this.current_customer = frappe.route_options.customer;
			}
			if (frappe.route_options.user && this.user_control) {
				this.user_control.set_value(frappe.route_options.user);
				this.current_user = frappe.route_options.user;
			}
			if (frappe.route_options.has_portal_user && this.has_user_control) {
				this.has_user_control.set_value(frappe.route_options.has_portal_user);
				this.current_has_user = frappe.route_options.has_portal_user;
			}
			frappe.route_options = null;
		}
	},

	load_initial_data: function () {
		const $tableMount = this.page.main.find('.customer-portal-table-mount');
		$tableMount.html('<div class="portal-skeleton-box"></div>');
		this.page.main.find('.portal-load-more-wrapper').hide();

		this.all_records = [];
		this.loaded_customer_names = new Set();
		this.next_start = 0;

		let page_length = 50;
		if (this.current_customer) {
			page_length = 1;
		} else if (this.current_user) {
			page_length = 0;
		}

		frappe.call({
			method: 'ui_component.ui_component.page.customer_portal_insp.api.get_customer_portal_data',
			args: {
				customer: this.current_customer,
				user: this.current_user,
				has_portal_user: this.current_has_user || 'Has User',
				limit_start: 0,
				page_length: page_length
			},
			callback: (r) => {
				setTimeout(() => {
					if (r && r.message) {
						const msg = r.message;
						const records = msg.records || [];
						const summary = msg.summary || {};

						this.all_records = records.slice();
						records.forEach((row) => {
							if (row.indent === 0 && row.customer) {
								this.loaded_customer_names.add(row.customer);
							}
						});

						this.loaded_customer_count = summary.loaded_customer_groups || 0;
						this.total_customer_count = summary.total_customer_groups || 0;
						this.total_portal_users = summary.total_portal_users || 0;
						this.has_more = Boolean(summary.has_more);
						this.next_start = summary.next_start || 50;

						this.render_summary();

						if (this.all_records.length === 0) {
							this.render_empty(msg.message || __('No Customer Portal records found.'));
						} else {
							this.render_table(this.all_records);
						}

						this.update_load_more_ui();
					} else {
						this.render_empty(__('No data returned for Customer Portal.'));
					}
				}, 200);
			},
			error: () => {
				setTimeout(() => {
					$tableMount.html(`
						<div class="empty-state text-center text-danger">
							<div>${__('Error loading Customer Portal Inspector. Please check permissions.')}</div>
						</div>
					`);
				}, 200);
			}
		});
	},

	load_more_data: function () {
		if (this.is_loading_more || !this.has_more) return;

		this.is_loading_more = true;
		const $btn = this.page.main.find('.btn-load-more');
		const originalText = $btn.html();
		$btn.prop('disabled', true).html(`<i class="fa fa-spinner fa-spin mr-1"></i> ${__('Loading next 50 customers...')}`);

		frappe.call({
			method: 'ui_component.ui_component.page.customer_portal_insp.api.get_customer_portal_data',
			args: {
				customer: this.current_customer,
				user: this.current_user,
				has_portal_user: this.current_has_user || 'Has User',
				limit_start: this.next_start,
				page_length: 50
			},
			callback: (r) => {
				this.is_loading_more = false;
				$btn.prop('disabled', false).html(originalText);

				if (r && r.message) {
					const msg = r.message;
					const newRecords = msg.records || [];
					const summary = msg.summary || {};

					// Prevent duplicate customer groups
					let newlyAddedCustomers = 0;
					let currentParentSkipped = false;

					newRecords.forEach((row) => {
						if (row.indent === 0) {
							if (this.loaded_customer_names.has(row.customer)) {
								currentParentSkipped = true;
							} else {
								currentParentSkipped = false;
								this.loaded_customer_names.add(row.customer);
								this.all_records.push(row);
								newlyAddedCustomers++;
							}
						} else if (row.indent === 1) {
							if (!currentParentSkipped) {
								this.all_records.push(row);
							}
						}
					});

					this.loaded_customer_count += newlyAddedCustomers;
					this.total_portal_users += summary.total_portal_users || 0;
					this.has_more = Boolean(summary.has_more);
					this.next_start = summary.next_start || (this.next_start + 50);

					this.render_summary();

					if (this.easy_table_instance) {
						this.render_table(this.all_records);
					}

					this.update_load_more_ui();
				}
			},
			error: () => {
				this.is_loading_more = false;
				$btn.prop('disabled', false).html(originalText);
				frappe.show_alert({
					message: __('Failed to load more customers.'),
					indicator: 'red'
				});
			}
		});
	},

	update_load_more_ui: function () {
		const $wrapper = this.page.main.find('.portal-load-more-wrapper');
		// Only show Load More if there are more customers and neither customer nor user filter is active
		if (this.has_more && !this.current_customer && !this.current_user) {
			$wrapper.show();
		} else {
			$wrapper.hide();
		}
	},

	render_summary: function () {
		const $summaryRow = this.page.main.find('.portal-summary-row');
		const $badges = $summaryRow.find('.portal-meta-badges');
		$badges.empty();

		$badges.append(`<span class="badge-tag badge-tag-total">${this.loaded_customer_count} / ${this.total_customer_count} ${__('Customer Groups Loaded')}</span>`);
		$badges.append(`<span class="badge-tag badge-tag-users">${this.total_portal_users} ${__('Portal Users')}</span>`);

		if (this.current_customer) {
			$badges.append(`<span class="badge-tag badge-tag-module">${__('Customer')}: ${this.current_customer}</span>`);
		}
		if (this.current_user) {
			$badges.append(`<span class="badge-tag badge-tag-module">${__('User Filter')}: ${this.current_user}</span>`);
		}

		if (this.current_has_user === 'No Has User') {
			$badges.append(`<span class="badge-tag badge-tag-no-user"><i class="fa fa-user-times mr-1"></i>${__('No Has User')}</span>`);
		} else {
			$badges.append(`<span class="badge-tag badge-tag-has-user"><i class="fa fa-user-check mr-1"></i>${__('Has User')}</span>`);
		}

		$summaryRow.show();
	},

	render_table: function (records) {
		const $tableMount = this.page.main.find('.customer-portal-table-mount');
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

		const formatCustomerCell = (val, row) => {
			const indent = Number(row?.indent) || 0;
			if (indent === 0) {
				return {
					styles: {
						fontWeight: '600',
						color: '#1d4ed8'
					}
				};
			}
			return {
				styles: {
					color: 'var(--text-muted, #94a3b8)',
					fontStyle: 'italic'
				}
			};
		};

		const formatStatusBadge = (val, row) => {
			const st = String(val || '').toLowerCase().trim();
			if (st === 'enabled' || st === 'active' || st === __('enabled').toLowerCase() || st === __('active').toLowerCase()) {
				return {
					styles: {
						color: '#15803d',
						fontWeight: '600',
						textAlign: 'center'
					}
				};
			} else if (st === 'disabled' || st === __('disabled').toLowerCase()) {
				return {
					styles: {
						color: '#b91c1c',
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

		// EasyTable puts the indentation and collapse chevron toggle on column index 1
		// (index 0 is the unshifted sequence number column).
		// Therefore, 'customer' is placed as the first user-defined column!
		const columns = [
			{
				fieldname: 'customer',
				label: __('Customer'),
				fieldtype: 'Link',
				options: 'Customer',
				width: 220,
				freeze: true,
				cell_decorator: { body: formatCustomerCell }
			},
			{
				fieldname: 'customer_name',
				label: __('Customer Name'),
				fieldtype: 'Data',
				width: 180,
				cell_decorator: {
					body(v, row) {
						return {
							styles: {
								fontWeight: row?.indent === 0 ? '600' : 'normal',
								color: row?.indent === 0 ? 'var(--text-color, #0f172a)' : 'transparent'
							}
						};
					}
				}
			},
			{
				fieldname: 'user',
				label: __('Portal User'),
				fieldtype: 'Link',
				options: 'User',
				width: 210,
				cell_decorator: {
					body(v, row) {
						if (row?.indent === 0) {
							return {
								styles: {
									color: 'var(--text-muted, #64748b)',
									fontStyle: 'italic'
								}
							};
						}
						return {
							styles: {
								fontWeight: '600',
								color: '#0f172a'
							}
						};
					}
				}
			},
			{
				fieldname: 'user_name',
				label: __('User Name'),
				fieldtype: 'Data',
				width: 160
			},
			{
				fieldname: 'email',
				label: __('Email'),
				fieldtype: 'Data',
				width: 200
			},
			{
				fieldname: 'enabled',
				label: __('Status'),
				fieldtype: 'Data',
				width: 105,
				align: 'center',
				cell_decorator: { body: formatStatusBadge }
			},
			{
				fieldname: 'user_type',
				label: __('User Type'),
				fieldtype: 'Data',
				width: 120,
				align: 'center'
			},
			{
				fieldname: 'last_active',
				label: __('Last Active'),
				fieldtype: 'Data',
				width: 140
			}
		];

		const tableData = records.map((r) => {
			const indent = Number(r.indent) || 0;
			return {
				customer: indent === 0 ? r.customer : '',
				customer_name: indent === 0 ? (r.customer_name || r.customer) : '',
				user: indent === 1 ? r.user : (r.portal_user_count > 0 ? `(${r.portal_user_count} User${r.portal_user_count > 1 ? 's' : ''})` : __('No Users')),
				user_name: indent === 1 ? r.user_name : '',
				email: indent === 1 ? r.email : '',
				enabled: r.enabled || '',
				user_type: indent === 1 ? r.user_type : '',
				last_active: indent === 1 ? r.last_active : '',
				portal_user_count: r.portal_user_count,
				indent: r.indent
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
		const $tableMount = this.page.main.find('.customer-portal-table-mount');
		$tableMount.html(`
			<div class="empty-state text-center text-muted">
				<i class="fa fa-users fa-3x mb-2 text-muted" style="opacity: 0.4;"></i>
				<div class="font-weight-bold">${message || __('No Customer Portal records found.')}</div>
			</div>
		`);
	},

	clear_all: function () {
		if (this.customer_control) {
			this.customer_control.set_value('');
			this.update_link_btn_visibility(this.customer_control);
		}
		if (this.user_control) {
			this.user_control.set_value('');
			this.update_link_btn_visibility(this.user_control);
		}
		if (this.has_user_control) {
			this.has_user_control.set_value('Has User');
		}

		this.current_customer = null;
		this.current_user = null;
		this.current_has_user = 'Has User';

		this.load_initial_data();
	}
});

window.customer_portal_insp = customer_portal_insp;
