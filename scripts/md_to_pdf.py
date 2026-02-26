#!/usr/bin/env python3
"""Markdown to styled HTML (for browser PDF print)."""
import markdown
import sys
import os
import subprocess

def convert(md_path, html_path):
    with open(md_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    html_body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code"],
    )

    html_full = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>パッティング分析アプリ - システム構成・コスト・料金設計</title>
<style>
body {{
    font-family: 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a1a;
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 50px;
}}
h1 {{
    font-size: 18pt;
    color: #1B5E20;
    border-bottom: 3px solid #1B5E20;
    padding-bottom: 8px;
    margin-top: 30px;
}}
h2 {{
    font-size: 14pt;
    color: #2E7D32;
    border-bottom: 1px solid #ccc;
    padding-bottom: 5px;
    margin-top: 25px;
}}
h3 {{
    font-size: 12pt;
    color: #388E3C;
    margin-top: 20px;
}}
table {{
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
    font-size: 10pt;
}}
th {{
    background-color: #E8F5E9;
    color: #1B5E20;
    font-weight: 700;
    padding: 8px 10px;
    border: 1px solid #C8E6C9;
    text-align: left;
}}
td {{
    padding: 6px 10px;
    border: 1px solid #ddd;
}}
tr:nth-child(even) td {{
    background-color: #FAFAFA;
}}
code {{
    background-color: #f5f5f5;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 9.5pt;
    font-family: 'Menlo', 'Consolas', monospace;
}}
pre {{
    background-color: #f5f5f5;
    padding: 12px;
    border-radius: 5px;
    overflow-x: auto;
    font-size: 9pt;
    line-height: 1.5;
    border: 1px solid #e0e0e0;
}}
pre code {{
    background: none;
    padding: 0;
}}
strong {{
    color: #1B5E20;
}}
hr {{
    border: none;
    border-top: 1px solid #ccc;
    margin: 20px 0;
}}
@media print {{
    body {{ padding: 0; }}
    h1 {{ page-break-before: auto; }}
    h2 {{ page-break-after: avoid; }}
    table {{ page-break-inside: avoid; }}
    pre {{ page-break-inside: avoid; }}
}}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_full)
    print(f"HTML saved: {html_path}")

if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "ARCHITECTURE.md"
    dst = sys.argv[2] if len(sys.argv) > 2 else src.replace(".md", ".html")
    convert(src, dst)
