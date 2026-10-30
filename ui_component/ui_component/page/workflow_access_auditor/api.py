import frappe
from frappe import _
from frappe.utils import cint


@frappe.whitelist()
def get_workflow_inspector_data(doctype=None, role=None, state=None):
	"""Fetches workflow definitions, document states, and transitions

	for a mandatory DocType, formatted as a hierarchical dataset for EasyTable.
	"""
	if not _is_authorized():
		frappe.throw(
			_("You are not authorized to view Workflow Inspector data."),
			frappe.PermissionError,
		)

	# 1. Validation: DocType is mandatory
	if not doctype or not isinstance(doctype, str) or not doctype.strip():
		frappe.throw(_("DocType is required to inspect workflows."))

	doctype = doctype.strip()
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} does not exist.").format(doctype))

	# 2. Retrieve workflows strictly for this DocType
	workflow_names = frappe.get_all(
		"Workflow",
		filters={"document_type": doctype},
		pluck="name",
		order_by="is_active desc, name asc",
	)

	if not workflow_names:
		return {
			"doctype": doctype,
			"summary": {
				"total_workflows": 0,
				"active_workflows": 0,
				"inactive_workflows": 0,
				"total_states": 0,
				"total_transitions": 0,
			},
			"records": [],
			"message": _("No workflows configured for DocType {0}.").format(doctype),
		}

	filter_role = (role.strip().lower() if (role and isinstance(role, str) and role.strip()) else None)
	filter_state = (state.strip().lower() if (state and isinstance(state, str) and state.strip()) else None)

	records = []
	active_wf_count = 0
	inactive_wf_count = 0
	total_states_count = 0
	total_transitions_count = 0
	matched_wf_count = 0

	docstatus_map = {
		0: _("0 (Draft)"),
		1: _("1 (Submitted)"),
		2: _("2 (Cancelled)"),
	}

	for wf_name in workflow_names:
		try:
			wf_doc = frappe.get_doc("Workflow", wf_name)
		except Exception:
			continue

		is_active = bool(cint(wf_doc.get("is_active", 0)))
		states = wf_doc.get("states") or []
		transitions = wf_doc.get("transitions") or []

		# Check role filter against states and transitions
		if filter_role:
			role_in_states = any(
				(s.get("allow_edit") or "").strip().lower() == filter_role for s in states
			)
			role_in_transitions = any(
				(t.get("allowed") or "").strip().lower() == filter_role for t in transitions
			)
			if not (role_in_states or role_in_transitions):
				continue

		# Check state filter against states and transitions
		if filter_state:
			state_in_states = any(
				(s.get("state") or "").strip().lower() == filter_state for s in states
			)
			state_in_transitions = any(
				(t.get("state") or "").strip().lower() == filter_state
				or (t.get("next_state") or "").strip().lower() == filter_state
				for t in transitions
			)
			if not (state_in_states or state_in_transitions):
				continue

		matched_wf_count += 1
		if is_active:
			active_wf_count += 1
		else:
			inactive_wf_count += 1

		# Group transitions by origin state: state_name -> list of transitions
		transitions_by_state = {}
		for t in transitions:
			orig_state = t.get("state") or ""
			transitions_by_state.setdefault(orig_state, []).append(t)

		total_transitions_count += len(transitions)
		total_states_count += len(states)

		# Row Level 0: Workflow
		records.append({
			"hierarchy_node": wf_name,
			"node_type": "Workflow",
			"workflow": wf_name,
			"doctype": doctype,
			"state": "",
			"doc_status": "",
			"allow_edit": "",
			"action": "",
			"next_state": "",
			"allowed_role": "",
			"allow_self_approval": None,
			"condition": "",
			"workflow_status": _("Active") if is_active else _("Inactive"),
			"is_active": is_active,
			"state_count": len(states),
			"transition_count": len(transitions),
			"indent": 0,
		})

		# Row Level 1: Workflow States
		for s in states:
			st_name = s.get("state") or ""
			raw_docstatus = cint(s.get("doc_status", 0))
			doc_status_label = docstatus_map.get(raw_docstatus, str(raw_docstatus))
			allow_edit_role = s.get("allow_edit") or ""
			state_transitions = transitions_by_state.get(st_name, [])

			# Filter transitions if role filter is set
			applicable_transitions = state_transitions
			if filter_role:
				applicable_transitions = [
					t for t in state_transitions
					if (t.get("allowed") or "").strip().lower() == filter_role
				]

			records.append({
				"hierarchy_node": st_name,
				"node_type": "State",
				"workflow": "",
				"doctype": "",
				"state": st_name,
				"doc_status": doc_status_label,
				"raw_docstatus": raw_docstatus,
				"allow_edit": allow_edit_role,
				"action": "",
				"next_state": "",
				"allowed_role": "",
				"allow_self_approval": None,
				"condition": "",
				"workflow_status": "",
				"is_active": is_active,
				"is_optional_state": bool(cint(s.get("is_optional_state", 0))),
				"transition_count": len(state_transitions),
				"indent": 1,
			})

			# Row Level 2: Transitions from this state
			for t in applicable_transitions:
				action_name = t.get("action") or ""
				nxt_state = t.get("next_state") or ""
				allowed_role = t.get("allowed") or ""
				self_approval = bool(cint(t.get("allow_self_approval", 0)))
				cond = (t.get("condition") or "").strip()

				records.append({
					"hierarchy_node": action_name or _("Transition"),
					"node_type": "Transition",
					"workflow": "",
					"doctype": "",
					"state": st_name,
					"doc_status": "",
					"allow_edit": "",
					"action": action_name,
					"next_state": nxt_state,
					"allowed_role": allowed_role,
					"allow_self_approval": self_approval,
					"condition": cond,
					"workflow_status": "",
					"is_active": is_active,
					"indent": 2,
				})

	return {
		"doctype": doctype,
		"summary": {
			"total_workflows": matched_wf_count,
			"active_workflows": active_wf_count,
			"inactive_workflows": inactive_wf_count,
			"total_states": total_states_count,
			"total_transitions": total_transitions_count,
		},
		"records": records,
	}


# Alias for backwards compatibility
get_workflow_access_auditor_data = get_workflow_inspector_data


def _is_authorized():
	"""Checks if session user is System Manager, Administrator, or has Workflow Manager role."""
	if frappe.session.user == "Administrator":
		return True
	user_roles = frappe.get_roles()
	allowed_roles = {"System Manager", "Workflow Manager", "Workspace Manager"}
	return bool(allowed_roles.intersection(user_roles))
