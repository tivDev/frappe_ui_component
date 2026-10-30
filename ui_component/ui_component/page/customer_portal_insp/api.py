import frappe
from frappe import _
from frappe.utils import cint


@frappe.whitelist()
def get_customer_portal_data(customer=None, user=None, has_portal_user="Has User", limit_start=0, page_length=50):
	"""Fetches Customer and associated Portal User records organized
	hierarchically with indent: 0 (Customer) and indent: 1 (Portal User).
	"""
	if not _is_authorized():
		frappe.throw(
			_("You are not authorized to access Customer Portal Inspector."),
			frappe.PermissionError,
		)

	limit_start = max(0, cint(limit_start or 0))
	page_length = min(200, max(1, cint(page_length or 50)))

	selected_customer = (customer.strip() if (customer and isinstance(customer, str) and customer.strip()) else None)
	selected_user = (user.strip() if (user and isinstance(user, str) and user.strip()) else None)

	# Determine "Has User" vs "No Has User" filter mode
	is_no_user_filter = False
	if has_portal_user:
		has_user_str = str(has_portal_user).strip().lower()
		if has_user_str in ("no has user", "no", "no user", "no_has_user", "without user", "without"):
			is_no_user_filter = True

	# 1. Determine target Customer names
	target_customers = []
	total_customer_count = 0

	if selected_customer and selected_user:
		# Both filters: verify user is associated with selected customer
		if not frappe.db.exists("Customer", selected_customer):
			frappe.throw(_("Customer {0} does not exist.").format(selected_customer))

		if is_no_user_filter:
			return {
				"summary": {
					"total_customer_groups": 0,
					"loaded_customer_groups": 0,
					"total_portal_users": 0,
					"has_more": False,
					"next_start": 0,
					"has_portal_user": "No Has User",
				},
				"records": [],
				"message": _("Customer {0} has user {1}, so it does not match 'No Has User'.").format(selected_customer, selected_user),
			}

		associated_customers = get_customers_for_user(selected_user)
		if selected_customer in associated_customers:
			target_customers = [selected_customer]
			total_customer_count = 1
		else:
			return {
				"summary": {
					"total_customer_groups": 0,
					"loaded_customer_groups": 0,
					"total_portal_users": 0,
					"has_more": False,
					"next_start": 0,
					"has_portal_user": "Has User",
				},
				"records": [],
				"message": _("User {0} is not associated with Customer {1}.").format(selected_user, selected_customer),
			}

	elif selected_customer:
		# Single Customer filter
		if not frappe.db.exists("Customer", selected_customer):
			frappe.throw(_("Customer {0} does not exist.").format(selected_customer))

		cust_portal_users = get_portal_users_for_customer(selected_customer)
		has_users = len(cust_portal_users) > 0

		if is_no_user_filter:
			if has_users:
				return {
					"summary": {
						"total_customer_groups": 0,
						"loaded_customer_groups": 0,
						"total_portal_users": 0,
						"has_more": False,
						"next_start": 0,
						"has_portal_user": "No Has User",
					},
					"records": [],
					"message": _("Customer {0} has {1} portal user(s).").format(selected_customer, len(cust_portal_users)),
				}
			target_customers = [selected_customer]
			total_customer_count = 1
		else:
			if not has_users:
				return {
					"summary": {
						"total_customer_groups": 0,
						"loaded_customer_groups": 0,
						"total_portal_users": 0,
						"has_more": False,
						"next_start": 0,
						"has_portal_user": "Has User",
					},
					"records": [],
					"message": _("Customer {0} has no portal users.").format(selected_customer),
				}
			target_customers = [selected_customer]
			total_customer_count = 1

	elif selected_user:
		# Single User filter
		if not frappe.db.exists("User", selected_user):
			frappe.throw(_("User {0} does not exist.").format(selected_user))

		if is_no_user_filter:
			return {
				"summary": {
					"total_customer_groups": 0,
					"loaded_customer_groups": 0,
					"total_portal_users": 0,
					"has_more": False,
					"next_start": 0,
					"has_portal_user": "No Has User",
				},
				"records": [],
				"message": _("Filtering by user {0} conflicts with 'No Has User'.").format(selected_user),
			}

		associated_customers = get_customers_for_user(selected_user)
		total_customer_count = len(associated_customers)
		target_customers = associated_customers

	else:
		# Group filter: Has User vs No Has User
		if is_no_user_filter:
			# Customers WITHOUT portal users
			all_cust_with_users = get_all_customers_with_portal_users()
			filters = {}
			if all_cust_with_users:
				filters["name"] = ["not in", all_cust_with_users]

			total_customer_count = frappe.db.count("Customer", filters=filters)
			target_customers = frappe.get_all(
				"Customer",
				filters=filters,
				pluck="name",
				order_by="modified desc, name asc",
				start=limit_start,
				page_length=page_length,
			)
		else:
			# Customers WITH portal users
			all_cust_with_users = get_all_customers_with_portal_users()
			total_customer_count = len(all_cust_with_users)
			target_customers = all_cust_with_users[limit_start : limit_start + page_length]

	if not target_customers:
		return {
			"summary": {
				"total_customer_groups": total_customer_count,
				"loaded_customer_groups": 0,
				"total_portal_users": 0,
				"has_more": False,
				"next_start": limit_start,
				"has_portal_user": "No Has User" if is_no_user_filter else "Has User",
			},
			"records": [],
			"message": _("No Customer records found matching the criteria."),
		}

	# 2. Build hierarchical records (indent: 0 for Customer, indent: 1 for Portal User)
	records = []
	total_portal_users = 0

	for cust_name in target_customers:
		try:
			cust_doc = frappe.get_doc("Customer", cust_name)
		except Exception:
			continue

		# Retrieve all distinct portal users for this customer
		portal_user_names = get_portal_users_for_customer(cust_name)

		# If user filter is active, only retain that specific user
		if selected_user:
			portal_user_names = [u for u in portal_user_names if u.lower() == selected_user.lower()]

		is_customer_disabled = bool(cint(cust_doc.get("disabled", 0)))
		user_count = len(portal_user_names)
		total_portal_users += user_count

		# Parent Row: Customer (indent: 0)
		records.append({
			"customer": cust_name,
			"customer_name": cust_doc.get("customer_name") or cust_name,
			"customer_group": cust_doc.get("customer_group") or "",
			"territory": cust_doc.get("territory") or "",
			"user": "",
			"user_name": "",
			"email": "",
			"enabled": _("Disabled") if is_customer_disabled else _("Active"),
			"user_type": "",
			"last_active": "",
			"roles": "",
			"portal_user_count": user_count,
			"is_customer_disabled": is_customer_disabled,
			"indent": 0,
		})

		# Child Rows: Portal Users (indent: 1)
		for u_name in portal_user_names:
			user_info = _get_user_info(u_name)
			records.append({
				"customer": "",
				"parent_customer": cust_name,
				"customer_name": "",
				"customer_group": "",
				"territory": "",
				"user": user_info["name"],
				"user_name": user_info["full_name"],
				"email": user_info["email"],
				"enabled": _("Enabled") if user_info["enabled"] else _("Disabled"),
				"user_type": user_info["user_type"],
				"last_active": user_info["last_active"],
				"roles": user_info["roles"],
				"portal_user_count": None,
				"is_customer_disabled": False,
				"indent": 1,
			})

	has_more = False if (selected_customer or selected_user) else ((limit_start + len(target_customers)) < total_customer_count)

	return {
		"summary": {
			"total_customer_groups": total_customer_count,
			"loaded_customer_groups": len(target_customers),
			"total_portal_users": total_portal_users,
			"has_more": has_more,
			"next_start": limit_start + len(target_customers),
			"has_portal_user": "No Has User" if is_no_user_filter else "Has User",
		},
		"records": records,
	}


def get_all_customers_with_portal_users():
	"""Returns a sorted list of Customer names that have at least one portal user."""
	customers = set()

	# 1. tabPortal User child table
	try:
		pu_custs = frappe.get_all(
			"Portal User",
			filters={"parenttype": "Customer"},
			pluck="parent",
			limit_page_length=0,
		)
		customers.update([p for p in pu_custs if p])
	except Exception:
		pass

	# 2. tabContact linked to Customer (user field or email matching a user)
	try:
		user_contacts = frappe.db.sql("""
			SELECT DISTINCT dl.link_name
			FROM `tabDynamic Link` dl
			INNER JOIN `tabContact` c ON c.name = dl.parent
			WHERE dl.link_doctype = 'Customer'
			  AND dl.parenttype = 'Contact'
			  AND c.user IS NOT NULL AND c.user != ''
		""", as_dict=True)
		customers.update([r["link_name"] for r in user_contacts if r.get("link_name")])
	except Exception:
		pass

	try:
		email_contacts = frappe.db.sql("""
			SELECT DISTINCT dl.link_name
			FROM `tabDynamic Link` dl
			INNER JOIN `tabContact` c ON c.name = dl.parent
			INNER JOIN `tabUser` u ON u.email = c.email_id
			WHERE dl.link_doctype = 'Customer'
			  AND dl.parenttype = 'Contact'
			  AND c.email_id IS NOT NULL AND c.email_id != ''
		""", as_dict=True)
		customers.update([r["link_name"] for r in email_contacts if r.get("link_name")])
	except Exception:
		pass

	# 3. User Permission
	try:
		up_custs = frappe.get_all(
			"User Permission",
			filters={"allow": "Customer"},
			pluck="for_value",
			limit_page_length=0,
		)
		customers.update([p for p in up_custs if p])
	except Exception:
		pass

	if not customers:
		return []

	valid_customers = frappe.get_all(
		"Customer",
		filters={"name": ["in", list(customers)]},
		pluck="name",
		order_by="modified desc, name asc",
		limit_page_length=0,
	)
	return valid_customers


def get_portal_users_for_customer(customer_name):
	"""Retrieves distinct portal user names for a customer via:

	1. tabPortal User child table
	2. tabContact dynamic link
	3. tabUser Permission
	"""
	users = []

	# 1. Portal User child table of Customer
	pu_rows = frappe.get_all(
		"Portal User",
		filters={"parent": customer_name, "parenttype": "Customer"},
		pluck="user",
		limit_page_length=0,
	)
	users.extend(pu_rows)

	# 2. Contacts linked to this Customer
	contact_names = frappe.get_all(
		"Dynamic Link",
		filters={"link_doctype": "Customer", "link_name": customer_name, "parenttype": "Contact"},
		pluck="parent",
		limit_page_length=0,
	)
	if contact_names:
		contacts = frappe.get_all(
			"Contact",
			filters={"name": ["in", contact_names]},
			fields=["user", "email_id"],
			limit_page_length=0,
		)
		for c in contacts:
			if c.get("user"):
				users.append(c["user"])
			elif c.get("email_id"):
				user_from_email = frappe.db.get_value("User", {"email": c["email_id"].strip()}, "name")
				if user_from_email:
					users.append(user_from_email)

	# 3. User Permissions (allow='Customer', for_value=customer_name)
	perm_users = frappe.get_all(
		"User Permission",
		filters={"allow": "Customer", "for_value": customer_name},
		pluck="user",
		limit_page_length=0,
	)
	users.extend(perm_users)

	# Deduplicate preserving order
	distinct = []
	seen = set()
	for u in users:
		if not u:
			continue
		clean_u = u.strip()
		lower_u = clean_u.lower()
		if lower_u not in seen:
			seen.add(lower_u)
			distinct.append(clean_u)

	return distinct


def get_customers_for_user(user_name):
	"""Finds all distinct Customer names associated with a user."""
	customers = set()

	# 1. Portal User child table
	pu_customers = frappe.get_all(
		"Portal User",
		filters={"user": user_name, "parenttype": "Customer"},
		pluck="parent",
		limit_page_length=0,
	)
	customers.update(pu_customers)

	# 2. Contact link
	user_email = frappe.db.get_value("User", user_name, "email") or user_name
	contact_names = frappe.get_all(
		"Contact",
		filters=[["user", "=", user_name]],
		pluck="name",
		limit_page_length=0,
	)
	if user_email and user_email != user_name:
		email_contacts = frappe.get_all(
			"Contact",
			filters=[["email_id", "=", user_email]],
			pluck="name",
			limit_page_length=0,
		)
		contact_names = list(set(contact_names + email_contacts))

	if contact_names:
		linked_customers = frappe.get_all(
			"Dynamic Link",
			filters={
				"link_doctype": "Customer",
				"parenttype": "Contact",
				"parent": ["in", contact_names],
			},
			pluck="link_name",
			limit_page_length=0,
		)
		customers.update(linked_customers)

	# 3. User Permission
	perm_customers = frappe.get_all(
		"User Permission",
		filters={"user": user_name, "allow": "Customer"},
		pluck="for_value",
		limit_page_length=0,
	)
	customers.update(perm_customers)

	# Ensure each customer is a valid existing record
	valid_customers = [c for c in customers if c and frappe.db.exists("Customer", c)]
	return sorted(valid_customers)


def _get_user_info(user_name):
	"""Retrieves formatted user metadata."""
	try:
		user_doc = frappe.get_doc("User", user_name)
		roles = [r.role for r in user_doc.get("roles", []) if r.role not in ("All", "Guest")]
		last_active = frappe.utils.format_datetime(user_doc.last_active or user_doc.last_login) if (user_doc.last_active or user_doc.last_login) else ""
		return {
			"name": user_doc.name,
			"full_name": user_doc.full_name or user_doc.name,
			"email": user_doc.email or user_doc.name,
			"enabled": bool(user_doc.enabled),
			"user_type": user_doc.user_type or _("Website User"),
			"last_active": last_active,
			"roles": ", ".join(roles),
		}
	except Exception:
		return {
			"name": user_name,
			"full_name": user_name,
			"email": user_name,
			"enabled": False,
			"user_type": _("Website User"),
			"last_active": "",
			"roles": "",
		}


def _is_authorized():
	"""Checks if session user has desk access and management roles."""
	if frappe.session.user == "Administrator":
		return True
	user_roles = frappe.get_roles()
	allowed_roles = {"System Manager", "Sales Manager", "Sales User", "Workspace Manager"}
	return bool(allowed_roles.intersection(user_roles))

