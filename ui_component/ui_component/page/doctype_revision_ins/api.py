from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import cint, format_datetime


VALID_STATUS_OPTIONS = {"All", "Active", "Inactive"}


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_revision_doctypes(doctype, txt, searchfield, start, page_len, filters):
	"""Return non-single, non-child DocTypes having is_active/custom_is_active and revised_from/custom_revised_from."""
	search_txt = f"%{txt or ''}%"
	raw_txt = txt or ""

	rows = frappe.db.sql(
		"""
		SELECT dt.name, dt.module
		FROM `tabDocType` dt
		WHERE dt.issingle = 0
			AND dt.istable = 0
			AND (
				EXISTS (
					SELECT 1 FROM `tabDocField` df
					WHERE df.parent = dt.name AND df.fieldname IN ('is_active', 'custom_is_active')
				)
				OR EXISTS (
					SELECT 1 FROM `tabCustom Field` cf
					WHERE cf.dt = dt.name AND cf.fieldname IN ('is_active', 'custom_is_active')
				)
			)
			AND (
				EXISTS (
					SELECT 1 FROM `tabDocField` df
					WHERE df.parent = dt.name AND df.fieldname IN ('revised_from', 'custom_revised_from')
				)
				OR EXISTS (
					SELECT 1 FROM `tabCustom Field` cf
					WHERE cf.dt = dt.name AND cf.fieldname IN ('revised_from', 'custom_revised_from')
				)
			)
			AND (dt.name LIKE %(search_txt)s OR dt.module LIKE %(search_txt)s)
		ORDER BY
			IF(LOCATE(%(raw_txt)s, dt.name) > 0, LOCATE(%(raw_txt)s, dt.name), 99999),
			dt.name ASC
		""",
		{
			"search_txt": search_txt,
			"raw_txt": raw_txt,
		},
		as_list=True,
	)

	if frappe.session.user != "Administrator":
		rows = [row for row in rows if frappe.has_permission(row[0], "read")]

	return rows[start : start + page_len]


@frappe.whitelist()
def get_doctype_revisions(doctype, document_name=None, status_option="All"):
	"""Return hierarchical revision records (with 'indent' key) for a revision-enabled DocType."""
	if not doctype or not isinstance(doctype, str) or not doctype.strip():
		frappe.throw(_("Please select a DocType."))

	doctype = doctype.strip()
	document_name = (document_name or "").strip() or None
	status_option = (status_option or "All").strip()
	if status_option not in VALID_STATUS_OPTIONS:
		status_option = "All"

	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} does not exist.").format(doctype))

	meta = frappe.get_meta(doctype)
	if meta.issingle or meta.istable:
		frappe.throw(_("DocType {0} must be a standard (non-single, non-child) DocType.").format(doctype))

	is_active_field, revised_from_field, revision_field = _resolve_revision_fields(meta)
	if not (is_active_field and revised_from_field):
		frappe.throw(
			_(
				"DocType {0} must have both 'is_active'/'custom_is_active' and 'revised_from'/'custom_revised_from' fields."
			).format(doctype)
		)

	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("You do not have permission to read {0}.").format(doctype), frappe.PermissionError)

	has_revision = bool(revision_field)
	has_status = bool(meta.has_field("status"))
	title_field = _get_usable_title_field(meta)

	fields = ["name", is_active_field, revised_from_field, "docstatus", "creation", "modified", "owner"]
	if revision_field:
		fields.append(revision_field)
	if has_status:
		fields.append("status")
	if title_field and title_field not in fields:
		fields.append(title_field)

	if document_name:
		if not frappe.db.exists(doctype, document_name):
			return _empty_response(
				doctype,
				document_name,
				status_option,
				meta,
				has_revision,
				has_status,
				bool(title_field),
			)

		if not frappe.has_permission(doctype, "read", doc=document_name):
			frappe.throw(
				_("You do not have permission to read {0} {1}.").format(doctype, document_name),
				frappe.PermissionError,
			)

		family_names = _get_revision_family_names(doctype, document_name, revised_from_field)
		docs = frappe.get_list(
			doctype,
			filters={"name": ["in", list(family_names)]},
			fields=fields,
			order_by="creation asc",
			limit_page_length=0,
		)
	else:
		docs = frappe.get_list(
			doctype,
			fields=fields,
			order_by="creation asc",
			limit_page_length=0,
		)

	_normalize_revision_docs(docs, is_active_field, revised_from_field, revision_field)

	records, summary = _build_hierarchical_records(
		docs=docs,
		meta=meta,
		status_option=status_option,
		document_name=document_name,
		has_revision=has_revision,
		has_status=has_status,
		title_field=title_field,
		reverse_roots=not bool(document_name),
	)

	return {
		"doctype": doctype,
		"module": meta.module,
		"document_name": document_name,
		"status_option": status_option,
		"has_revision_field": has_revision,
		"has_status_field": has_status,
		"has_title_field": bool(title_field),
		"title_field_label": meta.get_label(title_field) if title_field else None,
		"is_submittable": bool(meta.is_submittable),
		"records": records,
		"summary": summary,
	}


def _empty_response(doctype, document_name, status_option, meta, has_revision, has_status, has_title):
	return {
		"doctype": doctype,
		"module": meta.module,
		"document_name": document_name,
		"status_option": status_option,
		"has_revision_field": has_revision,
		"has_status_field": has_status,
		"has_title_field": has_title,
		"title_field_label": None,
		"is_submittable": bool(meta.is_submittable),
		"records": [],
		"summary": {
			"total": 0,
			"active": 0,
			"inactive": 0,
			"trees": 0,
			"filtered": 0,
		},
	}


def _resolve_revision_fields(meta):
	is_active_field = (
		"is_active"
		if meta.has_field("is_active")
		else ("custom_is_active" if meta.has_field("custom_is_active") else None)
	)
	revised_from_field = (
		"revised_from"
		if meta.has_field("revised_from")
		else ("custom_revised_from" if meta.has_field("custom_revised_from") else None)
	)
	revision_field = (
		"revision"
		if meta.has_field("revision")
		else ("custom_revision" if meta.has_field("custom_revision") else None)
	)
	return is_active_field, revised_from_field, revision_field


def _normalize_revision_docs(docs, is_active_field, revised_from_field, revision_field):
	for d in docs:
		if is_active_field != "is_active":
			d["is_active"] = d.get(is_active_field)
		if revised_from_field != "revised_from":
			d["revised_from"] = d.get(revised_from_field)
		if revision_field and revision_field != "revision":
			d["revision"] = d.get(revision_field)


def _get_usable_title_field(meta):
	tf = getattr(meta, "title_field", None)
	excluded = {
		"name",
		"is_active",
		"custom_is_active",
		"revised_from",
		"custom_revised_from",
		"revision",
		"custom_revision",
		"status",
		"docstatus",
	}
	if not tf or tf in excluded:
		return None
	df = meta.get_field(tf)
	if not df or df.fieldtype in frappe.model.no_value_fields:
		return None
	return tf


def _get_revision_family_names(doctype, docname, revised_from_field="revised_from"):
	"""Traverse up to root via revised_from_field and down to all descendants."""
	curr = docname
	visited_up = set()
	while curr and curr not in visited_up:
		visited_up.add(curr)
		parent = frappe.db.get_value(doctype, curr, revised_from_field)
		if parent and parent != curr and frappe.db.exists(doctype, parent):
			curr = parent
		else:
			break

	root = curr
	family = {root}
	queue = [root]
	while queue:
		batch = queue
		queue = []
		children = frappe.get_all(
			doctype,
			filters={revised_from_field: ["in", batch]},
			pluck="name",
		)
		for child in children:
			if child not in family:
				family.add(child)
				queue.append(child)

	# Ensure the requested doc is always included even if disconnected
	family.add(docname)
	return family


def _build_hierarchical_records(
	docs,
	meta,
	status_option,
	document_name,
	has_revision,
	has_status,
	title_field,
	reverse_roots=False,
):
	if not docs:
		return [], {"total": 0, "active": 0, "inactive": 0, "trees": 0, "filtered": 0}

	by_name = {d["name"]: d for d in docs}
	total_count = len(docs)
	active_count = sum(1 for d in docs if cint(d.get("is_active")) == 1)
	inactive_count = total_count - active_count

	# Count full-tree roots
	full_roots = [
		d for d in docs
		if not d.get("revised_from")
		or d.get("revised_from") == d["name"]
		or d.get("revised_from") not in by_name
	]

	# Determine kept set based on status_option
	if status_option == "Active":
		kept_names = {d["name"] for d in docs if cint(d.get("is_active")) == 1}
	elif status_option == "Inactive":
		kept_names = {d["name"] for d in docs if cint(d.get("is_active")) == 0}
	else:
		kept_names = set(by_name.keys())

	if not kept_names:
		return [], {
			"total": total_count,
			"active": active_count,
			"inactive": inactive_count,
			"trees": len(full_roots),
			"filtered": 0,
		}

	# Re-link each kept node to its nearest kept ancestor so tree nesting stays valid under filtering
	children_map = defaultdict(list)
	roots = []

	for d in docs:
		name = d["name"]
		if name not in kept_names:
			continue

		ancestor = _find_nearest_kept_ancestor(name, by_name, kept_names)
		if ancestor:
			children_map[ancestor].append(d)
		else:
			roots.append(d)

	def child_sort_key(d):
		rev = cint(d.get("revision")) if has_revision else 0
		return (rev, str(d.get("creation") or ""), d["name"])

	roots.sort(key=lambda d: (str(d.get("creation") or ""), d["name"]), reverse=reverse_roots)
	for parent_name in children_map:
		children_map[parent_name].sort(key=child_sort_key)

	ordered_nodes = []
	visited = set()

	def dfs(node, indent):
		name = node["name"]
		if name in visited:
			return
		visited.add(name)

		node_children = [c for c in children_map.get(name, []) if c["name"] not in visited]
		ordered_nodes.append((node, indent, bool(node_children)))
		for child in node_children:
			dfs(child, indent + 1)

	for root in roots:
		dfs(root, 0)

	# Safety pass in case any cyclic subset had no external root
	if len(visited) < len(kept_names):
		remaining = [d for d in docs if d["name"] in kept_names and d["name"] not in visited]
		remaining.sort(key=child_sort_key)
		for node in remaining:
			if node["name"] not in visited:
				dfs(node, 0)

	records = [
		_serialize_node(
			doc=node,
			indent=indent,
			has_children=has_children,
			meta=meta,
			document_name=document_name,
			has_revision=has_revision,
			has_status=has_status,
			title_field=title_field,
		)
		for node, indent, has_children in ordered_nodes
	]

	return records, {
		"total": total_count,
		"active": active_count,
		"inactive": inactive_count,
		"trees": len(full_roots),
		"filtered": len(records),
	}


def _find_nearest_kept_ancestor(name, by_name, kept_names):
	seen = {name}
	curr = by_name[name].get("revised_from")
	while curr and curr not in seen:
		seen.add(curr)
		if curr in kept_names:
			return curr
		parent_doc = by_name.get(curr)
		if not parent_doc:
			return None
		curr = parent_doc.get("revised_from")
	return None


def _serialize_node(doc, indent, has_children, meta, document_name, has_revision, has_status, title_field):
	is_active = cint(doc.get("is_active"))
	docstatus = cint(doc.get("docstatus"))

	if docstatus == 1:
		docstatus_label = _("Submitted")
	elif docstatus == 2:
		docstatus_label = _("Cancelled")
	else:
		docstatus_label = _("Draft") if meta.is_submittable else _("Saved")

	if has_revision and doc.get("revision") is not None:
		revision_display = _("Rev {0}").format(cint(doc.get("revision")))
	else:
		revision_display = _("Root") if indent == 0 else _("Level {0}").format(indent)

	return {
		"name": doc["name"],
		"indent": indent,
		"has_children": 1 if has_children else 0,
		"is_current": 1 if document_name and doc["name"] == document_name else 0,
		"is_active": is_active,
		"active_label": _("Active") if is_active == 1 else _("Inactive"),
		"revision": cint(doc.get("revision")) if has_revision and doc.get("revision") is not None else None,
		"revision_display": revision_display,
		"docstatus": docstatus,
		"docstatus_label": docstatus_label,
		"status": doc.get("status") or "" if has_status else "",
		"title": doc.get(title_field) or "" if title_field else "",
		"revised_from": doc.get("revised_from") or "",
		"owner": doc.get("owner") or "",
		"creation": format_datetime(doc.get("creation")) if doc.get("creation") else "",
		"modified": format_datetime(doc.get("modified")) if doc.get("modified") else "",
	}
