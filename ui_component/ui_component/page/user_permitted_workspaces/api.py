import frappe
import frappe.share
from collections import defaultdict
from frappe import _
from frappe.utils import cint
from frappe.permissions import get_valid_perms
from frappe.core.doctype.custom_role.custom_role import get_custom_allowed_roles
from frappe.core.doctype.domain_settings.domain_settings import get_active_modules


@frappe.whitelist()
def get_user_permitted_workspaces(
	user=None, workspace_name=None, show_details=0, status=None, permission_status=None
):
	"""Evaluates permitted workspaces and items inside each workspace for a specified user.

	Args:
	    user (str, optional): Target user ID (defaults to session user).
	    workspace_name (str, optional): Specific workspace to inspect.
	    show_details (int/bool, optional): If 1, includes item-level breakdown for workspaces.
	    status (str, optional): Filter by status: 'Allowed' / 'Permitted' or 'Denied'.
	    permission_status (str, optional): Alias for status filter.

	Returns:
	    dict: Summary, user metadata, workspaces list, and detailed items list.
	"""
	# Default to current session user if not provided
	if not user or not str(user).strip() or str(user).strip() in ["None", "null", "undefined"]:
		user = frappe.session.user
	user = str(user).strip()

	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} does not exist.").format(user))

	show_details = cint(show_details or 0)
	if workspace_name and str(workspace_name).strip() in ["None", "null", "undefined", ""]:
		workspace_name = None
	else:
		workspace_name = (workspace_name or "").strip() or None

	# Status filter: 'Permitted' or 'Denied'
	raw_status = (status or permission_status or "").strip().lower()
	if raw_status in ["permitted", "allowed"]:
		status_filter = "Permitted"
	elif raw_status in ["denied"]:
		status_filter = "Denied"
	else:
		status_filter = None

	# 1. User Context & Roles
	user_roles = set(frappe.permissions.get_roles(user))
	is_admin = bool(user == "Administrator" or "Administrator" in user_roles)
	is_workspace_manager = bool(is_admin or "Workspace Manager" in user_roles)

	user_doc = frappe.get_cached_doc("User", user)
	try:
		blocked_modules = set(user_doc.get_blocked_modules() or [])
	except Exception:
		blocked_modules = set()
	blocked_modules.add("Dummy Module")

	try:
		active_domains = set(frappe.get_active_domains() or [])
	except Exception:
		active_domains = set()

	# Existing DocTypes cache and domain mapping to avoid DoesNotExistError and handle domain restrictions
	all_doctypes_info = frappe.get_all(
		"DocType",
		fields=["name", "restrict_to_domain"],
	)
	existing_doctypes = {dt.name for dt in all_doctypes_info}
	doctype_domain_map = {dt.name: dt.restrict_to_domain for dt in all_doctypes_info}

	# User permission / module permissions calculated accurately for the specific user
	can_read_doctypes, allow_modules = _build_user_doctype_permissions(
		user, user_roles, is_admin, active_domains
	)

	# Allowed pages & reports maps for the target user
	allowed_pages = _get_allowed_pages_for_user(user, user_roles, is_admin, active_domains)
	allowed_reports = _get_allowed_reports_for_user(
		user, user_roles, is_admin, can_read_doctypes, existing_doctypes
	)

	# Modules associated with allowed pages and reports
	allowed_page_and_report_modules = _get_page_and_report_modules(allowed_pages, allowed_reports)

	# 2. Query Workspaces
	filters = {}
	if workspace_name:
		filters["name"] = workspace_name

	workspace_fields = [
		"name",
		"title",
		"label",
		"module",
		"parent_page",
		"public",
		"for_user",
		"is_hidden",
		"icon",
		"indicator_color",
		"sequence_id",
		"restrict_to_domain",
	]

	all_workspaces = frappe.get_all(
		"Workspace",
		fields=workspace_fields,
		filters=filters,
		order_by="sequence_id asc, creation asc",
		ignore_permissions=True,
	)

	ws_names = [ws.name for ws in all_workspaces]

	# Pre-fetch child tables for performance
	ws_roles_map = defaultdict(set)
	if ws_names:
		role_records = frappe.get_all(
			"Has Role",
			filters={"parenttype": "Workspace", "parent": ("in", ws_names)},
			fields=["parent", "role"],
		)
		for r in role_records:
			if r.role:
				ws_roles_map[r.parent].add(r.role)

	# Custom roles for workspace pages
	custom_roles_map = defaultdict(set)
	for ws_name in ws_names:
		c_roles = get_custom_allowed_roles("page", ws_name)
		if c_roles:
			custom_roles_map[ws_name].update(c_roles)

	# Fetch item child tables
	links_map = defaultdict(list)
	shortcuts_map = defaultdict(list)
	charts_map = defaultdict(list)
	number_cards_map = defaultdict(list)
	quick_lists_map = defaultdict(list)
	custom_blocks_map = defaultdict(list)

	if ws_names:
		links_data = frappe.get_all(
			"Workspace Link",
			filters={"parent": ("in", ws_names)},
			fields=["*"],
			order_by="idx asc",
		)
		for item in links_data:
			links_map[item.parent].append(item)

		shortcuts_data = frappe.get_all(
			"Workspace Shortcut",
			filters={"parent": ("in", ws_names)},
			fields=["*"],
			order_by="idx asc",
		)
		for item in shortcuts_data:
			shortcuts_map[item.parent].append(item)

		charts_data = frappe.get_all(
			"Workspace Chart",
			filters={"parent": ("in", ws_names)},
			fields=["*"],
			order_by="idx asc",
		)
		for item in charts_data:
			charts_map[item.parent].append(item)

		nc_data = frappe.get_all(
			"Workspace Number Card",
			filters={"parent": ("in", ws_names)},
			fields=["*"],
			order_by="idx asc",
		)
		for item in nc_data:
			number_cards_map[item.parent].append(item)

		ql_data = frappe.get_all(
			"Workspace Quick List",
			filters={"parent": ("in", ws_names)},
			fields=["*"],
			order_by="idx asc",
		)
		for item in ql_data:
			quick_lists_map[item.parent].append(item)

		cb_data = frappe.get_all(
			"Workspace Custom Block",
			filters={"parent": ("in", ws_names)},
			fields=["*"],
			order_by="idx asc",
		)
		for item in cb_data:
			custom_blocks_map[item.parent].append(item)

	# Cache for doctype/item permissions
	perm_cache = {}

	# 3. Process Workspaces
	workspaces_result = []
	all_detailed_items = []

	total_items_count_all = 0
	permitted_items_count_all = 0
	denied_items_count_all = 0

	total_workspaces = len(all_workspaces)
	permitted_workspaces = 0
	denied_workspaces = 0

	for ws in all_workspaces:
		# Check workspace level permission
		is_permitted, perm_reason = _check_workspace_permission(
			ws=ws,
			user=user,
			user_roles=user_roles,
			is_admin=is_admin,
			is_workspace_manager=is_workspace_manager,
			blocked_modules=blocked_modules,
			active_domains=active_domains,
			allow_modules=allow_modules,
			allowed_page_and_report_modules=allowed_page_and_report_modules,
			ws_roles=ws_roles_map.get(ws.name, set()),
			custom_roles=custom_roles_map.get(ws.name, set()),
		)

		if is_permitted:
			permitted_workspaces += 1
		else:
			denied_workspaces += 1

		# Evaluate items inside workspace
		items_evaluation = _evaluate_workspace_items(
			ws=ws,
			user=user,
			user_roles=user_roles,
			is_admin=is_admin,
			active_domains=active_domains,
			can_read_doctypes=can_read_doctypes,
			existing_doctypes=existing_doctypes,
			doctype_domain_map=doctype_domain_map,
			allowed_pages=allowed_pages,
			allowed_reports=allowed_reports,
			links=links_map.get(ws.name, []),
			shortcuts=shortcuts_map.get(ws.name, []),
			charts=charts_map.get(ws.name, []),
			number_cards=number_cards_map.get(ws.name, []),
			quick_lists=quick_lists_map.get(ws.name, []),
			custom_blocks=custom_blocks_map.get(ws.name, []),
			perm_cache=perm_cache,
			ws_permitted=is_permitted,
			ws_perm_reason=perm_reason,
		)

		ws_hierarchical_rows = items_evaluation["hierarchical_rows"]
		ws_item_stats = items_evaluation["stats"]

		total_items_count_all += ws_item_stats["total"]
		permitted_items_count_all += ws_item_stats["permitted"]
		denied_items_count_all += ws_item_stats["denied"]

		ws_dict = {
			"name": ws.name,
			"title": ws.title or ws.label or ws.name,
			"label": ws.label or ws.title or ws.name,
			"module": ws.module or "",
			"parent_page": ws.parent_page or "",
			"public": bool(ws.public),
			"for_user": ws.for_user or "",
			"is_hidden": bool(ws.is_hidden),
			"icon": ws.icon or "folder",
			"indicator_color": ws.indicator_color or "",
			"sequence_id": ws.sequence_id or 0,
			"is_permitted": bool(is_permitted),
			"permission_status": "Permitted" if is_permitted else "Denied",
			"permission_reason": perm_reason,
			"required_roles": sorted(list(ws_roles_map.get(ws.name, set()) | custom_roles_map.get(ws.name, set()))),
			"total_items": ws_item_stats["total"],
			"permitted_items": ws_item_stats["permitted"],
			"denied_items": ws_item_stats["denied"],
			"items_breakdown": ws_item_stats["by_type"],
			"indent": 0,
		}

		if show_details:
			ws_dict["items"] = ws_hierarchical_rows
			all_detailed_items.extend(ws_hierarchical_rows)

		workspaces_result.append(ws_dict)

	# Apply status filter if specified ('Permitted' or 'Denied')
	if status_filter == "Permitted":
		filtered_workspaces = [ws for ws in workspaces_result if ws.get("is_permitted")]
	elif status_filter == "Denied":
		filtered_workspaces = [ws for ws in workspaces_result if not ws.get("is_permitted")]
	else:
		filtered_workspaces = workspaces_result

	if show_details:
		filtered_detailed_items = _filter_hierarchical_rows_by_status(all_detailed_items, status_filter)
	else:
		filtered_detailed_items = []

	return {
		"user": user,
		"user_name": user_doc.full_name or user,
		"user_email": user_doc.email or user,
		"user_roles": sorted(list(user_roles)),
		"is_admin": is_admin,
		"is_workspace_manager": is_workspace_manager,
		"workspace_name": workspace_name,
		"show_details": bool(show_details),
		"status": status_filter,
		"summary": {
			"total_workspaces": total_workspaces,
			"permitted_workspaces": permitted_workspaces,
			"denied_workspaces": denied_workspaces,
			"total_items": total_items_count_all,
			"permitted_items": permitted_items_count_all,
			"denied_items": denied_items_count_all,
		},
		"workspaces": filtered_workspaces,
		"detailed_items": filtered_detailed_items,
		"records": filtered_detailed_items if show_details else filtered_workspaces,
	}


def _build_user_doctype_permissions(user, user_roles, is_admin, active_domains):
	"""Accurately calculates can_read doctypes and allowed modules specifically for the target user,
	without falling back to session user permissions.
	"""
	can_read = set()
	allow_modules = set()

	all_doctypes = frappe.get_all(
		"DocType",
		fields=["name", "module", "istable", "issingle", "read_only", "restrict_to_domain"],
	)

	if is_admin:
		for dt in all_doctypes:
			if not dt.istable:
				if not dt.restrict_to_domain or dt.restrict_to_domain in active_domains:
					can_read.add(dt.name)
					if dt.module:
						allow_modules.add(dt.module)
		return can_read, allow_modules

	# 1. Fetch valid permissions specifically for target user's roles from DocPerm and Custom DocPerm
	user_perms = get_valid_perms(user=user)

	perm_map = {}
	for r in user_perms:
		# Document and list view access requires level 0 permission
		if cint(r.permlevel or 0) != 0:
			continue
		dt_name = r.parent
		if dt_name not in perm_map:
			perm_map[dt_name] = {}
		for k in frappe.permissions.rights:
			if not perm_map[dt_name].get(k):
				perm_map[dt_name][k] = r.get(k)

	# 2. Get doctypes shared with the user
	try:
		user_shared = set(frappe.share.get_shared_doctypes(user=user) or [])
	except Exception:
		user_shared = set()

	# 3. Active modules
	try:
		active_modules = set(get_active_modules() or [])
	except Exception:
		active_modules = set()

	# 4. Check each doctype
	for dt in all_doctypes:
		dt_name = dt.name
		# Inactive domain -> not accessible
		if dt.restrict_to_domain and dt.restrict_to_domain not in active_domains:
			continue

		# Child table -> not a standalone desk doctype
		if dt.istable:
			continue

		p = perm_map.get(dt_name, {})
		has_perm = bool(p.get("read") or p.get("write") or p.get("create") or dt_name in user_shared)

		if has_perm:
			if not dt.read_only:
				can_read.add(dt_name)
			if dt.module:
				if not active_modules or dt.module in active_modules:
					allow_modules.add(dt.module)

	return can_read, allow_modules


def _filter_hierarchical_rows_by_status(all_detailed_items, status_filter):
	"""Filters hierarchical rows based on workspace permission ('Permitted' or 'Denied').
	When filtering by Permitted, shows permitted workspaces and all their internal items
	(even if individual items inside the workspace are denied).
	When filtering by Denied, shows denied workspaces and all their internal items.
	"""
	if not status_filter or not all_detailed_items:
		return all_detailed_items

	want_allowed = status_filter in ["Allowed", "Permitted"]

	return [
		it for it in all_detailed_items
		if bool(it.get("workspace_permitted")) == want_allowed
	]


def _check_workspace_permission(
	ws,
	user,
	user_roles,
	is_admin,
	is_workspace_manager,
	blocked_modules,
	active_domains,
	allow_modules,
	allowed_page_and_report_modules,
	ws_roles,
	custom_roles,
):
	"""Determines if a workspace is permitted for the user and supplies a clear explanation."""
	# 1. Private workspace
	if not ws.public:
		if ws.for_user == user or is_workspace_manager:
			return True, _("Private workspace for {0}").format(ws.for_user or user)
		return False, _("Private workspace belonging to {0}").format(ws.for_user or _("another user"))

	# 2. Workspace Manager / Administrator role has full access to all public workspaces
	if is_workspace_manager:
		if is_admin:
			return True, _("Permitted via Administrator role")
		return True, _("Permitted via Workspace Manager role")

	# 3. Public workspace - Hidden check
	if ws.is_hidden:
		return False, _("Workspace is hidden from non-manager users")

	# 4. Domain restriction
	if ws.restrict_to_domain and ws.restrict_to_domain not in active_domains:
		return False, _("Restricted to inactive domain '{0}'").format(ws.restrict_to_domain)

	# 5. Blocked modules
	if ws.module and ws.module in blocked_modules:
		return False, _("Module '{0}' is blocked for user").format(ws.module)

	# 6. User module permissions
	if (
		ws.module
		and ws.module not in allow_modules
		and ws.module not in allowed_page_and_report_modules
	):
		return False, _("User does not have permission for module '{0}'").format(ws.module)

	# 7. Roles check
	all_required_roles = ws_roles | custom_roles
	if not all_required_roles:
		return True, _("Public workspace (No role restriction)")

	matching_roles = user_roles & all_required_roles
	if matching_roles:
		return True, _("Permitted via role(s): {0}").format(", ".join(sorted(matching_roles)))

	return False, _("Missing required role(s): {0}").format(", ".join(sorted(all_required_roles)))


def _evaluate_workspace_items(
	ws,
	user,
	user_roles,
	is_admin,
	active_domains,
	can_read_doctypes,
	existing_doctypes,
	doctype_domain_map,
	allowed_pages,
	allowed_reports,
	links,
	shortcuts,
	charts,
	number_cards,
	quick_lists,
	custom_blocks,
	perm_cache,
	ws_permitted=True,
	ws_perm_reason="",
):
	"""Evaluates permission for all items inside a workspace and builds a hierarchical record list."""
	stats = {
		"total": 0,
		"permitted": 0,
		"denied": 0,
		"by_type": defaultdict(lambda: {"total": 0, "permitted": 0, "denied": 0}),
	}

	# Dictionary preserving section insertion order -> list of item dicts
	sections = {}

	# 1. Shortcuts Section (if any)
	if shortcuts:
		sec_name = _("Your Shortcuts")
		sections[sec_name] = []
		for sc in shortcuts:
			target = sc.link_to
			target_type = sc.type or "DocType"
			label = sc.label or target or _("Untitled Shortcut")

			if not ws_permitted:
				is_perm = False
				reason = _("Parent workspace '{0}' is denied ({1})").format(ws.title or ws.name, ws_perm_reason)
			elif sc.restrict_to_domain and sc.restrict_to_domain not in active_domains:
				is_perm = False
				reason = _("Domain '{0}' is inactive").format(sc.restrict_to_domain)
			else:
				is_perm, reason = _check_item_permission(
					target_type=target_type,
					target=target,
					user=user,
					user_roles=user_roles,
					is_admin=is_admin,
					can_read_doctypes=can_read_doctypes,
					existing_doctypes=existing_doctypes,
					doctype_domain_map=doctype_domain_map,
					active_domains=active_domains,
					allowed_pages=allowed_pages,
					allowed_reports=allowed_reports,
					perm_cache=perm_cache,
				)

			_record_item(
				sections[sec_name],
				stats=stats,
				ws=ws,
				item_type="Shortcut",
				section=sec_name,
				label=label,
				target_type=target_type,
				target=target,
				is_permitted=is_perm,
				reason=reason,
				icon=sc.icon or "bookmark",
				ws_permitted=ws_permitted,
			)

	# 2. Links grouped by Card Break
	current_card_label = None
	for link in links:
		if link.type == "Card Break":
			current_card_label = link.label or _("Card")
			if current_card_label not in sections:
				sections[current_card_label] = []
			continue

		if not current_card_label:
			current_card_label = _("General")
			if current_card_label not in sections:
				sections[current_card_label] = []

		target = link.link_to
		target_type = link.link_type or "DocType"
		label = link.label or target or _("Untitled Link")

		default_country = frappe.db.get_default("country")
		if not ws_permitted:
			is_perm = False
			reason = _("Parent workspace '{0}' is denied ({1})").format(ws.title or ws.name, ws_perm_reason)
		elif link.only_for and default_country and link.only_for != default_country:
			is_perm = False
			reason = _("Link restricted to country '{0}'").format(link.only_for)
		else:
			is_perm, reason = _check_item_permission(
				target_type=target_type,
				target=target,
				user=user,
				user_roles=user_roles,
				is_admin=is_admin,
				can_read_doctypes=can_read_doctypes,
				existing_doctypes=existing_doctypes,
				doctype_domain_map=doctype_domain_map,
				active_domains=active_domains,
				allowed_pages=allowed_pages,
				allowed_reports=allowed_reports,
				perm_cache=perm_cache,
			)

		_record_item(
			sections[current_card_label],
			stats=stats,
			ws=ws,
			item_type="Link",
			section=current_card_label,
			label=label,
			target_type=target_type,
			target=target,
			is_permitted=is_perm,
			reason=reason,
			icon=link.icon or "link",
			ws_permitted=ws_permitted,
		)

	# 3. Dashboard Charts Section
	if charts:
		sec_name = _("Dashboard Charts")
		if sec_name not in sections:
			sections[sec_name] = []
		for chart in charts:
			target = chart.chart_name
			label = chart.label or target or _("Untitled Chart")

			if not ws_permitted:
				is_perm = False
				reason = _("Parent workspace '{0}' is denied ({1})").format(ws.title or ws.name, ws_perm_reason)
			else:
				is_perm, reason = _check_chart_permission(target, user, is_admin, perm_cache)

			_record_item(
				sections[sec_name],
				stats=stats,
				ws=ws,
				item_type="Chart",
				section=sec_name,
				label=label,
				target_type="Dashboard Chart",
				target=target,
				is_permitted=is_perm,
				reason=reason,
				icon="bar-chart-2",
				ws_permitted=ws_permitted,
			)

	# 4. Number Cards Section
	if number_cards:
		sec_name = _("Number Cards")
		if sec_name not in sections:
			sections[sec_name] = []
		for nc in number_cards:
			target = nc.number_card_name
			label = nc.label or target or _("Untitled Number Card")

			if not ws_permitted:
				is_perm = False
				reason = _("Parent workspace '{0}' is denied ({1})").format(ws.title or ws.name, ws_perm_reason)
			else:
				is_perm, reason = _check_number_card_permission(target, user, is_admin, perm_cache)

			_record_item(
				sections[sec_name],
				stats=stats,
				ws=ws,
				item_type="Number Card",
				section=sec_name,
				label=label,
				target_type="Number Card",
				target=target,
				is_permitted=is_perm,
				reason=reason,
				icon="hash",
				ws_permitted=ws_permitted,
			)

	# 5. Quick Lists Section
	if quick_lists:
		sec_name = _("Quick Lists")
		if sec_name not in sections:
			sections[sec_name] = []
		for ql in quick_lists:
			target = ql.document_type
			label = ql.label or target or _("Untitled Quick List")

			if not ws_permitted:
				is_perm = False
				reason = _("Parent workspace '{0}' is denied ({1})").format(ws.title or ws.name, ws_perm_reason)
			else:
				is_perm, reason = _check_doctype_read_permission(
					target,
					user,
					is_admin,
					can_read_doctypes,
					existing_doctypes,
					doctype_domain_map,
					active_domains,
					perm_cache,
				)

			_record_item(
				sections[sec_name],
				stats=stats,
				ws=ws,
				item_type="Quick List",
				section=sec_name,
				label=label,
				target_type="DocType",
				target=target,
				is_permitted=is_perm,
				reason=reason,
				icon="list",
				ws_permitted=ws_permitted,
			)

	# 6. Custom Blocks Section
	if custom_blocks:
		sec_name = _("Custom Blocks")
		if sec_name not in sections:
			sections[sec_name] = []
		for cb in custom_blocks:
			target = cb.custom_block_name
			label = cb.label or target or _("Untitled Custom Block")

			if not ws_permitted:
				is_perm = False
				reason = _("Parent workspace '{0}' is denied ({1})").format(ws.title or ws.name, ws_perm_reason)
			else:
				is_perm, reason = _check_custom_block_permission(target, user, user_roles, is_admin, perm_cache)

			_record_item(
				sections[sec_name],
				stats=stats,
				ws=ws,
				item_type="Custom Block",
				section=sec_name,
				label=label,
				target_type="Custom HTML Block",
				target=target,
				is_permitted=is_perm,
				reason=reason,
				icon="code",
				ws_permitted=ws_permitted,
			)

	# Construct Hierarchical Rows (indent: 0 -> Workspace, indent: 1 -> Section, indent: 2 -> Item)
	hierarchical_rows = []

	# Root Node: Workspace (indent: 0)
	hierarchical_rows.append(
		{
			"node": ws.title or ws.name,
			"workspace": ws.name,
			"workspace_title": ws.title or ws.name,
			"workspace_permitted": bool(ws_permitted),
			"section": "",
			"item_type": "Workspace",
			"label": ws.title or ws.name,
			"target_type": "",
			"target": "",
			"is_permitted": bool(ws_permitted),
			"permission_status": "Permitted" if ws_permitted else "Denied",
			"reason": ws_perm_reason,
			"icon": ws.icon or "folder",
			"indent": 0,
			"total_items": stats["total"],
			"permitted_items": stats["permitted"],
			"denied_items": stats["denied"],
		}
	)

	# Child Nodes: Sections (indent: 1) and Items (indent: 2)
	for sec_label, sec_items in sections.items():
		if not sec_items:
			continue
		sec_total = len(sec_items)
		sec_perm = sum(1 for it in sec_items if it.get("is_permitted"))
		sec_denied = sec_total - sec_perm

		if not ws_permitted:
			sec_status = "Denied"
			sec_is_perm = False
			sec_reason = _("Parent workspace '{0}' is denied").format(ws.title or ws.name)
		else:
			sec_status = "Permitted" if sec_perm == sec_total else ("Partial" if sec_perm > 0 else "Denied")
			sec_is_perm = bool(sec_perm > 0)
			sec_reason = _("{0} of {1} item(s) accessible").format(sec_perm, sec_total)

		hierarchical_rows.append(
			{
				"node": sec_label,
				"workspace": ws.name,
				"workspace_title": ws.title or ws.name,
				"workspace_permitted": bool(ws_permitted),
				"section": sec_label,
				"item_type": "Section",
				"label": sec_label,
				"target_type": "",
				"target": "",
				"is_permitted": sec_is_perm,
				"permission_status": sec_status,
				"reason": sec_reason,
				"icon": "folder",
				"indent": 1,
				"total_items": sec_total,
				"permitted_items": sec_perm,
				"denied_items": sec_denied,
			}
		)

		for it in sec_items:
			it["indent"] = 2
			hierarchical_rows.append(it)

	return {"hierarchical_rows": hierarchical_rows, "stats": stats}


def _record_item(
	items, stats, ws, item_type, section, label, target_type, target, is_permitted, reason, icon, ws_permitted=True
):
	"""Records an item and updates summary stats."""
	effective_permitted = bool(is_permitted and ws_permitted)

	stats["total"] += 1
	stats["by_type"][item_type]["total"] += 1
	if effective_permitted:
		stats["permitted"] += 1
		stats["by_type"][item_type]["permitted"] += 1
	else:
		stats["denied"] += 1
		stats["by_type"][item_type]["denied"] += 1

	items.append(
		{
			"node": label,
			"workspace": ws.name,
			"workspace_title": ws.title or ws.name,
			"workspace_permitted": bool(ws_permitted),
			"item_type": item_type,
			"section": section,
			"label": label,
			"target_type": target_type,
			"target": target or "",
			"is_permitted": effective_permitted,
			"permission_status": "Permitted" if effective_permitted else "Denied",
			"reason": reason,
			"icon": icon,
			"indent": 2,
		}
	)


def _check_item_permission(
	target_type,
	target,
	user,
	user_roles,
	is_admin,
	can_read_doctypes,
	existing_doctypes,
	doctype_domain_map,
	active_domains,
	allowed_pages,
	allowed_reports,
	perm_cache,
):
	"""Evaluates access to a DocType, Page, Report, or URL."""
	if not target:
		return False, _("Target link is undefined")

	target_type_norm = (target_type or "").lower().strip()

	if target_type_norm == "doctype":
		return _check_doctype_read_permission(
			target,
			user,
			is_admin,
			can_read_doctypes,
			existing_doctypes,
			doctype_domain_map,
			active_domains,
			perm_cache,
		)
	elif target_type_norm == "page":
		if is_admin or target in allowed_pages:
			return True, _("Page '{0}' is accessible").format(target)
		return False, _("User missing required role for Page '{0}'").format(target)
	elif target_type_norm == "report":
		if is_admin or target in allowed_reports:
			return True, _("Report '{0}' is accessible").format(target)
		return False, _("User missing required role or reference doctype permission for Report '{0}'").format(target)
	elif target_type_norm in ["url", "help"]:
		return True, _("External/Desk URL")
	else:
		return True, _("Standard Link")


def _check_doctype_read_permission(
	doctype,
	user,
	is_admin,
	can_read_doctypes,
	existing_doctypes,
	doctype_domain_map,
	active_domains,
	perm_cache,
):
	"""Evaluates read permission on a DocType specifically for user with caching and safe existence check."""
	cache_key = ("doctype", doctype, user)
	if cache_key in perm_cache:
		return perm_cache[cache_key]

	if not doctype:
		res = (False, _("DocType is not specified"))
		perm_cache[cache_key] = res
		return res

	# 1. Quick in-memory existence check against existing doctypes set
	if existing_doctypes is not None and doctype not in existing_doctypes:
		res = (False, _("DocType '{0}' does not exist").format(doctype))
		perm_cache[cache_key] = res
		return res

	# 2. Administrator has access to everything
	if is_admin:
		res = (True, _("Read access permitted on DocType '{0}'").format(doctype))
		perm_cache[cache_key] = res
		return res

	# 3. Domain constraint: If restricted to a domain, domain must be active
	if doctype_domain_map:
		req_domain = doctype_domain_map.get(doctype)
		if req_domain and req_domain not in active_domains:
			res = (False, _("DocType '{0}' is restricted to inactive domain '{1}'").format(doctype, req_domain))
			perm_cache[cache_key] = res
			return res

	# 4. Check can_read_doctypes (computed specifically for target user's roles)
	if doctype in can_read_doctypes:
		res = (True, _("Read access permitted on DocType '{0}'").format(doctype))
		perm_cache[cache_key] = res
		return res

	# 5. Defensive fallback check using frappe.has_permission specifically for target user
	try:
		has_perm = bool(frappe.has_permission(doctype=doctype, ptype="read", user=user, raise_exception=False))
	except Exception:
		has_perm = False

	if has_perm:
		res = (True, _("Read access permitted on DocType '{0}'").format(doctype))
	else:
		res = (False, _("No 'read' permission on DocType '{0}'").format(doctype))

	perm_cache[cache_key] = res
	return res


def _check_chart_permission(chart_name, user, is_admin, perm_cache):
	"""Checks Dashboard Chart permission safely specifically for user."""
	cache_key = ("chart", chart_name, user)
	if cache_key in perm_cache:
		return perm_cache[cache_key]

	if not chart_name:
		res = (False, _("Dashboard Chart is not specified"))
		perm_cache[cache_key] = res
		return res

	if is_admin:
		res = (True, _("Access permitted to Dashboard Chart '{0}'").format(chart_name))
		perm_cache[cache_key] = res
		return res

	try:
		# User must have read permission on 'Dashboard Chart' doctype
		if not frappe.has_permission("Dashboard Chart", ptype="read", user=user, raise_exception=False):
			res = (False, _("No permission to view Dashboard Charts"))
			perm_cache[cache_key] = res
			return res

		if not frappe.db.exists("Dashboard Chart", chart_name):
			res = (False, _("Dashboard Chart '{0}' does not exist").format(chart_name))
			perm_cache[cache_key] = res
			return res

		has_perm = bool(frappe.has_permission("Dashboard Chart", ptype="read", doc=chart_name, user=user, raise_exception=False))
	except Exception:
		has_perm = False

	if has_perm:
		res = (True, _("Access permitted to Dashboard Chart '{0}'").format(chart_name))
	else:
		res = (False, _("No permission to view Dashboard Chart '{0}'").format(chart_name))

	perm_cache[cache_key] = res
	return res


def _check_number_card_permission(card_name, user, is_admin, perm_cache):
	"""Checks Number Card permission safely specifically for user."""
	cache_key = ("number_card", card_name, user)
	if cache_key in perm_cache:
		return perm_cache[cache_key]

	if not card_name:
		res = (False, _("Number Card is not specified"))
		perm_cache[cache_key] = res
		return res

	if is_admin:
		res = (True, _("Access permitted to Number Card '{0}'").format(card_name))
		perm_cache[cache_key] = res
		return res

	try:
		# User must have read permission on 'Number Card' doctype
		if not frappe.has_permission("Number Card", ptype="read", user=user, raise_exception=False):
			res = (False, _("No permission to view Number Cards"))
			perm_cache[cache_key] = res
			return res

		if not frappe.db.exists("Number Card", card_name):
			res = (False, _("Number Card '{0}' does not exist").format(card_name))
			perm_cache[cache_key] = res
			return res

		has_perm = bool(frappe.has_permission("Number Card", ptype="read", doc=card_name, user=user, raise_exception=False))
	except Exception:
		has_perm = False

	if has_perm:
		res = (True, _("Access permitted to Number Card '{0}'").format(card_name))
	else:
		res = (False, _("No permission to view Number Card '{0}'").format(card_name))

	perm_cache[cache_key] = res
	return res


def _check_custom_block_permission(block_name, user, user_roles, is_admin, perm_cache):
	"""Checks Custom HTML Block permission safely specifically for user."""
	cache_key = ("custom_block", block_name, user)
	if cache_key in perm_cache:
		return perm_cache[cache_key]

	if not block_name:
		res = (False, _("Custom HTML Block is not specified"))
		perm_cache[cache_key] = res
		return res

	if is_admin:
		res = (True, _("Access permitted to Custom HTML Block '{0}'").format(block_name))
		perm_cache[cache_key] = res
		return res

	try:
		if not frappe.has_permission("Custom HTML Block", ptype="read", user=user, raise_exception=False):
			res = (False, _("No permission to view Custom HTML Blocks"))
			perm_cache[cache_key] = res
			return res

		if not frappe.db.exists("Custom HTML Block", block_name):
			res = (False, _("Custom HTML Block '{0}' does not exist").format(block_name))
			perm_cache[cache_key] = res
			return res

		has_perm = bool(frappe.has_permission("Custom HTML Block", ptype="read", doc=block_name, user=user, raise_exception=False))
		if not has_perm:
			res = (False, _("No permission to view Custom HTML Block '{0}'").format(block_name))
			perm_cache[cache_key] = res
			return res

		allowed_roles = set(
			frappe.get_all("Has Role", filters={"parent": block_name}, pluck="role") or []
		)
		if not allowed_roles or (allowed_roles & user_roles):
			res = (True, _("Access permitted to Custom HTML Block '{0}'").format(block_name))
		else:
			res = (False, _("Missing required role(s) for Custom HTML Block '{0}'").format(block_name))
	except Exception:
		res = (False, _("Error evaluating permission for Custom HTML Block '{0}'").format(block_name))

	perm_cache[cache_key] = res
	return res


def _get_allowed_pages_for_user(user, user_roles, is_admin, active_domains):
	"""Calculates accessible Pages for a specific user safely."""
	try:
		if is_admin:
			return set(frappe.get_all("Page", pluck="name"))

		pages_with_roles = frappe.get_all("Has Role", filters={"parenttype": "Page"}, fields=["parent", "role"])
		page_roles_map = defaultdict(set)
		for r in pages_with_roles:
			if r.role:
				page_roles_map[r.parent].add(r.role)

		# Include custom roles if any
		try:
			custom_roles = frappe.get_all("Custom Role", filters={"page": ("is", "set")}, fields=["page", "roles"])
			for cr in custom_roles:
				if cr.roles:
					page_roles_map[cr.page].update([x.strip() for x in cr.roles.split("\n") if x.strip()])
		except Exception:
			pass

		all_pages = frappe.get_all("Page", fields=["name", "restrict_to_domain", "module"])
		allowed = set()
		for p in all_pages:
			if p.restrict_to_domain and p.restrict_to_domain not in active_domains:
				continue
			req_roles = page_roles_map.get(p.name, set())
			if not req_roles or (req_roles & user_roles):
				allowed.add(p.name)

		return allowed
	except Exception:
		return set()


def _get_allowed_reports_for_user(user, user_roles, is_admin, can_read_doctypes, existing_doctypes):
	"""Calculates accessible Reports for a specific user safely."""
	try:
		if is_admin:
			return set(frappe.get_all("Report", pluck="name"))

		reports = frappe.get_all("Report", fields=["name", "ref_doctype", "disabled"])
		report_roles = frappe.get_all("Has Role", filters={"parenttype": "Report"}, fields=["parent", "role"])
		report_roles_map = defaultdict(set)
		for r in report_roles:
			if r.role:
				report_roles_map[r.parent].add(r.role)

		allowed = set()
		for rep in reports:
			if rep.disabled:
				continue
			if rep.ref_doctype:
				# Reference DocType must exist before checking permission
				if existing_doctypes is not None and rep.ref_doctype not in existing_doctypes:
					continue
				if rep.ref_doctype not in can_read_doctypes:
					try:
						if not frappe.db.exists("DocType", rep.ref_doctype):
							continue
						if not frappe.has_permission(rep.ref_doctype, ptype="read", user=user):
							continue
					except Exception:
						continue
			req_roles = report_roles_map.get(rep.name, set())
			if not req_roles or (req_roles & user_roles):
				allowed.add(rep.name)

		return allowed
	except Exception:
		return set()


def _get_page_and_report_modules(allowed_pages, allowed_reports):
	"""Gathers modules associated with the user's accessible pages and reports safely."""
	modules = set()
	try:
		if allowed_pages:
			page_modules = frappe.get_all(
				"Page", filters={"name": ("in", list(allowed_pages))}, fields=["module"], distinct=True
			)
			for pm in page_modules:
				if pm.module:
					modules.add(pm.module)

		if allowed_reports:
			report_modules = frappe.get_all(
				"Report", filters={"name": ("in", list(allowed_reports))}, fields=["module"], distinct=True
			)
			for rm in report_modules:
				if rm.module:
					modules.add(rm.module)
	except Exception:
		pass

	return modules

