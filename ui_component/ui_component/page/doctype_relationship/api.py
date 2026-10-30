import frappe
from frappe import _


@frappe.whitelist()
def get_doctype_relationships(doctype=None, include_indirect=True, direction="both"):
	"""Explores and returns all DocTypes referencing or referenced by the target DocType.

	Discovers:
	- Incoming dependencies: Other DocTypes linking to target_doctype (Direct or via Child Table)
	- Outgoing dependencies: target_doctype linking to other DocTypes (Direct or via Child Table)

	:param doctype: Target DocType name (e.g. 'User', 'Customer', 'Item')
	:param include_indirect: Whether to discover references through child DocTypes (default True)
	:param direction: 'both', 'incoming', or 'outgoing' (default 'both')
	:return: dict with target metadata, counts, and list of verified relationship objects
	"""
	if not doctype or not isinstance(doctype, str):
		frappe.throw(_("Target DocType is required"))

	doctype = doctype.strip()

	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} not found").format(doctype))

	# Permission check for target DocType
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(
			_("You do not have permission to access DocType {0}.").format(doctype),
			frappe.PermissionError,
		)

	include_indirect = bool(frappe.utils.cint(include_indirect))
	direction = (direction or "both").strip().lower()
	if direction not in ("both", "incoming", "outgoing"):
		direction = "both"

	target_meta = frappe.get_meta(doctype)
	relationships = []
	seen_relationships = set()

	# ---------------------------------------------------------
	# 1. INCOMING DEPENDENCIES (Other DocTypes -> target_doctype)
	# ---------------------------------------------------------
	if direction in ("both", "incoming"):
		docfield_links = frappe.get_all(
			"DocField",
			fields=["parent", "fieldname", "label", "fieldtype", "options"],
			filters={"fieldtype": "Link", "options": doctype},
			order_by=None,
		)

		customfield_links = frappe.get_all(
			"Custom Field",
			fields=["dt as parent", "fieldname", "label", "fieldtype", "options"],
			filters={"fieldtype": "Link", "options": doctype},
			order_by=None,
		)

		raw_links = docfield_links + customfield_links

		# De-duplicate by (parent, fieldname)
		unique_links = {}
		for f in raw_links:
			parent = f.get("parent")
			fname = f.get("fieldname")
			if parent and fname and (parent, fname) not in unique_links:
				unique_links[(parent, fname)] = f

		all_referencing_doctypes = {f["parent"] for f in unique_links.values() if f.get("parent")}

		doctype_info_map = {}
		if all_referencing_doctypes:
			referencing_meta_records = frappe.get_all(
				"DocType",
				filters={"name": ["in", list(all_referencing_doctypes)]},
				fields=["name", "module", "istable", "issingle", "is_submittable"],
				order_by=None,
			)
			doctype_info_map = {d["name"]: d for d in referencing_meta_records}

		child_table_matches = {}  # child_doctype -> list of matching fields

		for f in unique_links.values():
			parent_dt = f["parent"]
			fname = f["fieldname"]
			dt_info = doctype_info_map.get(parent_dt)

			if not dt_info:
				continue

			# Check permission to prevent unauthorized metadata disclosure
			if not frappe.has_permission(parent_dt, "read"):
				continue

			is_child_table = bool(dt_info.get("istable"))

			if not is_child_table:
				# Direct Link relationship (Incoming)
				rel_key = (parent_dt, fname, "direct", "Incoming")
				if rel_key not in seen_relationships:
					seen_relationships.add(rel_key)
					relationships.append(
						{
							"direction": "Incoming",
							"source_doctype": parent_dt,
							"source_module": dt_info.get("module") or "",
							"is_child_table": False,
							"is_single": bool(dt_info.get("issingle")),
							"is_submittable": bool(dt_info.get("is_submittable")),
							"fieldname": fname,
							"label": f.get("label") or fname,
							"fieldtype": "Link",
							"options": doctype,
							"relationship_type": "direct",
							"matching_child_fields": [],
						}
					)
			else:
				# Child Table field reference - group for indirect lookup
				child_table_matches.setdefault(parent_dt, []).append(
					{
						"fieldname": fname,
						"label": f.get("label") or fname,
						"fieldtype": "Link",
						"options": doctype,
					}
				)

		# Discover indirect incoming references via Table and Table MultiSelect fields
		if include_indirect and child_table_matches:
			child_table_names = list(child_table_matches.keys())

			table_docfields = frappe.get_all(
				"DocField",
				fields=["parent", "fieldname", "label", "fieldtype", "options"],
				filters={
					"fieldtype": ["in", ["Table", "Table MultiSelect"]],
					"options": ["in", child_table_names],
				},
				order_by=None,
			)

			table_customfields = frappe.get_all(
				"Custom Field",
				fields=["dt as parent", "fieldname", "label", "fieldtype", "options"],
				filters={
					"fieldtype": ["in", ["Table", "Table MultiSelect"]],
					"options": ["in", child_table_names],
				},
				order_by=None,
			)

			raw_table_fields = table_docfields + table_customfields

			parent_doctypes_to_fetch = {
				tf["parent"] for tf in raw_table_fields if tf.get("parent") and tf["parent"] not in doctype_info_map
			}

			if parent_doctypes_to_fetch:
				parent_meta_records = frappe.get_all(
					"DocType",
					filters={"name": ["in", list(parent_doctypes_to_fetch)]},
					fields=["name", "module", "istable", "issingle", "is_submittable"],
					order_by=None,
				)
				for p in parent_meta_records:
					doctype_info_map[p["name"]] = p

			for tf in raw_table_fields:
				parent_dt = tf.get("parent")
				fname = tf.get("fieldname")
				child_dt = tf.get("options")
				fieldtype = tf.get("fieldtype")

				if not parent_dt or not fname or not child_dt:
					continue

				dt_info = doctype_info_map.get(parent_dt)
				if not dt_info:
					continue

				if not frappe.has_permission(parent_dt, "read"):
					continue

				matching_fields = child_table_matches.get(child_dt, [])
				if not matching_fields:
					continue

				rel_key = (parent_dt, fname, "indirect", "Incoming", child_dt)
				if rel_key not in seen_relationships:
					seen_relationships.add(rel_key)
					relationships.append(
						{
							"direction": "Incoming",
							"source_doctype": parent_dt,
							"source_module": dt_info.get("module") or "",
							"is_child_table": bool(dt_info.get("istable")),
							"is_single": bool(dt_info.get("issingle")),
							"is_submittable": bool(dt_info.get("is_submittable")),
							"fieldname": fname,
							"label": tf.get("label") or fname,
							"fieldtype": fieldtype,
							"options": child_dt,
							"relationship_type": "indirect",
							"matching_child_fields": matching_fields,
						}
					)

			# If any child table is not consumed by any parent, include it as direct child table ref
			consumed_child_tables = {tf.get("options") for tf in raw_table_fields}
			unconsumed_children = set(child_table_names) - consumed_child_tables
			for u_child in unconsumed_children:
				dt_info = doctype_info_map.get(u_child)
				if not dt_info or not frappe.has_permission(u_child, "read"):
					continue
				for mf in child_table_matches.get(u_child, []):
					rel_key = (u_child, mf["fieldname"], "direct", "Incoming")
					if rel_key not in seen_relationships:
						seen_relationships.add(rel_key)
						relationships.append(
							{
								"direction": "Incoming",
								"source_doctype": u_child,
								"source_module": dt_info.get("module") or "",
								"is_child_table": True,
								"is_single": False,
								"is_submittable": bool(dt_info.get("is_submittable")),
								"fieldname": mf["fieldname"],
								"label": mf["label"],
								"fieldtype": "Link",
								"options": doctype,
								"relationship_type": "direct",
								"matching_child_fields": [],
							}
						)

	# ---------------------------------------------------------
	# 2. OUTGOING DEPENDENCIES (target_doctype -> Other DocTypes)
	# ---------------------------------------------------------
	if direction in ("both", "outgoing"):
		# Direct Outgoing Links from target_doctype
		out_docfields = frappe.get_all(
			"DocField",
			fields=["parent", "fieldname", "label", "fieldtype", "options"],
			filters={"parent": doctype, "fieldtype": "Link"},
			order_by=None,
		)

		out_customfields = frappe.get_all(
			"Custom Field",
			fields=["dt as parent", "fieldname", "label", "fieldtype", "options"],
			filters={"dt": doctype, "fieldtype": "Link"},
			order_by=None,
		)

		raw_outgoing_links = out_docfields + out_customfields
		unique_outgoing = {}
		for f in raw_outgoing_links:
			fname = f.get("fieldname")
			target_opt = f.get("options")
			if fname and target_opt and (fname, target_opt) not in unique_outgoing:
				unique_outgoing[(fname, target_opt)] = f

		outgoing_target_dts = {f["options"] for f in unique_outgoing.values() if f.get("options")}
		out_dt_map = {}
		if outgoing_target_dts:
			out_meta_records = frappe.get_all(
				"DocType",
				filters={"name": ["in", list(outgoing_target_dts)]},
				fields=["name", "module", "istable", "issingle", "is_submittable"],
				order_by=None,
			)
			out_dt_map = {d["name"]: d for d in out_meta_records}

		for f in unique_outgoing.values():
			target_dt = f["options"]
			fname = f["fieldname"]
			dt_info = out_dt_map.get(target_dt)
			if not dt_info:
				continue

			if not frappe.has_permission(target_dt, "read"):
				continue

			rel_key = (doctype, fname, "direct", "Outgoing", target_dt)
			if rel_key not in seen_relationships:
				seen_relationships.add(rel_key)
				relationships.append(
					{
						"direction": "Outgoing",
						"source_doctype": doctype,
						"source_module": target_meta.module or "",
						"is_child_table": bool(target_meta.istable),
						"is_single": bool(target_meta.issingle),
						"is_submittable": bool(target_meta.is_submittable),
						"fieldname": fname,
						"label": f.get("label") or fname,
						"fieldtype": "Link",
						"options": target_dt,
						"relationship_type": "direct",
						"matching_child_fields": [],
					}
				)

		# Indirect Outgoing via Child Tables embedded in target_doctype
		if include_indirect:
			target_table_docfields = frappe.get_all(
				"DocField",
				fields=["parent", "fieldname", "label", "fieldtype", "options"],
				filters={
					"parent": doctype,
					"fieldtype": ["in", ["Table", "Table MultiSelect"]],
				},
				order_by=None,
			)

			target_table_customfields = frappe.get_all(
				"Custom Field",
				fields=["dt as parent", "fieldname", "label", "fieldtype", "options"],
				filters={
					"dt": doctype,
					"fieldtype": ["in", ["Table", "Table MultiSelect"]],
				},
				order_by=None,
			)

			raw_target_tables = target_table_docfields + target_table_customfields
			child_tables_in_target = {
				tf["options"]: tf for tf in raw_target_tables if tf.get("options")
			}

			if child_tables_in_target:
				child_table_names = list(child_tables_in_target.keys())

				child_docfields = frappe.get_all(
					"DocField",
					fields=["parent", "fieldname", "label", "fieldtype", "options"],
					filters={
						"parent": ["in", child_table_names],
						"fieldtype": "Link",
					},
					order_by=None,
				)

				child_customfields = frappe.get_all(
					"Custom Field",
					fields=["dt as parent", "fieldname", "label", "fieldtype", "options"],
					filters={
						"dt": ["in", child_table_names],
						"fieldtype": "Link",
					},
					order_by=None,
				)

				raw_child_links = child_docfields + child_customfields

				all_child_dest_dts = {
					cf["options"] for cf in raw_child_links if cf.get("options")
				}
				valid_dest_set = set()
				if all_child_dest_dts:
					child_dest_meta = frappe.get_all(
						"DocType",
						filters={"name": ["in", list(all_child_dest_dts)]},
						fields=["name"],
						order_by=None,
					)
					valid_dest_set = {
						d["name"]
						for d in child_dest_meta
						if frappe.has_permission(d["name"], "read")
					}

				child_links_by_table = {}
				for cf in raw_child_links:
					p = cf.get("parent")
					opt = cf.get("options")
					if p and opt and opt in valid_dest_set:
						child_links_by_table.setdefault(p, []).append(
							{
								"fieldname": cf["fieldname"],
								"label": cf.get("label") or cf["fieldname"],
								"fieldtype": "Link",
								"options": opt,
							}
						)

				for tf in raw_target_tables:
					fname = tf.get("fieldname")
					child_dt = tf.get("options")
					fieldtype = tf.get("fieldtype")
					if not fname or not child_dt:
						continue

					matching_links = child_links_by_table.get(child_dt, [])
					if not matching_links:
						continue

					rel_key = (doctype, fname, "indirect", "Outgoing", child_dt)
					if rel_key not in seen_relationships:
						seen_relationships.add(rel_key)
						relationships.append(
							{
								"direction": "Outgoing",
								"source_doctype": doctype,
								"source_module": target_meta.module or "",
								"is_child_table": False,
								"is_single": bool(target_meta.issingle),
								"is_submittable": bool(target_meta.is_submittable),
								"fieldname": fname,
								"label": tf.get("label") or fname,
								"fieldtype": fieldtype,
								"options": child_dt,
								"relationship_type": "indirect",
								"matching_child_fields": matching_links,
							}
						)

	# ---------------------------------------------------------
	# 3. SORTING & FORMATTING
	# ---------------------------------------------------------
	relationships.sort(
		key=lambda r: (
			0 if r["direction"] == "Incoming" else 1,
			0 if r["relationship_type"] == "direct" else 1,
			r["source_doctype"].lower(),
			r["fieldname"].lower(),
		)
	)

	for idx, r in enumerate(relationships, start=1):
		r["seq"] = idx
		if r["matching_child_fields"]:
			r["child_fields_display"] = ", ".join(
				[
					f"{cf['fieldname']} \u2192 {cf['options']} ({cf['fieldtype']})"
					if cf.get("options")
					else f"{cf['fieldname']} ({cf['fieldtype']})"
					for cf in r["matching_child_fields"]
				]
			)
		else:
			r["child_fields_display"] = "-"

	incoming_count = sum(1 for r in relationships if r["direction"] == "Incoming")
	outgoing_count = sum(1 for r in relationships if r["direction"] == "Outgoing")
	direct_count = sum(1 for r in relationships if r["relationship_type"] == "direct")
	indirect_count = sum(1 for r in relationships if r["relationship_type"] == "indirect")

	return {
		"target_doctype": doctype,
		"target_module": target_meta.module or "",
		"total_count": len(relationships),
		"incoming_count": incoming_count,
		"outgoing_count": outgoing_count,
		"direct_count": direct_count,
		"indirect_count": indirect_count,
		"relationships": relationships,
	}
