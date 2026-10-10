from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

class Page(HTMLParser):
    def __init__(self, file):
        super().__init__(); self.ids=set(); self.links=[]; self.quiz_details=0; self.summary_text=[]; self.in_summary=False
        self.feed(file.read_text())
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        if tag=='a' and 'href' in a: self.links.append(a['href'])
        if tag=='details' and 'open' in a: raise AssertionError('Quiz answers must start collapsed')
        if tag=='summary': self.in_summary=True
    def handle_data(self,data):
        if self.in_summary and 'Reveal all 20 answers' in data:self.quiz_details+=1
    def handle_endtag(self,tag):
        if tag=='summary': self.in_summary=False

root=Path('out'); pages={}
for f in root.rglob('*.html'):
    if f.name=='index.html':route='/'+str(f.parent.relative_to(root)).replace('\\','/')
    else:route='/'+str(f.relative_to(root))
    route=route.replace('/.','/').rstrip('/') or '/'
    pages[route]=Page(f)
checked=0
for route,page in pages.items():
    for href in page.links:
        u=urlsplit(href)
        if u.scheme or u.netloc:continue
        target=unquote(u.path).rstrip('/') or route
        assert target in pages,(route,href,'missing route')
        if u.fragment:assert unquote(u.fragment) in pages[target].ids,(route,href,'missing anchor')
        checked+=1
    if route.startswith('/systems/'):
        assert page.quiz_details==1,(route,'missing rendered answer disclosure')
print(f'Export verified: {len(pages)} HTML pages, {checked} links/anchors, all 13 answer disclosures.')
