# Renders the title cards for the demo video with Ghostscript (1080x1920 portrait, 30 fps clips later).
import subprocess, textwrap
NAVY="0.086 0.129 0.227"; ORANGE="0.94 0.39 0.16"; MUTED="0.66 0.72 0.80"; WHITE="1 1 1"
def esc(s): return s.replace("\\","\\\\").replace("(","\\(").replace(")","\\)")
def card(name, kicker, title, lines):
    ps=[ "%!PS-Adobe-3.0", "<< /PageSize [1080 1920] >> setpagedevice", f"{NAVY} setrgbcolor 0 0 1080 1920 rectfill",
         f"{ORANGE} setrgbcolor 80 1300 920 6 rectfill",
         f"/Helvetica-Bold findfont 26 scalefont setfont {ORANGE} setrgbcolor 80 1340 moveto ({esc(kicker)}) show"]
    y=1220
    for t in title:
        ps.append(f"/Helvetica-Bold findfont 64 scalefont setfont {WHITE} setrgbcolor 80 {y} moveto ({esc(t)}) show"); y-=80
    y-=30
    for l in lines:
        ps.append(f"/Helvetica findfont 34 scalefont setfont {MUTED} setrgbcolor 80 {y} moveto ({esc(l)}) show"); y-=52
    ps.append(f"/Helvetica findfont 24 scalefont setfont {MUTED} setrgbcolor 80 120 moveto (MOSIP Decode 2026  \\267  PS03  \\267  eSignet Go + ThunderID + Android) show")
    ps.append("showpage")
    open(f"{name}.ps","w").write("\n".join(ps))
    subprocess.run(["gs","-q","-dNOPAUSE","-dBATCH","-sDEVICE=png16m","-r72","-o",f"{name}.png",f"{name}.ps"],check=True)
card("c0","MOSIP DECODE 2026  -  PROBLEM STATEMENT 03",["One login,","every app."],
     ["Native SSO in eSignet (Go) for mobile apps","OpenID Connect Native SSO 1.0 + RFC 8693 token exchange","","Vendor Wallet signs in once.","Vendor Health signs in silently, no OTP, no consent screen."])
card("c1","1 / 4",["The problem"],["Native apps share no cookies.","Every app of a vendor repeats the full login:","UIN, OTP, captcha, consent.","","Web SSO does not exist on a phone, and a shared","session would not be bound to the device."])
card("c2","2 / 4",["Super app: Vendor Wallet"],["PAR + PKCE + DPoP (hardware key A) + private_key_jwt","Scope includes device_sso","","eSignet returns access_token, id_token {ds_hash, sid}","and a device_secret: signed, then encrypted JWE","that only eSignet can read."])
card("c3","3 / 4",["Child app: Vendor Health"],["Asks the Wallet over a signature-protected IPC for","id_token, device_secret and a DPoP proof (Key A)","","RFC 8693 token exchange, actor = device_secret","eSignet checks ds_hash, sid, sub, cnf.jkt, vendor family","Result: access token with act.sub = Wallet, in ~200 ms"])
card("c4","4 / 4",["Re-consent when scopes differ"],["Health asks for a claim the Wallet never got (phone)","eSignet refuses the silent path: invalid_scope /","interaction_required","","The app explains why and opens the normal","eSignet consent flow for its own client."])
card("c5","WHAT WE BUILT",["Everything in the PS,","plus the bonus."],["ThunderID: DeviceSecretProvider, device_sso scope,","token-exchange actor validation (ds_hash, sid, cnf.jkt)","eSignet Go: signed-then-encrypted secrets, consent derivation","Android SDK + two apps, Postman collection, 26/26 e2e checks","API + design docs, unit tests in Go and Kotlin","","github: DevAnuragT  -  thank you"])
print("cards ok")
