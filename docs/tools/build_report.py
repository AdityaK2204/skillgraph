"""Renders docs/REPORT.md (+ DATA_DICTIONARY.md as an appendix) to docs/SkillGraph_Project_Report.pdf.
Usage: python3 docs/tools/build_report.py   (needs: pip markdown, playwright with Chromium)
"""
import asyncio, re, pathlib, markdown

DOCS = pathlib.Path(__file__).resolve().parents[1]
src = (DOCS / 'REPORT.md').read_text()
meta = {}
if src.startswith('---'):
    head, src = src[3:].split('---', 1)
    for line in head.strip().splitlines():
        k, v = line.split(':', 1)
        meta[k.strip()] = v.strip().strip('"')

dd = (DOCS / 'DATA_DICTIONARY.md').read_text().replace('# Data dictionary', '# Appendix C. Data dictionary (generated)', 1)
dd = re.sub(r'^## ', '### ', dd, flags=re.M)
md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists'])
body = md.convert(src + '\n\n' + dd)
# figure captions from alt text
body = re.sub(r'<p><img alt="([^"]*)" src="([^"]+)" ?/?></p>',
              r'<figure><img src="\2" alt="\1"><figcaption>\1</figcaption></figure>', body)

body = re.sub(r'<td>(FR-\d+|#?\d+|Q\d+)</td>', r'<td class="id">\1</td>', body)
toc = ''.join(f'<li><span>{t["name"]}</span></li>' for t in md.toc_tokens if t['level'] == 1)

css = """
@page { size: A4; margin: 18mm 16mm 18mm 16mm; }
:root { --ink:#16202b; --muted:#5a6776; --line:#d6dce3; --accent:#1d6b58; --soft:#eef2f4; }
* { box-sizing: border-box; }
body { font: 10pt/1.5 "DejaVu Sans", system-ui, sans-serif; color: var(--ink); margin: 0; }
h1 { font-size: 17pt; margin: 0 0 8pt; padding-top: 2pt; color: var(--ink); page-break-before: always; letter-spacing: -0.01em; }
h1::after { content: ""; display: block; width: 36pt; height: 3pt; background: var(--accent); margin-top: 6pt; }
h2 { font-size: 12.5pt; margin: 16pt 0 6pt; color: var(--accent); page-break-after: avoid; }
h3 { font-size: 10.5pt; margin: 12pt 0 4pt; page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 8pt; padding-left: 16pt; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 8.4pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border-bottom: 0.6pt solid var(--line); padding: 3.5pt 5pt; text-align: left; vertical-align: top; }
td.id { white-space: nowrap; }
th { background: var(--soft); font-weight: 700; color: var(--muted); font-size: 7.8pt; text-transform: uppercase; letter-spacing: .03em; }
code { font: 8.4pt "DejaVu Sans Mono", monospace; background: var(--soft); padding: 0 2pt; border-radius: 2pt; word-break: break-word; }
pre { background: #f5f7f9; border: 0.6pt solid var(--line); border-radius: 4pt; padding: 7pt 9pt; white-space: pre-wrap; page-break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8pt; }
figure { margin: 8pt 0 12pt; page-break-inside: avoid; text-align: center; }
figure img[src$=".svg"] { width: 100%; height: auto; }
figure img { max-width: 100%; max-height: 236mm; object-fit: contain; border: 0.6pt solid var(--line); border-radius: 3pt; }
figcaption { font-size: 8.4pt; color: var(--muted); margin-top: 4pt; }
.cover { height: 255mm; display: flex; flex-direction: column; justify-content: space-between; padding: 20mm 4mm 0; }
.cover .eyebrow { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.cover .title { font-size: 40pt; font-weight: 700; letter-spacing: -0.02em; margin: 10pt 0 4pt; }
.cover .subtitle { font-size: 15pt; color: var(--accent); }
.cover .rule { height: 3pt; width: 60pt; background: var(--accent); margin: 18pt 0; }
.cover .lede { font-size: 11pt; max-width: 140mm; color: var(--ink); }
.cover dl { display: grid; grid-template-columns: 34mm 1fr; gap: 5pt 10pt; font-size: 10pt; margin: 0; }
.cover dt { color: var(--muted); } .cover dd { margin: 0; }
.stack { display: flex; gap: 6pt; flex-wrap: wrap; margin-top: 12pt; }
.stack span { border: 0.6pt solid var(--line); border-radius: 10pt; padding: 2pt 8pt; font-size: 8.6pt; }
.toc h1 { page-break-before: always; }
.toc ol { columns: 1; font-size: 10.5pt; line-height: 2; padding-left: 0; list-style: none; }
.toc li { border-bottom: 0.5pt dotted var(--line); }
"""

cover = f"""
<section class="cover">
  <div>
    <div class="eyebrow">{meta.get('course','')}</div>
    <div class="title">{meta.get('title','')}</div>
    <div class="subtitle">{meta.get('subtitle','')}</div>
    <div class="rule"></div>
    <p class="lede">An evidence-driven decision system that tells a specific person what to learn next, why it matters for their
    target career, and how to prove it. Built on PostgreSQL with pgvector, MongoDB and Neo4j behind a Next.js application.</p>
    <div class="stack"><span>PostgreSQL 16</span><span>pgvector · HNSW</span><span>MongoDB</span><span>Neo4j</span><span>Next.js 15</span><span>3 roles · RBAC</span><span>50 automated tests</span></div>
  </div>
  <dl>
    <dt>Team</dt><dd>{meta.get('team','')}</dd>
    <dt>Course</dt><dd>DBMS Experiential Learning, Level 3</dd>
    <dt>Date</dt><dd>{meta.get('date','')}</dd>
    <dt>Repository</dt><dd>{meta.get('repo','')}</dd>
  </dl>
</section>
<section class="toc"><h1 id="contents">Contents</h1><ol>{toc}</ol></section>
"""

html = f"<!doctype html><html><head><meta charset='utf-8'><title>SkillGraph Project Report</title><style>{css}</style></head><body>{cover}{body}</body></html>"
out_html = DOCS / '_report.html'
out_html.write_text(html)

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
        page = await b.new_page()
        await page.goto(out_html.as_uri()); await page.wait_for_load_state('networkidle')
        footer = ("<div style='font:7.5pt DejaVu Sans,sans-serif;color:#7a8794;width:100%;padding:0 16mm;display:flex;justify-content:space-between'>"
                  "<span>SkillGraph · DBMS Level 3 project report</span><span><span class='pageNumber'></span> / <span class='totalPages'></span></span></div>")
        await page.pdf(path=str(DOCS / 'SkillGraph_Project_Report.pdf'), format='A4', print_background=True,
                       display_header_footer=True, header_template='<div></div>', footer_template=footer,
                       margin={'top': '16mm', 'bottom': '18mm', 'left': '16mm', 'right': '16mm'})
        await b.close()
    out_html.unlink()
    print('wrote', DOCS / 'SkillGraph_Project_Report.pdf')

asyncio.run(main())
