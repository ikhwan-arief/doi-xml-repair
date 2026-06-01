"""Core XML repair logic for DOI XML Repair.

Hak cipta (c) 2026 Ikhwan Arief (ikhwan[at]unand.ac.id).
Aplikasi ini dapat digunakan oleh publik berdasarkan lisensi Creative Commons
Attribution-NonCommercial (CC BY-NC) untuk tujuan nonkomersial dengan atribusi
yang jelas kepada pembuat.
"""

from __future__ import annotations

import io
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as ET


XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"


class XmlRepairError(ValueError):
    """Raised when an XML file cannot be safely repaired."""


def analyze_xml_json(xml_text: str) -> str:
    return json.dumps(analyze_xml(xml_text), ensure_ascii=False)


def repair_xml_json(
    old_xml: str,
    new_xml: str,
    mapping_json: str,
    resource_urls_json: str = "",
) -> str:
    mapping = json.loads(mapping_json)
    resource_urls = json.loads(resource_urls_json) if resource_urls_json else None
    result = repair_xml(old_xml, new_xml, mapping, resource_urls=resource_urls)
    return json.dumps(result, ensure_ascii=False)


def repair_xml_with_dois_json(
    old_dois_json: str,
    new_xml: str,
    mapping_json: str,
    resource_urls_json: str = "",
) -> str:
    old_dois = json.loads(old_dois_json)
    mapping = json.loads(mapping_json)
    resource_urls = json.loads(resource_urls_json) if resource_urls_json else None
    result = repair_xml_with_dois(
        old_dois,
        new_xml,
        mapping,
        resource_urls=resource_urls,
    )
    return json.dumps(result, ensure_ascii=False)


def analyze_xml(xml_text: str) -> dict[str, Any]:
    root, _namespaces = _parse_crossref_xml(xml_text)
    articles = _extract_articles(root)
    head = _first_direct_child(root, "head")
    batch_id = ""
    timestamp = ""

    if head is not None:
        batch_id_el = _first_direct_child(head, "doi_batch_id")
        timestamp_el = _first_direct_child(head, "timestamp")
        batch_id = _text(batch_id_el)
        timestamp = _text(timestamp_el)

    warnings = []
    if not batch_id:
        warnings.append("Elemen head/doi_batch_id tidak ditemukan.")
    if not timestamp:
        warnings.append("Elemen head/timestamp tidak ditemukan; output akan membuat timestamp baru.")

    return {
        "batch_id": batch_id,
        "timestamp": timestamp,
        "article_count": len(articles),
        "articles": articles,
        "warnings": warnings,
    }


def repair_xml(
    old_xml: str,
    new_xml: str,
    mapping: Any,
    resource_urls: Any = None,
) -> dict[str, Any]:
    old_root, _old_namespaces = _parse_crossref_xml(old_xml)
    new_root, new_namespaces = _parse_crossref_xml(new_xml)

    old_articles = _extract_articles(old_root)
    return _repair_with_old_articles(
        old_articles,
        new_root,
        new_namespaces,
        mapping,
        old_timestamp=_timestamp_value(old_root),
        old_source_label="XML lama",
        resource_urls=resource_urls,
    )


def repair_xml_with_dois(
    old_dois: list[str],
    new_xml: str,
    mapping: Any,
    resource_urls: Any = None,
) -> dict[str, Any]:
    new_root, new_namespaces = _parse_crossref_xml(new_xml)
    old_articles = _articles_from_dois(old_dois)
    return _repair_with_old_articles(
        old_articles,
        new_root,
        new_namespaces,
        mapping,
        old_source_label="DOI lama",
        resource_urls=resource_urls,
    )


def _repair_with_old_articles(
    old_articles: list[dict[str, Any]],
    new_root: ET.Element,
    new_namespaces: list[tuple[str, str]],
    mapping: Any,
    old_timestamp: str = "",
    old_source_label: str = "data lama",
    resource_urls: Any = None,
) -> dict[str, Any]:
    new_articles = _extract_articles(new_root)
    normalized_mapping = _normalize_mapping(mapping, len(old_articles), len(new_articles))
    normalized_resource_urls = _normalize_resource_urls(
        resource_urls,
        len(new_articles),
    )

    output_root = deepcopy(new_root)
    output_articles = _journal_articles(output_root)
    for new_index, old_index in normalized_mapping.items():
        doi_el = _article_doi_element(output_articles[new_index])
        doi_el.text = old_articles[old_index]["doi"]
        new_resource_url = normalized_resource_urls[new_index]
        if new_resource_url:
            _set_article_resource(output_articles[new_index], new_resource_url)

    new_ts = _timestamp_value(output_root)
    output_ts = _next_timestamp(old_timestamp, new_ts)
    _set_timestamp(output_root, output_ts)

    _register_namespaces(new_namespaces, output_root)
    xml_output = _serialize_xml(output_root)

    warnings = []
    if not new_ts:
        warnings.append(
            "XML baru tidak memiliki timestamp; aplikasi membuat timestamp baru."
        )
    if len(old_articles) != len(new_articles):
        warnings.append(
            f"Jumlah artikel berbeda: {old_source_label} {len(old_articles)}, XML baru {len(new_articles)}."
        )
    unused_old = [
        article["doi"]
        for index, article in enumerate(old_articles)
        if index not in normalized_mapping.values()
    ]
    if unused_old:
        warnings.append(
            "DOI lama yang tidak dipakai: " + ", ".join(unused_old)
        )
    return {
        "xml": xml_output,
        "timestamp": output_ts,
        "timestamp_source": "incremented",
        "article_count": len(new_articles),
        "resource_url_override_count": sum(
            1 for url in normalized_resource_urls if url
        ),
        "warnings": warnings,
        "mapping": [
            {
                "new_index": new_index,
                "old_index": old_index,
                "doi": old_articles[old_index]["doi"],
                "new_title": new_articles[new_index]["title"],
                "resource_url": _article_resource(output_articles[new_index]),
            }
            for new_index, old_index in sorted(normalized_mapping.items())
        ],
    }


def _articles_from_dois(old_dois: list[str]) -> list[dict[str, Any]]:
    cleaned = [_normalize_doi_input(doi) for doi in old_dois]
    cleaned = [doi for doi in cleaned if doi]
    if not cleaned:
        raise XmlRepairError("Daftar DOI lama kosong.")

    duplicate_dois = sorted({doi for doi in cleaned if cleaned.count(doi) > 1})
    if duplicate_dois:
        raise XmlRepairError(
            "Satu DOI lama tidak boleh ditulis lebih dari sekali: "
            + ", ".join(duplicate_dois)
            + "."
        )

    return [
        {
            "index": index,
            "number": index + 1,
            "doi": doi,
            "title": f"DOI lama {index + 1}",
            "year": "",
            "first_page": "",
        }
        for index, doi in enumerate(cleaned)
    ]


def _parse_crossref_xml(xml_text: str) -> tuple[ET.Element, list[tuple[str, str]]]:
    if not xml_text or not xml_text.strip():
        raise XmlRepairError("XML kosong.")

    namespaces = _capture_namespaces(xml_text)
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise XmlRepairError(f"XML tidak valid: {exc}") from exc

    if _local_name(root.tag) != "doi_batch":
        raise XmlRepairError("Root XML harus berupa doi_batch Crossref.")

    articles = _journal_articles(root)
    if not articles:
        raise XmlRepairError("Tidak ada journal_article pada XML.")

    missing_doi = [
        str(index + 1)
        for index, article in enumerate(articles)
        if _article_doi_element(article) is None or not _article_doi(article)
    ]
    if missing_doi:
        raise XmlRepairError(
            "Artikel berikut tidak memiliki journal_article/doi_data/doi: "
            + ", ".join(missing_doi)
            + "."
        )

    return root, namespaces


def _capture_namespaces(xml_text: str) -> list[tuple[str, str]]:
    namespaces: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    try:
        for _event, ns in ET.iterparse(io.StringIO(xml_text), events=("start-ns",)):
            prefix, uri = ns
            key = (prefix or "", uri)
            if key not in seen:
                seen.add(key)
                namespaces.append(key)
    except ET.ParseError:
        return []
    return namespaces


def _register_namespaces(
    namespaces: list[tuple[str, str]], root: ET.Element
) -> None:
    root_uri = _namespace_uri(root.tag)
    if root_uri and ("", root_uri) not in namespaces:
        namespaces.insert(0, ("", root_uri))
    if ("xsi", XSI_NS) not in namespaces:
        namespaces.append(("xsi", XSI_NS))

    for prefix, uri in namespaces:
        try:
            ET.register_namespace(prefix, uri)
        except ValueError:
            continue


def _journal_articles(root: ET.Element) -> list[ET.Element]:
    return [element for element in root.iter() if _local_name(element.tag) == "journal_article"]


def _extract_articles(root: ET.Element) -> list[dict[str, Any]]:
    articles = []
    for index, article in enumerate(_journal_articles(root)):
        doi = _article_doi(article)
        title = _article_title(article)
        year = _article_year(article)
        first_page = _article_first_page(article)
        articles.append(
            {
                "index": index,
                "number": index + 1,
                "doi": doi,
                "title": title or "(tanpa judul)",
                "year": year,
                "first_page": first_page,
                "resource_url": _article_resource(article),
            }
        )
    return articles


def _article_doi(article: ET.Element) -> str:
    doi_el = _article_doi_element(article)
    return _text(doi_el)


def _article_doi_element(article: ET.Element) -> ET.Element | None:
    doi_data = _article_doi_data(article)
    if doi_data is None:
        return None
    return _first_direct_child(doi_data, "doi")


def _article_doi_data(article: ET.Element) -> ET.Element | None:
    return _first_direct_child(article, "doi_data")


def _article_resource(article: ET.Element) -> str:
    doi_data = _article_doi_data(article)
    if doi_data is None:
        return ""
    return _text(_first_direct_child(doi_data, "resource"))


def _set_article_resource(article: ET.Element, resource_url: str) -> None:
    doi_data = _article_doi_data(article)
    if doi_data is None:
        doi_data = ET.Element(_qualified_name(article, "doi_data"))
        article.append(doi_data)

    resource_el = _first_direct_child(doi_data, "resource")
    if resource_el is None:
        resource_el = ET.Element(_qualified_name(article, "resource"))
        doi_el = _first_direct_child(doi_data, "doi")
        children = list(doi_data)
        insert_at = (
            children.index(doi_el) + 1
            if doi_el in children
            else len(children)
        )
        doi_data.insert(insert_at, resource_el)
    resource_el.text = resource_url


def _article_title(article: ET.Element) -> str:
    titles = _first_direct_child(article, "titles")
    if titles is None:
        return ""
    title_parts = []
    for child in list(titles):
        if _local_name(child.tag) in {"title", "subtitle"}:
            title_parts.append(_collapse_text(" ".join(child.itertext())))
    return " - ".join(part for part in title_parts if part)


def _article_year(article: ET.Element) -> str:
    publication_date = _first_direct_child(article, "publication_date")
    if publication_date is None:
        return ""
    return _text(_first_direct_child(publication_date, "year"))


def _article_first_page(article: ET.Element) -> str:
    pages = _first_direct_child(article, "pages")
    if pages is None:
        return ""
    return _text(_first_direct_child(pages, "first_page"))


def _normalize_mapping(
    mapping: Any, old_count: int, new_count: int
) -> dict[int, int]:
    if mapping is None:
        raise XmlRepairError("Mapping DOI kosong.")

    if isinstance(mapping, list):
        mapping_items = {
            int(item["new_index"]): int(item["old_index"])
            for item in mapping
            if "new_index" in item and "old_index" in item
        }
    elif isinstance(mapping, dict):
        mapping_items = {
            int(new_index): int(old_index)
            for new_index, old_index in mapping.items()
        }
    else:
        raise XmlRepairError("Format mapping DOI tidak dikenali.")

    if not mapping_items:
        raise XmlRepairError("Mapping DOI kosong.")

    missing_new = [str(index + 1) for index in range(new_count) if index not in mapping_items]
    if missing_new:
        raise XmlRepairError(
            "Artikel baru berikut belum dipasangkan dengan DOI lama: "
            + ", ".join(missing_new)
            + "."
        )

    invalid_new = [
        str(index + 1)
        for index in mapping_items
        if index < 0 or index >= new_count
    ]
    if invalid_new:
        raise XmlRepairError(
            "Index artikel baru di luar jangkauan: " + ", ".join(invalid_new) + "."
        )

    invalid_old = [
        str(index + 1)
        for index in mapping_items.values()
        if index < 0 or index >= old_count
    ]
    if invalid_old:
        raise XmlRepairError(
            "Index DOI lama di luar jangkauan: " + ", ".join(invalid_old) + "."
        )

    old_indexes = list(mapping_items.values())
    duplicates = sorted({index for index in old_indexes if old_indexes.count(index) > 1})
    if duplicates:
        duplicate_labels = ", ".join(str(index + 1) for index in duplicates)
        raise XmlRepairError(
            "Satu DOI lama tidak boleh dipakai lebih dari sekali. Duplikat: "
            + duplicate_labels
            + "."
        )

    return mapping_items


def _normalize_resource_urls(resource_urls: Any, new_count: int) -> list[str]:
    if resource_urls is None:
        return [""] * new_count
    if not isinstance(resource_urls, list):
        raise XmlRepairError("Format URL artikel baru harus berupa daftar.")

    cleaned = [str(url or "").strip() for url in resource_urls]
    if not any(cleaned):
        return [""] * new_count
    if len(cleaned) != new_count:
        raise XmlRepairError(
            "Jumlah URL artikel baru harus sama dengan jumlah artikel XML baru: "
            f"{len(cleaned)} URL untuk {new_count} artikel."
        )

    invalid_urls = [
        str(index + 1)
        for index, url in enumerate(cleaned)
        if url and not re.match(r"^https?://", url, flags=re.I)
    ]
    if invalid_urls:
        raise XmlRepairError(
            "URL artikel baru harus diawali http:// atau https://. Baris: "
            + ", ".join(invalid_urls)
            + "."
        )

    return cleaned


def _timestamp_value(root: ET.Element) -> str:
    head = _first_direct_child(root, "head")
    if head is None:
        return ""
    return _text(_first_direct_child(head, "timestamp"))


def _set_timestamp(root: ET.Element, timestamp: str) -> None:
    head = _first_direct_child(root, "head")
    if head is None:
        head = ET.Element(_qualified_name(root, "head"))
        root.insert(0, head)

    timestamp_el = _first_direct_child(head, "timestamp")
    if timestamp_el is None:
        timestamp_el = ET.Element(_qualified_name(root, "timestamp"))
        head.insert(0, timestamp_el)
    timestamp_el.text = timestamp


def _next_timestamp(*values: str) -> str:
    numeric_values = [int(value) for value in values if value and value.isdigit()]
    now_value = int(datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S"))
    base = max(numeric_values + [now_value])
    return str(base + 1)


def _serialize_xml(root: ET.Element) -> str:
    try:
        ET.indent(root, space="  ")
    except AttributeError:
        pass
    xml_body = ET.tostring(root, encoding="unicode", short_empty_elements=True)
    if not xml_body.startswith("<?xml"):
        return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_body + "\n"
    return xml_body


def _first_direct_child(parent: ET.Element, local_name: str) -> ET.Element | None:
    for child in list(parent):
        if _local_name(child.tag) == local_name:
            return child
    return None


def _qualified_name(root: ET.Element, local_name: str) -> str:
    uri = _namespace_uri(root.tag)
    if not uri:
        return local_name
    return f"{{{uri}}}{local_name}"


def _namespace_uri(tag: str) -> str:
    if tag.startswith("{"):
        return tag[1:].split("}", 1)[0]
    return ""


def _local_name(tag: str) -> str:
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def _text(element: ET.Element | None) -> str:
    if element is None or element.text is None:
        return ""
    return element.text.strip()


def _collapse_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _normalize_doi_input(value: Any) -> str:
    doi = str(value or "").strip()
    doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi, flags=re.I)
    doi = re.sub(r"^doi:\s*", "", doi, flags=re.I)
    return doi.strip()
