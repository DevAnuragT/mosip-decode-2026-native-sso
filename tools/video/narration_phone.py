import subprocess
import os
VOICE=os.environ.get("VOICE","Samantha")  # e.g. VOICE="Ava (Premium)" once downloaded in System Settings
texts={
 "s1": "This is Vendor Wallet, the super app, signed out. The details card already shows the client id, the eSignet URL and the thumbprint of Key A, a hardware key in the Android Keystore. Tapping Sign in with eSignet opens the login in a Custom Tab. We choose OTP, enter the UIN, the Turnstile test captcha passes by itself, and we enter the one time password. On the consent screen we keep the essential claim and leave the voluntary ones off, then tap Allow. Back in the Wallet: signed in, device secret stored. The native SSO details show the session id, the D S hash from the ID token, and the SHA-256 of the stored device secret: they match, so the ID token is bound to this device secret. The device secret itself is an encrypted token the app cannot read.",
 "s2": "Now Vendor Health, the child app. Nothing is stored here and there is no browser session. One tap on Sign in. Within a fraction of a second the app is signed in silently, and the profile shows the user's name from userinfo. In the details: the token type is DPoP, the actor claim names the Wallet as the app that vouched for this sign-in, and the bound key is the Wallet's Key A. Vendor Health never had a key of its own: the Wallet signed each proof over a signature-protected IPC. No device secret was returned on the exchange.",
 "s3": "Finally the bonus. We sign out of Vendor Health and ask for extra claims, the phone number, which the Wallet was never granted. eSignet refuses the silent path. The app explains that it needs more than the user approved for the Wallet and offers to continue in the browser. There, the normal eSignet flow runs for Vendor Health itself: OTP login, then a consent screen that now lists the phone number. We approve it, and Vendor Health is signed in with its own consent. Silent sign-in never widens what the user agreed to.",
}
for k,v in texts.items():
    subprocess.run(["say","-v",VOICE,"-r",os.environ.get("RATE","200"),"-o",f"{k}.aiff",v],check=True)
    out=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{k}.aiff"],capture_output=True,text=True).stdout.strip()
    print(k, out)
