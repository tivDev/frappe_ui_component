import ast
import os
import re
import subprocess
import frappe
from frappe import _


@frappe.whitelist()
def search_method_origin(
	method_name=None,
	language="All",
	search_mode="definition",
	app=None,
	class_name=None,
	doctype=None,
):
	"""Discovers method/function and class definitions, overrides, extensions, and references
	across all installed apps for Python and JavaScript.

	Returns hierarchical EasyTable data:
	  indent: 0 -> Method / Class Name
	  indent: 1 -> Language (Python / JavaScript)
	  indent: 2 -> Category (Original Definition / Override / References)
	  indent: 3 -> App Name
	  indent: 4 -> Source File & Symbol Detail
	"""
	if not _is_authorized():
		frappe.throw(_("Not authorized to access Method Origin Explorer."), frappe.PermissionError)

	method_name = (method_name or "").strip()
	class_name = (class_name or "").strip()

	if not method_name and not class_name:
		frappe.throw(_("Please enter a Method / Function name or a Class / Object name to search."))

	language = (language or "All").strip()
	search_mode = (search_mode or "definition").strip().lower()

	# Resolve target apps
	all_installed = frappe.get_installed_apps()
	if app and app.strip():
		selected_app = app.strip()
		if selected_app in all_installed:
			target_apps = [selected_app]
		else:
			target_apps = [selected_app]
	else:
		target_apps = all_installed

	py_results = []
	js_results = []

	should_search_py = language in ("All", "Python")
	should_search_js = language in ("All", "JavaScript", "JS")

	filter_class = class_name.lower()
	filter_dt = (doctype or "").strip().lower()

	# 1. Search Python Files
	if should_search_py:
		for app_name in target_apps:
			app_results = _analyze_python_app(
				app_name, method_name, search_mode, filter_class, filter_dt
			)
			py_results.extend(app_results)

	# 2. Search JavaScript & TypeScript Files
	if should_search_js:
		for app_name in target_apps:
			app_results = _analyze_js_app(
				app_name, method_name, search_mode, filter_class, filter_dt
			)
			js_results.extend(app_results)

	# 3. Build Hierarchical Records for EasyTable
	records, summary = _build_hierarchy(method_name, class_name, py_results, js_results)

	return {
		"summary": summary,
		"records": records,
	}


def _analyze_python_app(app_name, method_name, search_mode, filter_class="", filter_dt=""):
	"""Scans Python files in an app using grep pre-filtering and Python AST."""
	results = []
	try:
		app_pkg_dir = frappe.get_app_path(app_name)
		app_base = os.path.dirname(app_pkg_dir)
	except Exception:
		return results

	search_term = method_name if method_name else filter_class
	candidate_files = _get_candidate_files(app_pkg_dir, [".py"], search_term)

	for file_path in candidate_files:
		rel_path = os.path.relpath(file_path, app_base) if app_base else file_path
		try:
			with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
				source = f.read()
			tree = ast.parse(source, filename=file_path)
		except Exception:
			continue

		# A. Find Definitions
		if search_mode in ("definition", "both"):
			def_visitor = _PyDefVisitor(method_name, filter_class)
			def_visitor.visit(tree)
			for d in def_visitor.matches:
				c_name = d["class_name"]
				if filter_dt and filter_dt not in rel_path.lower():
					continue

				# Classify implementation type
				impl_type, category = _classify_python_impl(
					app_name, rel_path, c_name, d["parent_classes"], d.get("symbol_type", "Method")
				)

				parent_class_str = ", ".join(d["parent_classes"]) if d["parent_classes"] else ""
				if d.get("symbol_type") == "Class":
					registration = f"class {d['class_name']}"
				else:
					registration = "Class Method" if c_name else "Function"
					if "whitelist" in " ".join(d["decorators"]).lower():
						registration += " (@frappe.whitelist)"

				results.append({
					"language": "Python",
					"app": app_name,
					"class_name": c_name or _("(Module Level)"),
					"symbol_name": d.get("symbol_name", d["method_name"]),
					"file_name": os.path.basename(file_path),
					"file_path": rel_path,
					"full_path": file_path,
					"line_no": d["line_no"],
					"impl_type": impl_type,
					"category": category,
					"parent_class": parent_class_str,
					"registration": registration,
					"status": "Found",
				})

		# B. Find References
		if search_mode in ("references", "both"):
			ref_visitor = _PyRefVisitor(method_name, filter_class)
			ref_visitor.visit(tree)
			for r in ref_visitor.matches:
				if filter_dt and filter_dt not in rel_path.lower():
					continue

				results.append({
					"language": "Python",
					"app": app_name,
					"class_name": r["class_name"] or _("(Module Level)"),
					"symbol_name": r["detail"],
					"file_name": os.path.basename(file_path),
					"file_path": rel_path,
					"full_path": file_path,
					"line_no": r["line_no"],
					"impl_type": r["ref_type"],
					"category": "References",
					"parent_class": "",
					"registration": r["detail"],
					"status": "Found",
				})

	return results


class _PyDefVisitor(ast.NodeVisitor):
	def __init__(self, target_name="", target_class=""):
		self.target_name = (target_name or "").strip()
		self.target_lower = self.target_name.lower()
		self.target_class = (target_class or "").strip()
		self.target_class_lower = self.target_class.lower()
		self.class_stack = []
		self.matches = []

	def visit_ClassDef(self, node):
		bases = []
		for b in node.bases:
			if isinstance(b, ast.Name):
				bases.append(b.id)
			elif isinstance(b, ast.Attribute):
				bases.append(b.attr)

		# If searching specifically by class (and no method name), this class definition is a primary match
		if self.target_class_lower and self.target_class_lower in node.name.lower():
			if not self.target_lower:
				decorators = []
				for d in node.decorator_list:
					if isinstance(d, ast.Name):
						decorators.append(d.id)
					elif isinstance(d, ast.Attribute):
						decorators.append(d.attr)
				self.matches.append({
					"method_name": f"class {node.name}",
					"symbol_name": node.name,
					"symbol_type": "Class",
					"line_no": node.lineno,
					"class_name": node.name,
					"parent_classes": bases,
					"decorators": decorators,
				})

		self.class_stack.append((node.name, bases))
		self.generic_visit(node)
		self.class_stack.pop()

	def visit_FunctionDef(self, node):
		self._inspect_func(node)
		self.generic_visit(node)

	def visit_AsyncFunctionDef(self, node):
		self._inspect_func(node)
		self.generic_visit(node)

	def _inspect_func(self, node):
		cls_info = self.class_stack[-1] if self.class_stack else ("", [])
		c_name = cls_info[0]

		if self.target_class_lower:
			if not c_name or self.target_class_lower not in c_name.lower():
				return

		if self.target_lower:
			if node.name.lower() != self.target_lower:
				return

		decorators = []
		for d in node.decorator_list:
			if isinstance(d, ast.Name):
				decorators.append(d.id)
			elif isinstance(d, ast.Attribute):
				decorators.append(d.attr)
			elif isinstance(d, ast.Call):
				if isinstance(d.func, ast.Name):
					decorators.append(d.func.id)
				elif isinstance(d.func, ast.Attribute):
					decorators.append(d.func.attr)

		self.matches.append({
			"method_name": node.name,
			"symbol_name": f"{c_name}.{node.name}" if c_name else node.name,
			"symbol_type": "Method" if c_name else "Function",
			"line_no": node.lineno,
			"class_name": c_name,
			"parent_classes": cls_info[1],
			"decorators": decorators,
		})


class _PyRefVisitor(ast.NodeVisitor):
	def __init__(self, target_name="", target_class=""):
		self.target_name = (target_name or "").strip()
		self.target_lower = self.target_name.lower()
		self.target_class = (target_class or "").strip()
		self.target_class_lower = self.target_class.lower()
		self.class_stack = []
		self.matches = []

	def visit_ClassDef(self, node):
		cls_name = self.class_stack[-1] if self.class_stack else ""
		for b in node.bases:
			b_name = b.id if isinstance(b, ast.Name) else (b.attr if isinstance(b, ast.Attribute) else "")
			if b_name and self.target_class_lower and self.target_class_lower in b_name.lower():
				self.matches.append({
					"line_no": node.lineno,
					"class_name": node.name,
					"ref_type": "Class Inheritance",
					"detail": f"class {node.name}({b_name})",
				})
		self.class_stack.append(node.name)
		self.generic_visit(node)
		self.class_stack.pop()

	def visit_Call(self, node):
		cls_name = self.class_stack[-1] if self.class_stack else ""
		if self.target_lower:
			if isinstance(node.func, ast.Name) and node.func.id.lower() == self.target_lower:
				self.matches.append({
					"line_no": node.lineno,
					"class_name": cls_name,
					"ref_type": "Direct Call",
					"detail": f"{node.func.id}()",
				})
			elif isinstance(node.func, ast.Attribute) and node.func.attr.lower() == self.target_lower:
				caller = "obj"
				if isinstance(node.func.value, ast.Name):
					caller = node.func.value.id
				self.matches.append({
					"line_no": node.lineno,
					"class_name": cls_name,
					"ref_type": "Method Call",
					"detail": f"{caller}.{node.func.attr}()",
				})
		elif self.target_class_lower:
			func_name = node.func.id if isinstance(node.func, ast.Name) else (node.func.attr if isinstance(node.func, ast.Attribute) else "")
			if func_name and self.target_class_lower in func_name.lower():
				self.matches.append({
					"line_no": node.lineno,
					"class_name": cls_name,
					"ref_type": "Instantiation / Call",
					"detail": f"{func_name}()",
				})
		self.generic_visit(node)

	def visit_ImportFrom(self, node):
		cls_name = self.class_stack[-1] if self.class_stack else ""
		term = self.target_lower or self.target_class_lower
		if term:
			for alias in node.names:
				if term in alias.name.lower():
					self.matches.append({
						"line_no": node.lineno,
						"class_name": cls_name,
						"ref_type": "Import",
						"detail": f"from {node.module or ''} import {alias.name}",
					})
		self.generic_visit(node)


def _classify_python_impl(app_name, rel_path, class_name, bases, symbol_type="Method"):
	"""Categorizes a Python method or class definition into:
	- 'Original Definition'
	- 'Override / Extension'
	"""
	lower_path = rel_path.lower()
	bases_str = " ".join(bases).lower()

	if symbol_type == "Class":
		if "override" in lower_path or "custom" in lower_path:
			return "Class Override", "Override / Extension"
		if bases and any(b in ("document", "controller", "statusupdater") for b in bases_str.split()):
			if app_name == "frappe" and "frappe/model" in lower_path:
				return "Base Controller", "Original Definition"
			return "DocType Controller", "Original Definition"
		return "Class Definition", "Original Definition"

	# If file or class is clearly an override / custom extension
	if "override" in lower_path or "custom" in lower_path:
		return "Override / Extension", "Override / Extension"

	# If base classes indicate inheritance from another DocType controller or framework class
	if bases:
		if any(b in ("document", "controller", "statusupdater") for b in bases_str.split()):
			if app_name == "frappe" and "frappe/model" in lower_path:
				return "Original Definition", "Original Definition"
			return "Controller Override", "Override / Extension"
		return "Class Method Override", "Override / Extension"
		return "Class Method Override", "Override / Extension"

	# If in core frappe framework
	if app_name == "frappe":
		return "Original Definition", "Original Definition"

	return "Method Definition", "Original Definition"


def _analyze_js_app(app_name, method_name, search_mode, filter_class="", filter_dt=""):
	"""Scans JavaScript and TypeScript files in an app using regex parsing."""
	results = []
	try:
		app_pkg_dir = frappe.get_app_path(app_name)
		app_base = os.path.dirname(app_pkg_dir)
	except Exception:
		return results

	search_term = method_name if method_name else filter_class
	candidate_files = _get_candidate_files(app_pkg_dir, [".js", ".ts"], search_term)

	if method_name:
		escaped_name = re.escape(method_name)
		proto_re = re.compile(rf"([a-zA-Z0-9_$.]+)\.prototype\.{escaped_name}\s*=\s*(?:async\s*)?function", re.IGNORECASE)
		obj_re = re.compile(rf"([a-zA-Z0-9_$.]+)\.{escaped_name}\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)", re.IGNORECASE)
		fn_re = re.compile(rf"(?:async\s+)?function\s+({escaped_name})\s*\(", re.IGNORECASE)
		class_method_re = re.compile(rf"^\s*(?:async\s+)?({escaped_name})\s*\([^)]*\)\s*\{{", re.IGNORECASE)
		literal_re = re.compile(rf"^\s*({escaped_name})\s*:\s*(?:async\s*)?function", re.IGNORECASE)
		call_re = re.compile(rf"([a-zA-Z0-9_$.]+)?\.?{escaped_name}\s*\(", re.IGNORECASE)
	else:
		escaped_class = re.escape(filter_class)
		class_decl_re = re.compile(rf"class\s+({escaped_class}[a-zA-Z0-9_$]*)(?:\s+extends\s+([a-zA-Z0-9_$.]+))?", re.IGNORECASE)
		proto_any_re = re.compile(rf"({escaped_class}[a-zA-Z0-9_$.]*)\.prototype\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?function", re.IGNORECASE)
		obj_any_re = re.compile(rf"({escaped_class}[a-zA-Z0-9_$.]*)\.([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)", re.IGNORECASE)
		class_method_any_re = re.compile(r"^\s*(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{")
		ref_class_re = re.compile(rf"(?:new\s+({escaped_class}[a-zA-Z0-9_$.]*)|extends\s+({escaped_class}[a-zA-Z0-9_$.]*)|({escaped_class}[a-zA-Z0-9_$.]*)\.)", re.IGNORECASE)

	for file_path in candidate_files:
		rel_path = os.path.relpath(file_path, app_base) if app_base else file_path
		if filter_dt and filter_dt not in rel_path.lower():
			continue

		try:
			with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
				lines = f.readlines()
		except Exception:
			continue

		current_class = ""

		for idx, line in enumerate(lines, 1):
			# Track class definition context
			class_decl = re.search(r"class\s+([a-zA-Z0-9_$]+)", line)
			if class_decl:
				current_class = class_decl.group(1)

			if method_name:
				# A. Find Definitions
				if search_mode in ("definition", "both"):
					matched_def = None
					matched_owner = current_class or _("(Module)")
					impl_type = "Function"
					registration = "Function Declaration"

					m_proto = proto_re.search(line)
					if m_proto:
						matched_def = True
						matched_owner = f"{m_proto.group(1)}.prototype"
						impl_type = "Prototype Method"
						registration = "Prototype Assignment"

					if not matched_def:
						m_obj = obj_re.search(line)
						if m_obj:
							matched_def = True
							matched_owner = m_obj.group(1)
							impl_type = "Object / Namespace Method"
							registration = "Object Assignment"

					if not matched_def:
						m_cm = class_method_re.search(line)
						if m_cm and current_class:
							matched_def = True
							matched_owner = current_class
							impl_type = "Class Method"
							registration = f"class {current_class}"

					if not matched_def:
						m_lit = literal_re.search(line)
						if m_lit:
							matched_def = True
							matched_owner = current_class or _("Object Literal")
							impl_type = "Object Method"
							registration = "Object Literal Method"

					if not matched_def:
						m_fn = fn_re.search(line)
						if m_fn:
							matched_def = True
							matched_owner = _("(Global / Module)")
							impl_type = "Function Declaration"
							registration = "function"

					if matched_def:
						if filter_class and filter_class not in matched_owner.lower():
							continue

						# Determine category: original vs override
						lower_path = rel_path.lower()
						if "override" in lower_path or "custom" in lower_path or "prototype" in impl_type.lower():
							category = "Override / Extension"
						elif app_name == "frappe":
							category = "Original Definition"
						else:
							category = "Original Definition"

						results.append({
							"language": "JavaScript",
							"app": app_name,
							"class_name": matched_owner,
							"symbol_name": f"{matched_owner}.{method_name}" if matched_owner != _("(Global / Module)") else method_name,
							"file_name": os.path.basename(file_path),
							"file_path": rel_path,
							"full_path": file_path,
							"line_no": idx,
							"impl_type": impl_type,
							"category": category,
							"parent_class": "",
							"registration": registration,
							"status": "Found",
						})

				# B. Find References
				if search_mode in ("references", "both"):
					m_call = call_re.search(line)
					if m_call:
						# Skip lines that are function definitions themselves
						if not (fn_re.search(line) or proto_re.search(line) or obj_re.search(line)):
							caller = m_call.group(1) or ""
							if filter_class and caller and filter_class not in caller.lower():
								continue
							results.append({
								"language": "JavaScript",
								"app": app_name,
								"class_name": current_class or caller or _("(Script)"),
								"symbol_name": f"{caller}.{method_name}()" if caller else f"{method_name}()",
								"file_name": os.path.basename(file_path),
								"file_path": rel_path,
								"full_path": file_path,
								"line_no": idx,
								"impl_type": "Function Call",
								"category": "References",
								"parent_class": "",
								"registration": f"{caller}.{method_name}()" if caller else f"{method_name}()",
								"status": "Found",
							})
			else:
				# Search by Class / Object only
				if search_mode in ("definition", "both"):
					m_cdecl = class_decl_re.search(line)
					if m_cdecl:
						cname = m_cdecl.group(1)
						cbase = m_cdecl.group(2) or ""
						lower_path = rel_path.lower()
						category = "Override / Extension" if ("override" in lower_path or "custom" in lower_path) else "Original Definition"
						results.append({
							"language": "JavaScript",
							"app": app_name,
							"class_name": cname,
							"symbol_name": f"class {cname}",
							"file_name": os.path.basename(file_path),
							"file_path": rel_path,
							"full_path": file_path,
							"line_no": idx,
							"impl_type": "Class Declaration",
							"category": category,
							"parent_class": cbase,
							"registration": f"class {cname}" + (f" extends {cbase}" if cbase else ""),
							"status": "Found",
						})

					m_proto_any = proto_any_re.search(line)
					if m_proto_any:
						cname = m_proto_any.group(1)
						mname = m_proto_any.group(2)
						results.append({
							"language": "JavaScript",
							"app": app_name,
							"class_name": f"{cname}.prototype",
							"symbol_name": f"{cname}.prototype.{mname}",
							"file_name": os.path.basename(file_path),
							"file_path": rel_path,
							"full_path": file_path,
							"line_no": idx,
							"impl_type": "Prototype Method",
							"category": "Override / Extension",
							"parent_class": "",
							"registration": f"{cname}.prototype.{mname}",
							"status": "Found",
						})

					m_obj_any = obj_any_re.search(line)
					if m_obj_any:
						cname = m_obj_any.group(1)
						mname = m_obj_any.group(2)
						results.append({
							"language": "JavaScript",
							"app": app_name,
							"class_name": cname,
							"symbol_name": f"{cname}.{mname}",
							"file_name": os.path.basename(file_path),
							"file_path": rel_path,
							"full_path": file_path,
							"line_no": idx,
							"impl_type": "Object Method",
							"category": "Original Definition",
							"parent_class": "",
							"registration": f"{cname}.{mname}",
							"status": "Found",
						})

					if current_class and filter_class in current_class.lower():
						m_cm_any = class_method_any_re.search(line)
						if m_cm_any and not class_decl:
							mname = m_cm_any.group(1)
							if mname not in ("if", "for", "while", "switch", "catch", "constructor"):
								results.append({
									"language": "JavaScript",
									"app": app_name,
									"class_name": current_class,
									"symbol_name": f"{current_class}.{mname}()",
									"file_name": os.path.basename(file_path),
									"file_path": rel_path,
									"full_path": file_path,
									"line_no": idx,
									"impl_type": "Class Method",
									"category": "Original Definition",
									"parent_class": "",
									"registration": f"{current_class}.{mname}",
									"status": "Found",
								})

				if search_mode in ("references", "both"):
					m_ref = ref_class_re.search(line)
					if m_ref and not class_decl:
						detail = (m_ref.group(0) or "").strip()
						results.append({
							"language": "JavaScript",
							"app": app_name,
							"class_name": current_class or _("(Script)"),
							"symbol_name": detail,
							"file_name": os.path.basename(file_path),
							"file_path": rel_path,
							"full_path": file_path,
							"line_no": idx,
							"impl_type": "Class Reference",
							"category": "References",
							"parent_class": "",
							"registration": detail,
							"status": "Found",
						})

	return results


def _get_candidate_files(search_dir, extensions, search_term):
	"""Returns file paths matching extensions and containing search_term."""
	if not os.path.isdir(search_dir):
		return []

	try:
		include_args = []
		for ext in extensions:
			include_args.extend(["--include", f"*{ext}"])
		cmd = [
			"grep", "-rnIil",
			"--exclude-dir=node_modules",
			"--exclude-dir=dist",
			"--exclude-dir=__pycache__",
			"--exclude-dir=.git",
			"--exclude-dir=.venv",
			"--exclude-dir=env",
			"--exclude-dir=assets",
			*include_args,
			search_term,
			search_dir,
		]
		proc = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
		return [f for f in proc.stdout.strip().split("\n") if f]
	except Exception:
		# Fallback walking files
		matched = []
		for root, dirs, files in os.walk(search_dir):
			dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", "__pycache__", ".git", "assets")]
			for f in files:
				if any(f.endswith(ext) for ext in extensions):
					full = os.path.join(root, f)
					try:
						with open(full, "r", encoding="utf-8", errors="ignore") as fh:
							if search_term.lower() in fh.read().lower():
								matched.append(full)
					except Exception:
						pass
		return matched


def _build_hierarchy(method_name, class_name, py_results, js_results):
	"""Builds collapsible hierarchical records for EasyTable.

	indent: 0 -> Method / Class Name Root
	indent: 1 -> Language (Python / JavaScript)
	indent: 2 -> Category (Original Definition / Override / References)
	indent: 3 -> App Name
	indent: 4 -> Source File & Symbol
	"""
	records = []
	all_items = py_results + js_results

	total_matches = len(all_items)
	total_py = len(py_results)
	total_js = len(js_results)
	total_defs = sum(1 for i in all_items if i["category"] == "Original Definition")
	total_overrides = sum(1 for i in all_items if i["category"] == "Override / Extension")
	total_refs = sum(1 for i in all_items if i["category"] == "References")
	apps_set = sorted(list(set(i["app"] for i in all_items)))

	# Determine root display name
	if method_name and class_name:
		display_name = f"{method_name} ({class_name})"
	elif method_name:
		display_name = method_name
	else:
		display_name = class_name

	# Root Node (indent: 0)
	records.append({
		"node": display_name,
		"language": f"{total_matches} " + _("Matches"),
		"app": f"{len(apps_set)} " + _("Apps"),
		"class_name": class_name or "",
		"file_name": "",
		"file_path": "",
		"line_no": None,
		"impl_type": _("Searched Criteria"),
		"parent_class": "",
		"registration": "",
		"status": "Found",
		"indent": 0,
	})

	# Language Sections (indent: 1)
	lang_groups = []
	if py_results:
		lang_groups.append(("Python", py_results))
	if js_results:
		lang_groups.append(("JavaScript", js_results))

	for lang_name, items in lang_groups:
		records.append({
			"node": f"{lang_name} ({len(items)})",
			"language": lang_name,
			"app": "",
			"class_name": "",
			"file_name": "",
			"file_path": "",
			"line_no": None,
			"impl_type": _("Language"),
			"parent_class": "",
			"registration": "",
			"status": "",
			"indent": 1,
		})

		# Category Groups (indent: 2): Original Definition -> Override / Extension -> References
		cat_order = ["Original Definition", "Override / Extension", "References"]
		cat_map = {}
		for item in items:
			cat_map.setdefault(item["category"], []).append(item)

		for cat in cat_order:
			if cat not in cat_map:
				continue
			cat_items = cat_map[cat]

			records.append({
				"node": f"{cat} ({len(cat_items)})",
				"language": lang_name,
				"app": "",
				"class_name": "",
				"file_name": "",
				"file_path": "",
				"line_no": None,
				"impl_type": cat,
				"parent_class": "",
				"registration": "",
				"status": "",
				"indent": 2,
			})

			# App Groups (indent: 3)
			apps_map = {}
			for item in cat_items:
				apps_map.setdefault(item["app"], []).append(item)

			for app_name in sorted(apps_map.keys()):
				app_items = apps_map[app_name]
				records.append({
					"node": f"{app_name} ({len(app_items)})",
					"language": lang_name,
					"app": app_name,
					"class_name": "",
					"file_name": "",
					"file_path": "",
					"line_no": None,
					"impl_type": _("App Group"),
					"parent_class": "",
					"registration": "",
					"status": "",
					"indent": 3,
				})

				# Leaf File / Symbol Rows (indent: 4)
				for item in app_items:
					display_node = f"{item['file_name']}:{item['line_no']}"
					if item.get("symbol_name"):
						display_node += f" ({item['symbol_name']})"
					elif item["class_name"] and item["class_name"] != _("(Module Level)"):
						display_node += f" ({item['class_name']})"

					records.append({
						"node": display_node,
						"language": item["language"],
						"app": item["app"],
						"class_name": item["class_name"],
						"file_name": item["file_name"],
						"file_path": item["file_path"],
						"line_no": item["line_no"],
						"impl_type": item["impl_type"],
						"parent_class": item["parent_class"],
						"registration": item["registration"],
						"status": item["status"],
						"indent": 4,
					})

	summary = {
		"method_name": method_name,
		"class_name": class_name,
		"display_query": display_name,
		"total_matches": total_matches,
		"total_python": total_py,
		"total_js": total_js,
		"total_definitions": total_defs,
		"total_overrides": total_overrides,
		"total_references": total_refs,
		"total_apps": len(apps_set),
	}

	return records, summary


def _is_authorized():
	if frappe.session.user == "Administrator":
		return True
	user_roles = set(frappe.get_roles())
	allowed = {"System Manager", "Workspace Manager"}
	return bool(allowed.intersection(user_roles))

