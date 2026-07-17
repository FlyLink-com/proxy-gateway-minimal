#!/usr/bin/dash
set -eu
exec /usr/bin/env -i LANG=C.UTF-8 PATH=/usr/bin:/bin \
  /usr/bin/flock --exclusive --nonblock --conflict-exit-code 75 \
  /var/lib/gccgw/japan-tuic-additive-repair/repair.lock \
  /usr/bin/node --disable-proto=throw --import=/usr/local/libexec/gccgw/japan-tuic-additive-repair-bootstrap.mjs \
  /usr/local/libexec/gccgw/japan-tuic-additive-repair-runner.mjs \
  --binding /etc/gccgw/japan-tuic-additive-repair-binding.json
