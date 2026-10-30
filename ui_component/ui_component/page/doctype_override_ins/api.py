import importlib
import importlib.util
import os
import frappe
from frappe import _


@frappe.whitelist()
def get_doctype_override_data(doctype):
	"""Discovers all implementation and override files across installed apps for a DocType:
	- Original controller, form JS, list JS, tree JS, dashboard JS
	- Hooks: doctype_js, doctype_list_js, doctype_tree_js
	- Hooks: override_doctype_class, extend_doctype_class, doc_events, override_whitelisted_methods
	- Client Scripts and Server Scripts in the database

	Returns hierarchical records:
	  indent: 0 -> DocType root
	  indent: 1 -> Language section (JavaScript / Python)
	  indent: 2 -> App
	  indent: 3 -> Implementation File / Detail
	"""
	if not _is_authorized():
		frappe.throw(_("Not authorized to access DocType Override Inspector."), frappe.PermissionError)

	if not doctype or not isinstance(doctype, str) or not doctype.strip():
		frappe.throw(_("Please select a DocType to inspect overrides."))

	doctype = doctype.strip()
	if not frappe.db.exists("DocType", doctype):
		frappe.throw(_("DocType {0} does not exist.").format(doctype))

	meta = frappe.get_meta(doctype)
	scrubbed = frappe.scrub(doctype)
	installed_apps = frappe.get_installed_apps()

	js_items = []
	python_items = []

	# ---------------------------------------------------------
	# 1. Original Files (Controller, JS form, list, tree, etc.)
	# ---------------------------------------------------------
	module = meta.module
	module_app = None
	if module:
		module_app = frappe.db.get_value("Module Def", module, "app_name")
	if not module_app:
		module_app = "frappe"

	try:
		module_path = frappe.get_module_path(module, "doctype", scrubbed)
	except Exception:
		module_path = None

	if module_path and os.path.isdir(module_path):
		app_base_path = _get_app_base_path(module_app)

		# Original Python Controller
		py_file = f"{scrubbed}.py"
		py_full = os.path.join(module_path, py_file)
		if os.path.exists(py_full):
			rel_path = os.path.relpath(py_full, app_base_path) if app_base_path else py_full
			python_items.append({
				"app": module_app,
				"file_name": py_file,
				"file_path": rel_path,
				"full_path": py_full,
				"impl_type": _("Original Controller"),
				"registration": _("DocType Controller"),
				"event": "",
				"handler": f"{frappe.scrub(module)}.doctype.{scrubbed}.{scrubbed}.{meta.name}",
				"status": "Found",
				"is_original": True,
			})

		# Original Form JS
		js_file = f"{scrubbed}.js"
		js_full = os.path.join(module_path, js_file)
		if os.path.exists(js_full):
			rel_path = os.path.relpath(js_full, app_base_path) if app_base_path else js_full
			js_items.append({
				"app": module_app,
				"file_name": js_file,
				"file_path": rel_path,
				"full_path": js_full,
				"impl_type": _("Original Script"),
				"registration": _("DocType Form JS"),
				"event": "Form View",
				"handler": "",
				"status": "Found",
				"is_original": True,
			})

		# Original List JS
		list_file = f"{scrubbed}_list.js"
		list_full = os.path.join(module_path, list_file)
		if os.path.exists(list_full):
			rel_path = os.path.relpath(list_full, app_base_path) if app_base_path else list_full
			js_items.append({
				"app": module_app,
				"file_name": list_file,
				"file_path": rel_path,
				"full_path": list_full,
				"impl_type": _("Original List Script"),
				"registration": _("DocType List JS"),
				"event": "List View",
				"handler": "",
				"status": "Found",
				"is_original": True,
			})

		# Original Tree JS
		tree_file = f"{scrubbed}_tree.js"
		tree_full = os.path.join(module_path, tree_file)
		if os.path.exists(tree_full):
			rel_path = os.path.relpath(tree_full, app_base_path) if app_base_path else tree_full
			js_items.append({
				"app": module_app,
				"file_name": tree_file,
				"file_path": rel_path,
				"full_path": tree_full,
				"impl_type": _("Original Tree Script"),
				"registration": _("DocType Tree JS"),
				"event": "Tree View",
				"handler": "",
				"status": "Found",
				"is_original": True,
			})

		# Original Calendar JS
		cal_file = f"{scrubbed}_calendar.js"
		cal_full = os.path.join(module_path, cal_file)
		if os.path.exists(cal_full):
			rel_path = os.path.relpath(cal_full, app_base_path) if app_base_path else cal_full
			js_items.append({
				"app": module_app,
				"file_name": cal_file,
				"file_path": rel_path,
				"full_path": cal_full,
				"impl_type": _("Original Calendar Script"),
				"registration": _("DocType Calendar JS"),
				"event": "Calendar View",
				"handler": "",
				"status": "Found",
				"is_original": True,
			})

		# Original Dashboard JS
		dash_file = f"{scrubbed}_dashboard.js"
		dash_full = os.path.join(module_path, dash_file)
		if os.path.exists(dash_full):
			rel_path = os.path.relpath(dash_full, app_base_path) if app_base_path else dash_full
			js_items.append({
				"app": module_app,
				"file_name": dash_file,
				"file_path": rel_path,
				"full_path": dash_full,
				"impl_type": _("Original Dashboard"),
				"registration": _("DocType Dashboard JS"),
				"event": "Dashboard View",
				"handler": "",
				"status": "Found",
				"is_original": True,
			})

	# ---------------------------------------------------------
	# 2. Hook Registrations across installed apps
	# ---------------------------------------------------------
	for app in installed_apps:
		try:
			hooks = frappe.get_hooks(app_name=app)
		except Exception:
			hooks = {}

		# 2.1 doctype_js (JavaScript)
		djs = hooks.get("doctype_js", {})
		if isinstance(djs, dict) and doctype in djs:
			for script_rel in _ensure_string_list(djs[doctype]):
				full_path, rel_path, status = _resolve_app_file(app, script_rel)
				js_items.append({
					"app": app,
					"file_name": os.path.basename(script_rel),
					"file_path": rel_path,
					"full_path": full_path,
					"impl_type": _("Hook Script"),
					"registration": "doctype_js",
					"event": "Form View Extension",
					"handler": "",
					"status": status,
					"is_original": False,
				})

		# 2.2 doctype_list_js (JavaScript)
		dljs = hooks.get("doctype_list_js", {})
		if isinstance(dljs, dict) and doctype in dljs:
			for script_rel in _ensure_string_list(dljs[doctype]):
				full_path, rel_path, status = _resolve_app_file(app, script_rel)
				js_items.append({
					"app": app,
					"file_name": os.path.basename(script_rel),
					"file_path": rel_path,
					"full_path": full_path,
					"impl_type": _("Hook List Script"),
					"registration": "doctype_list_js",
					"event": "List View Extension",
					"handler": "",
					"status": status,
					"is_original": False,
				})

		# 2.3 doctype_tree_js (JavaScript)
		dtjs = hooks.get("doctype_tree_js", {})
		if isinstance(dtjs, dict) and doctype in dtjs:
			for script_rel in _ensure_string_list(dtjs[doctype]):
				full_path, rel_path, status = _resolve_app_file(app, script_rel)
				js_items.append({
					"app": app,
					"file_name": os.path.basename(script_rel),
					"file_path": rel_path,
					"full_path": full_path,
					"impl_type": _("Hook Tree Script"),
					"registration": "doctype_tree_js",
					"event": "Tree View Extension",
					"handler": "",
					"status": status,
					"is_original": False,
				})

		# 2.4 override_doctype_class (Python)
		odc = hooks.get("override_doctype_class", {})
		if isinstance(odc, dict) and doctype in odc:
			for class_path in _ensure_string_list(odc[doctype]):
				file_name, rel_path, full_path, status = _resolve_python_file(app, class_path)
				python_items.append({
					"app": app,
					"file_name": file_name,
					"file_path": rel_path,
					"full_path": full_path,
					"impl_type": _("Controller Override"),
					"registration": "override_doctype_class",
					"event": "Controller Replacement",
					"handler": class_path,
					"status": status,
					"is_original": False,
				})

		# 2.5 extend_doctype_class (Python)
		edc = hooks.get("extend_doctype_class", {})
		if isinstance(edc, dict) and doctype in edc:
			for class_path in _ensure_string_list(edc[doctype]):
				file_name, rel_path, full_path, status = _resolve_python_file(app, class_path)
				python_items.append({
					"app": app,
					"file_name": file_name,
					"file_path": rel_path,
					"full_path": full_path,
					"impl_type": _("Controller Extension"),
					"registration": "extend_doctype_class",
					"event": "Controller Extension",
					"handler": class_path,
					"status": status,
					"is_original": False,
				})

		# 2.6 doc_events (Python)
		dev = hooks.get("doc_events", {})
		if isinstance(dev, dict):
			events_dict = dev.get(doctype) or {}
			if isinstance(events_dict, dict):
				for event_name, handlers in events_dict.items():
					for h in _ensure_string_list(handlers):
						file_name, rel_path, full_path, status = _resolve_python_file(app, h)
						python_items.append({
							"app": app,
							"file_name": file_name,
							"file_path": rel_path,
							"full_path": full_path,
							"impl_type": _("Doc Event"),
							"registration": "doc_events",
							"event": event_name,
							"handler": h,
							"status": status,
							"is_original": False,
						})

		# 2.7 override_whitelisted_methods (Python)
		owm = hooks.get("override_whitelisted_methods", {})
		if isinstance(owm, dict):
			for orig_method, override_methods in owm.items():
				if scrubbed in orig_method.lower() or doctype.lower() in orig_method.lower():
					for m in _ensure_string_list(override_methods):
						file_name, rel_path, full_path, status = _resolve_python_file(app, m)
						python_items.append({
							"app": app,
							"file_name": file_name,
							"file_path": rel_path,
							"full_path": full_path,
							"impl_type": _("Whitelisted Method Override"),
							"registration": "override_whitelisted_methods",
							"event": orig_method,
							"handler": m,
							"status": status,
							"is_original": False,
						})

	# ---------------------------------------------------------
	# 3. Database Client Scripts & Server Scripts
	# ---------------------------------------------------------
	try:
		client_scripts = frappe.get_all(
			"Client Script",
			filters={"dt": doctype},
			fields=["name", "enabled", "view", "module"],
			limit_page_length=0,
		)
		for cs in client_scripts:
			cs_app = _get_module_app(cs.get("module")) or "Custom"
			js_items.append({
				"app": cs_app,
				"file_name": f"{cs.name}.js",
				"file_path": f"Client Script / {cs.name}",
				"full_path": "",
				"impl_type": _("Client Script"),
				"registration": f"Client Script ({cs.view or 'Form'})",
				"event": cs.view or "Form",
				"handler": cs.name,
				"status": "Found" if cs.enabled else "Disabled",
				"is_original": False,
			})
	except Exception:
		pass

	try:
		server_scripts = frappe.get_all(
			"Server Script",
			filters={"reference_doctype": doctype},
			fields=["name", "disabled", "script_type", "doctype_event", "module"],
			limit_page_length=0,
		)
		for ss in server_scripts:
			ss_app = _get_module_app(ss.get("module")) or "Custom"
			python_items.append({
				"app": ss_app,
				"file_name": f"{ss.name}.py",
				"file_path": f"Server Script / {ss.name}",
				"full_path": "",
				"impl_type": _("Server Script"),
				"registration": f"Server Script ({ss.script_type or 'DocType Event'})",
				"event": ss.doctype_event or (ss.script_type or "Doc Event"),
				"handler": ss.name,
				"status": "Disabled" if ss.disabled else "Found",
				"is_original": False,
			})
	except Exception:
		pass

	# ---------------------------------------------------------
	# 4. Construct EasyTable Hierarchy
	# ---------------------------------------------------------
	# indent 0: DocType root
	# indent 1: Language (JavaScript / Python)
	# indent 2: App
	# indent 3: File / Entry
	records = []

	total_js = len(js_items)
	total_py = len(python_items)
	total_overrides = sum(1 for item in (js_items + python_items) if "Override" in item["impl_type"])
	total_events = sum(1 for item in python_items if item["impl_type"] == _("Doc Event"))
	total_custom_scripts = sum(1 for item in (js_items + python_items) if "Script" in item["impl_type"] and not item.get("is_original"))
	all_apps = sorted(list(set(r["app"] for r in (js_items + python_items))))

	# Root Row (indent: 0)
	records.append({
		"node": doctype,
		"doctype": doctype,
		"language": f"{total_js + total_py} " + _("Items"),
		"app": f"{len(all_apps)} " + _("Apps"),
		"file_name": "",
		"file_path": "",
		"impl_type": _("DocType"),
		"registration": "",
		"event": "",
		"handler": "",
		"status": "Found",
		"indent": 0,
	})

	# Section 1: JavaScript (indent: 1)
	if js_items:
		records.append({
			"node": f"JavaScript ({len(js_items)})",
			"doctype": "",
			"language": "JavaScript",
			"app": "",
			"file_name": "",
			"file_path": "",
			"impl_type": _("Language Section"),
			"registration": "",
			"event": "",
			"handler": "",
			"status": "",
			"indent": 1,
		})
		apps_js = {}
		for item in js_items:
			apps_js.setdefault(item["app"], []).append(item)

		for app_name in sorted(apps_js.keys()):
			items_for_app = apps_js[app_name]
			records.append({
				"node": f"{app_name} ({len(items_for_app)})",
				"doctype": "",
				"language": "JavaScript",
				"app": app_name,
				"file_name": "",
				"file_path": "",
				"impl_type": _("App Group"),
				"registration": "",
				"event": "",
				"handler": "",
				"status": "",
				"indent": 2,
			})
			for f in items_for_app:
				records.append({
					"node": f["file_name"],
					"doctype": doctype,
					"language": "JavaScript",
					"app": f["app"],
					"file_name": f["file_name"],
					"file_path": f["file_path"],
					"impl_type": f["impl_type"],
					"registration": f["registration"],
					"event": f["event"],
					"handler": f["handler"],
					"status": f["status"],
					"indent": 3,
				})

	# Section 2: Python (indent: 1)
	if python_items:
		records.append({
			"node": f"Python ({len(python_items)})",
			"doctype": "",
			"language": "Python",
			"app": "",
			"file_name": "",
			"file_path": "",
			"impl_type": _("Language Section"),
			"registration": "",
			"event": "",
			"handler": "",
			"status": "",
			"indent": 1,
		})
		apps_py = {}
		for item in python_items:
			apps_py.setdefault(item["app"], []).append(item)

		for app_name in sorted(apps_py.keys()):
			items_for_app = apps_py[app_name]
			records.append({
				"node": f"{app_name} ({len(items_for_app)})",
				"doctype": "",
				"language": "Python",
				"app": app_name,
				"file_name": "",
				"file_path": "",
				"impl_type": _("App Group"),
				"registration": "",
				"event": "",
				"handler": "",
				"status": "",
				"indent": 2,
			})
			for f in items_for_app:
				records.append({
					"node": f["file_name"],
					"doctype": doctype,
					"language": "Python",
					"app": f["app"],
					"file_name": f["file_name"],
					"file_path": f["file_path"],
					"impl_type": f["impl_type"],
					"registration": f["registration"],
					"event": f["event"],
					"handler": f["handler"],
					"status": f["status"],
					"indent": 3,
				})

	summary = {
		"doctype": doctype,
		"module": module,
		"module_app": module_app,
		"total_implementations": total_js + total_py,
		"total_js": total_js,
		"total_python": total_py,
		"total_overrides": total_overrides,
		"total_events": total_events,
		"total_custom_scripts": total_custom_scripts,
		"total_apps": len(all_apps),
	}

	return {
		"summary": summary,
		"records": records,
	}


def _ensure_string_list(val):
	if not val:
		return []
	if isinstance(val, (list, tuple, set)):
		result = []
		for x in val:
			if isinstance(x, str):
				result.append(x.strip())
			elif isinstance(x, (list, tuple)):
				result.extend(_ensure_string_list(x))
		return result
	if isinstance(val, str):
		return [val.strip()]
	return [str(val).strip()]


def _resolve_python_file(app_name, symbol_str):
	"""Resolves a Python symbol (e.g. 'ditech_core.overrides.CustomItem') to:
	(file_name, rel_path, full_path, status).
	Guarantees file_name is never a dot-path or symbol name.
	"""
	if not symbol_str:
		return "", "", "", "Unresolved"

	if isinstance(symbol_str, (list, tuple)):
		if len(symbol_str) > 0:
			symbol_str = str(symbol_str[0])
		else:
			return "", "", "", "Unresolved"

	symbol_str = str(symbol_str).strip()
	parts = symbol_str.split(".")

	full_path = None
	status = "Unresolved"

	# 1. Try finding via importlib.util.find_spec
	for i in range(len(parts), 0, -1):
		mod_name = ".".join(parts[:i])
		try:
			spec = importlib.util.find_spec(mod_name)
			if spec and spec.origin and spec.origin.endswith((".py", ".pyc")):
				origin = spec.origin
				if origin.endswith(".pyc") and os.path.exists(origin[:-1]):
					origin = origin[:-1]
				full_path = origin
				status = "Found"
				break
		except Exception:
			pass

	# 2. Try sys.modules or dynamic import
	if not full_path:
		for i in range(len(parts), 0, -1):
			mod_name = ".".join(parts[:i])
			try:
				mod = importlib.import_module(mod_name)
				f = getattr(mod, "__file__", None)
				if f and os.path.exists(f):
					if f.endswith(".pyc") and os.path.exists(f[:-1]):
						f = f[:-1]
					full_path = f
					status = "Found"
					break
			except Exception:
				pass

	# 3. Try direct filesystem lookup in app path
	if not full_path and app_name:
		try:
			app_dir = frappe.get_app_path(app_name)
			app_base = os.path.dirname(app_dir)
			sub_parts = parts[1:] if (len(parts) > 1 and parts[0] == app_name) else parts
			for j in range(len(sub_parts), 0, -1):
				rel_candidate = os.path.join(*sub_parts[:j]) + ".py"
				cand1 = os.path.join(app_dir, rel_candidate)
				if os.path.exists(cand1):
					full_path = cand1
					status = "Found"
					break
				cand2 = os.path.join(app_base, rel_candidate)
				if os.path.exists(cand2):
					full_path = cand2
					status = "Found"
					break
		except Exception:
			pass

	# 4. Compute file_name and rel_path
	app_base = _get_app_base_path(app_name)
	if full_path:
		file_name = os.path.basename(full_path)
		rel_path = os.path.relpath(full_path, app_base) if app_base else full_path
	else:
		# Fallback extraction: symbol is e.g. "ditech_core.overrides.CustomItem"
		# The file is "overrides.py" and relative path is "ditech_core/overrides.py"
		if len(parts) >= 2:
			file_name = f"{parts[-2]}.py"
			rel_path = "/".join(parts[:-1]) + ".py"
		else:
			file_name = f"{parts[0]}.py"
			rel_path = f"{parts[0]}.py"
		status = "Unresolved"

	return file_name, rel_path, full_path or "", status


def _get_app_base_path(app_name):
	try:
		app_dir = frappe.get_app_path(app_name)
		return os.path.dirname(app_dir)
	except Exception:
		return None


def _resolve_app_file(app_name, rel_path):
	rel_path = rel_path.lstrip("/")
	try:
		app_pkg_dir = frappe.get_app_path(app_name)
	except Exception:
		app_pkg_dir = None

	if app_pkg_dir:
		p1 = os.path.join(app_pkg_dir, rel_path)
		if os.path.exists(p1):
			return p1, rel_path, "Found"

		app_root = os.path.dirname(app_pkg_dir)
		p2 = os.path.join(app_root, rel_path)
		if os.path.exists(p2):
			return p2, rel_path, "Found"

		return p1, rel_path, "Missing"

	return None, rel_path, "Unresolved"


def _get_module_app(module_name):
	if not module_name:
		return None
	return frappe.db.get_value("Module Def", module_name, "app_name")


def _is_authorized():
	if frappe.session.user == "Administrator":
		return True
	user_roles = set(frappe.get_roles())
	allowed = {"System Manager", "Workspace Manager"}
	return bool(allowed.intersection(user_roles))
