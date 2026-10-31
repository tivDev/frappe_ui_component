frappe.pages['git-app-explorer'].on_page_load = function (wrapper) {
	new GitAppExplorer(wrapper);
};

let GitAppExplorer = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __('Git App Explorer'),
			single_column: true
		});

		this.apps = [];
		this.filtered_apps = [];
		this.summary = null;
		this.current_filter = 'all';
		this.easy_table_instance = null;

		this.make();
	},

	make: function () {
		let rendered_html = '';
		if (frappe.templates && frappe.templates['git_app_explorer']) {
			rendered_html = frappe.render_template('git_app_explorer', {});
		} else {
			rendered_html = `
				<div class="git-app-explorer-container" id="gitAppExplorerContainer">
					<div class="git-card">
						<div class="git-controls-row">
							<div class="git-inputs-group">
								<div class="filter-dropdown-wrapper">
									<select class="form-control input-sm git-status-filter">
										<option value="all">${__('All Repositories')}</option>
										<option value="clean">${__('Clean Working Tree')}</option>
										<option value="dirty">${__('Uncommitted Changes')}</option>
										<option value="installed">${__('Installed on Site')}</option>
										<option value="custom">${__('Custom Apps Only')}</option>
									</select>
								</div>
							</div>
							<div class="git-presets-group">
								<span class="preset-label">${__('Quick Filters:')}</span>
								<div class="preset-buttons">
									<span class="preset-pill active" data-filter="all">${__('All')}</span>
									<span class="preset-pill" data-filter="rsn">${__('RSN App')}</span>
									<span class="preset-pill" data-filter="custom">${__('Custom')}</span>
									<span class="preset-pill" data-filter="dirty">${__('Changes')}</span>
									<span class="preset-pill" data-filter="installed">${__('Installed')}</span>
								</div>
								<button class="btn btn-default btn-sm btn-refresh-git" title="${__('Reload Git Status')}">
									<i class="fa fa-refresh"></i> ${__('Refresh')}
								</button>
							</div>
						</div>
						<div class="git-summary-row">
							<div class="summary-left">
								<div class="git-meta-badges">
									<span class="badge-tag badge-tag-total" id="badgeTotalApps">-- Apps</span>
									<span class="badge-tag badge-tag-repo" id="badgeTotalRepos">-- Git Repos</span>
									<span class="badge-tag badge-tag-clean" id="badgeCleanRepos">-- Clean</span>
									<span class="badge-tag badge-tag-dirty" id="badgeDirtyRepos">-- Changes</span>
									<span class="badge-tag badge-tag-site" id="badgeSiteApps">Site: --</span>
								</div>
							</div>
							<div class="summary-right">
								<div class="git-legend">
									<span class="legend-item"><span class="legend-dot dot-clean"></span> ${__('Clean')}</span>
									<span class="legend-item"><span class="legend-dot dot-dirty"></span> ${__('Modified')}</span>
									<span class="legend-item"><span class="legend-dot dot-installed"></span> ${__('Installed')}</span>
								</div>
							</div>
						</div>
					</div>
					<div class="git-app-table-mount">
						<div class="git-skeleton-box"></div>
					</div>
				</div>
			`;
		}

		$(rendered_html).appendTo(this.page.main);

		if (this.page.page_form) {
			this.page.page_form.hide();
		}

		this.setup_events();
		this.load_data();
	},

	setup_events: function () {
		const self = this;
		const $container = this.page.main;

		// Status filter dropdown
		$container.on('change', '.git-status-filter', function () {
			self.current_filter = $(this).val();
			$container.find('.preset-pill').removeClass('active');
			$container.find(`.preset-pill[data-filter="${self.current_filter}"]`).addClass('active');
			self.apply_filter();
		});

		// Quick preset pills
		$container.on('click', '.preset-pill', function () {
			const filter = $(this).data('filter');
			self.current_filter = filter;
			$container.find('.preset-pill').removeClass('active');
			$(this).addClass('active');
			$container.find('.git-status-filter').val(filter);
			self.apply_filter();
		});

		// Refresh button
		$container.on('click', '.btn-refresh-git', function () {
			$(this).find('i').addClass('fa-spin');
			self.load_data(() => {
				$(this).find('i').removeClass('fa-spin');
			});
		});

		// Delegated Copy Remote Link button
		$container.on('click', '.btn-copy-url', function (e) {
			e.stopPropagation();
			const url = $(this).data('url') || $(this).closest('.remote-box').find('.remote-url-text').text().trim();
			if (url) {
				frappe.utils.copy_to_clipboard(url);
				frappe.show_alert({
					message: __('Git link copied to clipboard'),
					indicator: 'green'
				}, 3);
			}
		});

		// Delegated View Commit Log Modal
		$container.on('click', '.btn-view-log', function (e) {
			e.stopPropagation();
			const app_name = $(this).data('app');
			self.show_commit_log_modal(app_name);
		});

		// Delegated View Diff / Status Modal
		$container.on('click', '.btn-view-diff, .status-badge.dirty', function (e) {
			e.stopPropagation();
			const app_name = $(this).data('app');
			self.show_git_diff_modal(app_name);
		});
	},

	load_data: function (callback) {
		const self = this;
		const $tableMount = this.page.main.find('.git-app-table-mount');

		frappe.call({
			method: 'ui_component.ui_component.page.git_app_explorer.api.get_git_apps_overview',
			callback: function (r) {
				if (r && r.message) {
					self.apps = r.message.apps || [];
					self.summary = r.message.summary || {};
					self.update_summary_badges();
					self.apply_filter();
				} else {
					$tableMount.html(`
						<div class="alert alert-danger m-3">
							${__('Failed to load Git repository information.')}
						</div>
					`);
				}
				if (typeof callback === 'function') {
					callback();
				}
			},
			error: function () {
				$tableMount.html(`
					<div class="alert alert-danger m-3">
						${__('Error connecting to Git App Explorer API.')}
					</div>
				`);
				if (typeof callback === 'function') {
					callback();
				}
			}
		});
	},

	update_summary_badges: function () {
		if (!this.summary) return;
		const s = this.summary;
		this.page.main.find('#badgeTotalApps').text(`${s.total_apps || 0} ${__('Apps')}`);
		this.page.main.find('#badgeTotalRepos').text(`${s.repo_count || 0} ${__('Git Repos')}`);
		this.page.main.find('#badgeCleanRepos').text(`${s.clean_count || 0} ${__('Clean')}`);
		this.page.main.find('#badgeDirtyRepos').text(`${s.dirty_count || 0} ${__('With Changes')}`);
		this.page.main.find('#badgeSiteApps').text(`${__('Site:')} ${s.current_site || 'rsn.local'}`);
	},

	apply_filter: function () {
		const filter = this.current_filter;

		this.filtered_apps = this.apps.filter(function (app) {
			// Preset filter
			if (filter === 'clean') {
				return app.is_repo && app.is_clean;
			} else if (filter === 'dirty') {
				return app.is_repo && !app.is_clean;
			} else if (filter === 'installed') {
				return app.is_installed;
			} else if (filter === 'rsn') {
				return app.app_name === 'rsn_app';
			} else if (filter === 'custom') {
				return !['frappe', 'erpnext', 'hrms', 'payments'].includes(app.app_name);
			}

			return true;
		});

		this.render_table();
	},

	render_table: function () {
		const $mount = this.page.main.find('.git-app-table-mount');

		// Clean up existing EasyTable instance before re-render
		if (this.easy_table_instance && typeof this.easy_table_instance.destroy === 'function') {
			try {
				this.easy_table_instance.destroy();
			} catch (e) {
				console.warn(e);
			}
			this.easy_table_instance = null;
		}

		$mount.empty();

		if (!this.filtered_apps || this.filtered_apps.length === 0) {
			$mount.html(`
				<div class="text-center text-muted p-5" style="background: var(--card-bg, #fff); border-radius: 8px; border: 1px dashed var(--border-color, #cbd5e1);">
					<i class="fa fa-folder-open-o fa-3x mb-2 text-muted" style="display:block;"></i>
					<div style="font-size: 14px; font-weight: 500;">${__('No apps match the current filter')}</div>
					<div class="text-muted" style="font-size: 12px; margin-top: 4px;">${__('Try clearing the search box or selecting "All Repositories".')}</div>
				</div>
			`);
			return;
		}

		// Prepare row records formatted for display
		const table_data = this.filtered_apps.map((app, idx) => {
			// Remote HTML
			let remote_html = '';
			if (app.remote_url) {
				let open_btn = '';
				if (app.remote_web_url) {
					open_btn = `
						<a href="${app.remote_web_url}" target="_blank" class="btn-open-url" title="${__('Open Repository in Web Browser')}">
							<i class="fa fa-external-link"></i>
						</a>
					`;
				}
				remote_html = `
					<div class="remote-box">
						<span class="remote-url-text" title="${frappe.utils.escape_html(app.remote_url)}">
							${frappe.utils.escape_html(app.remote_url)}
						</span>
						<div class="remote-actions">
							<button class="btn-copy-url" data-url="${frappe.utils.escape_html(app.remote_url)}" title="${__('Copy Git URL')}">
								<i class="fa fa-copy"></i>
							</button>
							${open_btn}
						</div>
					</div>
				`;
			} else {
				remote_html = `<span class="text-muted">${__('No Remote URL')}</span>`;
			}

			// Branch HTML
			let branch_html = '';
			if (app.is_repo) {
				let ab = '';
				if (app.ahead > 0 || app.behind > 0) {
					ab = `<span class="text-muted" style="font-size:10.5px; margin-left:3px;">(${app.ahead}↑ ${app.behind}↓)</span>`;
				}
				branch_html = `<span class="branch-badge"><i class="fa fa-code-fork"></i> ${frappe.utils.escape_html(app.branch)}</span>${ab}`;
			} else {
				branch_html = `<span class="text-muted">-</span>`;
			}

			// Latest Commit HTML
			let commit_html = '';
			if (app.latest_commit) {
				commit_html = `
					<div class="commit-box">
						<div class="commit-msg" title="${frappe.utils.escape_html(app.latest_commit.message)}">
							<span class="commit-hash-pill">${frappe.utils.escape_html(app.latest_commit.short_hash)}</span>
							${frappe.utils.escape_html(app.latest_commit.message)}
						</div>
						<div class="commit-meta">
							${frappe.utils.escape_html(app.latest_commit.author)} · ${app.latest_commit.relative_date}
						</div>
					</div>
				`;
			} else {
				commit_html = `<span class="text-muted">-</span>`;
			}

			// Working Tree Status HTML
			let status_html = '';
			if (!app.is_repo) {
				status_html = `<span class="badge-tag" style="background:#f1f5f9; color:#94a3b8;">${__('Not Git')}</span>`;
			} else if (app.is_clean) {
				status_html = `<span class="status-badge clean"><i class="fa fa-check-circle"></i> ${__('Clean')}</span>`;
			} else {
				status_html = `
					<span class="status-badge dirty btn-view-diff" data-app="${app.app_name}" title="${__('Click to view uncommitted changes')}">
						<i class="fa fa-pencil"></i> ${app.uncommitted_count} ${__('Modified')}
					</span>
				`;
			}

			// Site Install status HTML
			let site_html = app.is_installed
				? `<span class="site-badge installed"><i class="fa fa-check" style="margin-right:2px;"></i> ${__('Installed')}</span>`
				: `<span class="site-badge not-installed">${__('Available')}</span>`;

			// Action Buttons HTML
			let actions_html = app.is_repo ? `
				<div class="action-buttons">
					<button class="action-btn btn-view-log" data-app="${app.app_name}" title="${__('View Commit Log')}">
						<i class="fa fa-history"></i> ${__('Log')}
					</button>
					<button class="action-btn btn-view-diff" data-app="${app.app_name}" title="${__('View Git Diff')}">
						<i class="fa fa-code"></i> ${__('Diff')}
					</button>
				</div>
			` : '';

			return {
				sequence_number: idx + 1,
				app_name: app.app_name,
				app_display: `
					<div class="git-app-title">
						<i class="fa fa-cube text-muted"></i>
						<span>${frappe.utils.escape_html(app.app_name)}</span>
					</div>
				`,
				app_title: `
					<div style="font-weight: 500;">${frappe.utils.escape_html(app.app_title || app.app_name)}</div>
					${app.app_version ? `<div class="text-muted" style="font-size: 11px;">v${app.app_version}</div>` : ''}
				`,
				branch_display: branch_html,
				remote_display: remote_html,
				commit_display: commit_html,
				status_display: status_html,
				site_display: site_html,
				actions_display: actions_html,
				raw_app: app
			};
		});

		// Detect EasyTable from ditech_core / window
		const EasyTable = (window.ditech && window.ditech.ui && window.ditech.ui.EasyTable) || window.EasyTable;

		if (EasyTable) {
			const columns = [
				{
					fieldname: 'app_display',
					label: __('App Name'),
					fieldtype: 'HTML',
					width: 170,
					freeze: true,
					cell_decorator: {
						body() {
							return {
								styles: {
									fontWeight: '600',
									color: 'var(--text-color, #0f172a)'
								}
							};
						}
					}
				},
				{
					fieldname: 'app_title',
					label: __('Title / Version'),
					fieldtype: 'HTML',
					width: 160
				},
				{
					fieldname: 'branch_display',
					label: __('Current Branch'),
					fieldtype: 'HTML',
					width: 150
				},
				{
					fieldname: 'remote_display',
					label: __('Git Remote Link'),
					fieldtype: 'HTML',
					width: 320,
					cell_decorator: {
						body() {
							return {
								styles: {
									width: '100%'
								}
							};
						}
					}
				},
				{
					fieldname: 'commit_display',
					label: __('Latest Commit'),
					fieldtype: 'HTML',
					width: 280
				},
				{
					fieldname: 'status_display',
					label: __('Status'),
					fieldtype: 'HTML',
					width: 130,
					align: 'center'
				},
				{
					fieldname: 'site_display',
					label: __('Site Status'),
					fieldtype: 'HTML',
					width: 110,
					align: 'center'
				},
				{
					fieldname: 'actions_display',
					label: __('Actions'),
					fieldtype: 'HTML',
					width: 140,
					no_filter: true,
					align: 'center'
				}
			];

			this.easy_table_instance = new EasyTable({
				parent: $mount[0],
				columns: columns,
				data: table_data,
				pagination: {
					enabled: true,
					pageSize: 25
				}
			});
		} else {
			// Fallback standard table if EasyTable is not found
			this.render_fallback_table($mount, table_data);
		}
	},

	render_fallback_table: function ($mount, table_data) {
		let rows_html = '';
		table_data.forEach((row, idx) => {
			rows_html += `
				<tr>
					<td style="width: 40px; text-align: center; color: var(--text-muted); font-size: 11px;">${idx + 1}</td>
					<td>${row.app_display}</td>
					<td>${row.app_title}</td>
					<td>${row.branch_display}</td>
					<td>${row.remote_display}</td>
					<td>${row.commit_display}</td>
					<td>${row.status_display}</td>
					<td>${row.site_display}</td>
					<td>${row.actions_display}</td>
				</tr>
			`;
		});

		$mount.html(`
			<div class="git-table-wrapper">
				<table class="table git-table">
					<thead>
						<tr>
							<th style="width: 40px; text-align: center;">#</th>
							<th>${__('App Name')}</th>
							<th>${__('Title / Version')}</th>
							<th>${__('Current Branch')}</th>
							<th>${__('Git Remote Link')}</th>
							<th>${__('Latest Commit')}</th>
							<th>${__('Status')}</th>
							<th>${__('Site')}</th>
							<th style="width: 140px;">${__('Actions')}</th>
						</tr>
					</thead>
					<tbody>
						${rows_html}
					</tbody>
				</table>
			</div>
		`);
	},

	show_commit_log_modal: function (app_name) {
		const dialog = new frappe.ui.Dialog({
			title: __(`Git Commit Log — ${app_name}`),
			size: 'large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'log_html'
				}
			],
			primary_action_label: __('Close'),
			primary_action: function () {
				dialog.hide();
			}
		});

		dialog.fields_dict.log_html.$wrapper.html(`
			<div class="text-center p-4">
				<i class="fa fa-spinner fa-spin fa-2x text-muted"></i>
				<div class="mt-2 text-muted">${__('Loading commits for {0}...', [app_name])}</div>
			</div>
		`);

		dialog.show();

		frappe.call({
			method: 'ui_component.ui_component.page.git_app_explorer.api.get_app_git_log',
			args: { app_name: app_name, limit: 30 },
			callback: function (r) {
				if (r && r.message && r.message.commits) {
					const commits = r.message.commits;
					if (commits.length === 0) {
						dialog.fields_dict.log_html.$wrapper.html(`
							<div class="text-center text-muted p-4">${__('No commits found.')}</div>
						`);
						return;
					}

					let items_html = commits.map(c => `
						<div class="commit-timeline-item">
							<div class="commit-log-header">
								<div>
									<span class="commit-log-hash">${c.short_hash}</span>
									${c.refs ? `<span class="badge badge-info" style="font-size: 10px; margin-left: 6px;">${frappe.utils.escape_html(c.refs)}</span>` : ''}
								</div>
								<div class="commit-log-author">
									<strong>${frappe.utils.escape_html(c.author)}</strong> · <span title="${c.date}">${c.relative_date}</span>
								</div>
							</div>
							<div class="commit-log-subject">${frappe.utils.escape_html(c.message)}</div>
						</div>
					`).join('');

					dialog.fields_dict.log_html.$wrapper.html(`
						<div style="max-height: 480px; overflow-y: auto;">
							${items_html}
						</div>
					`);
				}
			}
		});
	},

	show_git_diff_modal: function (app_name) {
		const dialog = new frappe.ui.Dialog({
			title: __(`Git Status & Diff — ${app_name}`),
			size: 'large',
			fields: [
				{
					fieldtype: 'HTML',
					fieldname: 'diff_html'
				}
			],
			primary_action_label: __('Close'),
			primary_action: function () {
				dialog.hide();
			}
		});

		dialog.fields_dict.diff_html.$wrapper.html(`
			<div class="text-center p-4">
				<i class="fa fa-spinner fa-spin fa-2x text-muted"></i>
				<div class="mt-2 text-muted">${__('Loading changes for {0}...', [app_name])}</div>
			</div>
		`);

		dialog.show();

		frappe.call({
			method: 'ui_component.ui_component.page.git_app_explorer.api.get_app_git_diff',
			args: { app_name: app_name },
			callback: function (r) {
				if (r && r.message) {
					const files = r.message.files || [];
					const diff = r.message.diff || '';

					let files_pills = files.map(f => `
						<span class="badge" style="background:#fef3c7; color:#b45309; margin: 2px 4px; font-family: monospace;">
							${f.status} ${frappe.utils.escape_html(f.file)}
						</span>
					`).join('');

					if (!files_pills) {
						files_pills = `<span class="text-success"><i class="fa fa-check"></i> ${__('Working tree is clean')}</span>`;
					}

					dialog.fields_dict.diff_html.$wrapper.html(`
						<div style="margin-bottom: 12px;">
							<div style="font-weight: 600; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; color: var(--text-muted);">
								${__('Changed Files')} (${files.length})
							</div>
							<div style="margin-bottom: 14px;">${files_pills}</div>
							<div style="font-weight: 600; font-size: 12px; margin-bottom: 6px; text-transform: uppercase; color: var(--text-muted);">
								${__('Working Tree Diff')}
							</div>
							<pre class="diff-view-pre">${frappe.utils.escape_html(diff)}</pre>
						</div>
					`);
				}
			}
		});
	}
});
