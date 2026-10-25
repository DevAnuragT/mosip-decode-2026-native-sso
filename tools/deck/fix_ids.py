"""Post-build fixes so the deck renders reliably in Apple Quick Look / Keynote.

Usage: python3 fix_ids.py deck.pptx   (rewrites the file in place)

1. Make every <p:cNvPr id> unique across the whole deck. pptxgenjs restarts the ids on every slide
   and can collide with its own slide-number placeholder.
2. Mark every text-less filled autoshape (cards, bars, badges, boxes; not lines) as a text box
   (txBox="1") and resolve its theme colours to RGB. Quick Look renders decks that contain plain
   autoshapes non-deterministically: shapes from other slides get drawn on top of the wrong slide,
   in the main view and in the thumbnails. Shapes on the text-box path render reliably, but Quick
   Look then ignores their preset geometry (hence the square corners in build.js) and resolves theme
   colours badly (hence RGB). PowerPoint and LibreOffice render both forms identically.
"""
import re, sys, zipfile, shutil

src = sys.argv[1]
tmp = src + ".tmp"
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)

theme_xml = zin.read("ppt/theme/theme1.xml").decode("utf-8")
THEME = {}
for slot in ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]:
    m = re.search(r"<a:%s>.*?(?:val|lastClr)=\"([0-9A-Fa-f]{6})\"" % slot, theme_xml, flags=re.S)
    if m:
        THEME[slot] = m.group(1)
THEME.update({"tx1": THEME.get("dk1"), "bg1": THEME.get("lt1"), "tx2": THEME.get("dk2"), "bg2": THEME.get("lt2")})


def textbox(sp):
    if "<p:txBody>" in sp or 'prst="line"' in sp:
        return sp
    sp = sp.replace("<p:cNvSpPr/>", '<p:cNvSpPr txBox="1"/>')
    return re.sub(r'<a:schemeClr val="([A-Za-z0-9]+)"\s*/>',
                  lambda m: '<a:srgbClr val="%s"/>' % (THEME.get(m.group(1)) or "000000"), sp)


for item in zin.infolist():
    data = zin.read(item.filename)
    m = re.match(r"ppt/slides/slide(\d+)\.xml$", item.filename)
    if m:
        counter = [int(m.group(1)) * 1000]

        def repl(mo):
            counter[0] += 1
            return '<p:cNvPr id="%d" name="%s"' % (counter[0], mo.group(1))

        text = data.decode("utf-8")
        text = re.sub(r'<p:cNvPr id="\d+" name="([^"]*)"', repl, text)
        text = re.sub(r"<p:sp>.*?</p:sp>", lambda mo: textbox(mo.group(0)), text, flags=re.S)
        data = text.encode("utf-8")
    zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.external_attr = 0o644 << 16
    zout.writestr(zi, data)
zout.close()
zin.close()
shutil.move(tmp, src)
print("ids renumbered, plain shapes marked as text boxes with RGB colours in", src)
