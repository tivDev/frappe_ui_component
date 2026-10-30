import frappe
from frappe import _
from frappe.model.db_query import DatabaseQuery
from frappe.utils import cint


@frappe.whitelist()
def get_user_access_analysis(
	user=None,
	doctype=None,
	document_name=None,
	access_type=None,
	access_status=None,
	limit_start=0,
	page_length=25,
):
	"""Analyzes effective access and permission distinctions (list visibility vs detail read vs write)

	for a specified user on candidate documents of a DocType.
	"""
	# 1. Security Check: Restrict to administrators or system managers
	if not _is_authorized_analyzer():
		frappe.throw(
			_("You are not authorized to use the User Access Analyzer."),
			frappe.PermissionError,
		)

	# 2. Input validation
	if not user or not isinstance(user, str):
		frappe.throw(_("User is required."))
	user = user.strip()
	if not frappe.db.exists("User", user):
		frappe.throw(_("User {0} does not exist.").format(user))

	user_doc = frappe.get_doc("User", user)
	has_desk_access = bool(
		user_doc.user_type == "System User"
		and user_doc.has_desk_access()
		and user_doc.enabled
	)

	if not doctype or not isinstance(doctype, str):
		frappe.throw(_("DocType is required."))
	doctype = doctype.strip()
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} does not exist.").format(doctype))

	meta = frappe.get_meta(doctype)
	if meta.issingle:
		frappe.throw(_("Single DocType {0} has no multiple document records.").format(doctype))
	if meta.istable:
		frappe.throw(_("Child Table {0} cannot be analyzed as independent documents.").format(doctype))

	limit_start = max(0, cint(limit_start or 0))
	page_length = min(100, max(1, cint(page_length or 25)))

	# 3. User baseline roles & DocType permissions
	user_roles = frappe.permissions.get_roles(user)
	role_perms = frappe.permissions.get_role_permissions(meta, user=user)

	# Fetch valid permissions from DocPerm & Custom DocPerm for this DocType without Administrator bypass
	valid_perms = frappe.permissions.get_valid_perms(doctype=doctype, user=user)
	level0_perms = [p for p in valid_perms if cint(p.get("permlevel", 0)) == 0]

	has_role_read_rule = any(p.get("read") for p in level0_perms)
	has_role_write_rule = any(p.get("write") for p in level0_perms)
	has_doctype_delete_rule = any(p.get("delete") for p in level0_perms)
	has_delete_without_if_owner = any(p.get("delete") and not p.get("if_owner") for p in level0_perms)
	has_delete_with_if_owner = any(p.get("delete") and p.get("if_owner") for p in level0_perms)

	has_doctype_read_rule = bool(role_perms.get("read")) or has_role_read_rule
	has_doctype_write_rule = bool(role_perms.get("write")) or has_role_write_rule
	has_if_owner_enabled = bool(role_perms.get("has_if_owner_enabled")) or any(p.get("if_owner") for p in level0_perms)

	# User permissions for this user (restrictive links)
	user_perms = frappe.get_all(
		"User Permission",
		filters={"user": user},
		fields=["allow", "for_value", "applicable_for"],
	)

	# 4. Discover candidate documents
	candidate_names = []
	if document_name and isinstance(document_name, str) and document_name.strip():
		doc_name = document_name.strip()
		if frappe.db.exists(doctype, doc_name):
			candidate_names = [doc_name]
		else:
			return {
				"user": user,
				"user_name": user_doc.full_name or user,
				"user_type": user_doc.user_type,
				"enabled": bool(user_doc.enabled),
				"has_desk_access": has_desk_access,
				"doctype": doctype,
				"document_name": doc_name,
				"summary": {
					"analyzed": 0,
					"accessible": 0,
					"inaccessible": 0,
					"indeterminate": 0,
				},
				"doctype_meta": {
					"module": meta.module,
					"is_submittable": bool(meta.is_submittable),
					"istable": bool(meta.istable),
					"has_read_rule": has_doctype_read_rule,
					"has_write_rule": has_doctype_write_rule,
					"has_delete_rule": has_doctype_delete_rule,
				},
				"records": [],
				"message": _("Document {0} does not exist in {1}.").format(doc_name, doctype),
			}
	else:
		candidate_names = frappe.get_all(
			doctype,
			pluck="name",
			order_by="modified desc",
			start=limit_start,
			page_length=page_length,
		)

	if not candidate_names:
		return {
			"user": user,
			"user_name": user_doc.full_name or user,
			"user_type": user_doc.user_type,
			"enabled": bool(user_doc.enabled),
			"has_desk_access": has_desk_access,
			"doctype": doctype,
			"document_name": document_name,
			"summary": {
				"analyzed": 0,
				"accessible": 0,
				"inaccessible": 0,
				"indeterminate": 0,
			},
			"doctype_meta": {
				"module": meta.module,
				"is_submittable": bool(meta.is_submittable),
				"istable": bool(meta.istable),
				"has_read_rule": has_doctype_read_rule,
				"has_write_rule": has_doctype_write_rule,
				"has_delete_rule": has_doctype_delete_rule,
			},
			"records": [],
		}

	# 5. Evaluate list visibility in the user's list query context
	visible_in_list = set()
	try:
		list_records = DatabaseQuery(doctype, user=user).execute(
			fields=["name"],
			filters=[["name", "in", candidate_names]],
			limit_page_length=len(candidate_names) + 5,
			ignore_permissions=False,
			user=user,
		)
		visible_in_list = {r["name"] for r in list_records if r.get("name")}
	except Exception as e:
		frappe.log_error(f"Error evaluating list visibility for {doctype} user {user}: {e}")

	# 6. Fetch sharing records for these candidate documents
	shared_records = {}
	shares = frappe.get_all(
		"DocShare",
		filters={"share_doctype": doctype, "share_name": ["in", candidate_names], "user": user},
		fields=["share_name", "read", "write", "share", "submit", "everyone"],
	)
	for s in shares:
		shared_records[s["share_name"]] = s

	# 7. Evaluate per-document access
	records = []
	accessible_count = 0
	inaccessible_count = 0
	indeterminate_count = 0

	for name in candidate_names:
		is_list_visible = name in visible_in_list
		doc = None
		is_owner = False
		doc_owner = ""

		try:
			doc = frappe.get_doc(doctype, name)
			doc_owner = doc.get("owner") or ""
			is_owner = doc_owner.lower() == user.lower()
		except Exception:
			pass

		# Detail read access
		can_read = False
		read_status = "denied"
		read_details = ""

		try:
			can_read = bool(frappe.has_permission(doctype, ptype="read", doc=doc, user=user))
			read_status = "allowed" if can_read else "denied"
		except Exception as e:
			read_status = "indeterminate"
			read_details = _("Read permission check encountered an error: {0}").format(str(e))

		# Write access
		can_write = False
		write_status = "denied"
		write_details = ""
		try:
			can_write = bool(frappe.has_permission(doctype, ptype="write", doc=doc, user=user))
			write_status = "allowed" if can_write else "denied"
		except Exception as e:
			write_status = "indeterminate"
			write_details = _("Write check encountered an error: {0}").format(str(e))

		# Delete access
		can_delete = False
		delete_status = "denied"
		delete_details = ""
		try:
			if not has_doctype_delete_rule:
				can_delete = False
				delete_status = "denied"
				delete_details = _("Delete access denied: User roles lack baseline Delete permission on {0}.").format(doctype)
			elif not has_delete_without_if_owner and has_delete_with_if_owner and not is_owner:
				can_delete = False
				delete_status = "denied"
				delete_details = _("Delete denied: Owner-only rule restricts deletion to document owner.")
			elif meta.is_submittable and doc and cint(doc.get("docstatus", 0)) == 1:
				can_delete = False
				delete_status = "denied"
				delete_details = _("Delete denied: Submitted documents cannot be deleted.")
			else:
				can_delete = bool(frappe.has_permission(doctype, ptype="delete", doc=doc, user=user))
				delete_status = "allowed" if can_delete else "denied"
				if not can_delete:
					delete_details = _("Delete denied: Restricted by document permissions or controller hook.")
		except Exception as e:
			delete_status = "indeterminate"
			delete_details = _("Delete check encountered an error: {0}").format(str(e))

		# Other permissions
		other_ops = {}
		if meta.is_submittable:
			try:
				other_ops["submit"] = "allowed" if frappe.has_permission(doctype, ptype="submit", doc=doc, user=user) else "denied"
			except Exception:
				other_ops["submit"] = "indeterminate"

			try:
				other_ops["cancel"] = "allowed" if frappe.has_permission(doctype, ptype="cancel", doc=doc, user=user) else "denied"
			except Exception:
				other_ops["cancel"] = "indeterminate"

			try:
				other_ops["amend"] = "allowed" if frappe.has_permission(doctype, ptype="amend", doc=doc, user=user) else "denied"
			except Exception:
				other_ops["amend"] = "indeterminate"
		else:
			other_ops["submit"] = "not_applicable"
			other_ops["cancel"] = "not_applicable"
			other_ops["amend"] = "not_applicable"

		try:
			other_ops["share"] = "allowed" if frappe.has_permission(doctype, ptype="share", doc=doc, user=user) else "denied"
		except Exception:
			other_ops["share"] = "indeterminate"

		# 8. Diagnostic Root Cause Explanation
		share_info = shared_records.get(name)
		causes = []

		if can_read and is_list_visible:
			if share_info:
				causes.append(_("Access granted via explicit document share."))
			elif has_if_owner_enabled and is_owner:
				causes.append(_("Access granted because user is the document owner (owner rule active)."))
			elif has_doctype_read_rule:
				causes.append(_("Read access granted via assigned role permissions."))
			else:
				causes.append(_("Read access permitted by effective permission evaluation."))
		elif is_list_visible and not can_read:
			causes.append(_("Appears in list query but detail read access is denied by document controller or permissions."))
		elif not is_list_visible and can_read:
			causes.append(_("Can read document details directly, but document is excluded from the list query view."))
		else:
			# Both denied
			has_query_cond = bool(frappe.get_hooks("permission_query_conditions", {}).get(doctype))
			has_perm_hook = bool(frappe.get_hooks("has_permission", {}).get(doctype))

			if not has_doctype_read_rule:
				causes.append(_("Denied: User roles lack baseline Read permission on {0}.").format(doctype))
			elif has_if_owner_enabled and not is_owner:
				causes.append(_("Denied: Read permission requires document ownership, but document owner is {0}.").format(doc_owner or "another user"))
			elif user_perms:
				causes.append(_("Denied: Blocked by active User Permission restriction(s)."))
			elif has_query_cond or has_perm_hook:
				causes.append(_("Denied: Excluded by DocType permission conditions / controller hook (e.g. document is not assigned to or allocated to this user)."))
			else:
				causes.append(_("Access denied; exact cause not determined."))

		if can_read and not can_write:
			if not has_doctype_write_rule:
				causes.append(_("Write access denied: User lacks Write permission."))
			elif has_if_owner_enabled and not is_owner:
				causes.append(_("Write denied: Owner-only rule restricts modification to owner."))

		if can_read and not can_delete:
			if not has_doctype_delete_rule:
				causes.append(_("Delete access denied: User roles lack Delete permission on {0}.").format(doctype))
			elif not has_delete_without_if_owner and has_delete_with_if_owner and not is_owner:
				causes.append(_("Delete denied: Owner-only rule restricts deletion to document owner."))
			elif meta.is_submittable and doc and cint(doc.get("docstatus", 0)) == 1:
				causes.append(_("Delete denied: Submitted document must be cancelled before deletion."))
			else:
				causes.append(_("Delete access denied by permissions or controller rule."))

		diagnostic_text = " ".join(causes)

		# Overall categorization
		is_accessible = can_read or is_list_visible
		if is_accessible:
			accessible_count += 1
		elif read_status == "indeterminate" or write_status == "indeterminate":
			indeterminate_count += 1
		else:
			inaccessible_count += 1

		# Filtering
		include_record = True
		if access_type and access_type.lower() != "all":
			op = access_type.lower()
			op_status = "denied"
			if op == "read":
				op_status = read_status
			elif op == "write":
				op_status = write_status
			elif op == "delete":
				op_status = delete_status
			elif op == "list":
				op_status = "allowed" if is_list_visible else "denied"
			elif op in other_ops:
				op_status = other_ops[op]

			if access_status and access_status.lower() != "all":
				if op_status.lower() != access_status.lower():
					include_record = False
			elif op_status != "allowed":
				# Default filter for specific access_type shows allowed records
				pass

		elif access_status and access_status.lower() != "all":
			target_stat = access_status.lower()
			if target_stat == "allowed" and not is_accessible:
				include_record = False
			elif target_stat == "denied" and is_accessible:
				include_record = False
			elif target_stat == "indeterminate" and (read_status != "indeterminate" and write_status != "indeterminate"):
				include_record = False

		if include_record:
			records.append({
				"name": name,
				"owner": doc_owner,
				"is_owner": is_owner,
				"list_visibility": {
					"status": "allowed" if is_list_visible else "denied",
					"details": _("Visible in list query") if is_list_visible else _("Excluded from list query"),
				},
				"detail_read_access": {
					"status": read_status,
					"details": read_details or (_("Detail read permitted") if can_read else _("Detail read denied")),
				},
				"write_access": {
					"status": write_status,
					"details": write_details or (_("Write permitted") if can_write else _("Write denied")),
				},
				"delete_access": {
					"status": delete_status,
					"details": delete_details or (_("Delete permitted") if can_delete else _("Delete denied")),
				},
				"other_permissions": other_ops,
				"access_details": diagnostic_text,
			})

	return {
		"user": user,
		"user_name": user_doc.full_name or user,
		"user_type": user_doc.user_type,
		"enabled": bool(user_doc.enabled),
		"has_desk_access": has_desk_access,
		"doctype": doctype,
		"document_name": document_name,
		"summary": {
			"analyzed": len(candidate_names),
			"accessible": accessible_count,
			"inaccessible": inaccessible_count,
			"indeterminate": indeterminate_count,
		},
		"doctype_meta": {
			"module": meta.module,
			"is_submittable": bool(meta.is_submittable),
			"istable": bool(meta.istable),
			"has_read_rule": has_doctype_read_rule,
			"has_write_rule": has_doctype_write_rule,
			"has_delete_rule": has_doctype_delete_rule,
			"has_if_owner_enabled": has_if_owner_enabled,
		},
		"records": records,
	}


def _is_authorized_analyzer():
	"""Checks if session user is System Manager or Administrator."""
	if frappe.session.user == "Administrator":
		return True
	user_roles = frappe.get_roles()
	return "System Manager" in user_roles

