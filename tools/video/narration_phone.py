import subprocess, os
VOICE=os.environ.get("VOICE","Ava (Premium)")
RATE=os.environ.get("RATE","190")
P=" [[slnc 400]] "
texts={
 "s1": f"Let's watch it.{P}This is Vendor Wallet, signed out. Down here you can already see the client id, the eSignet address, and the thumbprint of Key A. That's a hardware key living in the phone's keystore.{P}We tap sign in. eSignet opens in a browser tab. OTP, the test UIN, the captcha passes on its own, and the one-time code.{P}Now the consent screen. We keep the required claim and leave the optional ones off. Allow.{P}And we're back in the Wallet. Signed in, device secret stored.{P}Look at the details. The session id, the hash from the ID token, and the hash of the secret we stored. They match. So this ID token belongs to this device secret, and nothing else.{P}The secret itself? Encrypted. The app can't read it, and doesn't need to.",
 "s2": f"Now the fun part. Vendor Health.{P}Nothing's stored here. No browser session, nothing.{P}One tap on sign in.{P}And that's it. Signed in, in under a fifth of a second, and the profile shows the user's name.{P}Scroll down. The token is bound to a key. The actor claim says the Wallet vouched for this. And the key is the Wallet's Key A. Health never had a key of its own. It asked the Wallet to sign for it, and no device secret came back.",
 "s3": f"Last one. We sign out of Health, and this time we ask for the phone number. The Wallet never got that.{P}eSignet refuses the silent path, and the app tells you why, in plain words. We continue.{P}Now it's the normal eSignet flow, for Health itself. OTP again, and a consent screen that lists the phone number. We approve it.{P}Health is signed in, with its own consent this time. Silent sign-in never gave it more than you agreed to.",
}
for k,v in texts.items():
    subprocess.run(["say","-v",VOICE,"-r",RATE,"-o",f"{k}.aiff",v],check=True)
    out=subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"{k}.aiff"],capture_output=True,text=True).stdout.strip()
    print(k, out)
