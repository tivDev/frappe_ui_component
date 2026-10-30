import frappe
from frappe import _


@frappe.whitelist()
def get_permission_explorer_data(doctype=None, role=None, user=None, permlevel=None, mode=None):
	"""Centralized API for Permission Explorer.

	Explores:
	1. Mode 'doctype': All permission rules and field permlevels for a selected DocType.
	2. Mode 'role': All DocTypes and operations accessible by a selected Role.
	3. Mode 'user': User roles, user permission restrictions, document shares, and effective access.

	Restricted to System Managers and Administrator.
	"""
	# Security check: administrative inspection only
	if not (frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()):
		frappe.throw(
			_("Only System Managers are permitted to access the Permission Explorer."),
			frappe.PermissionError,
		)

	# Auto-detect mode if not provided
	if not mode:
		if user:
			mode = "user"
		elif role and not doctype:
			mode = "role"
		elif doctype:
			mode = "doctype"
		else:
			mode = "doctype"

	mode = mode.lower().strip()

	if mode == "user":
		return _get_user_access_overview(user, doctype=doctype, permlevel=permlevel)
	elif mode == "role":
		return _get_role_permissions(role, permlevel=permlevel)
	else:
		return _get_doctype_permissions(doctype, permlevel=permlevel)


def _get_doctype_permissions(doctype, permlevel=None):
	"""Retrieves configured permission rules and field permlevels for a given DocType."""
	if not doctype or not isinstance(doctype, str):
		frappe.throw(_("DocType is required"))

	doctype = doctype.strip()
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} not found").format(doctype))

	meta = frappe.get_meta(doctype)
	has_custom_permissions = bool(
		frappe.db.count("Custom DocPerm", filters={"parent": doctype})
	)

	perm_doctype = "Custom DocPerm" if has_custom_permissions else "DocPerm"
	perm_fields = [
		"name",
		"parent",
		"role",
		"permlevel",
		"read",
		"write",
		"create",
		"delete",
		"submit",
		"cancel",
		"amend",
		"report",
		"export",
		"import",
		"share",
		"print",
		"email",
		"select",
		"if_owner",
	]

	# Check if condition column exists
	if frappe.db.has_column(perm_doctype, "condition"):
		perm_fields.append("condition")

	filters = {"parent": doctype}
	if permlevel is not None and permlevel != "" and str(permlevel).lower() != "all":
		filters["permlevel"] = frappe.utils.cint(permlevel)

	raw_perms = frappe.get_all(
		perm_doctype,
		filters=filters,
		fields=perm_fields,
		order_by="permlevel asc, role asc",
	)

	for idx, p in enumerate(raw_perms, start=1):
		p["seq"] = idx
		p["permlevel"] = frappe.utils.cint(p.get("permlevel") or 0)
		p["is_custom"] = has_custom_permissions
		p["doctype"] = doctype

	# Field grouping by permlevel
	fields_by_permlevel = {}
	all_fields = []
	for df in meta.fields:
		pl = df.permlevel or 0
		field_info = {
			"fieldname": df.fieldname,
			"label": df.label or df.fieldname,
			"fieldtype": df.fieldtype,
			"options": df.options,
			"permlevel": pl,
			"reqd": bool(df.reqd),
			"read_only": bool(df.read_only),
			"hidden": bool(df.hidden),
		}
		fields_by_permlevel.setdefault(pl, []).append(field_info)
		all_fields.append(field_info)

	all_permlevels = sorted(list(fields_by_permlevel.keys()))

	return {
		"mode": "doctype",
		"doctype": doctype,
		"module": meta.module or "",
		"is_submittable": bool(meta.is_submittable),
		"is_single": bool(meta.issingle),
		"is_table": bool(meta.istable),
		"has_custom_permissions": has_custom_permissions,
		"perm_doctype_source": perm_doctype,
		"total_rules": len(raw_perms),
		"permlevels": all_permlevels,
		"permissions": raw_perms,
		"fields_by_permlevel": fields_by_permlevel,
		"fields": all_fields,
	}


def _get_role_permissions(role, permlevel=None):
	"""Retrieves all DocTypes and permissions configured for a given Role."""
	if not role or not isinstance(role, str):
		frappe.throw(_("Role is required"))

	role = role.strip()
	if not frappe.db.exists("Role", role):
		frappe.throw(_("Role {0} not found").format(role))

	perm_fields = [
		"name",
		"parent",
		"role",
		"permlevel",
		"read",
		"write",
		"create",
		"delete",
		"submit",
		"cancel",
		"amend",
		"report",
		"export",
		"import",
		"share",
		"print",
		"email",
		"select",
		"if_owner",
	]
	if frappe.db.has_column("DocPerm", "condition"):
		perm_fields.append("condition")

	docperm_filters = {"role": role}
	if permlevel is not None and permlevel != "" and str(permlevel).lower() != "all":
		docperm_filters["permlevel"] = frappe.utils.cint(permlevel)

	# Fetch standard and custom docperms for this role
	standard_perms = frappe.get_all("DocPerm", filters=docperm_filters, fields=perm_fields)
	custom_perms = frappe.get_all("Custom DocPerm", filters=docperm_filters, fields=perm_fields)

	# In Frappe, Custom DocPerm completely overrides standard DocPerm per DocType
	doctypes_with_custom = set(
		frappe.get_all("Custom DocPerm", pluck="parent", distinct=True)
	)

	valid_rules = []
	for p in custom_perms:
		p["is_custom"] = 1
		p["doctype"] = p.get("parent")
		valid_rules.append(p)

	for p in standard_perms:
		if p.get("parent") not in doctypes_with_custom:
			p["is_custom"] = 0
			p["doctype"] = p.get("parent")
			valid_rules.append(p)

	# Enrich with DocType metadata
	parent_doctypes = list({r["doctype"] for r in valid_rules if r.get("doctype")})
	dt_meta_map = {}
	if parent_doctypes:
		meta_records = frappe.get_all(
			"DocType",
			filters={"name": ["in", parent_doctypes]},
			fields=["name", "module", "is_submittable", "istable", "issingle"],
		)
		for rec in meta_records:
			dt_meta_map[rec["name"]] = rec

	for idx, r in enumerate(valid_rules, start=1):
		r["seq"] = idx
		r["permlevel"] = frappe.utils.cint(r.get("permlevel") or 0)
		dt_info = dt_meta_map.get(r.get("doctype"), {})
		r["module"] = dt_info.get("module") or ""
		r["is_submittable"] = bool(dt_info.get("is_submittable"))
		r["istable"] = bool(dt_info.get("istable"))

	# Sort by DocType name asc, permlevel asc
	valid_rules.sort(key=lambda r: (str(r.get("doctype", "")).lower(), r.get("permlevel", 0)))

	# Re-sequence
	for idx, r in enumerate(valid_rules, start=1):
		r["seq"] = idx
		r["permlevel"] = frappe.utils.cint(r.get("permlevel") or 0)

	unique_doctypes = {r.get("doctype") for r in valid_rules if r.get("doctype")}
	read_only_count = sum(1 for r in valid_rules if r.get("read") and not r.get("write"))
	read_write_count = sum(1 for r in valid_rules if r.get("read") and r.get("write"))
	submittable_count = sum(1 for r in valid_rules if r.get("submit"))
	role_desk_access = bool(frappe.db.get_value("Role", role, "desk_access"))

	return {
		"mode": "role",
		"role": role,
		"desk_access": role_desk_access,
		"total_doctypes": len(unique_doctypes),
		"total_rules": len(valid_rules),
		"read_only_count": read_only_count,
		"read_write_count": read_write_count,
		"submittable_count": submittable_count,
		"permissions": valid_rules,
	}


def _get_user_access_overview(user, doctype=None, permlevel=None):
	"""Retrieves user roles, user permission link restrictions, and effective permissions."""
	if not user or not isinstance(user, str):
		frappe.throw(_("User is required"))

	user = user.strip()
	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} not found").format(user))

	user_doc = frappe.get_doc("User", user)
	assigned_roles = frappe.permissions.get_roles(user)
	explicit_roles = [r.role for r in user_doc.roles]

	# 1. User Permission Restrictions
	user_perms = frappe.get_all(
		"User Permission",
		filters={"user": user},
		fields=["name", "allow", "for_value", "is_default", "applicable_for", "hide_descendants"],
		order_by="allow asc, for_value asc",
	)

	# 2. Shared Documents
	doc_shares = frappe.get_all(
		"DocShare",
		filters={"user": user},
		fields=["share_doctype", "share_name", "read", "write", "share", "submit", "everyone"],
		limit_page_length=50,
		order_by="creation desc",
	)

	# 3. DocType Rules applicable to user
	rule_filters = {"role": ["in", assigned_roles]}
	if doctype and frappe.db.exists("DocType", doctype):
		rule_filters["parent"] = doctype
	if permlevel is not None and permlevel != "" and str(permlevel).lower() != "all":
		rule_filters["permlevel"] = frappe.utils.cint(permlevel)

	perm_fields = [
		"name",
		"parent",
		"role",
		"permlevel",
		"read",
		"write",
		"create",
		"delete",
		"submit",
		"cancel",
		"amend",
		"report",
		"export",
		"import",
		"share",
		"print",
		"email",
		"select",
		"if_owner",
	]
	if frappe.db.has_column("DocPerm", "condition"):
		perm_fields.append("condition")

	standard_perms = frappe.get_all("DocPerm", filters=rule_filters, fields=perm_fields)
	custom_perms = frappe.get_all("Custom DocPerm", filters=rule_filters, fields=perm_fields)
	doctypes_with_custom = set(
		frappe.get_all("Custom DocPerm", pluck="parent", distinct=True)
	)

	applicable_rules = []
	for p in custom_perms:
		p["is_custom"] = 1
		p["doctype"] = p.get("parent")
		applicable_rules.append(p)

	for p in standard_perms:
		if p.get("parent") not in doctypes_with_custom:
			p["is_custom"] = 0
			p["doctype"] = p.get("parent")
			applicable_rules.append(p)

	applicable_rules.sort(key=lambda r: (str(r.get("doctype", "")).lower(), r.get("permlevel", 0)))
	for idx, r in enumerate(applicable_rules, start=1):
		r["seq"] = idx
		r["permlevel"] = frappe.utils.cint(r.get("permlevel") or 0)

	# 4. Effective permission summary if a DocType is selected
	effective_summary = None
	if doctype and frappe.db.exists("DocType", doctype):
		try:
			meta = frappe.get_meta(doctype)
			effective_summary = {
				"doctype": doctype,
				"can_read": bool(frappe.has_permission(doctype, ptype="read", user=user)),
				"can_write": bool(frappe.has_permission(doctype, ptype="write", user=user)),
				"can_create": bool(frappe.has_permission(doctype, ptype="create", user=user)),
				"can_delete": bool(frappe.has_permission(doctype, ptype="delete", user=user)),
				"can_submit": bool(frappe.has_permission(doctype, ptype="submit", user=user)),
				"can_cancel": bool(frappe.has_permission(doctype, ptype="cancel", user=user)),
				"can_amend": bool(frappe.has_permission(doctype, ptype="amend", user=user)),
				"can_report": bool(frappe.has_permission(doctype, ptype="report", user=user)),
				"can_export": bool(frappe.has_permission(doctype, ptype="export", user=user)),
				"can_import": bool(frappe.has_permission(doctype, ptype="import", user=user)),
				"can_print": bool(frappe.has_permission(doctype, ptype="print", user=user)),
				"can_email": bool(frappe.has_permission(doctype, ptype="email", user=user)),
				"can_share": bool(frappe.has_permission(doctype, ptype="share", user=user)),
			}
		except Exception as e:
			frappe.log_error(f"Error evaluating user permissions: {e}")

	has_desk_access = bool(
		user_doc.user_type == "System User"
		and user_doc.has_desk_access()
		and user_doc.enabled
	)

	return {
		"mode": "user",
		"user": user,
		"user_name": user_doc.full_name or user,
		"user_type": user_doc.user_type or "System User",
		"enabled": bool(user_doc.enabled),
		"has_desk_access": has_desk_access,
		"assigned_roles": assigned_roles,
		"explicit_roles": explicit_roles,
		"user_permissions": user_perms,
		"shares": doc_shares,
		"effective_summary": effective_summary,
		"doctype": doctype,
		"total_rules": len(applicable_rules),
		"permissions": applicable_rules,
	}

