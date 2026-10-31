#!/usr/bin/env bash
# Clones the two backend branches this submission builds on into repos/ (git-ignored):
#   repos/thunderid   thunder-id/thunderid fork, branch feature/ps03-native-sso-1.1.x
#                     (the Native SSO commit on the exact ThunderID 1.1.x commit eSignet develop-go
#                      pins; feature/ps03-native-sso is the same commit on the maintainers'
#                      feature/1.1.0/oidc-native-sso line, used for the upstream PR)
#   repos/esignet-go  mosip/esignet fork, branch feature/ps03-native-sso (based on develop-go)
# Override the sources with THUNDERID_REPO / THUNDERID_BRANCH / ESIGNET_REPO / ESIGNET_BRANCH.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
: "${THUNDERID_REPO:=https://github.com/DevAnuragT/thunderid.git}"
: "${THUNDERID_BRANCH:=feature/ps03-native-sso-1.1.x}"
: "${ESIGNET_REPO:=https://github.com/DevAnuragT/esignet.git}"
: "${ESIGNET_BRANCH:=feature/ps03-native-sso}"
mkdir -p "$HERE/repos"
clone() {  # clone <url> <branch> <dir>
  if [ -d "$3/.git" ]; then
    echo "$3 exists; fetching $2"; git -C "$3" fetch --depth 1 origin "$2" && git -C "$3" checkout -q FETCH_HEAD
  else
    git clone --depth 1 --branch "$2" "$1" "$3"
  fi
}
clone "$THUNDERID_REPO" "$THUNDERID_BRANCH" "$HERE/repos/thunderid"
clone "$ESIGNET_REPO" "$ESIGNET_BRANCH" "$HERE/repos/esignet-go"
echo "backends ready: $(git -C "$HERE/repos/thunderid" rev-parse --short HEAD) (thunderid), $(git -C "$HERE/repos/esignet-go" rev-parse --short HEAD) (esignet)"
