from __future__ import annotations

import re
from pathlib import Path

from app.models import MethodInfo, NodeModel, StructuralReference


CLASS_RE = re.compile(
    r"\b(?P<kind>class|interface|enum)\s+"
    r"(?P<name>[A-Z][A-Za-z0-9_]*)"
    r"(?:\s+extends\s+(?P<extends>[A-Za-z0-9_.,<>\s]+?))?"
    r"(?:\s+implements\s+(?P<implements>[A-Za-z0-9_.,<>\s]+?))?"
    r"\s*\{",
    re.MULTILINE,
)
PACKAGE_RE = re.compile(r"^\s*package\s+([A-Za-z0-9_.]+)\s*;", re.MULTILINE)
IMPORT_RE = re.compile(r"^\s*import\s+(?:static\s+)?([A-Za-z0-9_.*]+)\s*;", re.MULTILINE)
ANNOTATION_RE = re.compile(r"^\s*@([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
FIELD_RE = re.compile(
    r"^\s*(?:private|protected|public)\s+"
    r"(?:(?:static|final|volatile|transient)\s+)*"
    r"(?P<type>[A-Za-z0-9_.$<>, ?\[\]]+)\s+"
    r"(?P<name>[a-zA-Z_][A-Za-z0-9_]*)\s*(?:=|;)",
    re.MULTILINE,
)
METHOD_RE = re.compile(
    r"^\s*(?:@[A-Za-z0-9_]+(?:\([^)]*\))?\s*)*"
    r"(?:public|protected|private)\s+"
    r"(?:(?:static|final|abstract|synchronized)\s+)*"
    r"(?P<return>[A-Za-z0-9_.$<>, ?\[\]]+)\s+"
    r"(?P<name>[a-zA-Z_][A-Za-z0-9_]*)\s*"
    r"\((?P<params>[^)]*)\)",
    re.MULTILINE,
)

IGNORED_TYPES = {
    "String",
    "Integer",
    "Long",
    "Boolean",
    "Double",
    "Float",
    "Short",
    "Byte",
    "Object",
    "void",
    "int",
    "long",
    "boolean",
    "double",
    "float",
    "short",
    "byte",
    "char",
    "List",
    "Set",
    "Map",
    "Optional",
    "Collection",
    "LocalDateTime",
    "BigDecimal",
}

REFERENCE_WEIGHTS = {
    "extends": 1.0,
    "implements": 0.9,
    "field_dependency": 0.8,
    "constructor_dependency": 0.8,
    "method_signature_reference": 0.65,
    "import": 0.2,
}


class JavaScanner:
    """Best-effort Java class extractor for a local developer MVP.

    This intentionally avoids claiming compiler-grade type resolution. It works
    well for conventional Java/Spring-style files and degrades by skipping
    facts it cannot extract confidently.
    """

    def scan(self, repo_path: Path, max_files: int = 1000) -> list[NodeModel]:
        java_files = sorted(repo_path.rglob("*.java"))[:max_files]
        nodes: list[NodeModel] = []
        for file_path in java_files:
            try:
                source = file_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                source = file_path.read_text(encoding="utf-8", errors="ignore")
            node = self._parse_file(file_path, repo_path, source)
            if node:
                nodes.append(node)
        return nodes

    def _parse_file(self, file_path: Path, repo_path: Path, source: str) -> NodeModel | None:
        class_match = CLASS_RE.search(source)
        if not class_match:
            return None

        package_name = _first_match(PACKAGE_RE, source)
        class_name = class_match.group("name")
        kind = class_match.group("kind")
        qualified_name = f"{package_name}.{class_name}" if package_name else class_name
        imports = _unique(IMPORT_RE.findall(source))
        annotations = _unique(ANNOTATION_RE.findall(source))
        extends = _type_list(class_match.group("extends") or "")
        implements = _type_list(class_match.group("implements") or "")
        methods = self._methods(source)
        fields, field_refs = self._fields(source)
        constructor_refs = self._constructor_refs(source, class_name)
        method_refs = self._method_refs(methods)

        references: list[StructuralReference] = []
        for base in extends:
            references.append(_reference(base, "extends", f"extends {base}"))
        for base in implements:
            references.append(_reference(base, "implements", f"implements {base}"))
        references.extend(field_refs)
        references.extend(constructor_refs)
        references.extend(method_refs)
        references.extend(
            _reference(_simple_name(import_name), "import", f"import {import_name}")
            for import_name in imports
            if not import_name.endswith(".*")
        )

        dependencies = _unique(
            ref.targetName for ref in references if ref.targetName and ref.targetName not in IGNORED_TYPES
        )
        relative_path = _relative_posix(file_path)
        preview = "\n".join(source.splitlines()[:120])

        return NodeModel(
            id=qualified_name,
            label=class_name,
            qualifiedName=qualified_name,
            packageName=package_name,
            kind=kind,
            filePath=relative_path,
            annotations=annotations,
            imports=imports,
            methods=methods,
            fields=fields,
            dependencies=dependencies,
            extends=extends,
            implements=implements,
            references=references,
            sourcePreview=preview,
        )

    def _methods(self, source: str) -> list[MethodInfo]:
        methods: list[MethodInfo] = []
        for match in METHOD_RE.finditer(source):
            name = match.group("name")
            if name in {"if", "for", "while", "switch", "catch"}:
                continue
            return_type = _normalize_type(match.group("return"))
            parameters = _parameter_types(match.group("params"))
            signature = f"{name}({', '.join(parameters)})"
            methods.append(
                MethodInfo(
                    name=name,
                    signature=signature,
                    returnType=return_type,
                    parameters=parameters,
                )
            )
        return _unique_models(methods, key=lambda method: method.signature)

    def _fields(self, source: str) -> tuple[list[str], list[StructuralReference]]:
        fields: list[str] = []
        refs: list[StructuralReference] = []
        for match in FIELD_RE.finditer(source):
            field_type = _normalize_type(match.group("type"))
            field_name = match.group("name")
            if not field_type or field_type in IGNORED_TYPES:
                continue
            fields.append(f"{field_type} {field_name}")
            refs.append(
                _reference(
                    field_type,
                    "field_dependency",
                    f"field {field_type} {field_name}",
                )
            )
        return _unique(fields), refs

    def _constructor_refs(self, source: str, class_name: str) -> list[StructuralReference]:
        constructor_re = re.compile(
            rf"^\s*(?:public|protected|private)\s+{re.escape(class_name)}\s*\((?P<params>[^)]*)\)",
            re.MULTILINE,
        )
        refs: list[StructuralReference] = []
        for match in constructor_re.finditer(source):
            for param_type in _parameter_types(match.group("params")):
                if param_type not in IGNORED_TYPES:
                    refs.append(
                        _reference(
                            param_type,
                            "constructor_dependency",
                            f"constructor parameter {param_type}",
                        )
                    )
        return refs

    def _method_refs(self, methods: list[MethodInfo]) -> list[StructuralReference]:
        refs: list[StructuralReference] = []
        for method in methods:
            candidates = [method.returnType, *method.parameters]
            for candidate in candidates:
                if candidate and candidate not in IGNORED_TYPES:
                    refs.append(
                        _reference(
                            candidate,
                            "method_signature_reference",
                            f"method {method.signature} references {candidate}",
                        )
                    )
        return refs


def _first_match(pattern: re.Pattern[str], source: str) -> str:
    match = pattern.search(source)
    return match.group(1) if match else ""


def _reference(target: str, relation_type: str, evidence: str) -> StructuralReference:
    return StructuralReference(
        targetName=_normalize_type(target),
        relationType=relation_type,
        evidence=evidence,
        weight=REFERENCE_WEIGHTS[relation_type],
    )


def _parameter_types(params: str) -> list[str]:
    if not params.strip():
        return []
    types: list[str] = []
    for raw_param in params.split(","):
        cleaned = re.sub(r"@[A-Za-z0-9_]+(?:\([^)]*\))?", "", raw_param)
        cleaned = cleaned.replace("final ", "").strip()
        if not cleaned:
            continue
        parts = cleaned.split()
        if len(parts) >= 2:
            types.append(_normalize_type(" ".join(parts[:-1])))
    return _unique([item for item in types if item])


def _type_list(raw: str) -> list[str]:
    if not raw:
        return []
    cleaned = raw.replace("\n", " ")
    parts = re.split(r"\s*,\s*", cleaned)
    return _unique(_normalize_type(part) for part in parts if _normalize_type(part))


def _normalize_type(raw_type: str) -> str:
    value = raw_type.strip()
    value = re.sub(r"<[^<>]*>", "", value)
    value = value.replace("[]", "")
    value = value.replace("?", "")
    value = value.replace("extends ", "")
    value = value.replace("super ", "")
    value = value.strip()
    if not value:
        return ""
    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_.]*", value)
    if not tokens:
        return ""
    token = tokens[-1]
    return _simple_name(token)


def _simple_name(qualified: str) -> str:
    return qualified.split(".")[-1]


def _unique(values):
    seen = set()
    result = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _unique_models(values: list[MethodInfo], key) -> list[MethodInfo]:
    seen = set()
    result = []
    for value in values:
        marker = key(value)
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def _relative_posix(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.resolve().as_posix()

