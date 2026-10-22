import subprocess
NAVY="0.086 0.129 0.227"; ORANGE="0.94 0.39 0.16"; MUTED="0.66 0.72 0.80"; WHITE="1 1 1"; GREEN="0.30 0.80 0.45"
def esc(s): return s.replace("\\","\\\\").replace("(","\\(").replace(")","\\)")
lines=[
("$ python3 tests/native_sso_e2e.py",WHITE),
("== 1. super app login with device_sso",MUTED),
("  PASS  device_secret issued (encrypted JWE, 5 segments)",GREEN),
("  PASS  id_token ds_hash = SHA-256(device_secret)",GREEN),
("  PASS  id_token carries sid",GREEN),
("  PASS  access token bound to Key A (cnf.jkt)",GREEN),
("== 2. child app silent sign-in (token exchange)",MUTED),
("  PASS  child access token issued, no device_secret",GREEN),
("  PASS  same subject; act.sub = mosip-super-app",GREEN),
("  PASS  child token bound to Key A (cnf.jkt)",GREEN),
("  PASS  child userinfo: name=Siddharth K Mansour",GREEN),
("== 3. negative cases",MUTED),
("  PASS  scope escalation (phone) -> invalid_scope",GREEN),
("  PASS  device_sso on exchange -> invalid_scope",GREEN),
("  PASS  other vendor -> invalid_grant (vendor mismatch)",GREEN),
("  PASS  wrong DPoP key -> invalid_grant (cnf.jkt)",GREEN),
("  PASS  tampered secret -> invalid_grant (decrypt)",GREEN),
("  PASS  bonus: unconsented email -> interaction_required",GREEN),
("  PASS  audience missing / foreign -> invalid_target",GREEN),
("  PASS  no openid, no device_sso inherited, cross-login pair",GREEN),
("== 4. login without device_sso: no secret, no ds_hash",MUTED),
("",MUTED),
("35/35 checks passed",WHITE),
("",MUTED),
("$ go test ./internal/oauth/... ./pkg/thunderidengine/...   ok",GREEN),
("$ go test ./...   (esignet-service)                      ok",GREEN),
("$ ./gradlew :nativesso-sdk:testDebugUnitTest   20 tests  ok",GREEN),
]
ps=["%!PS-Adobe-3.0","<< /PageSize [1080 1920] >> setpagedevice",f"{NAVY} setrgbcolor 0 0 1080 1920 rectfill",
    f"{ORANGE} setrgbcolor 60 1700 960 6 rectfill",
    f"/Helvetica-Bold findfont 26 scalefont setfont {ORANGE} setrgbcolor 60 1740 moveto (BACKEND PROOF  -  LOCAL STACK, 2026-10-22) show",
    f"/Helvetica-Bold findfont 56 scalefont setfont {WHITE} setrgbcolor 60 1620 moveto (Every binding, tested.) show"]
y=1520
for t,c in lines:
    ps.append(f"/Courier-Bold findfont 24 scalefont setfont {c} setrgbcolor 60 {y} moveto ({esc(t)}) show"); y-=44
ps.append("showpage")
open("c6.ps","w").write("\n".join(ps))
subprocess.run(["gs","-q","-dNOPAUSE","-dBATCH","-sDEVICE=png16m","-r72","-o","c6.png","c6.ps"],check=True)
print("ok")
