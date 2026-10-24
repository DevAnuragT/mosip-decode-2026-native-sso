import subprocess, sys
import os
VOICE=os.environ.get("VOICE","Samantha")  # e.g. VOICE="Ava (Premium)" once downloaded in System Settings
texts = {
 "n0": "MOSIP Decode 2026, problem statement three: native single sign-on in eSignet Go for mobile apps. One login, every app.",
 "n1": "The problem. Native apps do not share cookies, so every app from the same vendor repeats the full login: UIN, OTP, captcha and consent. Web single sign-on does not exist on a phone, and a shared session would not be bound to the device.",
 "n2": "First, the super app, Vendor Wallet, signs in with pushed authorization, PKCE, DPoP with a hardware key, and the new device underscore S S O scope. eSignet returns an access token, an ID token carrying D S hash and S I D, and a device secret: a signed, then encrypted token that only eSignet can read.",
 "n3": "Second, the child app, Vendor Health. It asks the Wallet over a signature-protected IPC for the ID token, the device secret and a DPoP proof. Then it performs an RFC 8693 token exchange. eSignet checks the hash binding, the session id, the subject, the key thumbprint and the vendor family, and returns an access token in about two hundred milliseconds.",
 "n4": "Third, re-consent. When Vendor Health asks for a claim the Wallet never received, eSignet refuses the silent path. The app explains why and opens the normal eSignet consent flow for its own client, so silent sign-in never widens what the user agreed to.",
 "n5": "Everything in the problem statement is implemented, plus the bonus: the ThunderID engine changes, the eSignet provider with encrypted secrets and consent derivation, an Android SDK with two apps, a Postman collection, automated end-to-end checks, and full documentation. Thank you.",
 "n6": "Every binding is tested against the live stack: the hash binding, the session id, key binding, scope escalation, device S S O on exchange, vendor isolation, a wrong DPoP key, a tampered secret, and interaction required for an unconsented claim. Go and Kotlin unit tests pass as well.",
}
for k,v in texts.items():
    subprocess.run(["say","-v",VOICE,"-r",os.environ.get("RATE","200"),"-o",f"{k}.aiff",v],check=True)
    out=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{k}.aiff"],capture_output=True,text=True).stdout.strip()
    print(k, out)
