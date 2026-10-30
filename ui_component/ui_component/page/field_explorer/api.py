import frappe
from frappe import _


def _get_system_fields(meta, indent=0, parent_doctype=None, parent_field=None):
	"""Returns standard system fields for a DocType."""
	system_fields = [
		{
			"idx": 0,
			"fieldname": "name",
			"label": _("ID / Name"),
			"fieldtype": "Data",
			"options": None,
			"reqd": 1,
			"read_only": 1,
			"hidden": 0,
			"in_list_view": 1,
			"in_standard_filter": 1,
			"in_global_search": 1,
			"unique": 1,
			"default": None,
			"description": _("Unique primary key identifier"),
			"is_system_field": 1,
			"indent": indent,
			"parent_doctype": parent_doctype or meta.name,
			"parent_field": parent_field or "",
		},
		{
			"idx": 0,
			"fieldname": "owner",
			"label": _("Created By (Owner)"),
			"fieldtype": "Link",
			"options": "User",
			"reqd": 0,
			"read_only": 1,
			"hidden": 0,
			"in_list_view": 0,
			"in_standard_filter": 1,
			"in_global_search": 0,
			"unique": 0,
			"default": None,
			"description": _("User who created the record"),
			"is_system_field": 1,
			"indent": indent,
			"parent_doctype": parent_doctype or meta.name,
			"parent_field": parent_field or "",
		},
		{
			"idx": 0,
			"fieldname": "creation",
			"label": _("Created On"),
			"fieldtype": "Datetime",
			"options": None,
			"reqd": 0,
			"read_only": 1,
			"hidden": 0,
			"in_list_view": 0,
			"in_standard_filter": 0,
			"in_global_search": 0,
			"unique": 0,
			"default": None,
			"description": _("Creation timestamp"),
			"is_system_field": 1,
			"indent": indent,
			"parent_doctype": parent_doctype or meta.name,
			"parent_field": parent_field or "",
		},
		{
			"idx": 0,
			"fieldname": "modified",
			"label": _("Last Modified"),
			"fieldtype": "Datetime",
			"options": None,
			"reqd": 0,
			"read_only": 1,
			"hidden": 0,
			"in_list_view": 1,
			"in_standard_filter": 0,
			"in_global_search": 0,
			"unique": 0,
			"default": None,
			"description": _("Last modified timestamp"),
			"is_system_field": 1,
			"indent": indent,
			"parent_doctype": parent_doctype or meta.name,
			"parent_field": parent_field or "",
		},
		{
			"idx": 0,
			"fieldname": "modified_by",
			"label": _("Modified By"),
			"fieldtype": "Link",
			"options": "User",
			"reqd": 0,
			"read_only": 1,
			"hidden": 0,
			"in_list_view": 0,
			"in_standard_filter": 0,
			"in_global_search": 0,
			"unique": 0,
			"default": None,
			"description": _("User who last updated the record"),
			"is_system_field": 1,
			"indent": indent,
			"parent_doctype": parent_doctype or meta.name,
			"parent_field": parent_field or "",
		},
	]

	if meta.is_submittable:
		system_fields.append(
			{
				"idx": 0,
				"fieldname": "docstatus",
				"label": _("Document Status"),
				"fieldtype": "Select",
				"options": "0: Draft\n1: Submitted\n2: Cancelled",
				"reqd": 0,
				"read_only": 1,
				"hidden": 0,
				"in_list_view": 1,
				"in_standard_filter": 1,
				"in_global_search": 0,
				"unique": 0,
				"default": "0",
				"description": _("0=Draft, 1=Submitted, 2=Cancelled"),
				"is_system_field": 1,
				"indent": indent,
				"parent_doctype": parent_doctype or meta.name,
				"parent_field": parent_field or "",
			}
		)

	if meta.istable:
		system_fields.extend(
			[
				{
					"idx": 0,
					"fieldname": "parent",
					"label": _("Parent Document"),
					"fieldtype": "Data",
					"options": None,
					"reqd": 1,
					"read_only": 1,
					"hidden": 0,
					"in_list_view": 0,
					"in_standard_filter": 1,
					"in_global_search": 0,
					"unique": 0,
					"default": None,
					"description": _("Name of the parent record"),
					"is_system_field": 1,
					"indent": indent,
					"parent_doctype": parent_doctype or meta.name,
					"parent_field": parent_field or "",
				},
				{
					"idx": 0,
					"fieldname": "parenttype",
					"label": _("Parent DocType"),
					"fieldtype": "Link",
					"options": "DocType",
					"reqd": 1,
					"read_only": 1,
					"hidden": 0,
					"in_list_view": 0,
					"in_standard_filter": 1,
					"in_global_search": 0,
					"unique": 0,
					"default": None,
					"description": _("DocType of the parent record"),
					"is_system_field": 1,
					"indent": indent,
					"parent_doctype": parent_doctype or meta.name,
					"parent_field": parent_field or "",
				},
				{
					"idx": 0,
					"fieldname": "parentfield",
					"label": _("Parent Field"),
					"fieldtype": "Data",
					"options": None,
					"reqd": 1,
					"read_only": 1,
					"hidden": 0,
					"in_list_view": 0,
					"in_standard_filter": 0,
					"in_global_search": 0,
					"unique": 0,
					"default": None,
					"description": _("Fieldname in parent linking to this table"),
					"is_system_field": 1,
					"indent": indent,
					"parent_doctype": parent_doctype or meta.name,
					"parent_field": parent_field or "",
				},
			]
		)

	return system_fields


def _format_docfield(df, indent=0, parent_doctype=None, parent_field=None):
	"""Serializes a DocField into a dictionary with indent and metadata."""
	return {
		"idx": df.idx,
		"fieldname": df.fieldname or "",
		"label": df.label or df.fieldname or "",
		"fieldtype": df.fieldtype or "Data",
		"options": df.options or "",
		"reqd": 1 if df.reqd else 0,
		"read_only": 1 if df.read_only else 0,
		"hidden": 1 if df.hidden else 0,
		"in_list_view": 1 if df.in_list_view else 0,
		"in_standard_filter": 1 if df.in_standard_filter else 0,
		"in_global_search": 1 if df.in_global_search else 0,
		"allow_on_submit": 1 if df.allow_on_submit else 0,
		"bold": 1 if df.bold else 0,
		"unique": 1 if df.unique else 0,
		"translatable": 1 if df.translatable else 0,
		"default": str(df.default) if df.default is not None else "",
		"description": df.description or "",
		"depends_on": df.depends_on or "",
		"mandatory_depends_on": df.mandatory_depends_on or "",
		"read_only_depends_on": df.read_only_depends_on or "",
		"fetch_from": df.fetch_from or "",
		"is_custom_field": 1 if getattr(df, "is_custom_field", 0) else 0,
		"is_system_field": 0,
		"indent": indent,
		"parent_doctype": parent_doctype or "",
		"parent_field": parent_field or "",
	}


def _collect_doctype_fields(
	doctype,
	include_system_fields=True,
	indent=0,
	visited_doctypes=None,
	parent_field=None,
):
	"""Recursively gathers fields for a DocType and any child Table / Table MultiSelect fields."""
	if visited_doctypes is None:
		visited_doctypes = set()

	if doctype in visited_doctypes:
		return []

	visited_doctypes.add(doctype)

	try:
		meta = frappe.get_meta(doctype)
	except Exception:
		visited_doctypes.remove(doctype)
		return []

	all_fields = []

	if frappe.utils.cint(include_system_fields):
		all_fields.extend(
			_get_system_fields(
				meta,
				indent=indent,
				parent_doctype=doctype,
				parent_field=parent_field,
			)
		)

	for df in meta.fields:
		all_fields.append(
			_format_docfield(
				df,
				indent=indent,
				parent_doctype=doctype,
				parent_field=parent_field,
			)
		)

		# If fieldtype is Table or Table MultiSelect, fetch child fields with increased indent
		if df.fieldtype in ("Table", "Table MultiSelect") and df.options:
			child_doctype = df.options.strip()
			if frappe.db.exists("DocType", child_doctype):
				child_fields = _collect_doctype_fields(
					child_doctype,
					include_system_fields=include_system_fields,
					indent=indent + 2,
					visited_doctypes=visited_doctypes,
					parent_field=df.fieldname,
				)
				all_fields.extend(child_fields)

	visited_doctypes.remove(doctype)
	return all_fields


@frappe.whitelist()
def get_doctype_fields(doctype=None, include_system_fields=True):
	"""Returns comprehensive field metadata for a given DocType, including nested child tables."""
	if not doctype:
		frappe.throw(_("DocType is required"))

	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} not found").format(doctype))

	meta = frappe.get_meta(doctype)

	all_fields = _collect_doctype_fields(
		doctype,
		include_system_fields=include_system_fields,
		indent=0,
	)

	# Re-index sequence for display
	for i, f in enumerate(all_fields, start=1):
		f["seq"] = i

	child_tables = [
		{"fieldname": df.fieldname, "label": df.label or df.fieldname, "options": df.options}
		for df in meta.fields
		if df.fieldtype in ("Table", "Table MultiSelect") and df.options
	]

	return {
		"doctype": doctype,
		"module": meta.module,
		"is_submittable": bool(meta.is_submittable),
		"is_single": bool(meta.issingle),
		"is_table": bool(meta.istable),
		"is_tree": bool(meta.is_tree),
		"title_field": meta.title_field or "name",
		"search_fields": meta.search_fields or "",
		"sort_field": meta.sort_field or "modified",
		"sort_order": meta.sort_order or "DESC",
		"autoname": meta.autoname or "",
		"total_fields": len(all_fields),
		"fields": all_fields,
		"child_tables": child_tables,
	}
