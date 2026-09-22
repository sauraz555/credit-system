"""AST Equivalence Verifier.

Compares Python files on the current branch against a base branch (default: fix-sprint)
to ensure that only comments and docstrings were added/modified, and that the underlying
Abstract Syntax Tree (excluding docstrings and line number attributes) remains 100% identical.
"""

import ast
import subprocess
import sys
import os
from typing import Optional, Tuple


class DocstringStripper(ast.NodeTransformer):
    """AST transformer that removes docstrings from modules, classes, and functions."""

    def _strip_docstring(self, body):
        if body and isinstance(body[0], ast.Expr):
            val = body[0].value
            if isinstance(val, ast.Constant) and isinstance(val.value, str):
                return body[1:]
        return body

    def visit_Module(self, node: ast.Module) -> ast.Module:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node

    def visit_FunctionDef(self, node: ast.FunctionDef) -> ast.FunctionDef:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> ast.AsyncFunctionDef:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node

    def visit_ClassDef(self, node: ast.ClassDef) -> ast.ClassDef:
        self.generic_visit(node)
        node.body = self._strip_docstring(node.body)
        return node


def normalize_ast(code: str) -> str:
    """Parses code, removes docstrings, and dumps the AST without location attributes."""
    tree = ast.parse(code)
    stripper = DocstringStripper()
    tree = stripper.visit(tree)
    return ast.dump(tree, include_attributes=False)


def get_git_file_content(branch: str, filepath: str) -> Optional[str]:
    """Retrieves file content from a specific git ref."""
    git_path = filepath.replace("\\", "/")
    try:
        res = subprocess.run(
            ["git", "show", f"{branch}:{git_path}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True
        )
        return res.stdout
    except subprocess.CalledProcessError:
        return None


def verify_file(filepath: str, base_branch: str = "fix-sprint") -> Tuple[bool, str]:
    """Compares the current file against base_branch."""
    if not os.path.exists(filepath):
        return False, f"File does not exist: {filepath}"

    with open(filepath, "r", encoding="utf-8") as f:
        current_code = f.read()

    base_code = get_git_file_content(base_branch, filepath)
    if base_code is None:
        # File is new on this branch
        return True, "NEW FILE (not in base branch)"

    try:
        current_dump = normalize_ast(current_code)
        base_dump = normalize_ast(base_code)
    except SyntaxError as e:
        return False, f"Syntax error parsing AST: {e}"

    if current_dump == base_dump:
        return True, "IDENTICAL"
    else:
        return False, "AST MISMATCH (behavior/logic altered!)"


def main():
    base_branch = sys.argv[1] if len(sys.argv) > 1 else "fix-sprint"
    root_dir = "."
    py_files = []

    for root, dirs, files in os.walk(root_dir):
        if any(ignored in root for ignored in ["venv", ".pytest_cache", "__pycache__", ".git", "node_modules"]):
            continue
        for file in files:
            if file.endswith(".py"):
                # Exclude the verification script itself
                rel = os.path.relpath(os.path.join(root, file), root_dir)
                if rel.replace("\\", "/") != "scripts/verify_ast_equivalence.py":
                    py_files.append(rel)

    py_files.sort()
    all_passed = True
    results = []

    print(f"Comparing {len(py_files)} Python files against branch '{base_branch}'...")
    print("=" * 70)

    for pf in py_files:
        passed, msg = verify_file(pf, base_branch)
        results.append((pf, passed, msg))
        status_label = "[PASS]" if passed else "[FAIL]"
        print(f"{status_label:7} {pf:55} {msg}")
        if not passed:
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("SUCCESS: All Python files have 100% equivalent ASTs to base branch.")
        sys.exit(0)
    else:
        print("ERROR: AST differences detected! Code behavior may have changed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
