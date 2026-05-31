import re
from xml.etree import ElementTree as ET

import pytest

from doi_xml_repair import XmlRepairError, analyze_xml, repair_xml


def _article_dois(xml_text):
    root = ET.fromstring(xml_text)
    dois = []
    for article in root.iter():
        if _local(article.tag) != "journal_article":
            continue
        for child in list(article):
            if _local(child.tag) != "doi_data":
                continue
            for grandchild in list(child):
                if _local(grandchild.tag) == "doi":
                    dois.append((grandchild.text or "").strip())
    return dois


def _article_titles(xml_text):
    root = ET.fromstring(xml_text)
    titles = []
    for element in root.iter():
        if _local(element.tag) == "title":
            titles.append(" ".join(element.itertext()).strip())
    return titles


def _timestamp(xml_text):
    root = ET.fromstring(xml_text)
    for element in root.iter():
        if _local(element.tag) == "timestamp":
            return (element.text or "").strip()
    return ""


def _local(tag):
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


OLD_SINGLE = """<?xml version="1.0" encoding="UTF-8"?>
<doi_batch xmlns="http://www.crossref.org/schema/4.4.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="4.4.2">
  <head>
    <doi_batch_id>old-batch</doi_batch_id>
    <timestamp>20240101000000</timestamp>
    <depositor>
      <depositor_name>Journal Team</depositor_name>
      <email_address>journal@example.test</email_address>
    </depositor>
    <registrant>Journal</registrant>
  </head>
  <body>
    <journal>
      <journal_metadata>
        <full_title>Old Journal</full_title>
      </journal_metadata>
      <journal_article publication_type="full_text">
        <titles><title>Old title</title></titles>
        <publication_date><year>2024</year></publication_date>
        <doi_data>
          <doi>10.5555/ABC.Old-1</doi>
          <resource>https://old.example.test/article</resource>
        </doi_data>
      </journal_article>
    </journal>
  </body>
</doi_batch>
"""


NEW_SINGLE = """<?xml version="1.0" encoding="UTF-8"?>
<doi_batch xmlns="http://www.crossref.org/schema/4.4.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="4.4.2">
  <head>
    <doi_batch_id>new-batch</doi_batch_id>
    <timestamp>20240102000000</timestamp>
    <depositor>
      <depositor_name>Journal Team</depositor_name>
      <email_address>journal@example.test</email_address>
    </depositor>
    <registrant>Journal</registrant>
  </head>
  <body>
    <journal>
      <journal_metadata>
        <full_title>New Journal</full_title>
      </journal_metadata>
      <journal_article publication_type="full_text">
        <titles><title>New corrected title</title></titles>
        <publication_date><year>2025</year></publication_date>
        <pages><first_page>17</first_page></pages>
        <doi_data>
          <doi>10.9999/SHOULD-NOT-STAY</doi>
          <resource>https://new.example.test/article</resource>
        </doi_data>
      </journal_article>
    </journal>
  </body>
</doi_batch>
"""


OLD_ISSUE = """<doi_batch xmlns="http://www.crossref.org/schema/4.4.2" version="4.4.2">
  <head><timestamp>20240101000000</timestamp></head>
  <body>
    <journal>
      <journal_metadata><full_title>Journal</full_title></journal_metadata>
      <journal_issue><issue>1</issue></journal_issue>
      <journal_article>
        <titles><title>Old A</title></titles>
        <doi_data><doi>10.7777/LOCKED-A</doi><resource>https://old/a</resource></doi_data>
      </journal_article>
      <journal_article>
        <titles><title>Old B</title></titles>
        <doi_data><doi>10.7777/Locked.B</doi><resource>https://old/b</resource></doi_data>
      </journal_article>
    </journal>
  </body>
</doi_batch>
"""


NEW_ISSUE = """<doi_batch xmlns="http://www.crossref.org/schema/4.4.2" version="4.4.2">
  <head><timestamp>20240102000000</timestamp></head>
  <body>
    <journal>
      <journal_metadata><full_title>Journal</full_title></journal_metadata>
      <journal_issue><issue>2</issue></journal_issue>
      <journal_article>
        <titles><title>New first article</title></titles>
        <doi_data><doi>10.0000/temp-1</doi><resource>https://new/first</resource></doi_data>
      </journal_article>
      <journal_article>
        <titles><title>New second article</title></titles>
        <doi_data><doi>10.0000/temp-2</doi><resource>https://new/second</resource></doi_data>
      </journal_article>
    </journal>
  </body>
</doi_batch>
"""


def test_single_article_keeps_old_doi_and_new_metadata():
    result = repair_xml(
        OLD_SINGLE,
        NEW_SINGLE,
        [{"new_index": 0, "old_index": 0}],
    )

    assert _article_dois(result["xml"]) == ["10.5555/ABC.Old-1"]
    assert "New corrected title" in _article_titles(result["xml"])
    assert "Old title" not in _article_titles(result["xml"])
    assert int(_timestamp(result["xml"])) > 20240102000000
    assert result["timestamp_source"] == "incremented"


def test_generates_timestamp_only_when_new_xml_has_none():
    new_without_timestamp = re.sub(
        r"<timestamp>.*?</timestamp>",
        "",
        NEW_SINGLE,
        flags=re.S,
    )

    result = repair_xml(
        OLD_SINGLE,
        new_without_timestamp,
        [{"new_index": 0, "old_index": 0}],
    )

    assert int(_timestamp(result["xml"])) > 20240101000000
    assert result["timestamp_source"] == "incremented"


def test_issue_mapping_can_be_out_of_order():
    result = repair_xml(
        OLD_ISSUE,
        NEW_ISSUE,
        [
            {"new_index": 0, "old_index": 1},
            {"new_index": 1, "old_index": 0},
        ],
    )

    assert _article_dois(result["xml"]) == ["10.7777/Locked.B", "10.7777/LOCKED-A"]
    assert _article_titles(result["xml"])[:2] == [
        "New first article",
        "New second article",
    ]


def test_analyze_reports_article_summary():
    analysis = analyze_xml(OLD_SINGLE)

    assert analysis["article_count"] == 1
    assert analysis["articles"][0]["doi"] == "10.5555/ABC.Old-1"
    assert analysis["articles"][0]["title"] == "Old title"


def test_rejects_duplicate_old_doi_mapping():
    with pytest.raises(XmlRepairError, match="tidak boleh dipakai lebih dari sekali"):
        repair_xml(
            OLD_ISSUE,
            NEW_ISSUE,
            [
                {"new_index": 0, "old_index": 0},
                {"new_index": 1, "old_index": 0},
            ],
        )


def test_rejects_empty_mapping():
    with pytest.raises(XmlRepairError, match="Mapping DOI kosong"):
        repair_xml(OLD_SINGLE, NEW_SINGLE, [])


def test_rejects_invalid_xml():
    with pytest.raises(XmlRepairError, match="XML tidak valid"):
        analyze_xml("<doi_batch><body>")


def test_rejects_article_without_doi():
    xml = re.sub(r"<doi_data>.*?</doi_data>", "", OLD_SINGLE, flags=re.S)

    with pytest.raises(XmlRepairError, match="tidak memiliki"):
        analyze_xml(xml)
