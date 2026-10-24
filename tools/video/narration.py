import subprocess, os
VOICE=os.environ.get("VOICE","Ava (Premium)")  # see RECORDING.md
RATE=os.environ.get("RATE","190")
P=" [[slnc 350]] "   # a breath between thoughts
texts = {
 "n0": f"Hi. This is our entry for MOSIP Decode 2026, problem statement three.{P}Native single sign-on for mobile apps, built into eSignet Go.{P}The idea fits in five words: one login, every app.",
 "n1": f"So here's the problem.{P}Apps on your phone don't share cookies. If a vendor has a wallet app and a health app, you log in twice. UIN, OTP, captcha, consent, and then all of it again.{P}And you can't just share a session between apps, because nothing would tie it to the device.",
 "n2": f"Here's how we fix it, in three moves.{P}Move one. The first app, Vendor Wallet, signs in once. It uses pushed authorization, PKCE, and DPoP with a hardware key, and it asks for a new scope called device underscore S S O.{P}eSignet sends back the usual access token and ID token, plus something new: a device secret. It's signed, then encrypted, so only eSignet can ever read it.",
 "n3": f"Move two. The second app, Vendor Health.{P}It asks the Wallet, over a protected channel, for three things: the ID token, the device secret, and a DPoP proof.{P}Then it does a token exchange. eSignet checks that everything matches: the hash, the session, the user, the key, and the vendor.{P}If it all lines up, Health gets its own token. That takes about two hundred milliseconds.",
 "n4": f"Move three, and this one's the bonus.{P}What if Health asks for something the Wallet never got, like your phone number?{P}eSignet says no to the silent path. The app explains why, and sends you to the normal eSignet consent screen.{P}So a silent sign-in can never quietly widen what you agreed to.",
 "n5": f"That's the whole thing.{P}Everything in the problem statement is built, plus the bonus. Engine changes in ThunderID, the provider in eSignet, an Android SDK with two apps, a Postman collection, automated checks, and the docs.{P}Thanks for watching.",
 "n6": f"And we don't just claim it works, we test it.{P}Thirty-five checks run against the live stack. The hash binding, the session id, the key binding, scope escalation, device S S O on an exchange, another vendor trying their luck, a wrong key, a tampered secret, and the re-consent case.{P}All green. The Go and Kotlin unit tests pass too.",
}
for k,v in texts.items():
    subprocess.run(["say","-v",VOICE,"-r",RATE,"-o",f"{k}.aiff",v],check=True)
    out=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{k}.aiff"],capture_output=True,text=True).stdout.strip()
    print(k, out)
