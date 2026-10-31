import json
import os
import re
import subprocess
import frappe
from frappe import _


def _run_git_cmd(args, cwd):
	"""Helper to safely run git command and return stdout."""
	try:
		res = subprocess.run(
			["git"] + args,
			cwd=cwd,
			capture_output=True,
			text=True,
			timeout=10,
		)
		if res.returncode == 0:
			return res.stdout.strip()
		return ""
	except Exception:
		return ""


def _to_web_url(git_url):
	"""Convert SSH or HTTPS git clone URL to browser-friendly HTTP URL."""
	if not git_url:
		return ""
	url = git_url.strip()
	if url.startswith("git@"):
		# git@github.com:org/repo.git -> https://github.com/org/repo
		m = re.match(r"git@([^:]+):(.+?)(\.git)?$", url)
		if m:
			return f"https://{m.group(1)}/{m.group(2)}"
	elif url.startswith("https://") or url.startswith("http://"):
		if url.endswith(".git"):
			return url[:-4]
		return url
	return url


def _get_app_hooks_metadata(app_name, app_path):
	"""Extract title, publisher, version and description from hooks.py or pyproject.toml."""
	meta = {
		"title": app_name.replace("_", " ").title(),
		"publisher": "",
		"version": "",
		"description": "",
	}

	hooks_file = os.path.join(app_path, app_name, "hooks.py")
	if os.path.exists(hooks_file):
		try:
			with open(hooks_file, "r", encoding="utf-8") as f:
				content = f.read()
				t_match = re.search(r'app_title\s*=\s*["\']([^"\']+)["\']', content)
				if t_match:
					meta["title"] = t_match.group(1)
				p_match = re.search(r'app_publisher\s*=\s*["\']([^"\']+)["\']', content)
				if p_match:
					meta["publisher"] = p_match.group(1)
				v_match = re.search(r'app_version\s*=\s*["\']([^"\']+)["\']', content)
				if v_match:
					meta["version"] = v_match.group(1)
				d_match = re.search(r'app_description\s*=\s*["\']([^"\']+)["\']', content)
				if d_match:
					meta["description"] = d_match.group(1)
		except Exception:
			pass

	return meta


@frappe.whitelist()
def get_git_apps_overview(filter_name=None):
	"""Returns overview of all bench apps, git links, branches, and working tree statuses."""
	if not frappe.has_permission("Page", "read"):
		frappe.throw(_("Not permitted to view Git App Explorer"), frappe.PermissionError)

	bench_path = frappe.utils.get_bench_path()
	apps_dir = os.path.join(bench_path, "apps")
	sites_path = os.path.join(bench_path, "sites")

	# Read sites/apps.json for recorded git resolutions
	apps_json_data = {}
	apps_json_file = os.path.join(sites_path, "apps.json")
	if os.path.exists(apps_json_file):
		try:
			with open(apps_json_file, "r", encoding="utf-8") as f:
				apps_json_data = json.load(f)
		except Exception:
			pass

	# Read sites/apps.txt for registered apps
	registered_apps = []
	apps_txt_file = os.path.join(sites_path, "apps.txt")
	if os.path.exists(apps_txt_file):
		try:
			with open(apps_txt_file, "r", encoding="utf-8") as f:
				registered_apps = [line.strip() for line in f if line.strip()]
		except Exception:
			pass

	# Get installed apps for the current site
	try:
		installed_apps = set(frappe.get_installed_apps())
	except Exception:
		installed_apps = set()

	all_app_names = []
	if os.path.exists(apps_dir):
		for name in os.listdir(apps_dir):
			full_p = os.path.join(apps_dir, name)
			if os.path.isdir(full_p) and not name.startswith("."):
				all_app_names.append(name)
	all_app_names.sort()

	apps_list = []
	total_repos = 0
	clean_repos = 0
	dirty_repos = 0
	installed_count = 0

	for app_name in all_app_names:
		if filter_name and filter_name.lower() not in app_name.lower():
			continue

		app_path = os.path.join(apps_dir, app_name)
		git_dir = os.path.join(app_path, ".git")
		is_repo = os.path.isdir(git_dir)
		hooks_meta = _get_app_hooks_metadata(app_name, app_path)

		is_installed = app_name in installed_apps
		if is_installed:
			installed_count += 1

		# Assets symlink check
		asset_link = os.path.join(sites_path, "assets", app_name)
		asset_symlink_ok = os.path.islink(asset_link)

		app_data = {
			"app_name": app_name,
			"app_title": hooks_meta["title"],
			"app_publisher": hooks_meta["publisher"],
			"app_version": hooks_meta["version"],
			"app_description": hooks_meta["description"],
			"app_path": app_path,
			"is_repo": is_repo,
			"is_installed": is_installed,
			"is_in_apps_txt": app_name in registered_apps,
			"asset_symlink_ok": asset_symlink_ok,
			"branch": "-",
			"tracking_branch": "-",
			"ahead": 0,
			"behind": 0,
			"remote_name": "",
			"remote_url": "",
			"remote_web_url": "",
			"remotes": [],
			"latest_commit": None,
			"is_clean": True,
			"uncommitted_count": 0,
			"uncommitted_files": [],
			"apps_json_resolution": apps_json_data.get(app_name, {}).get("resolution"),
			"is_restored": True,
		}

		if is_repo:
			total_repos += 1

			# Current active branch or tag/commit
			branch = _run_git_cmd(["branch", "--show-current"], app_path)
			if not branch:
				branch = _run_git_cmd(["describe", "--tags", "--exact-match"], app_path)
			if not branch:
				short_hash = _run_git_cmd(["rev-parse", "--short", "HEAD"], app_path)
				branch = f"detached at {short_hash}" if short_hash else "HEAD"
			app_data["branch"] = branch

			# Tracking branch
			tracking = _run_git_cmd(
				["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], app_path
			)
			app_data["tracking_branch"] = tracking or "-"

			# Ahead / Behind count
			if tracking:
				ahead_behind_str = _run_git_cmd(
					["rev-list", "--left-right", "--count", "HEAD...@{u}"], app_path
				)
				if ahead_behind_str:
					parts = ahead_behind_str.split()
					if len(parts) == 2:
						try:
							app_data["ahead"] = int(parts[0])
							app_data["behind"] = int(parts[1])
						except ValueError:
							pass

			# Remotes
			remotes_raw = _run_git_cmd(["remote", "-v"], app_path)
			remotes_list = []
			seen_remotes = set()
			primary_remote = ""
			for line in remotes_raw.splitlines():
				parts = line.split()
				if len(parts) >= 2:
					r_name, r_url = parts[0], parts[1]
					r_type = parts[2].strip("()") if len(parts) > 2 else "fetch"
					remotes_list.append({"name": r_name, "url": r_url, "type": r_type})
					if r_type == "fetch" and r_name not in seen_remotes:
						seen_remotes.add(r_name)
						if not primary_remote:
							primary_remote = r_url
							app_data["remote_name"] = r_name

			app_data["remotes"] = remotes_list
			app_data["remote_url"] = primary_remote
			app_data["remote_web_url"] = _to_web_url(primary_remote)

			# Latest Commit
			commit_raw = _run_git_cmd(
				["log", "-1", "--pretty=format:%H|%h|%an|%ae|%ad|%ar|%s"], app_path
			)
			if commit_raw:
				c_parts = commit_raw.split("|", 6)
				if len(c_parts) == 7:
					app_data["latest_commit"] = {
						"hash": c_parts[0],
						"short_hash": c_parts[1],
						"author": c_parts[2],
						"email": c_parts[3],
						"date": c_parts[4],
						"relative_date": c_parts[5],
						"message": c_parts[6],
					}

			# Status / Working tree
			status_raw = _run_git_cmd(["status", "--porcelain"], app_path)
			if status_raw:
				lines = [l for l in status_raw.splitlines() if l.strip()]
				app_data["uncommitted_count"] = len(lines)
				app_data["is_clean"] = len(lines) == 0
				dirty_repos += 1
				uncommitted_files = []
				for l in lines[:25]:  # limit to top 25 files
					code = l[:2].strip()
					fpath = l[3:].strip()
					uncommitted_files.append({"status": code, "file": fpath})
				app_data["uncommitted_files"] = uncommitted_files
			else:
				app_data["is_clean"] = True
				clean_repos += 1
		else:
			app_data["is_clean"] = True
			app_data["is_restored"] = False

		apps_list.append(app_data)

	summary = {
		"total_apps": len(all_app_names),
		"repo_count": total_repos,
		"clean_count": clean_repos,
		"dirty_count": dirty_repos,
		"installed_count": installed_count,
		"bench_path": bench_path,
		"current_site": frappe.local.site,
	}

	return {
		"summary": summary,
		"apps": apps_list,
	}


@frappe.whitelist()
def get_app_git_log(app_name, limit=25):
	"""Returns commit history for a specific app."""
	if not frappe.has_permission("Page", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	limit = min(int(limit or 25), 100)
	bench_path = frappe.utils.get_bench_path()
	app_path = os.path.join(bench_path, "apps", app_name)

	if not os.path.isdir(os.path.join(app_path, ".git")):
		frappe.throw(_("App {0} is not a Git repository").format(app_name))

	log_raw = _run_git_cmd(
		[
			"log",
			f"-n{limit}",
			"--pretty=format:%H%x00%h%x00%an%x00%ae%x00%ad%x00%ar%x00%s%x00%d",
			"--date=format:%Y-%m-%d %H:%M",
		],
		app_path,
	)

	commits = []
	if log_raw:
		for entry in log_raw.split("\n"):
			parts = entry.split("\x00")
			if len(parts) >= 7:
				commits.append(
					{
						"hash": parts[0],
						"short_hash": parts[1],
						"author": parts[2],
						"email": parts[3],
						"date": parts[4],
						"relative_date": parts[5],
						"message": parts[6],
						"refs": parts[7].strip() if len(parts) > 7 else "",
					}
				)

	return {
		"app_name": app_name,
		"commits": commits,
	}


@frappe.whitelist()
def get_app_git_diff(app_name, file_path=None):
	"""Returns working tree diff or detailed uncommitted status for an app."""
	if not frappe.has_permission("Page", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	bench_path = frappe.utils.get_bench_path()
	app_path = os.path.join(bench_path, "apps", app_name)

	if not os.path.isdir(os.path.join(app_path, ".git")):
		frappe.throw(_("App {0} is not a Git repository").format(app_name))

	status_raw = _run_git_cmd(["status", "--porcelain"], app_path)
	files = []
	for line in status_raw.splitlines():
		if line.strip():
			files.append({"status": line[:2].strip(), "file": line[3:].strip()})

	diff_args = ["diff", "HEAD"]
	if file_path:
		diff_args.extend(["--", file_path])

	diff_output = _run_git_cmd(diff_args, app_path)
	if not diff_output:
		# If unstaged without commit or untracked
		diff_output = _run_git_cmd(["diff"], app_path)

	return {
		"app_name": app_name,
		"files": files,
		"diff": diff_output or "No differences found or only untracked files.",
	}


@frappe.whitelist()
def get_app_branches(app_name):
	"""Returns local and remote branches for an app."""
	if not frappe.has_permission("Page", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	bench_path = frappe.utils.get_bench_path()
	app_path = os.path.join(bench_path, "apps", app_name)

	if not os.path.isdir(os.path.join(app_path, ".git")):
		frappe.throw(_("App {0} is not a Git repository").format(app_name))

	branches_raw = _run_git_cmd(["branch", "-a"], app_path)
	branches = []
	current = ""
	for b in branches_raw.splitlines():
		b_clean = b.strip()
		is_current = b_clean.startswith("*")
		name = b_clean.lstrip("* ").strip()
		if is_current:
			current = name
		branches.append({"name": name, "is_current": is_current})

	return {
		"app_name": app_name,
		"current_branch": current,
		"branches": branches,
	}
