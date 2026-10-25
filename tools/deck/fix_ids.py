"""Make every <p:cNvPr id> unique across the whole deck (pptxgenjs reuses ids and can
collide with its own slide-number placeholder; Apple's Quick Look keys shapes by id and
then draws shapes from other slides)."""
import re, sys, zipfile, shutil, os
src = sys.argv[1]; tmp = src + ".tmp"
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
for item in zin.infolist():
    data = zin.read(item.filename)
    m = re.match(r"ppt/slides/slide(\d+)\.xml$", item.filename)
    if m:
        base = int(m.group(1)) * 1000
        counter = [base]
        def repl(mo):
            counter[0] += 1
            return f'<p:cNvPr id="{counter[0]}" name="{mo.group(1)}"'
        text = data.decode("utf-8")
        text = re.sub(r'<p:cNvPr id="\d+" name="([^"]*)"', repl, text)
        data = text.encode("utf-8")
    zi = zipfile.ZipInfo(item.filename, date_time=item.date_time); zi.compress_type = zipfile.ZIP_DEFLATED
    zout.writestr(zi, data)
zout.close(); zin.close(); shutil.move(tmp, src)
print("ids renumbered in", src)
